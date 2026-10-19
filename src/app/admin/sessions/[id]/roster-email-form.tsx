"use client";

import { useState } from "react";
import { RichTextEditor } from "@/components/rich-text-editor";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";
import { AUDIENCE_LABELS, type Audience } from "@/lib/audiences";

/** Host email to this session's players. The recipient count follows the ticked groups. */
export function RosterEmailForm({
  action,
  counts,
}: {
  action: (formData: FormData) => Promise<void>;
  /** How many players are in each group right now. */
  counts: Record<Audience, number>;
}) {
  const [picked, setPicked] = useState<Set<Audience>>(new Set(["confirmed", "pending_payment", "instructional"]));
  const total = [...picked].reduce((sum, a) => sum + counts[a], 0);
  const toggle = (a: Audience, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(a);
      else next.delete(a);
      return next;
    });

  return (
    <form action={action} className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="font-display text-sm font-bold tracking-[0.15em] uppercase">Send to</legend>
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
                {AUDIENCE_LABELS[a]} <span className="font-score font-black text-ink-soft">{counts[a]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Subject">
        <input
          name="subject"
          required
          maxLength={150}
          placeholder="e.g. We're in Gym 2 tonight"
          className={`${inputClass} font-display text-2xl font-black uppercase`}
        />
      </Field>

      <div className="space-y-2">
        <p className="font-display text-sm font-bold tracking-[0.15em] uppercase">Message</p>
        <RichTextEditor name="body_html" label="Message to players" />
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-ink/25 pt-5">
        <SubmitButton
          disabled={total === 0}
          confirm={{
            title: `Email ${total} player${total === 1 ? "" : "s"}?`,
            description: "Everyone in the ticked groups gets this now, even if they turned off announcement emails.",
            action: "Send email",
          }}
        >
          Send to {total} player{total === 1 ? "" : "s"}
        </SubmitButton>
      </div>
    </form>
  );
}
