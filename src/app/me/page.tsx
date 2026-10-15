import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ProfileForm } from "@/components/profile-form";
import { Avatar, PageSpinner, reveal, Sheet } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { getMySignups } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false },
};

export default function MePage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Account />
    </Suspense>
  );
}

async function Account() {
  const profile = await requireProfile("/me");
  const upcoming = (await getMySignups(profile.id)).filter((r) => r.view === "upcoming");
  const needsPayment = upcoming.filter((r) => r.status === "pending_payment").length;
  const name = profile.display_name ?? profile.full_name ?? profile.email;

  return (
    <div className="space-y-12">
      <div className="reveal flex items-center gap-5" style={reveal(0)}>
        <Avatar name={name} src={profile.avatar_url} size={72} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-5xl leading-[0.85] font-black tracking-tight uppercase sm:text-6xl">
            {name}
          </h1>
          <p className="truncate text-ink-soft">{profile.email}</p>
        </div>
      </div>

      {upcoming.length > 0 && (
        <Link
          href="/me/signups"
          className="reveal group flex flex-wrap items-center justify-between gap-3 border-2 border-ink bg-maple-deep/60 px-4 py-3 hover:bg-maple-deep"
          style={reveal(1)}
        >
          <span>
            You have <b>{upcoming.length}</b> upcoming sign-up{upcoming.length === 1 ? "" : "s"}
            {needsPayment > 0 && (
              <span className="font-semibold text-warn">
                {" "}
                · {needsPayment} waiting for payment
              </span>
            )}
          </span>
          <span className="font-display font-bold tracking-wide text-line uppercase">
            My sign-ups <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
          </span>
        </Link>
      )}

      <Sheet label="Profile" className="reveal max-w-xl" style={reveal(2)}>
        <ProfileForm profile={profile} next="/me" submitLabel="Save changes" requireChange />
      </Sheet>
    </div>
  );
}
