"use client";

import { NavLink } from "@/components/nav-pending";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const links = [
  { href: "/me", label: "Profile" },
  { href: "/me/signups", label: "My sign-ups" },
] as const;

/** Profile / My sign-ups tabs, styled like the host nav. Active tab streams in behind Suspense. */
export function MeNav() {
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
  return (
    <nav className="inline-flex max-w-full gap-1 bg-board p-1.5 shadow-[4px_4px_0_var(--line)]">
      {links.map((l) => {
        const active = path === l.href;
        return (
          <NavLink
            key={l.href}
            href={l.href}
            active={active}
            className={({ active: on }) =>
              `px-3 py-1.5 font-display text-lg font-bold tracking-wide whitespace-nowrap uppercase transition-colors ${
                on ? "bg-line text-board" : "text-maple/70 hover:bg-maple/10 hover:text-maple"
              }`
            }
          >
            {l.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
