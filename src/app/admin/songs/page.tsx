import type { Metadata } from "next";
import { Suspense } from "react";
import { ListFilters } from "@/components/list-filters";
import { PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { SongList, type SongRow } from "./song-list";

const TABS = [
  { key: "to_add", label: "To add" },
  { key: "added", label: "Added" },
  { key: "all", label: "All" },
] as const;
type View = (typeof TABS)[number]["key"];

export const metadata: Metadata = {
  title: "Songs",
};

export default function SongsPage(props: PageProps<"/admin/songs">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Songs searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Songs({ searchParams }: { searchParams: PageProps<"/admin/songs">["searchParams"] }) {
  await requireAdmin();
  const params = await searchParams;
  const view: View = TABS.find((t) => t.key === params.view)?.key ?? "to_add";
  const q = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";

  const supabase = await createClient();
  const [{ data }, { data: checked }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, full_name, avatar_url, hype_song")
      .not("hype_song", "is", null)
      .order("display_name"),
    supabase.from("song_checklist").select("profile_id, song, checked_at"),
  ]);
  const ticked = new Map(
    ((checked ?? []) as { profile_id: string; song: string; checked_at: string }[]).map((c) => [c.profile_id, c]),
  );
  // A song counts as added only while it's the one that was ticked off.
  const rows: SongRow[] = (
    (data ?? []) as Pick<Profile, "id" | "display_name" | "full_name" | "avatar_url" | "hype_song">[]
  ).map((p) => {
    const song = p.hype_song ?? "";
    const tick = ticked.get(p.id);
    return {
      id: p.id,
      name: p.display_name ?? p.full_name ?? "Player",
      avatar_url: p.avatar_url,
      song,
      added_at: tick && tick.song === song ? tick.checked_at : null,
    };
  });
  const matching = rows.filter((r) => !q || `${r.song} ${r.name}`.toLowerCase().includes(q));
  const count = (v: View) => matching.filter((r) => v === "all" || (v === "added") === (r.added_at !== null)).length;
  const shown = matching.filter((r) => view === "all" || (view === "added") === (r.added_at !== null));
  const toAdd = rows.filter((r) => r.added_at === null).length;
  const playlist = env.spotifyPlaylistUrl();

  return (
    <div className="space-y-12">
      <PageTitle
        sub={
          playlist ? (
            <>
              Players&apos; hype songs. Add new ones to{" "}
              <a href={playlist} target="_blank" rel="noreferrer" className="text-line underline decoration-2 underline-offset-4">
                the Spotify playlist
              </a>
              .
            </>
          ) : (
            "Players' hype songs, to add to the session playlist. Set SPOTIFY_PLAYLIST_URL to show the playlist on the home page."
          )
        }
      >
        Songs
      </PageTitle>
      <Sheet label={`To add · ${toAdd}`} className="reveal" style={reveal(1)}>
        <ListFilters
          path="/admin/songs"
          tabs={{ param: "view", value: view, options: TABS.map((t) => ({ ...t, count: count(t.key) })) }}
          q={typeof params.q === "string" ? params.q : ""}
          placeholder="Search song or player"
        >
          <SongList
            rows={shown}
            empty={
              rows.length === 0
                ? "No song requests yet"
                : q
                  ? "No songs match"
                  : view === "to_add"
                    ? "All caught up"
                    : "Nothing here"
            }
          />
        </ListFilters>
      </Sheet>
    </div>
  );
}
