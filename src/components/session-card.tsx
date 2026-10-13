import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { formatDateTime, formatMoney } from "@/lib/format";
import { spotsLeft } from "@/lib/queries";
import type { Session, SessionCounts } from "@/lib/types";

export function SessionCard({ session, counts, href }: { session: Session; counts?: SessionCounts; href: string }) {
  const left = spotsLeft(session, counts);
  const waitlisted = counts?.waitlisted ?? 0;
  const cancelled = session.status === "cancelled";

  return (
    <Link href={href} className="block">
      <Card className="transition-colors hover:border-stone-600">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{session.title}</p>
            <p className="text-sm text-stone-400">{formatDateTime(session.starts_at)}</p>
            <p className="text-sm text-stone-400">
              {session.location} · {formatMoney(session.price_cents)}
            </p>
          </div>
          <div className="text-right">
            {cancelled ? (
              <Badge className="bg-red-950 text-red-300">Cancelled</Badge>
            ) : left > 0 ? (
              <Badge className="bg-green-950 text-green-300">
                {left} spot{left === 1 ? "" : "s"} left
              </Badge>
            ) : (
              <Badge className="bg-sky-950 text-sky-300">Full · {waitlisted} waiting</Badge>
            )}
            <p className="mt-1 text-xs text-stone-400">
              {(counts?.confirmed ?? 0) + (counts?.holding ?? 0)}/{session.capacity} signed up
            </p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
