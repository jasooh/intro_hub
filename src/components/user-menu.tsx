import Link from "next/link";
import { getHostMenuData } from "@/lib/host-badges";
import { AccountMenu } from "@/components/account-menu";
import { buttonClass } from "@/components/ui";
import { canUseDevTools, getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

async function getPlayerUnread() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("unread_message_count");
  return typeof data === "number" ? data : 0;
}

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
  const isHost = profile.role === "admin";
  // Hosts see unread messages as a badge on the host Messages page; players get it on their own tab.
  const unread = isHost ? 0 : await getPlayerUnread();
  return (
    <AccountMenu
      name={name}
      email={profile.email}
      avatarUrl={profile.avatar_url}
      unread={unread}
      host={isHost ? await getHostMenuData() : null}
      showDevTools={await canUseDevTools()}
    />
  );
}
