"use client";

import { BoardNav } from "@/components/board-nav";

const links = [
  { href: "/owner", label: "Health" },
  { href: "/owner/data", label: "Data" },
  { href: "/owner/players", label: "View as player" },
  { href: "/owner/danger", label: "Danger zone" },
  { href: "/owner/audit", label: "Audit log" },
] as const;

export function OwnerNav() {
  return <BoardNav links={links} root="/owner" />;
}
