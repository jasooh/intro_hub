"use client";

import { BoardNav } from "@/components/board-nav";

const links = [
  { href: "/admin", label: "Sessions" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/refunds", label: "Refunds" },
  { href: "/admin/players", label: "Players" },
  { href: "/admin/stats", label: "Stats" },
  { href: "/admin/updates", label: "Updates" },
  { href: "/admin/templates", label: "Weekly schedule" },
  { href: "/admin/songs", label: "Songs" },
] as const;

export function AdminNav() {
  return <BoardNav links={links} root="/admin" rootAlso={["/admin/sessions"]} />;
}
