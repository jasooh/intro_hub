"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/** Re-renders the page whenever a session's roster changes (via Supabase Realtime). */
export function LiveRefresh({ sessionId }: { sessionId?: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
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
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, sessionId]);

  return null;
}
