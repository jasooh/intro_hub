"use client";

import Link from "next/link";
import "./globals.css";

/** Last resort when the root layout itself fails: a plain page with its own <html>. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center bg-maple px-4 text-ink">
        <main className="mx-auto max-w-md space-y-4">
          <p className="text-sm font-bold tracking-[0.3em] text-line uppercase">Error</p>
          <h1 className="text-5xl leading-none font-black uppercase">
            Something broke<span className="text-line">.</span>
          </h1>
          <p>Please try again. If it keeps happening, message @intro2volleyball on Instagram.</p>
          <div className="flex gap-4">
            <button type="button" onClick={reset} className="border-2 border-ink bg-line px-4 py-2 font-bold uppercase">
              Try again
            </button>
            <Link href="/" className="border-2 border-ink px-4 py-2 font-bold uppercase">
              Home
            </Link>
          </div>
          {error.digest && <p className="text-xs opacity-60">Error code: {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
