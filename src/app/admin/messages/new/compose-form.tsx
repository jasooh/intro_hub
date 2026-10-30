"use client";

import { useState } from "react";
import { hostStartThreads } from "@/app/admin/messages/actions";
import { SubmitButton } from "@/components/submit-button";
import { cn, Field, inputClass } from "@/components/ui";
import { AUDIENCE_LABELS, type Audience } from "@/lib/audiences";
import { MESSAGE_MAX, SUBJECT_MAX } from "@/lib/message-errors";

export type ComposeTarget =
  | { kind: "player"; id: string; name: string }
  | { kind: "session"; id: string; title: string; counts: Record<Audience, number> };

/**
 * A host starts a conversation: with one player, or with the ticked groups of
 * a session (each person gets their own private thread). The count follows the ticks.
 */
export function ComposeForm({ target }: { target: ComposeTarget }) {
  const [picked, setPicked] = useState<Set<Audience>>(new Set(["confirmed", "pending_payment", "instructional"]));
  const toggle = (a: Audience, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(a);
      else next.delete(a);
      return next;
    });
  const total = target.kind === "session" ? [...picked].reduce((sum, a) => sum + target.counts[a], 0) : 1;

  return (
    <form action={hostStartThreads} className="max-w-2xl space-y-6">
      {target.kind === "player" ? (
        <>
          <input type="hidden" name="to" value={target.id} />
          <p>
            To <b className="[overflow-wrap:anywhere]">{target.name}</b>
          </p>
        </>
      ) : (
        <>
          <input type="hidden" name="session" value={target.id} />
          <fieldset className="space-y-2">
            <legend className="font-display text-sm font-bold tracking-[0.15em] uppercase">
              Send to · {target.title}
            </legend>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((a) => (
                <label key={a} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="audiences"
                    value={a}
                    checked={picked.has(a)}
                    onChange={(e) => toggle(a, e.target.checked)}
                    className="size-5 shrink-0 accent-[var(--line)]"
                  />
                  <span>
                    {AUDIENCE_LABELS[a]} <span className="font-score font-black text-ink-soft">{target.counts[a]}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-sm text-ink-soft">Each player gets their own private conversation, so replies don&apos;t reach the others.</p>
          </fieldset>
        </>
      )}

      <Field label="Subject" required>
        <input
          name="subject"
          required
          maxLength={SUBJECT_MAX}
          placeholder="e.g. Quick question about Saturday"
          className={cn(inputClass, "font-display text-2xl font-black uppercase")}
        />
      </Field>
      <Field label="Message" required>
        <textarea name="body" required rows={7} maxLength={MESSAGE_MAX} className={cn(inputClass, "resize-y")} />
      </Field>

      <div className="border-t border-ink/25 pt-5">
        <SubmitButton
          disabled={total === 0}
          confirm={
            total > 1
              ? {
                  title: `Message ${total} players?`,
                  description: "Each of them gets this in their inbox now, and an email unless they turned message emails off.",
                  action: "Send",
                }
              : undefined
          }
        >
          {total > 1 ? `Send to ${total} players` : "Send message"}
        </SubmitButton>
      </div>
    </form>
  );
}
