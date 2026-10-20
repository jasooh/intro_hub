import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/** The signed-in user's profile, or null. Cached per request. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();
  return (profile as Profile | null) ?? null;
});

export async function requireProfile(next = "/"): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(next)}`);
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile("/admin");
  if (profile.role !== "admin") redirect("/");
  return profile;
}

/** The one account that gets /dev-tools. Must match public.is_devtools_user() (supabase/migrations/20261023000000_dev_tools.sql). */
const DEV_TOOLS_EMAIL = "abuyuanjustin@gmail.com";

/** Whether the signed-in user can use dev tools, from the email in their auth token. Cached per request. */
export const canUseDevTools = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;
  return typeof email === "string" && email.toLowerCase() === DEV_TOOLS_EMAIL;
});

/** Dev tools pages 404 for everyone else (hosts included), so they don't advertise themselves. */
export async function requireDevTools(): Promise<void> {
  if (!(await canUseDevTools())) notFound();
}
