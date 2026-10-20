"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";
import { submitFeedback } from "./actions";
import { FEEDBACK_LIMITS } from "./limits";

/** The contact page's feedback form. Anonymous by default when signed out. */
export function FeedbackForm({
  signedIn,
  defaultName = "",
  defaultEmail = "",
}: {
  signedIn: boolean;
  defaultName?: string;
  defaultEmail?: string;
}) {
  const [anonymous, setAnonymous] = useState(!signedIn);
  const [length, setLength] = useState(0);

  return (
    <form action={submitFeedback} onReset={() => setLength(0)} className="max-w-2xl space-y-6">
      <Field label="Message" required>
        <textarea
          name="message"
          required
          rows={6}
          maxLength={FEEDBACK_LIMITS.message}
          onChange={(e) => setLength(e.target.value.length)}
          placeholder="What's working, what isn't, ideas for sessions…"
          className={inputClass}
        />
      </Field>
      <p className="-mt-4 text-right text-xs text-ink-soft" aria-live="polite">
        <span className="font-score font-black">{length}</span> / {FEEDBACK_LIMITS.message}
      </p>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="anonymous"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.target.checked)}
          className="mt-1 size-5 shrink-0 accent-[var(--line)]"
        />
        <span>
          <span className="font-display text-lg font-bold uppercase">Send anonymously</span>
          <span className="block text-sm text-ink-soft">
            {signedIn
              ? "We won't see your name, email or account."
              : "We won't know who sent it. Untick to leave a name or email if you'd like a reply."}
          </span>
        </span>
      </label>

      <fieldset
        disabled={anonymous}
        className={`grid grid-cols-1 gap-6 transition-opacity sm:grid-cols-2 ${anonymous ? "opacity-40" : ""}`}
      >
        <legend className="sr-only">Who it&apos;s from (optional)</legend>
        <Field label="Name" hint="Optional">
          <input
            name="name"
            defaultValue={defaultName}
            maxLength={FEEDBACK_LIMITS.name}
            autoComplete="name"
            className={inputClass}
          />
        </Field>
        <Field label="Email" hint="Optional, if you'd like a reply">
          <input
            name="email"
            type="email"
            defaultValue={defaultEmail}
            maxLength={FEEDBACK_LIMITS.email}
            autoComplete="email"
            className={inputClass}
          />
        </Field>
      </fieldset>

      {/* Honeypot for bots: hidden from people and screen readers. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <SubmitButton>Send feedback</SubmitButton>
    </form>
  );
}
