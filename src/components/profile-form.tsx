import { saveProfile } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";
import type { Profile } from "@/lib/types";

/** Display name + e-Transfer names. Used by onboarding and the Account page. */
export function ProfileForm({
  profile,
  next,
  returnTo,
  submitLabel,
  submitClassName,
}: {
  profile: Profile;
  /** Where to go after saving. */
  next: string;
  /** Page to show validation errors on. */
  returnTo: string;
  submitLabel: string;
  submitClassName?: string;
}) {
  const name = profile.display_name ?? profile.full_name ?? "";
  return (
    <form action={saveProfile} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="return_to" value={returnTo} />
      <Field label="Display name" hint="Shown to other players on the attendee list.">
        <input name="display_name" defaultValue={name} required maxLength={60} className={inputClass} />
      </Field>
      <Field
        label="Name on your e-Transfers"
        hint="The name your bank shows when you send money (e.g. JANE DOE). Separate several with commas. This helps match your payment if you forget the code."
      >
        <input
          name="etransfer_names"
          defaultValue={profile.etransfer_names.join(", ") || name}
          maxLength={300}
          className={inputClass}
        />
      </Field>
      <SubmitButton className={submitClassName}>{submitLabel}</SubmitButton>
    </form>
  );
}
