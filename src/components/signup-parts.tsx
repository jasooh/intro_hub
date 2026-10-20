import { Avatar, Mark } from "@/components/ui";
import type { Attendee, SignupOption } from "@/lib/types";

/** One sign-up option (Instructional + Drop-in / Drop-in only / Instructional only) as a radio row. */
export function OptionRadio({
  value,
  title,
  price,
  detail,
  defaultChecked,
}: {
  value: SignupOption;
  title: string;
  price: string;
  detail: (string | null)[];
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 border-l-4 border-transparent py-2 pl-3 has-[:checked]:border-line sm:py-1">
      <input
        type="radio"
        name="option"
        value={value}
        defaultChecked={defaultChecked}
        required
        className="mt-1.5 size-4 shrink-0 accent-[var(--line)]"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-4">
          <span className="font-display text-xl font-extrabold uppercase">{title}</span>
          <span className="font-score text-xl font-black">{price}</span>
        </span>
        {detail[0] && <span className="block text-sm font-semibold">{detail[0]}</span>}
        <span className="block text-sm text-ink-soft">{detail.slice(1).filter(Boolean).join(" · ")}</span>
      </span>
    </label>
  );
}

/** A player on the team sheet, waitlist or instructional-only list. */
export function AttendeeRow({ a, number, numberClass = "text-ink-soft" }: { a: Attendee; number: string; numberClass?: string }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className={`w-7 font-score text-lg font-black ${numberClass}`}>{number}</span>
      <Avatar name={a.display_name} src={a.avatar_url} size={28} />
      <span className={`min-w-0 flex-1 truncate ${a.is_me ? "font-bold" : ""}`}>
        {a.display_name}
        {a.is_me && <span className="text-line"> (you)</span>}
      </span>
      {a.option === "instructional" && (
        <Mark tone="mat" glyph="◇">
          Instr. only
        </Mark>
      )}
      {a.option === "dropin" && (
        <Mark tone="line" glyph="▸">
          Drop-in only
        </Mark>
      )}
      {a.status === "pending_payment" && (
        <Mark tone="warn" glyph="◐">
          Holding
        </Mark>
      )}
    </li>
  );
}
