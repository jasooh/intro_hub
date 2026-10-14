import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next, Big_Shoulders, Doto } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { AsciiBall } from "@/components/ascii-ball";
import { UserMenu } from "@/components/user-menu";
import "./globals.css";

const display = Big_Shoulders({ variable: "--font-big-shoulders", subsets: ["latin"], adjustFontFallback: false });
const score = Doto({ variable: "--font-doto", subsets: ["latin"], weight: ["700", "900"] });
const body = Atkinson_Hyperlegible_Next({ variable: "--font-atkinson", subsets: ["latin"], adjustFontFallback: false });

export const metadata: Metadata = {
  title: "Intro Hub",
  description: "Sign up for volleyball sessions, pay by e-Transfer, and join the waitlist.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${score.variable} ${body.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        {/* Lowkey spinning ASCII volleyball behind every page. */}
        <AsciiBall />
        <header className="sticky top-0 z-20 bg-maple/90 backdrop-blur-sm">
          <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-4 px-4">
            <nav className="flex items-baseline gap-4 sm:gap-6">
              <Link href="/" className="font-display text-2xl font-black tracking-tight uppercase">
                Intro<span className="text-line">/</span>Hub
              </Link>
              <Link
                href="/sessions"
                className="font-display text-lg font-bold tracking-wide text-ink-soft uppercase underline-offset-[6px] hover:text-ink hover:underline hover:decoration-line hover:decoration-2"
              >
                Sessions
              </Link>
              <Link
                href="/about"
                className="font-display text-lg font-bold tracking-wide text-ink-soft uppercase underline-offset-[6px] hover:text-ink hover:underline hover:decoration-line hover:decoration-2"
              >
                About
              </Link>
            </nav>
            <Suspense>
              <UserMenu />
            </Suspense>
          </div>
          {/* the painted court line */}
          <div className="h-[3px] bg-line" />
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:py-10">{children}</main>
        <footer className="mx-auto w-full max-w-4xl px-4 pb-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t-2 border-ink pt-3 font-display text-sm font-semibold tracking-widest text-ink-soft uppercase">
            <span>Intro 2 Volleyball · Aaniin CC · Markham</span>
            <span className="flex flex-wrap gap-x-5 gap-y-1">
              <Link href="/about" className="text-ink hover:text-line">
                About
              </Link>
              <a
                href="https://www.instagram.com/intro2volleyball/"
                target="_blank"
                rel="noreferrer"
                className="text-ink hover:text-line"
              >
                Instagram @intro2volleyball
              </a>
              <a href="mailto:intro2volleyball@gmail.com" className="text-ink normal-case tracking-wide hover:text-line">
                intro2volleyball@gmail.com
              </a>
            </span>
          </div>
          <p className="mt-3 text-xs text-ink-soft/70">
            Made with love by{" "}
            <a
              href="https://justin-abuyuan.xyz/"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-ink/30 underline-offset-2 hover:text-line hover:decoration-line"
            >
              one of the players
            </a>
          </p>
        </footer>
      </body>
    </html>
  );
}
