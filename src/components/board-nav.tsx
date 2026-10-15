"use client";

import Link from "next/link";
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
