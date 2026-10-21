"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { signOut } from "@/app/auth/actions";
import { Avatar, cn } from "@/components/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { HOST_GROUPS, needsAttention, type HostBadges } from "@/lib/host-pages";

export type HostMenu = { badges: HostBadges; nextSession: { id: string; label: string } | null };

/**
 * The profile picture in the header opens a panel with every page grouped:
 * You (players), then the host pages with what's waiting on each, then Dev tools
 * (one account only). Any page is two clicks away. An orange dot on the picture
 * means something needs a host.
 */
export function AccountMenu({
  name,
  email,
  avatarUrl,
  host,
  showDevTools,
}: {
  name: string;
  email: string;
  avatarUrl: string | null;
  /** Hosts only. */
  host: HostMenu | null;
  showDevTools: boolean;
}) {
  const [signingOut, startSignOut] = useTransition();
  const pathname = usePathname();
  const waiting = host ? needsAttention(host.badges) : 0;
  const wide = Boolean(host);
  const isActive = (href: string) =>
    href === "/admin"
      ? pathname === "/admin" || pathname.startsWith("/admin/sessions")
      : href === "/me"
        ? pathname === "/me"
        : pathname === href || pathname.startsWith(`${href}/`);

  return (
    // Not modal: no scroll lock, so opening it never shifts the page (or the sticky header).
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={waiting ? `Account menu (${waiting} thing${waiting === 1 ? "" : "s"} need a host)` : "Account menu"}
        className="relative -m-1.5 rounded-full p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-line focus-visible:ring-offset-2 focus-visible:ring-offset-maple"
      >
        <Avatar name={name} src={avatarUrl} size={32} />
        {waiting > 0 && (
          <span aria-hidden className="absolute top-0.5 right-0.5 size-3 rounded-full border-2 border-maple bg-line" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        collisionPadding={12}
        className={cn(
          "rounded-none border-2 border-ink bg-[#fbf3e3] p-0 shadow-[4px_4px_0_var(--ink)]",
          wide ? "w-[min(38rem,calc(100vw-1.5rem))]" : "w-64",
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b-2 border-ink px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate font-display text-lg leading-tight font-extrabold uppercase">{name}</p>
            <p className="truncate text-xs text-ink-soft">{email}</p>
          </div>
          <DropdownMenuItem
            disabled={signingOut}
            onSelect={() => startSignOut(() => signOut())}
            className="shrink-0 gap-1.5! rounded-none! px-2! py-1! font-display text-sm font-bold tracking-wide text-ink-soft uppercase focus:bg-maple-deep! focus:text-ink!"
          >
            <LogOut className="size-3.5" />
            {signingOut ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </div>

        <div className={cn("grid gap-x-4 gap-y-4 p-3", wide ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1")}>
          <Group label="You">
            <PanelLink href="/me" active={isActive("/me")}>
              Account
            </PanelLink>
            <PanelLink href="/me/signups" active={isActive("/me/signups")}>
              My sign-ups
            </PanelLink>
          </Group>

          {host &&
            HOST_GROUPS.map((g) => (
              <Group key={g.label} label={g.label}>
                {g.links.map((l) => (
                  <PanelLink key={l.href} href={l.href} active={isActive(l.href)} count={l.badge ? host.badges[l.badge] : 0}>
                    {l.label}
                  </PanelLink>
                ))}
                {g.label === "Sessions" && host.nextSession && (
                  <DropdownMenuItem asChild className="rounded-none! px-2! py-1! focus:bg-maple-deep!">
                    <Link href={`/admin/sessions/${host.nextSession.id}`} className="block! text-sm text-mat">
                      <span className="font-display font-bold tracking-wide uppercase">Next ▸ </span>
                      <span className="[overflow-wrap:anywhere]">{host.nextSession.label}</span>
                    </Link>
                  </DropdownMenuItem>
                )}
              </Group>
            ))}

          {showDevTools && (
            <Group label="Dev" muted>
              <PanelLink href="/dev-tools" active={isActive("/dev-tools")}>
                Dev tools
              </PanelLink>
            </Group>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A column: a small dark tab label (like a Sheet's) over its links. */
function Group({ label, muted = false, children }: { label: string; muted?: boolean; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1" role="group" aria-label={label}>
      <p
        className={cn(
          "inline-flex items-center gap-1.5 px-2 pt-1 pb-0.5 font-display text-xs font-bold tracking-[0.2em] uppercase",
          muted ? "bg-ink/60 text-maple" : "bg-ink text-maple",
        )}
      >
        <span aria-hidden className="size-1.5 bg-line" />
        {label}
      </p>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

/** One page: caps link, orange bar when it's the current page, orange count when something's waiting. */
function PanelLink({ href, active, count = 0, children }: { href: string; active: boolean; count?: number; children: ReactNode }) {
  return (
    <DropdownMenuItem asChild className="rounded-none! focus:bg-maple-deep!">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center justify-between gap-2 border-l-[3px] px-2! py-1.5! font-display text-base! leading-tight font-bold tracking-wide uppercase",
          active ? "border-line text-ink" : "border-transparent text-ink-soft hover:text-ink",
        )}
      >
        <span className="min-w-0 truncate">{children}</span>
        {count > 0 && (
          <span className="shrink-0 font-score text-sm font-black text-line" aria-label={`${count} waiting`}>
            {count}
          </span>
        )}
      </Link>
    </DropdownMenuItem>
  );
}
