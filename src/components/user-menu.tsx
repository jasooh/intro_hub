import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { Avatar, buttonClass } from "@/components/ui";
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
    <nav className="flex items-center gap-1 text-sm">
      {profile.role === "admin" && (
        <Link href="/admin" className={buttonClass("ghost", "sm")}>
          Admin
        </Link>
      )}
      <Link href="/me" className={`${buttonClass("ghost", "sm")} gap-2`}>
        <Avatar name={name} src={profile.avatar_url} size={24} />
        <span className="hidden sm:inline">My sign-ups</span>
      </Link>
      <form action={signOut}>
        <button className={buttonClass("ghost", "sm")}>Sign out</button>
      </form>
    </nav>
  );
}
