"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";
import { OPTION_LABELS } from "@/lib/profile";
import type { SignupOption } from "@/lib/types";

export type AddablePlayer = { id: string; name: string; email: string };

/**
 * Host adds someone by hand: search an existing player, or type a guest's name.
 * `full` says, per option, whether the session has no room left (adding makes room).
 */
export function AddPlayerForm({
  action,
  players,
  options,
  prices,
  full,
}: {
  action: (formData: FormData) => Promise<void>;
  players: AddablePlayer[];
  options: SignupOption[];
  prices: Record<SignupOption, string>;
  full: Record<SignupOption, boolean>;
}) {
  const [mode, setMode] = useState<"account" | "guest">("account");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<AddablePlayer | null>(null);
  const [option, setOption] = useState<SignupOption>(options[0]);
  const q = query.trim().toLowerCase();
  const matches = q
    ? players.filter((p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)).slice(0, 8)
    : [];
  const who = mode === "account" ? picked?.name : "the guest";

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="mode" value={mode} />
      <div className="flex flex-wrap gap-x-6 gap-y-2" role="radiogroup" aria-label="Who">
        {(["account", "guest"] as const).map((m) => (
          <label key={m} className="flex items-center gap-2">
            <input
              type="radio"
              checked={mode === m}
              onChange={() => setMode(m)}
              className="size-4 accent-[var(--line)]"
            />
            {m === "account" ? "A player with an account" : "A guest (no account)"}
          </label>
        ))}
      </div>

      {mode === "account" ? (
        <div className="max-w-md space-y-2">
          <input type="hidden" name="profile_id" value={picked?.id ?? ""} />
          {picked ? (
            <p className="flex flex-wrap items-baseline gap-x-3">
              <b className="[overflow-wrap:anywhere]">{picked.name}</b>
              <span className="text-sm text-ink-soft [overflow-wrap:anywhere]">{picked.email}</span>
              <button type="button" onClick={() => setPicked(null)} className="text-sm underline decoration-line">
                Change
              </button>
            </p>
          ) : (
            <>
              <Field label="Find a player">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Name or email"
                  className={inputClass}
                />
              </Field>
              {q && (
                <ul className="divide-y divide-ink/20 border-y border-ink/20">
                  {matches.length === 0 && <li className="py-2 text-sm text-ink-soft">No match. Add them as a guest?</li>}
                  {matches.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setPicked(p)}
                        className="flex w-full flex-wrap items-baseline gap-x-3 py-2 text-left hover:bg-maple-deep/50"
                      >
                        <b className="[overflow-wrap:anywhere]">{p.name}</b>
                        <span className="text-sm text-ink-soft [overflow-wrap:anywhere]">{p.email}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="grid max-w-xl grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
          <Field label="Name">
            <input name="guest_name" required maxLength={100} placeholder="e.g. Sam Lee" className={inputClass} />
          </Field>
          <Field label="Email (optional)" hint="If they have an account with this email, it's used.">
            <input name="guest_email" type="email" maxLength={200} className={inputClass} />
          </Field>
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-1 font-display text-sm font-bold tracking-[0.15em] uppercase">Coming for</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {options.map((o) => (
            <label key={o} className="flex items-center gap-2">
              <input
                type="radio"
                name="option"
                value={o}
                checked={option === o}
                onChange={() => setOption(o)}
                className="size-4 accent-[var(--line)]"
              />
              {OPTION_LABELS[o]} <span className="font-score font-black">{prices[o]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-start gap-3">
        <input type="checkbox" name="paid" className="mt-1 size-5 shrink-0 accent-[var(--line)]" />
        <span>
          <b>Already paid</b>
          <span className="block text-sm text-ink-soft">
            Cash at the door, or a transfer you&apos;ve already seen. Otherwise they owe the price, with no hold that runs
            out.
          </span>
        </span>
      </label>

      <SubmitButton
        disabled={mode === "account" && !picked}
        confirm={{
          title: `Add ${who ?? "this player"}?`,
          description: full[option]
            ? `This option is full, so the session gets one more ${option === "instructional" ? "instructional place" : "spot"} for them.`
            : "They get a spot straight away.",
          action: "Add player",
        }}
      >
        Add player
      </SubmitButton>
    </form>
  );
}
