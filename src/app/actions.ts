"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { dispatchEvents, parseEvents } from "@/lib/registrations";
import { createClient } from "@/lib/supabase/server";

const ERRORS: Record<string, string> = {
  not_authenticated: "Please sign in first.",
  session_unavailable: "This session isn't available any more.",
  signups_not_open: "Sign-ups haven't opened yet.",
  session_started: "This session has already started.",
  forbidden: "You can't do that.",
};

function friendly(message: string) {
  const key = Object.keys(ERRORS).find((k) => message.includes(k));
  return key ? ERRORS[key] : "Something went wrong. Please try again.";
}

export async function registerForSession(sessionId: string) {
  await requireProfile(`/s/${sessionId}`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_for_session", { p_session_id: sessionId });
  if (error) redirect(`/s/${sessionId}?error=${encodeURIComponent(friendly(error.message))}`);

  const events = parseEvents(data);
  after(() => dispatchEvents(events));
  revalidatePath(`/s/${sessionId}`);
}

export async function cancelRegistration(registrationId: string, returnTo: string) {
  await requireProfile(returnTo);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_registration", { p_registration_id: registrationId });
  if (error) redirect(`${returnTo}?error=${encodeURIComponent(friendly(error.message))}`);

  const events = parseEvents(data);
  after(() => dispatchEvents(events));
  revalidatePath(returnTo);
}

const ProfileForm = z.object({
  display_name: z.string().trim().min(1, "Display name is required").max(60),
  etransfer_names: z.string().max(300),
  next: z.string().default("/"),
  return_to: z.string().default("/onboarding"),
});

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
  const names = parsed.data.etransfer_names
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 5);

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.display_name,
      etransfer_names: names.length ? names : [parsed.data.display_name],
      onboarded_at: profile.onboarded_at ?? new Date().toISOString(),
    })
    .eq("id", profile.id);
  if (error) redirect(withParams(returnTo, { error: error.message }));

  revalidatePath("/", "layout");
  redirect(localPath(parsed.data.next, "/"));
}
