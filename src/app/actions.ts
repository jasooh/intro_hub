"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { WAIVER_VERSION } from "@/lib/agreements";
import { requireProfile } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { allowed, SLOW_DOWN } from "@/lib/rate-limit";
import { expireCounts } from "@/lib/public-cache";
import { cleanName, cleanNameList, cleanText, normalizePhone } from "@/lib/input";
import { MAX_TEAMMATES } from "@/lib/teams";
import { formatDateTime } from "@/lib/format";
import { IDENTITY_CHANGES_PER_DAY, OPTION_LABELS, profileComplete } from "@/lib/profile";
import type { SignupOption } from "@/lib/types";
import { dispatchEvents, parseEvents } from "@/lib/registrations";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { AVATAR_SEED_RE, PHOTO_STYLE, PROFILE_AVATAR_STYLES, randomSeed } from "@/lib/avatars";
import { AVATAR_MAX_BYTES, AvatarImageError, toAvatarWebp } from "@/lib/avatar-image";
import { removePhotos, savePhoto } from "@/lib/avatar-storage";

const ERRORS: Record<string, string> = {
  not_authenticated: "Please sign in first.",
  session_unavailable: "This session isn't available any more.",
  signups_not_open: "Sign-ups haven't opened yet.",
  session_started: "This session has already started.",
  forbidden: "You can't do that.",
  profile_incomplete: "Please finish your profile first.",
  blocked: "You can't sign up right now. Please contact the hosts.",
  option_unavailable: "That option isn't offered for this session.",
  option_locked: "You've already paid, so the option can't be changed here. Please contact the host.",
  too_many_signups: "You've signed up for this session a few times already. Please message the host if you still need a spot.",
  slow_down: "That's a lot of sign-ups in a short time. Please wait a bit and try again.",
  too_many_teammates: `You can ask for up to ${MAX_TEAMMATES} teammates.`,
  teammate_unavailable: "One of those players isn't signed up for drop-in anymore. Pick again.",
  maintenance: "Sign-ups are paused for a few minutes while we fix something. Please try again soon.",
  not_first_timer: "Bring a Friend is for first-time players.",
  buddy_unavailable: "Pick a regular (someone who's played before) who's signed up for this session.",
  friend_rate_unavailable: "This session is free, so there's no Bring a Friend rate.",
};

function friendly(message: string) {
  const key = Object.keys(ERRORS).find((k) => message.includes(k));
  return key ? ERRORS[key] : "Something went wrong. Please try again.";
}

const Option = z.enum(["full", "instructional", "dropin"]);

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

  expireCounts();
  const events = parseEvents(data);
  after(() => dispatchEvents(events));

  // Teammate requests (drop-in only) are saved once the sign-up exists.
  const teammates = teammateIds(formData);
  let teamNote = "";
  if (option !== "instructional" && teammates.length && events[0]) {
    const { error: teamError } = await supabase.rpc("set_team_requests", {
      p_registration_id: events[0].registration_id,
      p_requested: teammates,
    });
    if (teamError) teamNote = " We couldn't save your teammate picks; try again below.";
  }

  // Bring a Friend: a first-timer says who brought them, and both pay half.
  const buddy = String(formData.get("brought_by") ?? "");
  let friendNote = "";
  if (buddy && events[0]) {
    const { data: friendData, error: friendError } = await supabase.rpc("set_brought_by", {
      p_registration_id: events[0].registration_id,
      p_buddy_id: buddy,
    });
    if (friendError) {
      friendNote = ` ${friendly(friendError.message)}`;
    } else {
      const friendEvents = parseEvents(friendData);
      after(() => dispatchEvents(friendEvents));
      friendNote = " Bring a Friend: you both pay half.";
    }
  }

  revalidatePath(path);
  await flash("success", (SIGNED_UP[events[0]?.event ?? ""] ?? "You're already signed up for this session.") + teamNote + friendNote);
}

/** Bring a Friend from the session page: set, change or clear who brought you. */
/** Players' own changes: plenty for real use, stops scripted spam. */
async function playerLimit(profileId: string, path: string) {
  if (!(await allowed("player-action", profileId, 20, 60))) redirect(`${path}?error=${encodeURIComponent(SLOW_DOWN)}`);
}

