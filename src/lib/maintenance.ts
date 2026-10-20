import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Maintenance = { on: boolean; message: string };

/** Maintenance mode from dev tools. While on, players can't sign up (the database enforces it too); hosts can. */
export const getMaintenance = cache(async (): Promise<Maintenance> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "maintenance")
    .maybeSingle();
  const m = data?.value as { on?: boolean; message?: string } | undefined;
  return {
    on: Boolean(m?.on),
    message:
      m?.message?.trim() ||
      "Sign-ups are paused for a few minutes while we fix something.",
  };
});
