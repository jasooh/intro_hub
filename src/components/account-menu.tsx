"use client";

import { CalendarCheck, LayoutDashboard, LogOut, UserRound, Wrench } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { signOut } from "@/app/auth/actions";
import { Avatar } from "@/components/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Profile picture in the header that opens Account / Admin (hosts only) / Dev tools (the owner only) / Sign out. */
export function AccountMenu({
  name,
  email,
  avatarUrl,
  isAdmin,
  isOwner,
}: {
  name: string;
  email: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  isOwner: boolean;
}) {
  const [signingOut, startSignOut] = useTransition();

  return (
    // Not modal: no scroll lock, so opening it never shifts the page (or the sticky header).
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-line focus-visible:ring-offset-2 focus-visible:ring-offset-maple"
      >
        <Avatar name={name} src={avatarUrl} size={32} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-none border-2 p-1.5 shadow-[4px_4px_0_var(--ink)]">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate font-display text-lg font-extrabold uppercase">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/me">
            <UserRound />
            Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/me/signups">
            <CalendarCheck />
            My sign-ups
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <LayoutDashboard />
              Admin
            </Link>
          </DropdownMenuItem>
        )}
        {isOwner && (
          <DropdownMenuItem asChild>
            <Link href="/dev-tools">
              <Wrench />
              Dev tools
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signingOut} onSelect={() => startSignOut(() => signOut())}>
          <LogOut />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
