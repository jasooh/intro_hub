"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";

/** Tick a player's hype song off as added to the Spotify playlist (bookkeeping only), or untick it. */
export async function setSongAdded(profileId: string, song: string, added: boolean) {
  const host = await requireAdmin();
  const supabase = await createClient();
  const { error } = added
    ? await supabase
        .from("song_checklist")
        .upsert({ profile_id: profileId, song, checked_at: new Date().toISOString(), checked_by: host.id })
    : await supabase.from("song_checklist").delete().eq("profile_id", profileId);
  if (error) redirect(`/admin/songs?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/songs");
  await flash("success", added ? "Marked as added to the playlist" : "Moved back to To add");
}
