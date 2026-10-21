import Link from "next/link";
import type { ReactNode } from "react";

const linkClass = "hover:text-line";

/** Dark footer band: the club, then Resources / Keep in touch / Legal stacks. */
export function SiteFooter() {
  return (
    <footer className="mt-6 bg-board text-maple">
      <div className="h-[3px] bg-line" />
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="col-span-2 space-y-2 sm:col-span-1">
            <p className="font-display text-2xl font-black tracking-tight uppercase">
              Intro<span className="text-line">/</span>Hub
            </p>
            <p className="max-w-56 text-sm text-maple/60">
              Intro 2 Volleyball · beginner-friendly drop-in at Aaniin Community Centre, Markham.
            </p>
          </div>

          <Stack title="Resources">
            <Link href="/updates" className={linkClass}>
              Updates
            </Link>
            <Link href="/about" className={linkClass}>
              About
            </Link>
            <Link href="/sessions" className={linkClass}>
              Sessions
            </Link>
          </Stack>

          <Stack title="Keep in touch">
            <a href="https://www.instagram.com/intro2volleyball/" target="_blank" rel="noreferrer" className={linkClass}>
              Instagram
            </a>
            <Link href="/contact" className={linkClass}>
              Contact &amp; feedback
            </Link>
          </Stack>

          <Stack title="Legal">
            <Link href="/legal/waiver" className={linkClass}>
              Waiver
            </Link>
            <Link href="/legal/media-release" className={linkClass}>
              Media release
            </Link>
            <Link href="/legal/privacy" className={linkClass}>
              Privacy
            </Link>
          </Stack>
        </div>

        <p className="mt-8 border-t border-maple/15 pt-4 text-xs text-maple/50">
          Made with &lt;3 by{" "}
          <a
            href="https://justin-abuyuan.xyz/"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-maple/30 underline-offset-2 hover:text-line hover:decoration-line"
          >
            one of the players
          </a>
        </p>
      </div>
    </footer>
  );
}

function Stack({ title, children }: { title: string; children: ReactNode }) {
  return (
    <nav aria-label={title} className="space-y-3">
      <p className="font-display text-xs font-bold tracking-[0.25em] text-line uppercase">{title}</p>
      <div className="flex flex-col items-start gap-2 font-display text-base font-semibold tracking-wide uppercase">
        {children}
      </div>
    </nav>
  );
}
