import { Mark } from "@/components/ui";
import { OPTION_LABELS } from "@/lib/profile";
import type { SignupOption } from "@/lib/types";

/** Flags a sign-up that isn't the usual Instructional + Drop-in. */
export function OptionMark({ option }: { option: SignupOption }) {
  if (option === "full") return null;
  return (
    <Mark tone={option === "instructional" ? "mat" : "line"} glyph={option === "instructional" ? "◇" : "▸"}>
      {OPTION_LABELS[option]}
    </Mark>
  );
}
