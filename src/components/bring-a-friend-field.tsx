import { InfoTip } from "@/components/info-tip";
import { inputClass } from "@/components/ui";

/**
 * "Did a friend bring you?" for first-time players (Bring a Friend), with a
 * "?" that explains the rate. Used on the sign-up form and in "Your spot".
 */
export function BringAFriendField({
  id,
  options,
  defaultValue = "",
  hint,
  optional = false,
}: {
  /** Unique per page: ties the label to the dropdown. */
  id: string;
  options: { id: string; name: string }[];
  defaultValue?: string;
  hint: string;
  optional?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="font-display text-sm font-bold tracking-[0.15em] text-ink uppercase">
          Did a friend bring you?{optional && " (optional)"}
        </label>
        <InfoTip title="Bring a Friend">
          <span className="block">
            First time at Intro 2 Volleyball? If a regular brought you, pick them here and{" "}
            <b>you both pay half</b> for this session.
          </span>
          <span className="mt-1.5 block text-ink-soft">
            Only for first-time players. If your friend can&apos;t make it, you still keep your half price.
          </span>
        </InfoTip>
      </div>
      <select id={id} name="brought_by" defaultValue={defaultValue} className={inputClass}>
        <option value="">No</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <span className="block text-sm text-ink-soft">{hint}</span>
    </div>
  );
}
