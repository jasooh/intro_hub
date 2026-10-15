import "server-only";
import { render } from "@react-email/components";
import { buildAnnouncementEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { env } from "@/lib/env";
import { sanitizePostHtml } from "@/lib/rich-text";
import { createAdminClient } from "@/lib/supabase/server";
import type { Post, Profile } from "@/lib/types";

type Recipient = Pick<Profile, "id" | "email" | "display_name" | "full_name">;

/** Players who'll get a host announcement: finished their profile and haven't opted out. */
export async function announcementRecipients(): Promise<Recipient[]> {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id, email, display_name, full_name")
    .eq("announcement_emails", true)
    .not("onboarded_at", "is", null);
  if (error) throw error;
  return (data ?? []) as Recipient[];
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Emails a published post to every opted-in player, one at a time with a short
 * pause (Gmail throttles bursts and caps a personal account at ~500 a day).
 * Each send is claimed in email_log first, so a retry never double-sends.
 */
export async function sendPostToPlayers(postId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: post, error } = await admin.from("posts").select("*").eq("id", postId).maybeSingle<Post>();
  if (error) throw error;
  if (!post || !post.published_at) return;

  const appUrl = env.appUrl();
  const bodyHtml = sanitizePostHtml(post.body_html);
  for (const r of await announcementRecipients()) {
    const dedupeKey = `post:${post.id}:${r.id}`;
    const { error: claimError } = await admin.from("email_log").insert({ dedupe_key: dedupeKey, kind: "announcement" });
    if (claimError) {
      if (claimError.code !== "23505") console.error(`Couldn't claim announcement email for ${r.id}`, claimError);
      continue; // already sent (or claim failed)
    }
    const { subject, element } = buildAnnouncementEmail({
      title: post.title,
      bodyHtml,
      playerName: r.display_name ?? r.full_name ?? "there",
      postUrl: `${appUrl}/updates/${post.id}`,
      profileUrl: `${appUrl}/me`,
    });
    try {
      await sendEmail({
        to: r.email,
        subject,
        html: await render(element),
        text: await render(element, { plainText: true }),
      });
    } catch (err) {
      await admin.from("email_log").delete().eq("dedupe_key", dedupeKey);
      console.error(`Failed to send announcement to ${r.id}`, err);
    }
    await pause(400);
  }
}
