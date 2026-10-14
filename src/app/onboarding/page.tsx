import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileForm } from "@/components/profile-form";
import { Avatar, PageSpinner, reveal } from "@/components/ui";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false },
};

export default function OnboardingPage(props: PageProps<"/onboarding">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Onboarding searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Onboarding({ searchParams }: { searchParams: PageProps<"/onboarding">["searchParams"] }) {
  const profile = await requireProfile("/onboarding");
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const name = profile.display_name ?? profile.full_name ?? "";

  return (
    <div className="mx-auto max-w-md space-y-8">
      <div className="reveal flex items-center gap-4" style={reveal(0)}>
        <Avatar name={name || profile.email} src={profile.avatar_url} size={64} />
        <div className="min-w-0">
          <h1 className="font-display text-5xl leading-[0.85] font-black tracking-tight uppercase">
            {profile.onboarded_at ? "Your profile" : "Welcome"}
            <span className="text-line">{profile.onboarded_at ? "." : "!"}</span>
          </h1>
          <p className="truncate text-ink-soft">{profile.email}</p>
        </div>
      </div>
      <div className="reveal space-y-5 border-t-2 border-ink pt-5" style={reveal(1)}>
        <ProfileForm
          profile={profile}
          next={next}
          returnTo={`/onboarding?next=${encodeURIComponent(next)}`}
          submitLabel={profile.onboarded_at ? "Save" : "Continue"}
          submitClassName="w-full"
        />
      </div>
    </div>
  );
}
