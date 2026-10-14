import { Suspense } from "react";
import { ProfileForm } from "@/components/profile-form";
import { Avatar, Card, PageSpinner } from "@/components/ui";
import { requireProfile } from "@/lib/auth";

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
  const error = typeof params.error === "string" ? params.error : null;
  const name = profile.display_name ?? profile.full_name ?? "";

  return (
    <div className="mx-auto max-w-md">
      <Card className="space-y-5">
        <div className="flex items-center gap-3">
          <Avatar name={name || profile.email} src={profile.avatar_url} size={48} />
          <div>
            <h1 className="text-xl font-semibold">{profile.onboarded_at ? "Your profile" : "Welcome! 👋"}</h1>
            <p className="text-sm text-stone-400">{profile.email}</p>
          </div>
        </div>
        {error && <p className="rounded-lg bg-red-950/50 p-2 text-sm text-red-300">{error}</p>}
        <ProfileForm
          profile={profile}
          next={next}
          returnTo={`/onboarding?next=${encodeURIComponent(next)}`}
          submitLabel={profile.onboarded_at ? "Save" : "Continue"}
          submitClassName="w-full"
        />
      </Card>
    </div>
  );
}
