"use client";

import { NavLink } from "@/components/nav-pending";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

export type BoardLink = { href: string; label: string };

/**
 * Dark tab bar (admin, dev tools); the active tab is an orange block.
 * `root` is the section's home tab, active only on its exact path unless
 * `rootAlso` prefixes match. The pathname is request-time data, so the
 * active tab streams in behind Suspense; the fallback highlights nothing.
 */
export function BoardNav({ links, root, rootAlso = [] }: { links: readonly BoardLink[]; root: string; rootAlso?: string[] }) {
  return (
    <Suspense fallback={<Tabs links={links} root={root} rootAlso={rootAlso} path={null} />}>
      <ActiveTabs links={links} root={root} rootAlso={rootAlso} />
    </Suspense>
  );
}

function ActiveTabs(props: { links: readonly BoardLink[]; root: string; rootAlso: string[] }) {
  return <Tabs {...props} path={usePathname()} />;
}

function Tabs({
  links,
  root,
  rootAlso,
  path,
}: {
  links: readonly BoardLink[];
  root: string;
  rootAlso: string[];
  path: string | null;
}) {
  const active = (href: string) =>
    path !== null &&
    (href === root ? path === root || rootAlso.some((p) => path.startsWith(p)) : path.startsWith(href));
  return (
    <nav className="flex gap-1 overflow-x-auto overflow-y-hidden bg-board p-1.5 shadow-[4px_4px_0_var(--line)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {links.map((l) => (
        <NavLink
          key={l.href}
          href={l.href}
          active={active(l.href)}
          className={({ active: on }) =>
            `px-3 py-1.5 font-display text-lg font-bold tracking-wide whitespace-nowrap uppercase transition-colors ${
              on ? "bg-line text-board" : "text-maple/70 hover:bg-maple/10 hover:text-maple"
            }`
          }
        >
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}

export type BoardGroup = { label: string; links: readonly BoardLink[] };

/**
 * Two-row tab bar for many pages: categories on top (the active one is the
 * orange block, and goes to its first page), the current category's pages
 * underneath. Same active rules as BoardNav.
 */
export function GroupedBoardNav({
  groups,
  root,
  rootAlso = [],
}: {
  groups: readonly BoardGroup[];
  root: string;
  rootAlso?: string[];
}) {
  return (
    <Suspense fallback={<GroupedTabs groups={groups} root={root} rootAlso={rootAlso} path={null} />}>
      <ActiveGroupedTabs groups={groups} root={root} rootAlso={rootAlso} />
    </Suspense>
  );
}

function ActiveGroupedTabs(props: { groups: readonly BoardGroup[]; root: string; rootAlso: string[] }) {
  return <GroupedTabs {...props} path={usePathname()} />;
}

function GroupedTabs({
  groups,
  root,
  rootAlso,
  path,
}: {
  groups: readonly BoardGroup[];
  root: string;
  rootAlso: string[];
  path: string | null;
}) {
  const active = (href: string) =>
    path !== null &&
    (href === root ? path === root || rootAlso.some((p) => path.startsWith(p)) : path.startsWith(href));
  const current = groups.find((g) => g.links.some((l) => active(l.href))) ?? groups[0];
  const scroll = "overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  return (
    <nav aria-label="Host pages" className="bg-board shadow-[4px_4px_0_var(--line)]">
      {/* Phones: one equal column per category so all of them fit. */}
      <div className="grid grid-cols-4 gap-1 p-1.5 sm:flex">
        {groups.map((g) => {
          const on = g === current;
          return (
            <NavLink
              key={g.label}
              href={g.links[0].href}
              active={on}
              linkClassName="flex"
              className={({ active: lit }) =>
                `w-full px-1 py-1.5 text-center font-display text-base font-bold tracking-wide whitespace-nowrap uppercase transition-colors sm:px-3 sm:text-lg ${
                  lit ? "bg-line text-board" : "text-maple/70 hover:bg-maple/10 hover:text-maple"
                }`
              }
            >
              {g.label}
            </NavLink>
          );
        })}
      </div>
      {current.links.length > 1 && (
        <div className={`flex gap-x-5 border-t border-maple/15 px-3 py-1.5 ${scroll}`}>
          {current.links.map((l) => (
            <NavLink
              key={l.href}
              href={l.href}
              active={active(l.href)}
              className={({ active: lit }) =>
                `py-1 font-display text-base font-bold tracking-wide whitespace-nowrap uppercase underline-offset-[6px] transition-colors ${
                  lit ? "text-maple underline decoration-line decoration-2" : "text-maple/60 hover:text-maple"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </div>
      )}
    </nav>
  );
}
