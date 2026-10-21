"use client";

import Link from "next/link";
import { buttonClass } from "@/components/ui";

/** Something broke while loading a page. The error is logged on the server (src/instrumentation.ts). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="space-y-5 py-6 sm:py-12">
      <p className="font-display text-base font-bold tracking-[0.3em] text-line uppercase">Error</p>
      <h1 className="font-display text-[clamp(3.5rem,15vw,7rem)] leading-[0.85] font-black tracking-tight uppercase">
        Net
        <br />
        ball<span className="text-line">.</span>
      </h1>
      <p className="max-w-md text-lg text-ink-soft">
        Something went wrong on our side. Try again; if it keeps happening, message the hosts and we&apos;ll sort it out.
      </p>
      <div className="flex flex-wrap gap-4 pt-1">
        <button type="button" onClick={reset} className={buttonClass("primary")}>
          Try again
        </button>
        <Link href="/" className={buttonClass("secondary")}>
          Back to home
        </Link>
      </div>
      {error.digest && <p className="text-xs text-ink-soft">Error code: {error.digest}</p>}
    </section>
  );
}
