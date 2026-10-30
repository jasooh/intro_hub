import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { matchPayment, type Candidate, type MatchResult } from "@/lib/matcher";
import { HOST_MARKED_NOTE, onlyHostMarked } from "@/lib/payments";
import { dispatchEvents, parseEvents } from "@/lib/registrations";
import { createAdminClient } from "@/lib/supabase/server";
import type { RegistrationEvent, RegistrationStatus } from "@/lib/types";

// Receives parsed Interac notification emails from scripts/gmail-ingest.gs.
// kind "received" (the default, so older script versions keep working) is money
// that arrived; "cancelled" means the sender took it back or it expired unclaimed.
const Message = z
  .object({
    id: z.string().min(1).max(200),
    kind: z.enum(["received", "cancelled"]).default("received"),
    senderName: z.string().max(200).nullable(),
    amountCents: z.number().int().positive().nullable(),
    memo: z.string().max(1000).nullable(),
    reference: z.string().max(100).nullable().optional(),
    /** Cancellations: the day the cancelled transfer was sent ("2026-10-19"). */
    sentOn: z.iso.date().nullable().optional(),
    text: z.string().max(4000).nullable().optional(),
    receivedAt: z.iso.datetime({ offset: true }),
  })
  .refine((m) => m.kind === "cancelled" || m.amountCents != null, { message: "amountCents is required for payments" });
const Body = z.object({ messages: z.array(Message).max(100) });

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
  const events: RegistrationEvent[] = [];

  // Cancelled / expired e-Transfers: store each once, then take back the payment it refers to.
  const cancellations = parsed.data.messages.filter((m) => m.kind === "cancelled");
  let reversed = 0;
  if (cancellations.length) {
    const { data: newCancels, error: cancelError } = await admin
      .from("payment_cancellations")
      .upsert(
        cancellations.map((m) => ({
          gmail_message_id: m.id,
          sender_name: m.senderName,
          amount_cents: m.amountCents,
          memo: m.memo,
          reference: m.reference ?? null,
          sent_on: m.sentOn ?? null,
          received_at: m.receivedAt,
          raw: m,
        })),
        { onConflict: "gmail_message_id", ignoreDuplicates: true },
      )
      .select("id");
    if (cancelError) return NextResponse.json({ error: cancelError.message }, { status: 500 });
    for (const c of newCancels ?? []) {
      const { data, error } = await admin.rpc("ingest_reverse_payment", {
        p_cancellation_id: c.id,
        p_timezone: env.timezone(),
      });
      if (error) {
        console.error(`Couldn't apply cancellation ${c.id}`, error);
        continue;
      }
      reversed += 1;
      events.push(...parseEvents(data));
    }
  }
  const received = parsed.data.messages.filter((m) => m.kind === "received");
  if (received.length === 0) {
    await dispatchEvents(events);
    return NextResponse.json({ ok: true, new: 0, matched: 0, cancelled: reversed });
  }

  // Store new payments; duplicates (already-seen Gmail message ids) are skipped.
  const { data: inserted, error: insertError } = await admin
    .from("payments")
    .upsert(
      received.map((m) => ({
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
  if (!inserted?.length) {
    await dispatchEvents(events);
    return NextResponse.json({ ok: true, new: 0, matched: 0, cancelled: reversed });
  }

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

  const messages = new Map(received.map((m) => [m.id, m]));
  let matched = 0;

  for (const payment of inserted) {
    const msg = messages.get(payment.gmail_message_id!)!;
    const result = matchPayment(
      { senderName: msg.senderName, amountCents: msg.amountCents!, memo: msg.memo, text: msg.text },
      candidates,
    );

    if (result.kind === "unmatched") {
      const update = (await isHostMarkedPaid(admin, result))
        ? { note: HOST_MARKED_NOTE, dismissed: true }
        : { note: result.reason };
      await admin.from("payments").update(update).eq("id", payment.id);
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
      candidate.paidCents = (candidate.paidCents ?? 0) + msg.amountCents!;
      if (applied.some((e) => e.event === "confirmed")) candidate.status = "confirmed";
    }
  }

  await dispatchEvents(events);
  return NextResponse.json({ ok: true, new: inserted.length, matched, cancelled: reversed });
}

/** A ref code for a confirmed sign-up that only a host's "Mark paid" covers (see `onlyHostMarked`). */
async function isHostMarkedPaid(
  admin: ReturnType<typeof createAdminClient>,
  result: Extract<MatchResult, { kind: "unmatched" }>,
) {
  if (result.status !== "confirmed" || !result.registrationId) return false;
  const { data } = await admin
    .from("payments")
    .select("gmail_message_id, matched_by")
    .eq("registration_id", result.registrationId)
    .is("reversed_at", null);
  return onlyHostMarked(data ?? []);
}
