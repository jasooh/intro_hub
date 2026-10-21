import "server-only";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/public-data";

// Expire cached public data from a server action (updateTag only works there),
// so the person who made a change sees it on their next view.

/** A sign-up changed: spot counts. */
export const expireCounts = () => updateTag(CACHE_TAGS.counts);

/** A session was created, edited or cancelled. */
export function expireSession(sessionId?: string) {
  updateTag(CACHE_TAGS.sessions);
  if (sessionId) updateTag(CACHE_TAGS.session(sessionId));
  updateTag(CACHE_TAGS.counts);
}

export const expirePosts = () => updateTag(CACHE_TAGS.posts);

/** Dev tools edits can touch anything. */
export function expireAllPublic() {
  updateTag(CACHE_TAGS.sessions);
  updateTag(CACHE_TAGS.counts);
  updateTag(CACHE_TAGS.posts);
}
