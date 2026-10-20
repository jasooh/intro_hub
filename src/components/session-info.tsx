import Link from "next/link";
import type { ReactNode } from "react";
import { Sheet } from "@/components/ui";
import { SESSION_PARTS, WHAT_TO_KNOW } from "@/lib/club";
import { env } from "@/lib/env";
import { formatDateTime, formatMoney, pad2 } from "@/lib/format";
import type { Session } from "@/lib/types";

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="font-score font-black text-line">{pad2(n)}</span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/**
 * How signing up works, next to the Sign up button: the hold, paying, being
 * confirmed, and the refund cutoff. `price` is what the default option costs.
 */
export function HowItWorks({ session, price, waitlist }: { session: Session; price: number; waitlist: boolean }) {
  const cutoffPassed = new Date(session.cancel_cutoff) <= new Date();
  const deposit = session.deposit_cents != null;
  const steps: ReactNode[] = [
    waitlist ? (
      <>Join the waitlist. If a spot opens, it&apos;s yours and we email you to pay. Don&apos;t send money yet.</>
    ) : (
      <>
        Sign up. Your spot is held for <b>{session.hold_hours} hours</b> while you pay.
      </>
    ),
  ];
  if (price > 0) {
    steps.push(
      <>
        {waitlist ? "When you get a spot, send" : "Send"} <b>{formatMoney(price)}</b>
        {deposit && " (a refundable deposit, returned after the session)"} by Interac e-Transfer to{" "}
        <b className="[overflow-wrap:anywhere]">{env.etransferEmail()}</b> with the code we give you.
      </>,
      <>You&apos;re confirmed automatically when it arrives, usually within minutes. We email you.</>,
    );
  }
  steps.push(
    cutoffPassed ? (
      <>The refund cutoff has passed: spots cancelled now aren&apos;t refunded.</>
    ) : (
      <>
        Can&apos;t make it? Cancel before <b>{formatDateTime(session.cancel_cutoff)}</b> for a refund.
      </>
    ),
  );
  return (
    <div className="max-w-xl space-y-2 border-l-4 border-line py-1 pl-3">
      <p className="font-display text-sm font-bold tracking-[0.15em] uppercase">How it works</p>
      <ol className="space-y-1.5 text-sm">
        {steps.map((s, i) => (
          <Step key={i} n={i + 1}>
            {s}
          </Step>
        ))}
      </ol>
    </div>
  );
}

/** For newcomers (and anyone signed out): what a session is like and what to bring. */
export function FirstTimeSheet({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <Sheet label="First time?" className={className} style={style}>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <ol className="space-y-3">
          {SESSION_PARTS.map((part, i) => (
            <li key={part.title} className="flex gap-3">
              <span className="font-score text-2xl leading-none font-black text-line">{pad2(i + 1)}</span>
              <span className="min-w-0">
                <span className="block font-display text-lg font-extrabold uppercase">{part.title}</span>
                <span className="text-ink-soft">{part.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <dl className="divide-y divide-ink/20 border-y border-ink/20">
          {WHAT_TO_KNOW.map((item) => (
            <div key={item.label} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 py-2">
              <dt className="font-display text-sm font-bold tracking-[0.15em] uppercase">{item.label}</dt>
              <dd className="text-ink-soft">{item.body}</dd>
            </div>
          ))}
          <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 py-2">
            <dt className="font-display text-sm font-bold tracking-[0.15em] uppercase">Waiver</dt>
            <dd className="text-ink-soft">
              You&apos;ll accept the{" "}
              <Link href="/legal/waiver" className="underline decoration-line decoration-2 underline-offset-4">
                waiver
              </Link>{" "}
              once, when you set up your profile.
            </dd>
          </div>
        </dl>
      </div>
    </Sheet>
  );
}

/** The host's notes on a session, labelled so they don't read like a status message. */
export function HostNotes({ notes, className, style }: { notes: string; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`border-l-4 border-ink py-1 pl-4 ${className ?? ""}`} style={style}>
      <p className="font-display text-sm font-bold tracking-[0.15em] text-ink-soft uppercase">From the host</p>
      <p className="whitespace-pre-line text-ink">{notes}</p>
    </div>
  );
}