export async function setBroughtBy(registrationId: string, sessionId: string, formData: FormData) {
  const path = `/s/${sessionId}`;
  const me = await requireProfile(path);
  await playerLimit(me.id, path);
  const buddy = String(formData.get("brought_by") ?? "") || null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_brought_by", { p_registration_id: registrationId, p_buddy_id: buddy });
  if (error) redirect(`${path}?error=${encodeURIComponent(friendly(error.message))}`);
  const events = parseEvents(data);
  after(() => dispatchEvents(events));
  revalidatePath(path);
  revalidatePath(`/admin/sessions/${sessionId}`);
  await flash("success", buddy ? "Bring a Friend applied: you both pay half." : "Bring a Friend removed.");
}

function teammateIds(formData: FormData) {
  return [...new Set(formData.getAll("teammates").map(String).filter(Boolean))].slice(0, MAX_TEAMMATES);
}

export async function setTeammates(registrationId: string, sessionId: string, formData: FormData) {
  const path = `/s/${sessionId}`;
  const me = await requireProfile(path);
  await playerLimit(me.id, path);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_team_requests", {
    p_registration_id: registrationId,
    p_requested: teammateIds(formData),
  });
  if (error) redirect(`${path}?error=${encodeURIComponent(friendly(error.message))}`);
  revalidatePath(path);
  revalidatePath(`/admin/sessions/${sessionId}`);
  await flash("success", "Teammate requests saved");
}

const SIGNED_UP: Record<string, string> = {
  signed_up: "You're signed up! Send the e-Transfer to lock in your spot.",
  waitlisted: "You're on the waitlist. We'll email you if a spot opens up.",
  confirmed: "You're in! See you on court.",
};

export async function changeOption(registrationId: string, option: SignupOption, returnTo: string) {
  const me = await requireProfile(returnTo);
  await playerLimit(me.id, returnTo);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("change_registration_option", {
    p_registration_id: registrationId,
    p_option: option,
  });
  if (error) redirect(`${returnTo}?error=${encodeURIComponent(friendly(error.message))}`);

  expireCounts();
  const events = parseEvents(data);
  after(() => dispatchEvents(events));
  revalidatePath(returnTo);
  await flash("success", `Switched to ${OPTION_LABELS[option]}`);
}

export async function cancelRegistration(registrationId: string, returnTo: string) {
  const me = await requireProfile(returnTo);
  await playerLimit(me.id, returnTo);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_registration", { p_registration_id: registrationId });
  if (error) redirect(`${returnTo}?error=${encodeURIComponent(friendly(error.message))}`);

  expireCounts();
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
const phoneField = (label: string) => z.string().transform((v, ctx) => {
  if (!v.trim()) {
    ctx.addIssue({ code: "custom", message: `${label} is required` });
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
    phone: phoneField("Contact number"),
    emergency_name: required("Emergency contact name", 100),
    emergency_relationship: required("Their relationship to you", 50),
    emergency_phone: phoneField("Emergency contact number"),
    adult: z.literal("on", { message: "Please confirm you're 18 or older" }),
    skill_level: z.enum(["1", "2", "3", "4", "5"], { message: "Please pick your skill level" }).transform(Number),
    // Asked once (it decides Bring a Friend); not sent again after it's answered.
    attended_before: z.enum(["yes", "no"]).optional(),
    learning_goals: text(500),
    hype_song: text(200),
    heard_about: z.enum(["word_of_mouth", "instagram", "javelin", "other"]).optional(),
    heard_about_other: text(100),
    media_consent: z.enum(["agree", "disagree"], { message: "Please answer the media release" }),
    waiver: z.literal("on", { message: "Please accept the waiver to play" }),
    announcement_emails: z.literal("on").optional(),
    email_updates: z.literal("on").optional(),
    email_session_open: z.literal("on").optional(),
    email_reminders: z.literal("on").optional(),
    email_messages: z.literal("on").optional(),
    etransfer_names: z.string().max(300).default(""),
    avatar_style: z.enum(PROFILE_AVATAR_STYLES, { message: "Please pick an avatar style" }).optional(),
    avatar_seed: z.string().regex(AVATAR_SEED_RE, "Please shuffle your avatar again").optional(),
    next: z.string().default("/"),
    return_to: z.string().default("/onboarding"),
  })
  .partial({ learning_goals: true, hype_song: true, heard_about_other: true });

const localPath = (p: string, fallback: string) => (p.startsWith("/") && !p.startsWith("//") ? p : fallback);

/**
 * What the profile form gets back when a save fails: the message, plus what
 * was typed so the form can put it back (instead of starting over).
 */
export type ProfileFormState = { error: string; values: Record<string, string>; at: number } | null;

export async function saveProfile(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const profile = await requireProfile("/onboarding");
  const raw = Object.fromEntries(formData);
  const values = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? v : ""]));
  const failed = (error: string): ProfileFormState => ({ error, values, at: Date.now() });
  if (!(await allowed("player-action", profile.id, 20, 60))) return failed(SLOW_DOWN);
  const parsed = ProfileForm.safeParse(raw);
  if (!parsed.success) return failed(parsed.error.issues[0].message);
  const f = parsed.data;
  if (profile.attended_before == null && !f.attended_before) return failed("Please say whether you've attended before");
  if (f.emergency_phone === f.phone) return failed("Your emergency contact needs a different number from yours");
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
      emergency_name: f.emergency_name,
      emergency_relationship: f.emergency_relationship,
      emergency_phone: f.emergency_phone,
      adult_confirmed_at: profile.adult_confirmed_at ?? now,
      skill_level: f.skill_level,
      attended_before: profile.attended_before ?? f.attended_before === "yes",
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
      // Which optional emails. Kept as picked even while the main switch is off.
      email_updates: f.email_updates === "on",
      email_session_open: f.email_session_open === "on",
      email_reminders: f.email_reminders === "on",
      email_messages: f.email_messages === "on",
      onboarded_at: profile.onboarded_at ?? now,
      ...(f.avatar_style && { avatar_style: f.avatar_style }),
      ...(f.avatar_seed && { avatar_seed: f.avatar_seed }),
    })
    .eq("id", profile.id);
  if (error?.message === "identity_change_limit") {
    const again = error.details ? ` You can change them again after ${formatDateTime(error.details)}.` : "";
    return failed(
      `You've changed your display name or avatar ${IDENTITY_CHANGES_PER_DAY} times today.${again} Put them back to save your other changes.`,
    );
  }
  if (error) return failed(error.message);

  // Uploaded pictures the saved profile no longer uses.
  if (f.avatar_style) {
    const keep = f.avatar_style === PHOTO_STYLE && f.avatar_seed ? [f.avatar_seed] : [];
    after(() => removePhotos(profile.id, keep).catch((err) => console.error("Avatar clean-up failed", err)));
  }

  revalidatePath("/", "layout");
  await flash("success", "Profile saved");
  redirect(localPath(f.next, "/"));
}

