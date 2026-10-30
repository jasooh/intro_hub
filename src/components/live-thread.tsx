"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Re-renders the page when a message arrives (Supabase Realtime). Pass a
 * threadId on a conversation, or nothing on an inbox list. Row-level security
 * means each person is only told about messages they can read.
 */
export function LiveThread({ threadId }: { threadId?: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 500);
    };
    const channel = supabase
      .channel(`messages:${threadId ?? "all"}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          ...(threadId ? { filter: `thread_id=eq.${threadId}` } : {}),
        },
        refresh,
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router, threadId]);

  return null;
}
