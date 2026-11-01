import { getProfile } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { NoShowDialog } from "@/components/no-show-dialog";

/**
 * A one-time, polite pop-up after a host marked the signed-in player as a
 * no-show: asks them to cancel early next time. Shows until they tap "Got it"
 * (profiles.no_show_seen catches up to no_show_count). They never see the count.
 */
export async function NoShowNotice() {
  const profile = await getProfile();
  if (!profile || profile.no_show_count <= profile.no_show_seen) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("registrations")
    .select("session:sessions(title, starts_at)")
    .eq("profile_id", profile.id)
    .not("no_show_at", "is", null)
    .order("no_show_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ session: { title: string; starts_at: string } | null }>();

  const session = data?.session;
  return <NoShowDialog sessionTitle={session?.title ?? null} when={session ? formatDateTime(session.starts_at) : null} />;
}
