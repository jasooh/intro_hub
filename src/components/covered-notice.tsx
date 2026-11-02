import { getProfile } from "@/lib/auth";
import { getAttendees } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { CoveredDialog } from "@/components/covered-dialog";

/**
 * A one-time pop-up when another player picked the signed-in player's unpaid
 * sign-up to pay for (registrations.covered_seen tracks it).
 */
export async function CoveredNotice() {
  const profile = await getProfile();
  if (!profile) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("registrations")
    .select("id, covered_by, session:sessions(id, title)")
    .eq("profile_id", profile.id)
    .eq("status", "pending_payment")
    .eq("covered_seen", false)
    .not("covered_by", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; covered_by: string; session: { id: string; title: string } | null }>();
  if (!data?.session) return null;

  const payer = (await getAttendees(data.session.id)).find((a) => a.registration_id === data.covered_by);
  if (!payer) return null;
  return (
    <CoveredDialog
      registrationId={data.id}
      sessionId={data.session.id}
      payerName={payer.display_name}
      sessionTitle={data.session.title}
    />
  );
}
