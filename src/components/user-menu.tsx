import Link from "next/link";
import { AccountMenu } from "@/components/account-menu";
import { buttonClass } from "@/components/ui";
import { getProfile } from "@/lib/auth";

export async function UserMenu() {
  const profile = await getProfile();
  if (!profile) {
    return (
      <Link href="/login" className={buttonClass("primary", "sm")}>
        Sign in
      </Link>
    );
  }
  const name = profile.display_name ?? profile.full_name ?? profile.email;
  return (
    <nav className="flex items-center gap-2 text-sm">
      {profile.role === "admin" && (
        <Link href="/admin" className={buttonClass("ghost", "sm")}>
          Admin
        </Link>
      )}
      <AccountMenu name={name} email={profile.email} avatarUrl={profile.avatar_url} />
    </nav>
  );
}
