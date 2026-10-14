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
 * The pathname is request-time data, so the active tab streams in behind
 * Suspense; the prerendered fallback is the same tabs with none highlighted.
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
    <nav className="flex gap-1 overflow-x-auto overflow-y-hidden bg-board p-1.5 shadow-[4px_4px_0_var(--line)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={active(l.href) ? "page" : undefined}
          className={`px-3 py-1.5 font-display text-lg font-bold tracking-wide whitespace-nowrap uppercase transition-colors ${
            active(l.href) ? "bg-line text-board" : "text-maple/70 hover:bg-maple/10 hover:text-maple"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
