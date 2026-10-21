import { Dropdown } from "@/components/dropdown";
import { SubmitButton } from "@/components/submit-button";
import type { AddablePlayer } from "./add-player-form";

/** On a guest's details: move their sign-ups onto the account they've since made. */
export function LinkGuestForm({
  action,
  accounts,
  name,
}: {
  action: (formData: FormData) => Promise<void>;
  accounts: AddablePlayer[];
  name: string;
}) {
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-ink-soft">
        Has {name} signed in with Google since? Link this guest to their account: their sign-ups, payments and history
        move over, and the guest entry goes away.
      </p>
      <div className="flex items-end gap-3">
        <label className="block min-w-0 flex-1 space-y-1">
          <span className="font-display text-sm font-bold tracking-[0.15em] uppercase">Their account</span>
          <Dropdown
            name="account"
            required
            placeholder="Find their account"
            options={accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.email}` }))}
            searchAt={1}
          />
        </label>
        <SubmitButton
          size="sm"
          variant="secondary"
          confirm={{
            title: `Link ${name} to that account?`,
            description: "Their sign-ups move to the account and the guest entry is removed. This can't be undone.",
            action: "Link",
          }}
        >
          Link
        </SubmitButton>
      </div>
    </form>
  );
}
