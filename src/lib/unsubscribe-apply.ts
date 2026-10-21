import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { UNSUBSCRIBE_COLUMNS, verifyUnsubscribe } from "@/lib/unsubscribe";

/** Turn off one kind of optional email for a signed link. Returns false for a bad link. */
export async function applyUnsubscribe(profileId: string, kind: string, token: string): Promise<boolean> {
  if (!verifyUnsubscribe(profileId, kind, token)) return false;
  const { error } = await createAdminClient()
    .from("profiles")
    .update({ [UNSUBSCRIBE_COLUMNS[kind]]: false })
    .eq("id", profileId);
  if (error) throw error;
  return true;
}
