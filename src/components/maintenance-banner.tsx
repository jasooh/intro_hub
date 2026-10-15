import { createClient } from "@/lib/supabase/server";

/** Site-wide notice while maintenance mode is on in dev tools (sign-ups are paused). */
export async function MaintenanceBanner() {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "maintenance").maybeSingle();
  const m = data?.value as { on?: boolean; message?: string } | undefined;
  if (!m?.on) return null;
  return (
    <div role="status" className="bg-board text-maple">
      <p className="mx-auto flex max-w-4xl items-baseline gap-3 px-4 py-2.5">
        <span aria-hidden className="size-2 shrink-0 translate-y-[-1px] bg-led" />
        <span className="font-display font-bold tracking-[0.15em] text-led uppercase">Heads up</span>
        <span className="min-w-0">{m.message || "Sign-ups are paused for a few minutes while we fix something."}</span>
      </p>
    </div>
  );
}
