import "server-only";
import { formatDateTime } from "@/lib/format";
import type { HostBadges } from "@/lib/host-pages";
import { getOwedSignups, getUpcomingSessions } from "@/lib/queries";
import { owedTotals } from "@/lib/owed";
import { createClient } from "@/lib/supabase/server";

export type HostMenuData = { badges: HostBadges; nextSession: { id: string; label: string } | null };

/** Counts for the avatar panel (hosts only): what's waiting on each page, and the next session. */
export async function getHostMenuData(): Promise<HostMenuData> {
  const supabase = await createClient();
  const head = { count: "exact", head: true } as const;
  const [payments, cancellations, refunds, feedback, messages, owing, upcoming] = await Promise.all([
    supabase.from("payments").select("id", head).is("registration_id", null).eq("dismissed", false).is("reversed_at", null),
    supabase.from("payment_cancellations").select("id", head).is("payment_id", null).is("dismissed_at", null),
    supabase
      .from("registrations")
      .select("id", head)
      .eq("refund_owed", true)
      .is("refunded_at", null)
      .is("refund_waived_at", null),
    supabase.from("feedback").select("id", head).is("handled_at", null),
    supabase.rpc("unread_message_count"),
    getOwedSignups(),
    getUpcomingSessions(1, { includeCancelled: false }),
  ]);
  const next = upcoming[0];
  return {
    badges: {
      payments: (payments.count ?? 0) + (cancellations.count ?? 0),
      owed: owedTotals(owing).size,
      refunds: refunds.count ?? 0,
      feedback: feedback.count ?? 0,
      messages: typeof messages.data === "number" ? messages.data : 0,
    },
    nextSession: next ? { id: next.id, label: `${next.title} · ${formatDateTime(next.starts_at)}` } : null,
  };
}
