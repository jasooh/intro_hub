"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { WAIVER_VERSION } from "@/lib/agreements";
import { requireProfile } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { cleanName, cleanNameList, cleanText, normalizePhone } from "@/lib/input";
import { OPTION_LABELS, profileComplete } from "@/lib/profile";
import { dispatchEvents, parseEvents } from "@/lib/registrations";
import { createClient } from "@/lib/supabase/server";

const ERRORS: Record<string, string> = {
  not_authenticated: "Please sign in first.",
  session_unavailable: "This session isn't available any more.",
  signups_not_open: "Sign-ups haven't opened yet.",
  session_started: "This session has already started.",
  forbidden: "You can't do that.",
  profile_incomplete: "Please finish your profile first.",
  option_unavailable: "That option isn't offered for this session.",
  option_locked: "You've already paid, so the option can't be changed here. Please contact the host.",
  too_many_signups: "You've signed up for this session a few times already. Please message the host if you still need a spot.",
  slow_down: "That's a lot of sign-ups in a short time. Please wait a bit and try again.",
};

function friendly(message: string) {
  const key = Object.keys(ERRORS).find((k) => message.includes(k));
  return key ? ERRORS[key] : "Something went wrong. Please try again.";
}

const Option = z.enum(["full", "instructional"]);

export async function registerForSession(sessionId: string, formData: FormData) {
  const path = `/s/${sessionId}`;
  const profile = await requireProfile(path);
  if (!profileComplete(profile)) redirect(`/onboarding?next=${encodeURIComponent(path)}`);

  const option = Option.catch("full").parse(formData.get("option"));
  const note = String(formData.get("note") ?? "").slice(0, 1000);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_for_session", {
    p_session_id: sessionId,
    p_option: option,
    p_note: note || null,
  });
  if (error) {
    if (error.message.includes("profile_incomplete")) redirect(`/onboarding?next=${encodeURIComponent(path)}`);
    redirect(`${path}?error=${encodeURIComponent(friendly(error.message))}`);
  }

  const events = parseEvents(data);
  after(() => dispatchEvents(events));
  revalidatePath(path);
  await flash("success", SIGNED_UP[events[0]?.event ?? ""] ?? "You're already signed up for this session.");
}

const SIGNED_UP: Record<string, string> = {
  signed_up: "You're signed up! Send the e-Transfer to lock in your spot.",
  waitlisted: "You're on the waitlist. We'll email you if a spot opens up.",
  confirmed: "You're in! See you on court.",
};

export async function changeOption(registrationId: string, option: "full" | "instructional", returnTo: string) {
  await requireProfile(returnTo);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("change_registration_option", {
    p_registration_id: registrationId,
    p_option: option,
  });
  if (error) redirect(`${returnTo}?error=${encodeURIComponent(friendly(error.message))}`);

  const events = parseEvents(data);
  after(() => dispatchEvents(events));
  revalidatePath(returnTo);
  await flash("success", `Switched to ${OPTION_LABELS[option]}`);
}

export async function cancelRegistration(registrationId: string, returnTo: string) {
  await requireProfile(returnTo);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_registration", { p_registration_id: registrationId });
  if (error) redirect(`${returnTo}?error=${encodeURIComponent(friendly(error.message))}`);

  const events = parseEvents(data);
  after(() => dispatchEvents(events));
  revalidatePath(returnTo);
  await flash("success", "Your spot is cancelled.");
}

const text = (max: number) => z.string().transform(cleanText).pipe(z.string().max(max, `Please keep it under ${max} characters`));
const required = (label: string, max: number) =>
  z.string().transform(cleanText).pipe(z.string().min(1, `${label} is required`).max(max, `${label} is too long`));
const personName = (label: string) =>
  required(label, 60).transform((v, ctx) => {
    const r = cleanName(v);
    if (!r.ok) {
      ctx.addIssue({ code: "custom", message: `${label} can only use letters, spaces, apostrophes, hyphens and periods` });
      return z.NEVER;
    }
    return r.value;
  });
const phone = z.string().transform((v, ctx) => {
  if (!v.trim()) {
    ctx.addIssue({ code: "custom", message: "Contact number is required" });
    return z.NEVER;
  }
  const r = normalizePhone(v);
  if (!r.ok) {
    ctx.addIssue({ code: "custom", message: r.error });
    return z.NEVER;
  }
  return r.value;
});

const ProfileForm = z
  .object({
    first_name: personName("First name"),
    last_name: personName("Last name"),
    display_name: required("Display name", 60).transform((v) => v.replace(/\n/g, " ")),
    phone,
    skill_level: z.enum(["never", "some", "experienced", "prefer_not"], { message: "Please pick your skill level" }),
    attended_before: z.enum(["yes", "no"], { message: "Please say whether you've attended before" }),
    learning_goals: text(500),
    hype_song: text(200),
    heard_about: z.enum(["word_of_mouth", "instagram", "javelin", "other"]).optional(),
    heard_about_other: text(100),
    media_consent: z.enum(["agree", "disagree"], { message: "Please answer the media release" }),
    waiver: z.literal("on", { message: "Please accept the waiver to play" }),
    announcement_emails: z.literal("on").optional(),
    etransfer_names: z.string().max(300).default(""),
    next: z.string().default("/"),
    return_to: z.string().default("/onboarding"),
  })
  .partial({ learning_goals: true, hype_song: true, heard_about_other: true });

const localPath = (p: string, fallback: string) => (p.startsWith("/") && !p.startsWith("//") ? p : fallback);

/** `path` with `params` added to its query string. */
function withParams(path: string, params: Record<string, string>) {
  const url = new URL(path, "http://x");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return `${url.pathname}${url.search}`;
}

export async function saveProfile(formData: FormData) {
  const profile = await requireProfile("/onboarding");
  const raw = Object.fromEntries(formData);
  const returnTo = localPath(typeof raw.return_to === "string" ? raw.return_to : "", "/onboarding");
  const parsed = ProfileForm.safeParse(raw);
  if (!parsed.success) {
    redirect(withParams(returnTo, { error: parsed.error.issues[0].message }));
  }
  const f = parsed.data;
  const names = cleanNameList(f.etransfer_names, 5);
  const consent = f.media_consent === "agree";
  const now = new Date().toISOString();
  const waiverIsCurrent = profile.waiver_accepted_at && profile.waiver_version === WAIVER_VERSION;

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: f.first_name,
      last_name: f.last_name,
      display_name: f.display_name,
      phone: f.phone,
      skill_level: f.skill_level,
      attended_before: f.attended_before === "yes",
      learning_goals: f.learning_goals || null,
      hype_song: f.hype_song || null,
      heard_about: f.heard_about ?? null,
      heard_about_other: f.heard_about === "other" ? f.heard_about_other || null : null,
      media_consent: consent,
      media_consent_at: profile.media_consent === consent ? profile.media_consent_at : now,
      waiver_accepted_at: waiverIsCurrent ? profile.waiver_accepted_at : now,
      waiver_version: WAIVER_VERSION,
      etransfer_names: names.length ? names : [`${f.first_name} ${f.last_name}`],
      announcement_emails: f.announcement_emails === "on",
      onboarded_at: profile.onboarded_at ?? now,
    })
    .eq("id", profile.id);
  if (error) redirect(withParams(returnTo, { error: error.message }));

  revalidatePath("/", "layout");
  await flash("success", "Profile saved");
  redirect(localPath(f.next, "/"));
}
