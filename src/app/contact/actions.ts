"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { getProfile } from "@/lib/auth";
import { env } from "@/lib/env";
import { flash } from "@/lib/flash";
import { sendEmail } from "@/lib/email/send";
import { createAdminClient } from "@/lib/supabase/server";
import { CONTACT_EMAIL, FEEDBACK_LIMITS } from "./limits";

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const schema = z.object({
  message: z.string().trim().min(1, "Write a message first").max(FEEDBACK_LIMITS.message, "That message is too long"),
  name: optional(FEEDBACK_LIMITS.name),
  email: optional(FEEDBACK_LIMITS.email).pipe(z.email("That email doesn't look right").nullable()),
  anonymous: z.boolean(),
});

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Contact-page feedback: stored for hosts (/admin/feedback) and emailed to the club inbox. */
export async function submitFeedback(formData: FormData) {
  // Honeypot: people never see this field, bots fill it in. Pretend it worked.
  if (String(formData.get("website") ?? "")) {
    await flash("success", "Thanks! Your feedback was sent.");
    redirect("/contact");
  }

  const anonymous = formData.get("anonymous") === "on";
  const parsed = schema.safeParse({
    message: String(formData.get("message") ?? ""),
    name: anonymous ? "" : String(formData.get("name") ?? ""),
    email: anonymous ? "" : String(formData.get("email") ?? ""),
    anonymous,
  });
  if (!parsed.success) redirect(`/contact?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  const { message, name, email } = parsed.data;
  const profile = anonymous ? null : await getProfile();

  const { error } = await createAdminClient()
    .from("feedback")
    .insert({ message, name, email, profile_id: profile?.id ?? null });
  if (error) redirect(`/contact?error=${encodeURIComponent("Couldn't send that. Please try again.")}`);

  const from = anonymous ? "Anonymous" : [name, email].filter(Boolean).join(" · ") || profile?.display_name || "No name given";
  const account = profile ? `Signed in as ${profile.display_name ?? profile.full_name ?? profile.email} (${profile.email})` : null;
  after(() =>
    sendEmail({
      to: CONTACT_EMAIL,
      subject: `New feedback from ${anonymous ? "someone anonymous" : from}`,
      text: [`From: ${from}`, account, "", message, "", `All feedback: ${env.appUrl()}/admin/feedback`]
        .filter((l) => l !== null)
        .join("\n"),
      html: [
        `<p><b>From:</b> ${escape(from)}</p>`,
        account ? `<p>${escape(account)}</p>` : "",
        `<p style="white-space:pre-wrap">${escape(message)}</p>`,
        `<p><a href="${env.appUrl()}/admin/feedback">All feedback</a></p>`,
      ].join(""),
    }).catch((e) => console.error("[feedback] email failed", e)),
  );

  await flash("success", "Thanks! Your feedback was sent.");
  redirect("/contact");
}