/**
 * A player deletes their own account: sign-in, profile and sign-ups go (spots
 * they held are refilled from the waitlist by the every-minute job). Payment
 * records stay for the hosts, unlinked. Hosts have to lose host access first.
 */
export async function deleteMyAccount() {
  const profile = await requireProfile("/me");
  if (!(await allowed("delete-account", profile.id, 3, 3600))) redirect(`/me?error=${encodeURIComponent(SLOW_DOWN)}`);
  if (profile.role === "admin") {
    redirect(`/me?error=${encodeURIComponent("Hosts can't delete their account here. Ask another host to remove your host access first.")}`);
  }
  const { error } = await createAdminClient().auth.admin.deleteUser(profile.id);
  if (error) redirect(`/me?error=${encodeURIComponent(error.message)}`);
  after(() => removePhotos(profile.id).catch((err) => console.error("Avatar clean-up failed", err)));
  // The sign-in is gone; clear this browser's session cookies too.
  const supabase = await createClient();
  await supabase.auth.signOut().catch(() => {});
  revalidatePath("/", "layout");
  await flash("success", "Your account has been deleted");
  redirect("/");
}

export type AvatarUploadResult = { seed: string } | { error: string };

/**
 * Stores a new profile picture (resized, location data removed) and returns its
 * seed. It's used once the player saves their profile with the "photo" style,
 * so Save and the daily change limit work as for the other avatars.
 */
export async function uploadAvatar(formData: FormData): Promise<AvatarUploadResult> {
  const profile = await requireProfile("/me");
  if (!(await allowed("avatar-upload", profile.id, 10, 3600))) {
    return { error: "That's a lot of pictures in an hour. Try again a bit later." };
  }
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Pick a picture first." };
  if (file.size > AVATAR_MAX_BYTES) return { error: "That picture is too big. Try a smaller one." };

  let webp: Buffer;
  try {
    webp = await toAvatarWebp(Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    return { error: err instanceof AvatarImageError ? err.message : "Couldn't read that picture." };
  }
  const seed = randomSeed();
  try {
    await savePhoto(profile.id, seed, webp);
  } catch (err) {
    console.error("Avatar upload failed", err);
    return { error: "Couldn't upload that picture. Please try again." };
  }
  // Keep the picture their saved profile uses (until they save the new one) and the new one.
  const keep = profile.avatar_style === PHOTO_STYLE ? [profile.avatar_seed, seed] : [seed];
  after(() => removePhotos(profile.id, keep).catch((err) => console.error("Avatar clean-up failed", err)));
  return { seed };
}
