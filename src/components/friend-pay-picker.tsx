import { setCoveredSignups } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { TeammatePicker } from "@/components/teammate-picker";
import { MAX_TEAMMATES } from "@/lib/teams";

/**
 * "Paying for friends too?": pick other unpaid sign-ups in this session.
 * One e-Transfer with this player's code then pays for all of them.
 */
export function FriendPayPicker({
  registrationId,
  sessionId,
  options,
  selected,
  summary,
}: {
  registrationId: string;
  sessionId: string;
  options: { id: string; name: string }[];
  selected: string[];
  /** The toggle text: "Paying for friends too?" or "Pay for a friend". */
  summary: string;
}) {
  return (
    <details open={selected.length > 0} className="border-t border-ink/20 pt-4">
      <summary className="cursor-pointer font-display text-sm font-bold tracking-[0.15em] uppercase">
        {summary} <span className="font-normal tracking-normal normal-case text-ink-soft">(up to {MAX_TEAMMATES})</span>
      </summary>
      <form action={setCoveredSignups.bind(null, registrationId, sessionId)} className="mt-3 space-y-2">
        <p className="text-sm text-ink-soft">
          Pick friends who still have to pay. Send one e-Transfer with your code for everyone, and they&apos;re told they
          have nothing to send.
        </p>
        <TeammatePicker
          options={options}
          defaultSelected={selected}
          name="friends"
          addLabel="Add a friend"
          emptyText="No one else in this session is waiting to pay."
        />
        {(options.length > 0 || selected.length > 0) && (
          <SubmitButton size="sm" variant="secondary" requireChange>
            Save
          </SubmitButton>
        )}
      </form>
    </details>
  );
}
