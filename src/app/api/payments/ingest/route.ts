import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { matchPayment, type Candidate } from "@/lib/matcher";
import { dispatchEvents, parseEvents } from "@/lib/registrations";
import { createAdminClient } from "@/lib/supabase/server";
import type { RegistrationEvent, RegistrationStatus } from "@/lib/types";

// Receives parsed Interac notification emails from scripts/gmail-ingest.gs.
const Body = z.object({
  messages: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        senderName: z.string().max(200).nullable(),
        amountCents: z.number().int().positive(),
        memo: z.string().max(1000).nullable(),
        text: z.string().max(4000).nullable().optional(),
        receivedAt: z.iso.datetime({ offset: true }),
      }),
    )
    .max(100),
});

function validSignature(raw: string, signature: string | null) {
  if (!signature) return false;
  const expected = createHmac("sha256", env.ingestSecret()).update(raw).digest("hex");
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

type CandidateRow = {
  id: string;
  ref_code: string;
  status: RegistrationStatus;
  amount_cents: number;
  paid_cents: number;
  profile: {
    display_name: string | null;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    etransfer_names: string[];
  };
};

export async function POST(request: Request) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-signature"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  const parsed = Body.safeParse(JSON.parse(raw || "{}"));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const admin = createAdminClient();

  // Store new payments; duplicates (already-seen Gmail message ids) are skipped.
  const { data: inserted, error: insertError } = await admin
    .from("payments")
    .upsert(
      parsed.data.messages.map((m) => ({
        gmail_message_id: m.id,
        sender_name: m.senderName,
        amount_cents: m.amountCents,
        memo: m.memo,
        received_at: m.receivedAt,
        raw: m,
      })),
      { onConflict: "gmail_message_id", ignoreDuplicates: true },
    )
    .select("id, gmail_message_id");
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  if (!inserted?.length) return NextResponse.json({ ok: true, new: 0, matched: 0 });

  // Candidates: registrations for sessions from the last week onwards.
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: rows, error: candError } = await admin
    .from("registrations")
    .select(
      "id, ref_code, status, amount_cents, paid_cents, session:sessions!inner(starts_at), profile:profiles(display_name, full_name, first_name, last_name, etransfer_names)",
    )
    .gte("session.starts_at", since);
  if (candError) return NextResponse.json({ error: candError.message }, { status: 500 });

  const candidates: Candidate[] = (rows as unknown as CandidateRow[]).map((r) => ({
    registrationId: r.id,
    refCode: r.ref_code,
    status: r.status,
    owedCents: r.amount_cents,
    paidCents: r.paid_cents,
    names: [
      ...r.profile.etransfer_names,
      r.profile.display_name,
      r.profile.full_name,
      r.profile.first_name && r.profile.last_name ? `${r.profile.first_name} ${r.profile.last_name}` : null,
    ].filter((n): n is string => !!n),
  }));

  const messages = new Map(parsed.data.messages.map((m) => [m.id, m]));
  const events: RegistrationEvent[] = [];
  let matched = 0;

  for (const payment of inserted) {
    const msg = messages.get(payment.gmail_message_id!)!;
    const result = matchPayment(
      { senderName: msg.senderName, amountCents: msg.amountCents, memo: msg.memo, text: msg.text },
      candidates,
    );

    if (result.kind === "unmatched") {
      await admin.from("payments").update({ note: result.reason }).eq("id", payment.id);
      continue;
    }

    const { data, error } = await admin.rpc("ingest_apply_payment", {
      p_payment_id: payment.id,
      p_registration_id: result.registrationId,
      p_matched_by: result.by,
    });
    if (error || data === null) {
      const note = error ? `Error applying payment: ${error.message}` : "Registration was no longer awaiting payment";
      await admin.from("payments").update({ note }).eq("id", payment.id);
      continue;
    }
    matched += 1;
    const applied = parseEvents(data);
    events.push(...applied);
    // Keep later messages in this batch matching against the up-to-date sign-up.
    const candidate = candidates.find((c) => c.registrationId === result.registrationId);
    if (candidate) {
      candidate.paidCents = (candidate.paidCents ?? 0) + msg.amountCents;
      if (applied.some((e) => e.event === "confirmed")) candidate.status = "confirmed";
    }
  }

  await dispatchEvents(events);
  return NextResponse.json({ ok: true, new: inserted.length, matched });
}
