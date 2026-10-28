import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { Post, PostAuthor, PublicPost, Session, SessionCounts } from "@/lib/types";

// Cached reads for the public pages (home, /sessions, /s/[id], /updates). Page
// views are served from the cache instead of hitting the database each time;
// server actions that change the data call updateTag() with these tags so the
// person who made the change sees it straight away (CACHE_TAGS below).

export const CACHE_TAGS = {
  sessions: "sessions",
  session: (id: string) => `session:${id}`,
  counts: "counts",
  posts: "posts",
} as const;

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/** Upcoming sessions players can see (not cancelled), soonest first. */
export async function getPublicSessions(limit = 10): Promise<Session[]> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 3600 });
  cacheTag(CACHE_TAGS.sessions);
  const { data } = await createPublicClient()
    .from("sessions")
    .select("*")
    .gt("ends_at", new Date().toISOString())
    .neq("status", "cancelled")
    .order("starts_at")
    .limit(limit);
  return (data ?? []) as Session[];
}

export async function getPublicSession(id: string): Promise<Session | null> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 3600 });
  cacheTag(CACHE_TAGS.sessions, CACHE_TAGS.session(id));
  if (!isUuid(id)) return null;
  const { data } = await createPublicClient().from("sessions").select("*").eq("id", id).maybeSingle<Session>();
  return data;
}

/** Spot counts change often (and by the every-minute job), so they're kept only briefly. */
async function getPublicCountList(sessionIds: string[]): Promise<SessionCounts[]> {
  "use cache";
  cacheLife({ stale: 10, revalidate: 15, expire: 600 });
  cacheTag(CACHE_TAGS.counts);
  const { data } = await createPublicClient().rpc("get_session_counts", { p_session_ids: sessionIds });
  return (data ?? []) as SessionCounts[];
}

export async function getPublicCounts(sessionIds: string[]): Promise<Map<string, SessionCounts>> {
  if (sessionIds.length === 0) return new Map();
  const list = await getPublicCountList([...sessionIds].sort());
  return new Map(list.map((c) => [c.session_id, c]));
}

/** Adds each post's poster (name + avatar) via get_post_authors (profiles are private). */
async function withAuthors(posts: Post[]): Promise<PublicPost[]> {
  if (posts.length === 0) return [];
  const { data } = await createPublicClient().rpc("get_post_authors", { p_post_ids: posts.map((p) => p.id) });
  const byPost = new Map(
    ((data ?? []) as (PostAuthor & { post_id: string })[]).map((a) => [a.post_id, { name: a.name, avatar_url: a.avatar_url }]),
  );
  return posts.map((p) => ({ ...p, author: byPost.get(p.id) ?? null }));
}

/** Published host posts, newest first. */
export async function getPublicPosts(limit = 50): Promise<PublicPost[]> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 86400 });
  cacheTag(CACHE_TAGS.posts);
  const { data } = await createPublicClient()
    .from("posts")
    .select("*")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(limit);
  return withAuthors((data ?? []) as Post[]);
}

export async function getPublicPost(id: string): Promise<PublicPost | null> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 86400 });
  cacheTag(CACHE_TAGS.posts);
  if (!isUuid(id)) return null;
  const { data } = await createPublicClient()
    .from("posts")
    .select("*")
    .eq("id", id)
    .not("published_at", "is", null)
    .maybeSingle<Post>();
  return data ? (await withAuthors([data]))[0] : null;
}

/** The one post featured on the home page, if any. */
export async function getPublicFeaturedPost(): Promise<PublicPost | null> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 86400 });
  cacheTag(CACHE_TAGS.posts);
  const { data } = await createPublicClient()
    .from("posts")
    .select("*")
    .eq("featured", true)
    .not("published_at", "is", null)
    .maybeSingle<Post>();
  return data ? (await withAuthors([data]))[0] : null;
}
