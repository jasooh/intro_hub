import "server-only";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { MessageThread, Profile, ThreadMessage } from "@/lib/types";

// Reads for the inbox pages. Threads and messages come through the signed-in
// user's client, so RLS decides what they can see (a player: their own; a
// host: everything). Names of host authors are then looked up with the admin
// client, because players can't read other profiles.

export type Viewer = "player" | "host";
type Who = Pick<Profile, "display_name" | "full_name" | "email" | "avatar_url">;

export type ThreadRow = MessageThread & {
  player: Who | null;
  /** The newest message, for the list's one-line preview. */
  snippet: string | null;
};

export type MessageView = ThreadMessage & { authorName: string; authorAvatar: string | null };

const WHO = "display_name, full_name, email, avatar_url";

export const whoName = (p: Pick<Who, "display_name" | "full_name" | "email"> | null | undefined, fallback = "Player") =>
  p?.display_name ?? p?.full_name ?? p?.email ?? fallback;

/** Whether this side hasn't seen the latest message yet. */
export function isUnread(t: Pick<MessageThread, "last_from_host" | "last_message_at" | "player_read_at" | "host_read_at">, viewer: Viewer) {
  const readAt = viewer === "host" ? t.host_read_at : t.player_read_at;
  const fromOtherSide = viewer === "host" ? !t.last_from_host : t.last_from_host;
  return fromOtherSide && (readAt == null || readAt < t.last_message_at);
}

/** Newest threads first. A player gets their own; hosts get the whole inbox. */
export async function loadThreads(limit = 300): Promise<ThreadRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("message_threads")
    .select(`*, player:profiles!message_threads_profile_id_fkey(${WHO}), messages(body, created_at)`)
    .order("last_message_at", { ascending: false })
    .order("created_at", { ascending: false, referencedTable: "messages" })
    .limit(1, { referencedTable: "messages" })
    .limit(limit);
  return ((data ?? []) as unknown as (MessageThread & { player: Who | null; messages: { body: string }[] })[]).map(
    ({ messages, ...t }) => ({ ...t, snippet: messages?.[0]?.body ?? null }),
  );
}

/** One thread with its messages (oldest first), or null if it doesn't exist or isn't theirs. */
export async function loadThread(id: string): Promise<{ thread: MessageThread & { player: Who | null }; messages: MessageView[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data: thread } = await supabase
    .from("message_threads")
    .select(`*, player:profiles!message_threads_profile_id_fkey(${WHO})`)
    .eq("id", id)
    .maybeSingle<MessageThread & { player: Who | null }>();
  if (!thread) return null;

  const { data: msgs } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  const messages = (msgs ?? []) as ThreadMessage[];

  const authorIds = [...new Set(messages.map((m) => m.author_id).filter((x): x is string => !!x))];
  const people = new Map<string, Who>();
  if (authorIds.length) {
    const { data: authors } = await createAdminClient()
      .from("profiles")
      .select(`id, ${WHO}`)
      .in("id", authorIds);
    for (const a of (authors ?? []) as (Who & { id: string })[]) people.set(a.id, a);
  }

  return {
    thread,
    messages: messages.map((m) => {
      const a = m.author_id ? people.get(m.author_id) : undefined;
      return {
        ...m,
        authorName: m.from_host ? (a ? whoName(a, "Host") : "Host") : whoName(a ?? thread.player),
        authorAvatar: a?.avatar_url ?? (m.from_host ? null : (thread.player?.avatar_url ?? null)),
      };
    }),
  };
}
