import type { ReactNode } from "react";
import { saveProfile } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { PhoneInput } from "@/components/phone-input";
import { Field, inputClass } from "@/components/ui";
import {
  INCLUSION_CHARTER_URL,
  MEDIA_RELEASE,
  WAIVER_AGREEMENT,
  WAIVER_PARAGRAPHS,
  WAIVER_VERSION,
} from "@/lib/agreements";
import { defaultDisplayName, HEARD_LABELS, SKILL_LABELS, splitFullName } from "@/lib/profile";
import type { Profile } from "@/lib/types";

/** Everything the old Google Form asked, answered once. Used by onboarding and the Account page. */
export function ProfileForm({
  profile,
  next,
  returnTo,
  submitLabel,
  submitClassName,
  requireChange = false,
}: {
  profile: Profile;
  /** Where to go after saving. */
  next: string;
  /** Page to show validation errors on. */
  returnTo: string;
  submitLabel: string;
  submitClassName?: string;
  /** Editing a saved profile: Save stays disabled until something changes. */
  requireChange?: boolean;
}) {
  const guess = splitFullName(profile.full_name);
  const first = profile.first_name ?? guess.first;
  const last = profile.last_name ?? guess.last;
  const display = profile.onboarded_at && profile.display_name ? profile.display_name : defaultDisplayName(first, last);
  const waiverCurrent = Boolean(profile.waiver_accepted_at && profile.waiver_version === WAIVER_VERSION);

  return (
    <form action={saveProfile} className="space-y-10">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="return_to" value={returnTo} />

      <Group title="You">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="First name">
            <input name="first_name" defaultValue={first} required maxLength={60} autoComplete="given-name" autoCapitalize="words" spellCheck={false} className={inputClass} />
          </Field>
          <Field label="Last name">
            <input name="last_name" defaultValue={last} required maxLength={60} autoComplete="family-name" autoCapitalize="words" spellCheck={false} className={inputClass} />
          </Field>
          <Field label="Display name" hint="What other players see on the team sheet.">
            <input name="display_name" defaultValue={display} required maxLength={60} autoComplete="nickname" autoCapitalize="words" spellCheck={false} className={inputClass} />
          </Field>
          <Field label="Contact number" hint="Only the hosts can see this.">
            <PhoneInput name="phone" defaultValue={profile.phone ?? ""} required />
          </Field>
        </div>
      </Group>

      <Group title="About you">
        <div className="space-y-6">
          <Choice label="What is your current skill level?">
            {Object.entries(SKILL_LABELS).map(([value, label]) => (
              <Radio key={value} name="skill_level" value={value} defaultChecked={profile.skill_level === value} required>
                {label}
              </Radio>
            ))}
          </Choice>
          <Choice label="Have you attended this class before?">
            <Radio name="attended_before" value="yes" defaultChecked={profile.attended_before === true} required>
              Yes
            </Radio>
            <Radio name="attended_before" value="no" defaultChecked={profile.attended_before === false} required>
              No, I&apos;m new
            </Radio>
          </Choice>
          <Field label="What do you most want to learn or improve? (optional)">
            <textarea name="learning_goals" defaultValue={profile.learning_goals ?? ""} rows={2} maxLength={500} autoCapitalize="sentences" className={inputClass} />
          </Field>
          <Field label="Your hype song (optional)" hint="The song that gets your adrenaline pumping. It goes on the session playlist.">
            <input name="hype_song" defaultValue={profile.hype_song ?? ""} maxLength={200} placeholder="Song – Artist" autoComplete="off" className={inputClass} />
          </Field>
          <Choice label="How did you hear about us? (optional)">
            {Object.entries(HEARD_LABELS).map(([value, label]) => (
              <Radio key={value} name="heard_about" value={value} defaultChecked={profile.heard_about === value}>
                {label}
              </Radio>
            ))}
            <input
              name="heard_about_other"
              defaultValue={profile.heard_about_other ?? ""}
              maxLength={100}
              autoComplete="off"
              placeholder="If other, where?"
              className={`${inputClass} max-w-xs text-base`}
            />
          </Choice>
        </div>
      </Group>

      <Group title="Payments">
        <Field
          label="Name on your e-Transfers"
          hint="The name your bank shows when you send money (e.g. JANE DOE). Separate several with commas (up to 5). This helps match your payment if you forget the code."
        >
          <input
            name="etransfer_names"
            defaultValue={profile.etransfer_names.join(", ") || `${first} ${last}`.trim()}
            maxLength={300}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className={inputClass}
          />
        </Field>
      </Group>

      <Group title="Agreements">
        <div className="space-y-6">
          <Choice label="Multimedia release">
            <Legal summary="Read the media release">
              <p>{MEDIA_RELEASE}</p>
            </Legal>
            <Radio name="media_consent" value="agree" defaultChecked={profile.media_consent === true} required>
              I agree to be photographed and filmed
            </Radio>
            <Radio name="media_consent" value="disagree" defaultChecked={profile.media_consent === false} required>
              I don&apos;t agree. Please keep me out of photos and videos
            </Radio>
          </Choice>

          <Choice label="Waiver">
            <Legal summary="Read the waiver">
              {WAIVER_PARAGRAPHS.map((p) => (
                <p key={p.slice(0, 24)}>{p}</p>
              ))}
              <p>
                {INCLUSION_CHARTER_URL ? (
                  <a href={INCLUSION_CHARTER_URL} target="_blank" rel="noreferrer" className="text-mat underline">
                    City of Markham Inclusion Charter
                  </a>
                ) : (
                  "City of Markham Inclusion Charter"
                )}
              </p>
            </Legal>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="waiver"
                defaultChecked={waiverCurrent}
                required
                className="mt-1 size-5 shrink-0 accent-[var(--line)]"
              />
              <span>{WAIVER_AGREEMENT}</span>
            </label>
            {profile.waiver_accepted_at && !waiverCurrent && (
              <p className="text-sm font-semibold text-warn">The waiver has changed since you last accepted it.</p>
            )}
          </Choice>
        </div>
      </Group>

      <Group title="Emails">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="announcement_emails"
            defaultChecked={profile.announcement_emails ?? true}
            className="mt-1 size-5 shrink-0 accent-[var(--line)]"
          />
          <span>
            Email me announcements from the hosts
            <span className="block text-sm text-ink-soft">
              News and updates. You&apos;ll always get emails about your own sign-ups and payments.
            </span>
          </span>
        </label>
      </Group>

      <SubmitButton className={submitClassName} requireChange={requireChange}>
        {submitLabel}
      </SubmitButton>
    </form>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-5">
      <legend className="mb-4 font-display text-2xl font-black uppercase">
        {title}
        <span className="text-line">.</span>
      </legend>
      {children}
    </fieldset>
  );
}

function Choice({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2" role="group" aria-label={label}>
      <p className="font-display text-sm font-bold tracking-[0.15em] uppercase">{label}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Radio({
  name,
  value,
  defaultChecked,
  required,
  children,
}: {
  name: string;
  value: string;
  defaultChecked?: boolean;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        required={required}
        className="size-4 shrink-0 accent-[var(--line)]"
      />
      <span>{children}</span>
    </label>
  );
}

function Legal({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group border-l-4 border-ink/20 pl-4">
      <summary className="cursor-pointer list-none text-sm font-semibold text-mat underline decoration-2 underline-offset-4">
        {summary}
      </summary>
      <div className="mt-2 max-h-64 space-y-2 overflow-y-auto text-sm text-ink-soft">{children}</div>
    </details>
  );
}
