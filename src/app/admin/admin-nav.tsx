"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/refunds", label: "Refunds" },
  { href: "/admin/players", label: "Players" },
  { href: "/admin/templates", label: "Weekly schedule" },
  { href: "/admin/songs", label: "Songs" },
] as const;

/**
 * The pathname is request-time data, so the active underline streams in behind
 * Suspense; the prerendered fallback is the same tabs with nothing underlined.
 */
export function AdminNav() {
  return (
    <Suspense fallback={<Tabs path={null} />}>
      <ActiveTabs />
    </Suspense>
  );
}

function ActiveTabs() {
  return <Tabs path={usePathname()} />;
}

function Tabs({ path }: { path: string | null }) {
  const active = (href: string) =>
    path !== null &&
    (href === "/admin" ? path === "/admin" || path.startsWith("/admin/sessions") : path.startsWith(href));
  return (
    <nav className="-mx-4 flex gap-6 overflow-x-auto overflow-y-hidden px-4 shadow-[inset_0_-2px_0_var(--ink)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`border-b-4 pb-2 font-display text-lg font-bold tracking-wide whitespace-nowrap uppercase transition-colors ${
            active(l.href) ? "border-line text-ink" : "border-transparent text-ink-soft hover:text-ink"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
