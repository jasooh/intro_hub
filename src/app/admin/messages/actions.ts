"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { AUDIENCES, audienceOf } from "@/lib/audiences";
import { requireAdmin } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { messageError } from "@/lib/message-errors";
import { notifyNewMessage, notifyNewMessages } from "@/lib/messages";
import { createClient } from "@/lib/supabase/server";

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

const Recipients = z.union([
  z.object({ to: z.string().uuid() }),
  z.object({ session: z.string().uuid(), audiences: z.array(z.enum(AUDIENCES)).min(1, "Pick at least one group") }),
]);

/**
 * A host starts threads: with one player (`to`), or with everyone in the ticked
 * groups of a session (one private thread each).
 */
export async function hostStartThreads(formData: FormData) {
  await requireAdmin();
  const to = text(formData.get("to"));
  const session = text(formData.get("session"));
  const here = to ? `/admin/messages/new?to=${to}` : `/admin/messages/new?session=${session}`;
  const back = (msg: string): never => redirect(`${here}&error=${encodeURIComponent(msg)}`);

  const parsed = Recipients.safeParse(to ? { to } : { session, audiences: formData.getAll("audiences") });
  if (!parsed.success) back(parsed.error.issues[0]?.message ?? "Pick who to message");
  const r = parsed.data!;

  const supabase = await createClient();
  let ids: string[];
  let sessionId: string | null = null;
  if ("to" in r) {
    ids = [r.to];
  } else {
    sessionId = r.session;
    const { data: regs, error } = await supabase
      .from("registrations")
      .select("profile_id, status, option")
      .eq("session_id", r.session);
    if (error) back(error.message);
    ids = [
      ...new Set(
        (regs ?? [])
          .filter((x) => {
            const a = audienceOf(x);
            return a != null && r.audiences.includes(a);
          })
          .map((x) => x.profile_id),
      ),
    ];
  }

  const { data, error } = await supabase.rpc("host_start_threads", {
    p_profile_ids: ids,
    p_subject: text(formData.get("subject")),
    p_body: text(formData.get("body")),
    p_session_id: sessionId,
  });
  if (error) back(messageError(error.message));
  const rows = (data ?? []) as { t_id: string; p_id: string; m_id: string }[];
  if (rows.length === 0) back("Nobody there can get messages (guests and unfinished accounts are skipped).");

  after(() => notifyNewMessages(rows.map((x) => x.m_id)));
  revalidatePath("/admin/messages");
  const skipped = ids.length - rows.length;
  await flash(
    "success",
    rows.length === 1
      ? "Message sent"
      : `Sent to ${rows.length} players${skipped > 0 ? ` (${skipped} skipped: guests or unfinished accounts)` : ""}`,
  );
  redirect(rows.length === 1 ? `/admin/messages/${rows[0].t_id}` : "/admin/messages");
}

/** Any host replies in any thread. */
export async function hostReply(threadId: string, formData: FormData) {
  await requireAdmin();
  const path = `/admin/messages/${threadId}`;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_message", {
    p_thread_id: threadId,
    p_body: text(formData.get("body")),
  });
  if (error) redirect(`${path}?error=${encodeURIComponent(messageError(error.message))}`);

  after(() => notifyNewMessage(data as string));
  revalidatePath(path);
  revalidatePath("/admin/messages");
  await flash("success", "Reply sent");
}
