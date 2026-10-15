"use client";

import { BoardNav } from "@/components/board-nav";

const links = [
  { href: "/dev-tools", label: "Health" },
  { href: "/dev-tools/data", label: "Data" },
  { href: "/dev-tools/players", label: "View as player" },
  { href: "/dev-tools/danger", label: "Danger zone" },
  { href: "/dev-tools/audit", label: "Audit log" },
] as const;

export function DevToolsNav() {
  return <BoardNav links={links} root="/dev-tools" />;
}
