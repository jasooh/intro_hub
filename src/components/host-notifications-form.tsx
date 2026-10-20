import { saveHostNotifications } from "@/app/admin/actions";
import { SubmitButton } from "@/components/submit-button";
import { DIGEST_LABELS, type HostDigest } from "@/lib/host-schedule";
import type { Profile } from "@/lib/types";

const DIGEST_HINTS: Record<HostDigest, string> = {
  off: "No summary emails.",
  "3h": "A summary of joins, cancels and payments at most every 3 hours, only when something changed. Held overnight (10pm–7am).",
  daily: "One summary each morning at 8am, if anything changed.",
};

/** Hosts only, on the account page: how much email they get about sign-ups. */
export function HostNotificationsForm({ profile }: { profile: Profile }) {
  const check = (name: keyof Profile, title: string, hint: string) => (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={Boolean(profile[name])}
        className="mt-1 size-5 shrink-0 accent-[var(--line)]"
      />
      <span>
        <b>{title}</b>
        <span className="block text-sm text-ink-soft">{hint}</span>
      </span>
    </label>
  );

  return (
    <form action={saveHostNotifications} className="space-y-8">
      <fieldset className="space-y-3">
        <legend className="mb-1 font-display text-sm font-bold tracking-[0.15em] uppercase">Summary of changes</legend>
        {(Object.keys(DIGEST_LABELS) as HostDigest[]).map((d) => (
          <label key={d} className="flex items-start gap-3">
            <input
              type="radio"
              name="host_digest"
              value={d}
              defaultChecked={profile.host_digest === d}
              className="mt-1 size-5 shrink-0 accent-[var(--line)]"
            />
            <span>
              <b>{DIGEST_LABELS[d]}</b>
              <span className="block text-sm text-ink-soft">{DIGEST_HINTS[d]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 font-display text-sm font-bold tracking-[0.15em] uppercase">Also email me</legend>
        {check(
          "host_session_day",
          "On session day",
          "At 9am on the day: the roster, who still owes, the waitlist and notes.",
        )}
        {check(
          "host_alert_late_cancel",
          "Right away for late cancellations",
          "When someone gives up their spot within 24 hours of the start.",
        )}
        {check(
          "host_alert_unmatched",
          "Right away for unmatched e-Transfers",
          "When a payment arrives that couldn't be matched to a sign-up.",
        )}
      </fieldset>

      <SubmitButton requireChange>Save</SubmitButton>
    </form>
  );
}
