import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { HEARD_LABELS, OPTION_LABELS, SKILL_LABELS } from "@/lib/profile";
import type { Payment, Profile, Registration, Session } from "@/lib/types";

function csvCell(value: unknown) {
  const s = value == null ? "" : String(value);
  // Quote everything and neutralize spreadsheet formulas.
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
}

export async function GET(_request: Request, ctx: RouteContext<"/admin/sessions/[id]/roster.csv">) {
  const profile = await getProfile();
  if (profile?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const supabase = await createClient();
  const [{ data: session }, { data: regs }] = await Promise.all([
    supabase.from("sessions").select("*").eq("id", id).maybeSingle<Session>(),
    supabase
      .from("registrations")
      .select("*, profile:profiles(*), payments(amount_cents, sender_name, matched_by, received_at)")
      .eq("session_id", id)
      .order("created_at"),
  ]);
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });

  const rows = (regs ?? []) as (Registration & { profile: Profile; payments: Payment[] })[];
  const header = [
    "display_name", "first_name", "last_name", "email", "phone", "option", "owes", "status", "ref_code",
    "skill_level", "attended_before", "media_consent", "note", "learning_goals", "hype_song", "heard_about",
    "signed_up_at", "confirmed_at", "paid", "payer_name", "matched_by", "refund_owed", "refunded_at",
  ];
  const lines = rows.map((r) => {
    const p = r.payments[0];
    return [
      r.profile.display_name ?? r.profile.full_name,
      r.profile.first_name,
      r.profile.last_name,
      r.profile.email,
      r.profile.phone,
      OPTION_LABELS[r.option],
      (r.amount_cents / 100).toFixed(2),
      r.status,
      r.ref_code,
      r.profile.skill_level ? SKILL_LABELS[r.profile.skill_level] : "",
      r.profile.attended_before == null ? "" : r.profile.attended_before ? "yes" : "no",
      r.profile.media_consent == null ? "" : r.profile.media_consent ? "agree" : "DISAGREE",
      r.note,
      r.profile.learning_goals,
      r.profile.hype_song,
      r.profile.heard_about === "other" ? r.profile.heard_about_other : r.profile.heard_about ? HEARD_LABELS[r.profile.heard_about] : "",
      r.created_at,
      r.confirmed_at,
      p ? (p.amount_cents / 100).toFixed(2) : "",
      p?.sender_name,
      p?.matched_by,
      r.refund_owed,
      r.refunded_at,
    ]
      .map(csvCell)
      .join(",");
  });

  const filename = `roster-${session.starts_at.slice(0, 10)}.csv`;
  return new NextResponse([header.join(","), ...lines].join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
