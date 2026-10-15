import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Avatar, buttonClass, EmptyState, inputClass, Mark, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = {
  title: "View as player",
};

export default function OwnerPlayersPage(props: PageProps<"/owner/players">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <PlayerList searchParams={props.searchParams} />
    </Suspense>
  );
}

async function PlayerList({ searchParams }: { searchParams: PageProps<"/owner/players">["searchParams"] }) {
  await requireOwner();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("owner_rows", { p_table: "profiles", p_search: q, p_limit: 100 });
  if (error) throw error;
  const { rows, total } = data as { rows: Profile[]; total: number };

  return (
    <div className="space-y-10">
      <PageTitle eyebrow="Owner" sub="See a player's account the way it looks to them: sign-ups, holds, ref codes and emails. Read-only.">
        View as player
      </PageTitle>

      <form className="reveal flex items-end gap-3" style={reveal(1)}>
        <input name="q" defaultValue={q} placeholder="Name, email, phone, e-Transfer name…" className={inputClass} aria-label="Search players" />
        <button className={buttonClass("secondary", "sm")}>Search</button>
      </form>

      <Sheet label={`Players · ${total}`} className="reveal" style={reveal(2)}>
        {rows.length === 0 ? (
          <EmptyState>No players match</EmptyState>
        ) : (
          <ul className="divide-y divide-ink/20 border-b border-ink/20">
            {rows.map((p) => {
              const name = p.display_name ?? p.full_name ?? p.email;
              return (
                <li key={p.id}>
                  <Link href={`/owner/players/${p.id}`} className="flex items-center gap-3 py-2.5 hover:bg-maple-deep/50">
                    <Avatar name={name} src={p.avatar_url} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{name}</span>
                      <span className="block truncate text-sm text-ink-soft">{p.email}</span>
                    </span>
                    {p.role === "admin" && (
                      <Mark tone="line" glyph="●">
                        Host
                      </Mark>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </div>
  );
}
