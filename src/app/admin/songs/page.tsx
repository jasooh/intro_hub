import type { Metadata } from "next";
import { Suspense } from "react";
import { Avatar, EmptyState, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = {
  title: "Songs",
};

export default function SongsPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Songs />
    </Suspense>
  );
}

async function Songs() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, full_name, avatar_url, hype_song")
    .not("hype_song", "is", null)
    .order("display_name");
  const rows = (data ?? []) as Pick<Profile, "id" | "display_name" | "full_name" | "avatar_url" | "hype_song">[];
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
      <Sheet label={`Requests · ${rows.length}`} className="reveal" style={reveal(1)}>
        {rows.length === 0 ? (
          <EmptyState>No song requests yet</EmptyState>
        ) : (
          <ul className="divide-y divide-ink/20">
            {rows.map((r) => {
              const name = r.display_name ?? r.full_name ?? "Player";
              return (
                <li key={r.id} className="flex items-center gap-3 py-3">
                  <Avatar name={name} src={r.avatar_url} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-xl font-extrabold uppercase">{r.hype_song}</span>
                    <span className="block truncate text-sm text-ink-soft">{name}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </div>
  );
}
