"use client";

import { useEffect } from "react";
import { markThreadRead } from "@/app/me/messages/actions";

/** Marks the open thread read, now and again whenever a newer message arrives while it's open. */
export function MarkRead({ threadId, unread, lastMessageAt }: { threadId: string; unread: boolean; lastMessageAt: string }) {
  useEffect(() => {
    if (unread) void markThreadRead(threadId);
  }, [threadId, unread, lastMessageAt]);
  return null;
}
