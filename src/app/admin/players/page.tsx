import { Suspense } from "react";
import { setRole, updateEtransferNames } from "@/app/admin/actions";
import { SubmitButton } from "@/components/submit-button";
import { Avatar, inputClass, Mark, Notice, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export default function PlayersPage(props: PageProps<"/admin/players">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Players searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Players({ searchParams }: { searchParams: PageProps<"/admin/players">["searchParams"] }) {
  const me = await requireAdmin();
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").order("role").order("display_name");
  const players = (data ?? []) as Profile[];

  return (
    <div className="space-y-12">
      <PageTitle sub="Everyone who has signed in. Add the names their e-Transfers come from to improve auto-matching.">
        Players
      </PageTitle>
      {typeof error === "string" && <Notice tone="bad">{error}</Notice>}
      <Sheet label={`Roster · ${players.length}`} className="reveal" style={reveal(1)}>
      <div className="divide-y divide-ink/25">
        {players.map((p) => {
          const name = p.display_name ?? p.full_name ?? p.email;
          return (
            <div key={p.id} className="space-y-3 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar name={name} src={p.avatar_url} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-3 font-display text-xl font-extrabold uppercase">
                    <span className="truncate">{name}</span>
                    {p.role === "admin" && (
                      <Mark tone="line" glyph="★">
                        Host
                      </Mark>
                    )}
                  </p>
                  <p className="truncate text-sm text-ink-soft">{p.email}</p>
                </div>
                {p.id !== me.id && (
                  <form action={setRole.bind(null, p.id, p.role === "admin" ? "player" : "admin")}>
                    <SubmitButton
                      size="sm"
                      variant="secondary"
                      confirm={
                        p.role === "admin"
                          ? { title: `Remove ${name} as a host?`, description: "They'll lose access to the admin dashboard." }
                          : {
                              title: `Make ${name} a host?`,
                              description: "They'll get full access to the admin dashboard: sessions, payments, refunds and players.",
                            }
                      }
                    >
                      {p.role === "admin" ? "Remove host" : "Make host"}
                    </SubmitButton>
                  </form>
                )}
              </div>
              <form action={updateEtransferNames.bind(null, p.id)} className="flex items-end gap-4">
                <input
                  name="etransfer_names"
                  defaultValue={p.etransfer_names.join(", ")}
                  placeholder="e-Transfer sender names, comma separated"
                  className={`${inputClass} py-1 text-base`}
                />
                <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
              </form>
            </div>
          );
        })}
      </div>
      </Sheet>
    </div>
  );
}
