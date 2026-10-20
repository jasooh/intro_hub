"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { Scoreboard } from "@/components/ui";

// One shared clock, ticking every second. null on the server so it never mismatches.
let current = 0;
function subscribe(onChange: () => void) {
  current = Date.now();
  const id = setInterval(() => {
    current = Date.now();
    onChange();
  }, 1000);
  return () => clearInterval(id);
}
const useNow = () =>
  useSyncExternalStore(
    subscribe,
    () => current || null,
    () => null,
  );

function parts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { days: Math.floor(total / 86400), hours: Math.floor(total / 3600) % 24, minutes: Math.floor(total / 60) % 60, seconds: total % 60 };
}
const two = (n: number) => String(n).padStart(2, "0");

/** Re-renders the page once the time is up (and keeps trying, in case this device's clock runs fast). */
function useRefreshWhenDone(done: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!done) return;
    router.refresh();
    const id = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(id);
  }, [done, router]);
}

/** Big scoreboard countdown: DAYS · HRS · MIN · SEC. */
export function Countdown({ to }: { to: string }) {
  const now = useNow();
  const left = now == null ? null : new Date(to).getTime() - now;
  useRefreshWhenDone(left != null && left <= 0);
  if (left == null) return <div className="h-[5.5rem]" aria-hidden />;
  if (left <= 0) return <p className="font-display text-2xl font-black tracking-[0.15em] text-line uppercase">Opening now…</p>;
  const { days, hours, minutes, seconds } = parts(left);
  const cells: [string, string][] = [
    ...(days > 0 ? ([[String(days), days === 1 ? "Day" : "Days"]] as [string, string][]) : []),
    [two(hours), "Hrs"],
    [two(minutes), "Min"],
    [two(seconds), "Sec"],
  ];
  return (
    <div role="timer" aria-label={`Sign-ups open in ${days} days ${hours} hours ${minutes} minutes`} className="flex flex-wrap gap-3 sm:gap-4">
      {cells.map(([value, label]) => (
        <Scoreboard key={label} value={value} label={label} size="sm" className="min-w-[4.5rem]" />
      ))}
    </div>
  );
}

/** Small "Opens in 2d 4h" tag for session rows; down to the second in the last hour. */
export function OpensIn({ to }: { to: string }) {
  const now = useNow();
  const left = now == null ? null : new Date(to).getTime() - now;
  useRefreshWhenDone(left != null && left <= 0);
  const { days, hours, minutes, seconds } = parts(left ?? 0);
  const text =
    left == null ? "soon" : left <= 0 ? "now" : days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${two(minutes)}m` : `${two(minutes)}:${two(seconds)}`;
  return (
    <span className="inline-flex items-center gap-2 bg-board px-2 pt-1 pb-0.5 font-display text-xs font-bold tracking-[0.2em] whitespace-nowrap text-led uppercase">
      Sign-ups open in <span className="font-score text-sm tabular-nums">{text}</span>
    </span>
  );
}
