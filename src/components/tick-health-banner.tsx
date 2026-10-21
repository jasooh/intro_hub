import { after } from "next/server";
import { formatDateTime } from "@/lib/format";
import { alertDevTickStale, getTickHealth } from "@/lib/tick-health";

/** Host panel warning when the every-minute job stops; also emails the developer once. */
export async function TickHealthBanner() {
  const health = await getTickHealth();
  if (!health.stale) return null;
  after(() => alertDevTickStale(health).catch((err) => console.error("Tick alert failed", err)));
  return (
    <div role="status" className="space-y-1 border-l-4 border-bad bg-maple-deep/40 py-2 pl-3 text-sm">
      <p className="font-display text-base font-bold tracking-wide text-bad uppercase">The every-minute job has stopped</p>
      <p>
        {health.lastTick ? `It last ran ${formatDateTime(health.lastTick)}.` : "It hasn't run yet."} Until it runs again,
        unpaid holds won&apos;t expire, the waitlist won&apos;t move and queued emails won&apos;t retry. The developer has
        been emailed.
      </p>
    </div>
  );
}
