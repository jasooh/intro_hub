import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { signInWithGoogle } from "@/app/auth/actions";
import { LoginSubline, PlayerPass, PlayerPassFrame } from "@/components/player-pass";
import { SubmitButton } from "@/components/submit-button";
import { reveal } from "@/components/ui";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in with Google to sign up for Intro 2 Volleyball sessions.",
};

const PERKS = [
  { title: "One-tap sign-up", body: "Fill in your profile once, then grab a spot in one tap." },
  { title: "See your team", body: "See who's coming, and your team once the hosts post them." },
  { title: "Add your hype song", body: "It goes on the session playlist." },
];

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <div className="mx-auto max-w-4xl space-y-12 py-6 sm:py-12">
      <div className="grid grid-cols-1 items-start gap-10 sm:grid-cols-[1fr_auto] sm:gap-12">
        <div className="space-y-6">
          <div className="reveal space-y-3" style={reveal(0)}>
            <p className="font-display text-base font-bold tracking-[0.3em] text-line uppercase">Check in</p>
            <h1 className="font-display text-6xl leading-[0.85] font-black tracking-tight uppercase sm:text-7xl">
              Sign in to play<span className="text-line">.</span>
            </h1>
            <p className="max-w-md text-lg text-ink-soft">
              <Suspense fallback="Sign up for sessions, see who's coming, and manage your spot.">
                <Sub searchParams={props.searchParams} />
              </Suspense>
            </p>
          </div>
          <div className="reveal max-w-md space-y-4" style={reveal(1)}>
            <Suspense>
              <LoginForm searchParams={props.searchParams} />
            </Suspense>
            <p className="text-sm text-ink-soft">
              No password to remember. We only get your name, email and photo from Google. By signing in you agree to the{" "}
              <Link href="/legal/waiver" className="underline decoration-line decoration-2 underline-offset-4">
                waiver
              </Link>{" "}
              and{" "}
              <Link href="/legal/media-release" className="underline decoration-line decoration-2 underline-offset-4">
                media release
              </Link>
              .
            </p>
          </div>
        </div>
        <div className="reveal" style={reveal(2)}>
          <Suspense
            fallback={
              <PlayerPassFrame>
                <p className="font-display text-lg font-bold tracking-[0.15em] text-maple/70 uppercase">Next session…</p>
              </PlayerPassFrame>
            }
          >
            <Pass searchParams={props.searchParams} />
          </Suspense>
        </div>
      </div>

      <ol className="reveal grid grid-cols-1 divide-y divide-ink/20 border-t-2 border-ink sm:grid-cols-3 sm:divide-x sm:divide-y-0" style={reveal(3)}>
        {PERKS.map((p, i) => (
          <li key={p.title} className="flex gap-4 py-5 sm:flex-col sm:gap-2 sm:px-5 sm:first:pl-0 sm:last:pr-0">
            <span className="font-score text-4xl leading-none font-black text-line">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <p className="font-display text-xl font-extrabold uppercase">{p.title}</p>
              <p className="text-ink-soft">{p.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

async function nextPath(searchParams: PageProps<"/login">["searchParams"]) {
  const params = await searchParams;
  return typeof params.next === "string" ? params.next : "/";
}

async function Sub({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  return <LoginSubline next={await nextPath(searchParams)} />;
}

async function Pass({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  return <PlayerPass next={await nextPath(searchParams)} />;
}

async function LoginForm({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const next = await nextPath(searchParams);
  return (
    <form action={signInWithGoogle}>
      <input type="hidden" name="next" value={next} />
      <SubmitButton className="w-full sm:w-auto">
        <span className="grid size-7 place-items-center bg-[#fff8ee]">
          <GoogleIcon />
        </span>
        Continue with Google
      </SubmitButton>
    </form>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
