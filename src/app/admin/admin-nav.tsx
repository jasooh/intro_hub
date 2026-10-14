"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/refunds", label: "Refunds" },
  { href: "/admin/players", label: "Players" },
  { href: "/admin/templates", label: "Weekly schedule" },
] as const;

export function AdminNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/admin" ? path === "/admin" || path.startsWith("/admin/sessions") : path.startsWith(href));
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
