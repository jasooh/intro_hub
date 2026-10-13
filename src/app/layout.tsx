import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui";
import { UserMenu } from "@/components/user-menu";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Intro Hub",
  description: "Sign up for volleyball sessions, pay by e-Transfer, and join the waitlist.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <header className="sticky top-0 z-10 border-b border-stone-800 bg-stone-950/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 px-4">
            <div className="flex items-center gap-1">
              <Link href="/" className="mr-2 flex items-center gap-2 font-semibold">
                <span aria-hidden>🏐</span> Intro Hub
              </Link>
              <Link href="/sessions" className={buttonClass("ghost", "sm")}>
                Sessions
              </Link>
            </div>
            <Suspense>
              <UserMenu />
            </Suspense>
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
