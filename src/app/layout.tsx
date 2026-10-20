import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Big_Shoulders, Doto } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { FlashToaster } from "@/components/flash-toaster";
import { MaintenanceBanner } from "@/components/maintenance-banner";
import { WireBall } from "@/components/wire-ball";
import { SiteFooter } from "@/components/site-footer";
import { UserMenu } from "@/components/user-menu";
import { env } from "@/lib/env";
import { SITE } from "@/lib/site";
import "./globals.css";

const display = Big_Shoulders({ variable: "--font-big-shoulders", subsets: ["latin"], adjustFontFallback: false });
const score = Doto({ variable: "--font-doto", subsets: ["latin"], weight: ["700", "900"] });
const body = Atkinson_Hyperlegible_Next({ variable: "--font-atkinson", subsets: ["latin"], adjustFontFallback: false });

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl()),
  title: { default: `${SITE.name} · ${SITE.club}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: {
    type: "website",
    siteName: `${SITE.name} · ${SITE.club}`,
    locale: "en_CA",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: SITE.colors.maple,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${score.variable} ${body.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        {/* Lowkey spinning wireframe volleyball behind every page. */}
        <WireBall />
        <FlashToaster />
        <header className="sticky top-0 z-20 bg-maple/90 backdrop-blur-sm">
          <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-4 px-4">
            <nav className="flex items-baseline gap-3 sm:gap-6">
              <Link href="/" className="-my-2 py-2 font-display text-xl font-black tracking-tight uppercase sm:text-2xl">
                Intro<span className="text-line">/</span>Hub
              </Link>
              <Link
                href="/sessions"
                className="-my-2 py-2 font-display text-base sm:text-lg font-bold tracking-wide text-ink-soft uppercase underline-offset-[6px] hover:text-ink hover:underline hover:decoration-line hover:decoration-2"
              >
                Sessions
              </Link>
              <Link
                href="/updates"
                className="-my-2 py-2 font-display text-base max-[359px]:hidden sm:text-lg font-bold tracking-wide text-ink-soft uppercase underline-offset-[6px] hover:text-ink hover:underline hover:decoration-line hover:decoration-2"
              >
                Updates
              </Link>
            </nav>
            <Suspense>
              <UserMenu />
            </Suspense>
          </div>
          {/* the painted court line */}
          <div className="h-[3px] bg-line" />
        </header>
        <Suspense>
          <MaintenanceBanner />
        </Suspense>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:py-10">{children}</main>
        <SiteFooter />
        <Suspense>
          <Analytics />
        </Suspense>
      </body>
    </html>
  );
}
