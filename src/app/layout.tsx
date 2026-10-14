import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next, Big_Shoulders, Doto } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
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
        <header className="sticky top-0 z-20 bg-maple/90 backdrop-blur-sm">
          <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-4 px-4">
            <nav className="flex items-baseline gap-6">
              <Link href="/" className="font-display text-2xl font-black tracking-tight uppercase">
                Intro<span className="text-line">/</span>Hub
              </Link>
              <Link
                href="/sessions"
                className="font-display text-lg font-bold tracking-wide text-ink-soft uppercase underline-offset-[6px] hover:text-ink hover:underline hover:decoration-line hover:decoration-2"
              >
                Sessions
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
          <div className="border-t-2 border-ink pt-3 font-display text-sm font-semibold tracking-widest text-ink-soft uppercase">
            Intro 2 Volleyball · Drop-in · Toronto
          </div>
        </footer>
      </body>
    </html>
  );
}
