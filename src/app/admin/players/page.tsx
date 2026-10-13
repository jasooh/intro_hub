import { Suspense } from "react";
import { setRole, updateEtransferNames } from "@/app/admin/actions";
import { SubmitButton } from "@/components/submit-button";
import { Avatar, Badge, Card, inputClass, PageSpinner } from "@/components/ui";
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
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Players ({players.length})</h1>
        <p className="text-sm text-stone-600">
          Everyone who has signed in. Add the names their e-Transfers come from to improve auto-matching.
        </p>
      </div>
      {typeof error === "string" && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="space-y-2">
        {players.map((p) => {
          const name = p.display_name ?? p.full_name ?? p.email;
          return (
            <Card key={p.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar name={name} src={p.avatar_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {name} {p.role === "admin" && <Badge className="bg-orange-100 text-orange-800">host</Badge>}
                  </p>
                  <p className="truncate text-xs text-stone-500">{p.email}</p>
                </div>
                {p.id !== me.id && (
                  <form action={setRole.bind(null, p.id, p.role === "admin" ? "player" : "admin")}>
                    <SubmitButton
                      size="sm"
                      variant="secondary"
                      confirm={p.role === "admin" ? `Remove host access for ${name}?` : `Make ${name} a host?`}
                    >
                      {p.role === "admin" ? "Remove host" : "Make host"}
                    </SubmitButton>
                  </form>
                )}
              </div>
              <form action={updateEtransferNames.bind(null, p.id)} className="flex gap-2">
                <input
                  name="etransfer_names"
                  defaultValue={p.etransfer_names.join(", ")}
                  placeholder="e-Transfer sender names, comma separated"
                  className={`${inputClass} py-1 text-sm`}
                />
                <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
              </form>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
