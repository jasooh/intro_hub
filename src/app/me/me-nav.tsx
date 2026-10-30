"use client";

import { NavLink } from "@/components/nav-pending";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const links = [
  { href: "/me", label: "Profile" },
  { href: "/me/signups", label: "My sign-ups" },
  { href: "/me/messages", label: "Messages" },
] as const;

/** Profile / My sign-ups / Messages tabs, styled like the host nav. Active tab streams in behind Suspense. */
export function MeNav({ unread = 0 }: { unread?: number }) {
  return (
    <Suspense fallback={<Tabs path={null} unread={unread} />}>
      <ActiveTabs unread={unread} />
    </Suspense>
  );
}

function ActiveTabs({ unread }: { unread: number }) {
  return <Tabs path={usePathname()} unread={unread} />;
}

/** /me is only the Profile tab; the others also own their sub-pages (a conversation stays under Messages). */
const isActive = (path: string | null, href: string) =>
  href === "/me" ? path === href : path === href || !!path?.startsWith(`${href}/`);

function Tabs({ path, unread }: { path: string | null; unread: number }) {
  return (
    <nav className="inline-flex max-w-full gap-1 bg-board p-1.5 shadow-[4px_4px_0_var(--line)]">
      {links.map((l) => {
        const active = isActive(path, l.href);
        const count = l.href === "/me/messages" ? unread : 0;
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
            {count > 0 && (
              <span className="ml-2 inline-block min-w-5 bg-line px-1 text-center font-score text-sm leading-5 text-board">
                {count}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
