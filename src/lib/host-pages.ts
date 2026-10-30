// Host pages by what they're for: the admin tab bar and the avatar panel both use this.

export type HostBadge = "payments" | "owed" | "refunds" | "feedback" | "messages";
export type HostPage = { href: string; label: string; badge?: HostBadge };
export type HostGroup = { label: string; links: readonly HostPage[] };

export const HOST_GROUPS: readonly HostGroup[] = [
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
      { href: "/admin/payments", label: "Payments", badge: "payments" },
      { href: "/admin/owed", label: "Owed", badge: "owed" },
      { href: "/admin/refunds", label: "Refunds", badge: "refunds" },
    ],
  },
  {
    label: "Players",
    links: [
      { href: "/admin/players", label: "Players" },
      { href: "/admin/messages", label: "Messages", badge: "messages" },
      { href: "/admin/feedback", label: "Feedback", badge: "feedback" },
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
];

export type HostBadges = Record<HostBadge, number>;

/** Things a host has to act on (owed money is a reminder, not a to-do): drives the dot on the avatar. */
export const needsAttention = (b: HostBadges) => b.payments + b.refunds + b.feedback + b.messages;
