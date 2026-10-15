import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass, PageSpinner, PageTitle } from "@/components/ui";
import { getProfile } from "@/lib/auth";
import { CrowThemeDemo } from "./crow-theme-demo";

export const metadata: Metadata = {
  title: "Theme demo",
};

export default function ThemeDemoPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Gate />
    </Suspense>
  );
}

/** Hosts see the demo; everyone else gets an "admin only" screen instead of a redirect. */
async function Gate() {
  const profile = await getProfile();
  if (profile?.role === "admin") {
    return (
      <div className="space-y-10">
        <PageTitle eyebrow="Demo · not live" sub="A preview of a crow / “Fly” theme. Nothing here changes the real site.">
          Theme demo
        </PageTitle>
        <CrowThemeDemo />
      </div>
    );
  }
  return (
    <div className="max-w-xl space-y-6 py-6">
      <PageTitle eyebrow="Hosts only" sub="This page is only available to Intro 2 Volleyball hosts.">
        Admin only
      </PageTitle>
      <div className="flex flex-wrap gap-4">
        {profile ? (
          <Link href="/" className={buttonClass("primary")}>
            Back to home
          </Link>
        ) : (
          <Link href="/login?next=%2Fadmin%2Fdemo" className={buttonClass("primary")}>
            Sign in as a host
          </Link>
        )}
        <Link href="/sessions" className={buttonClass("secondary")}>
          See sessions
        </Link>
      </div>
    </div>
  );
}
