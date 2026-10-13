import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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
  const header = ["name", "email", "status", "ref_code", "signed_up_at", "confirmed_at", "paid", "payer_name", "matched_by", "refund_owed", "refunded_at"];
  const lines = rows.map((r) => {
    const p = r.payments[0];
    return [
      r.profile.display_name ?? r.profile.full_name,
      r.profile.email,
      r.status,
      r.ref_code,
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
