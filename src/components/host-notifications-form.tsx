import { saveHostNotifications } from "@/app/admin/actions";
import { EmailChoice, EmailSwitch } from "@/components/email-switch";
import { SubmitButton } from "@/components/submit-button";
import { DIGEST_LABELS, type HostDigest } from "@/lib/host-schedule";
import type { Profile } from "@/lib/types";

const DIGEST_HINTS: Record<HostDigest, string> = {
  off: "No summary emails.",
  "3h": "A summary of joins, cancels and payments at most every 3 hours, only when something changed. Held overnight (10pm–7am).",
  daily: "One summary each morning at 8am, if anything changed.",
};

/**
 * Hosts only, on the account page: how much email they get about sign-ups.
 * Same shape as the players' email settings: a main switch, then the choices.
 */
export function HostNotificationsForm({ profile }: { profile: Profile }) {
  return (
    <form action={saveHostNotifications} className="space-y-8">
      <EmailSwitch
        name="host_emails"
        defaultOn={profile.host_emails ?? true}
        label="Email me about sign-ups"
        hint="Summaries, session-day rosters and alerts about problems."
        total={5}
      >
        <fieldset className="space-y-3">
          <legend className="mb-1 font-display text-sm font-bold tracking-[0.15em] uppercase">Summary of changes</legend>
          {(Object.keys(DIGEST_LABELS) as HostDigest[]).map((d) => (
            <EmailChoice
              key={d}
              type="radio"
              name="host_digest"
              value={d}
              defaultChecked={profile.host_digest === d}
              title={<b>{DIGEST_LABELS[d]}</b>}
              hint={DIGEST_HINTS[d]}
            />
          ))}
        </fieldset>
        <fieldset className="space-y-3 border-t border-ink/15 pt-3">
          <legend className="sr-only">Also email me</legend>
          <EmailChoice
            name="host_session_day"
            defaultChecked={profile.host_session_day}
            title={<b>On session day</b>}
            hint="At 9am on the day: the roster, who still owes, the waitlist and notes."
          />
          <EmailChoice
            name="host_alert_late_cancel"
            defaultChecked={profile.host_alert_late_cancel}
            title={<b>Right away for late cancellations</b>}
            hint="When someone gives up their spot within 24 hours of the start."
          />
          <EmailChoice
            name="host_alert_unmatched"
            defaultChecked={profile.host_alert_unmatched}
            title={<b>Right away for e-Transfer problems</b>}
            hint="When a payment arrives that couldn't be matched to a sign-up, or a sender cancels one."
          />
          <EmailChoice
            name="host_alert_messages"
            defaultChecked={profile.host_alert_messages ?? true}
            title={<b>Right away for player messages</b>}
            hint="When a player writes to the hosts in the inbox."
          />
        </fieldset>
      </EmailSwitch>

      <SubmitButton requireChange>Save</SubmitButton>
    </form>
  );
}
