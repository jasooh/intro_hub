"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/** Re-renders the page whenever a session's roster changes (via Supabase Realtime). */
export function LiveRefresh({ sessionId }: { sessionId?: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`sessions:${sessionId ?? "all"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sessions",
          ...(sessionId ? { filter: `id=eq.${sessionId}` } : {}),
        },
        () => {
          // A burst of changes (e.g. several sign-ups at once) becomes one refresh.
          clearTimeout(timer);
          timer = setTimeout(() => router.refresh(), 1000);
        },
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router, sessionId]);

  return null;
}
