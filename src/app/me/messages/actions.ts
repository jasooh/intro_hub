"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireProfile } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { messageError } from "@/lib/message-errors";
import { notifyNewMessage } from "@/lib/messages";
import { allowed, SLOW_DOWN } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

/** A player starts a thread with the hosts. */
export async function startThread(formData: FormData) {
  const me = await requireProfile("/me/messages");
  const back = (msg: string): never => redirect(`/me/messages/new?error=${encodeURIComponent(msg)}`);
  if (!(await allowed("player-action", me.id, 20, 60))) back(SLOW_DOWN);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("player_start_thread", {
    p_subject: text(formData.get("subject")),
    p_body: text(formData.get("body")),
  });
  if (error) back(messageError(error.message));
  const row = (data as { t_id: string; m_id: string }[] | null)?.[0];
  if (!row) back("Couldn't send that. Please try again.");

  after(() => notifyNewMessage(row!.m_id));
  revalidatePath("/me/messages");
  await flash("success", "Message sent to the hosts");
  redirect(`/me/messages/${row!.t_id}`);
}

/** Marks a thread read for whoever is looking at it (player or host) and refreshes the unread badges. */
export async function markThreadRead(threadId: string) {
  await requireProfile("/me/messages");
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_thread_read", { p_thread_id: threadId });
  if (error) return;
  revalidatePath("/", "layout");
}

/** A player replies in one of their threads. */
export async function replyToThread(threadId: string, formData: FormData) {
  const me = await requireProfile("/me/messages");
  const path = `/me/messages/${threadId}`;
  const back = (msg: string): never => redirect(`${path}?error=${encodeURIComponent(msg)}`);
  if (!(await allowed("player-action", me.id, 20, 60))) back(SLOW_DOWN);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_message", {
    p_thread_id: threadId,
    p_body: text(formData.get("body")),
  });
  if (error) back(messageError(error.message));

  after(() => notifyNewMessage(data as string));
  revalidatePath(path);
  await flash("success", "Reply sent");
}
