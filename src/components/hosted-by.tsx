import { Avatar } from "@/components/ui";
import type { SessionHost } from "@/lib/types";

/** "Hosted by" with each host's avatar, on the session page. */
export function HostedBy({ hosts }: { hosts: SessionHost[] }) {
  if (hosts.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
      <span className="flex -space-x-2">
        {hosts.map((h, i) => (
          <Avatar key={`${h.name}-${i}`} name={h.name} src={h.avatar_url} size={28} />
        ))}
      </span>
      <span className="min-w-0 [overflow-wrap:anywhere]">
        Hosted by <b className="font-semibold text-ink">{hosts.map((h) => h.name).join(" & ")}</b>
      </span>
    </p>
  );
}
