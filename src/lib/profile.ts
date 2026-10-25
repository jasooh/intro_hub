import { WAIVER_VERSION } from "@/lib/agreements";
import type { HeardAbout, Profile, SignupOption } from "@/lib/types";

export const HEARD_LABELS: Record<HeardAbout, string> = {
  word_of_mouth: "Word of mouth",
  instagram: "Instagram",
  javelin: "Javelin",
  other: "Other",
};

export const OPTION_LABELS: Record<SignupOption, string> = {
  full: "Instructional + Drop-in",
  instructional: "Instructional only",
  dropin: "Drop-in only",
};

/** Everything sign-up needs. Mirrors public._profile_complete() plus the current waiver version. */
/**
 * Profile details asked for after launch that don't block signing up (players
 * are reminded instead): "an emergency contact", "your 18+ confirmation".
 */
export function missingProfileExtras(
  p: Pick<Profile, "emergency_name" | "emergency_phone" | "adult_confirmed_at">,
): string[] {
  const missing: string[] = [];
  if (!p.emergency_name?.trim() || !p.emergency_phone?.trim()) missing.push("an emergency contact");
  if (!p.adult_confirmed_at) missing.push("your 18+ confirmation");
  return missing;
}

export function profileComplete(p: Profile): boolean {
  return Boolean(
    p.first_name?.trim() &&
      p.last_name?.trim() &&
      p.phone?.trim() &&
      p.skill_level &&
      p.attended_before !== null &&
      p.media_consent !== null &&
      p.waiver_accepted_at &&
      p.waiver_version === WAIVER_VERSION,
  );
}

/** "Jane D." from first/last name. */
export function defaultDisplayName(first: string, last: string): string {
  const initial = last.trim().charAt(0);
  return initial ? `${first.trim()} ${initial.toUpperCase()}.` : first.trim();
}

/** Google's full name split into a first/last guess, for pre-filling. */
export function splitFullName(fullName: string | null): { first: string; last: string } {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

/** How many times a day a player may change their display name and avatar (public._limit_identity_changes). */
export const IDENTITY_CHANGES_PER_DAY = 3;
