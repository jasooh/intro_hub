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

/** Big scoreboard countdown: DAYS · HRS · MIN · SEC. `label` is read out by screen readers ("Sign-ups open in"). */
export function Countdown({
  to,
  label = "Sign-ups open in",
  doneText = "Opening now…",
}: {
  to: string;
  label?: string;
  doneText?: string;
}) {
  const now = useNow();
  const left = now == null ? null : new Date(to).getTime() - now;
  useRefreshWhenDone(left != null && left <= 0);
  if (left == null) return <div className="h-[5.5rem]" aria-hidden />;
  if (left <= 0) return <p className="font-display text-2xl font-black tracking-[0.15em] text-line uppercase">{doneText}</p>;
  const { days, hours, minutes, seconds } = parts(left);
  const cells: [string, string][] = [
    ...(days > 0 ? ([[String(days), days === 1 ? "Day" : "Days"]] as [string, string][]) : []),
    [two(hours), "Hrs"],
    [two(minutes), "Min"],
    [two(seconds), "Sec"],
  ];
  return (
    <div role="timer" aria-label={`${label} ${days} days ${hours} hours ${minutes} minutes`} className="flex flex-wrap gap-3 sm:gap-4">
      {cells.map(([value, label]) => (
        <Scoreboard key={label} value={value} label={label} size="sm" className="min-w-[4.5rem]" />
      ))}
    </div>
  );
}

/** Small LED tag like "Starts in 2d 4h" for session rows; down to the second in the last hour. */
export function CountTag({ to, label }: { to: string; label: string }) {
  const now = useNow();
  const left = now == null ? null : new Date(to).getTime() - now;
  useRefreshWhenDone(left != null && left <= 0);
  const { days, hours, minutes, seconds } = parts(left ?? 0);
  const text =
    left == null ? "soon" : left <= 0 ? "now" : days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${two(minutes)}m` : `${two(minutes)}:${two(seconds)}`;
  return (
    <span className="inline-flex items-center gap-2 bg-board px-2 pt-1 pb-0.5 font-display text-xs font-bold tracking-[0.2em] whitespace-nowrap text-led uppercase">
      {label} <span className="font-score text-sm tabular-nums">{text}</span>
    </span>
  );
}

export const OpensIn = ({ to }: { to: string }) => <CountTag to={to} label="Sign-ups open in" />;

/**
 * How long an unpaid spot stays held: an LED tag like "Pay within 11h 42m",
 * down to the second in the last hour. At zero it says so and checks back
 * every 20 seconds until the every-minute job releases the spot.
 */
export function HoldTimer({ to }: { to: string }) {
  const now = useNow();
  const left = now == null ? null : new Date(to).getTime() - now;
  const done = left != null && left <= 0;
  const router = useRouter();
  useEffect(() => {
    if (!done) return;
    router.refresh();
    const id = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(id);
  }, [done, router]);

  const { days, hours, minutes, seconds } = parts(left ?? 0);
  const text =
    left == null
      ? "…"
      : days > 0
        ? `${days}d ${hours}h`
        : hours > 0
          ? `${hours}h ${two(minutes)}m`
          : `${two(minutes)}:${two(seconds)}`;
  const urgent = left != null && left < 3_600_000;
  return (
    <span
      role="timer"
      aria-label={done ? "Hold time is up" : `Pay within ${days} days ${hours} hours ${minutes} minutes`}
      className="inline-flex items-center gap-2 bg-board px-2.5 pt-1 pb-0.5 font-display text-sm font-bold tracking-[0.2em] whitespace-nowrap text-led uppercase"
    >
      {done ? (
        "Hold time's up"
      ) : (
        <>
          Pay within{" "}
          <span className={`font-score text-base tabular-nums ${urgent ? "animate-flicker" : ""}`}>{text}</span>
        </>
      )}
    </span>
  );
}
