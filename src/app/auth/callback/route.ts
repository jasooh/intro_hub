import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { profileComplete } from "@/lib/profile";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

// Google redirects here after sign-in. Exchanges the code for a session,
// promotes emails listed in ADMIN_EMAILS, and sends first-timers to onboarding.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  const base = env.appUrl();

  if (!code) return NextResponse.redirect(`${base}/login?error=Missing+sign-in+code`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(error?.message ?? "Sign-in failed")}`);
  }

  const user = data.user;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).single<Profile>();

  if (profile && profile.role !== "admin" && env.adminEmails().includes((user.email ?? "").toLowerCase())) {
    await admin.from("profiles").update({ role: "admin" }).eq("id", user.id);
  }

  // First sign-in, or an older profile missing details the sign-up now needs.
  if (!profile || !profileComplete(profile)) {
    return NextResponse.redirect(`${base}/onboarding?next=${encodeURIComponent(next)}`);
  }
  return NextResponse.redirect(`${base}${next}`);
}
