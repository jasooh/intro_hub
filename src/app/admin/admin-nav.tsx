"use client";

import { GroupedBoardNav } from "@/components/board-nav";

// Host pages by what they're for. A category tab opens its first page.
const groups = [
  {
    label: "Sessions",
    links: [
      { href: "/admin", label: "Sessions" },
      { href: "/admin/templates", label: "Weekly schedule" },
    ],
  },
  {
    label: "Money",
    links: [
      { href: "/admin/payments", label: "Payments" },
      { href: "/admin/refunds", label: "Refunds" },
    ],
  },
  {
    label: "Players",
    links: [
      { href: "/admin/players", label: "Players" },
      { href: "/admin/feedback", label: "Feedback" },
      { href: "/admin/songs", label: "Songs" },
    ],
  },
  {
    label: "Club",
    links: [
      { href: "/admin/updates", label: "Updates" },
      { href: "/admin/stats", label: "Stats" },
    ],
  },
] as const;

export function AdminNav() {
  return <GroupedBoardNav groups={groups} root="/admin" rootAlso={["/admin/sessions"]} />;
}
