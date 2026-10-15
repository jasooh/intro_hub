import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, reveal, Scoreboard } from "@/components/ui";

export const metadata: Metadata = {
  title: "Page not found",
};

/** Unknown URLs and notFound() (e.g. a deleted session) land here. */
export default function NotFound() {
  return (
    <section className="grid grid-cols-1 items-center gap-10 py-6 sm:grid-cols-[1fr_auto] sm:py-12">
      <div className="space-y-5">
        <p className="reveal font-display text-base font-bold tracking-[0.3em] text-line uppercase" style={reveal(0)}>
          Error 404
        </p>
        <h1
          className="reveal font-display text-[clamp(3.5rem,15vw,7rem)] leading-[0.85] font-black tracking-tight uppercase"
          style={reveal(1)}
        >
          Out of
          <br />
          bounds<span className="text-line">.</span>
        </h1>
        <p className="reveal max-w-md text-lg text-ink-soft" style={reveal(2)}>
          That page doesn&apos;t exist, or the session was removed. Let&apos;s get you back on the court.
        </p>
        <div className="reveal flex flex-wrap gap-4 pt-1" style={reveal(3)}>
          <Link href="/" className={buttonClass("primary")}>
            Back to home
          </Link>
          <Link href="/sessions" className={buttonClass("secondary")}>
            See sessions
          </Link>
        </div>
      </div>
      <div className="reveal pr-1 pb-1" style={reveal(4)}>
        <Scoreboard size="lg" value="4-0-4" label="Ball out" />
      </div>
    </section>
  );
}
