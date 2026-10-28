import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

// Uploaded avatars live in the private "avatars" bucket at <profile id>/<seed>.webp
// (supabase/migrations/20261127000000_photo_avatars.sql). Only the server touches it.

const BUCKET = "avatars";
const pathOf = (profileId: string, seed: string) => `${profileId}/${seed}.webp`;

export async function savePhoto(profileId: string, seed: string, webp: Buffer) {
  const { error } = await createAdminClient()
    .storage.from(BUCKET)
    .upload(pathOf(profileId, seed), webp, { contentType: "image/webp", upsert: true });
  if (error) throw error;
}

export async function readPhoto(profileId: string, seed: string): Promise<Blob | null> {
  const { data } = await createAdminClient().storage.from(BUCKET).download(pathOf(profileId, seed));
  return data ?? null;
}

/** Deletes a player's uploaded pictures, except the seeds in `keep`. */
export async function removePhotos(profileId: string, keep: string[] = []) {
  const storage = createAdminClient().storage.from(BUCKET);
  const { data } = await storage.list(profileId, { limit: 100 });
  const doomed = (data ?? []).map((f) => `${profileId}/${f.name}`).filter((p) => !keep.some((s) => p === pathOf(profileId, s)));
  if (doomed.length) await storage.remove(doomed);
}
