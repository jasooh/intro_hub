import Link from "next/link";
import { missingProfileExtras } from "@/lib/profile";
import type { Profile } from "@/lib/types";

/** Reminds a player to add what their profile is missing (it doesn't stop them signing up). */
export function ProfileExtrasNotice({
  profile,
  linked = true,
}: {
  profile: Pick<Profile, "emergency_name" | "emergency_phone" | "adult_confirmed_at"> | null;
  /** Off on the Account page, where the form is right there. */
  linked?: boolean;
}) {
  if (!profile) return null;
  const missing = missingProfileExtras(profile);
  if (missing.length === 0) return null;
  return (
    <div role="status" className="space-y-1 border-l-4 border-warn bg-maple-deep/40 py-2 pr-3 pl-3">
      <p className="font-display text-base font-bold tracking-wide text-warn uppercase">Finish your profile</p>
      <p>
        Please add {missing.join(" and ")}. You can still sign up, but the hosts need {missing.length > 1 ? "these" : "this"}{" "}
        before you play.{" "}
        {linked && (
          <Link href="/me" className="font-semibold text-mat underline underline-offset-2">
            Finish profile
          </Link>
        )}
      </p>
    </div>
  );
}
