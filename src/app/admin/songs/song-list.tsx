import { CheckToggle } from "@/components/check-toggle";
import { Avatar, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { setSongAdded } from "./actions";

export type SongRow = {
  id: string;
  name: string;
  avatar_url: string | null;
  song: string;
  /** When the current song was ticked off, or null if it's still to add. */
  added_at: string | null;
};

/** Players' hype songs as ruled rows, each with an "added to the playlist" checkbox. */
export function SongList({ rows, empty }: { rows: SongRow[]; empty: string }) {
  if (rows.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <ul className="divide-y divide-ink/20">
      {rows.map((r) => {
        const added = r.added_at !== null;
        return (
          <li key={r.id} className={`flex items-center gap-3 py-3 ${added ? "text-ink-soft" : ""}`}>
            <form action={setSongAdded.bind(null, r.id, r.song, !added)}>
              <CheckToggle checked={added} label={added ? `Untick ${r.song}` : `Mark ${r.song} as added to the playlist`} />
            </form>
            <Avatar name={r.name} src={r.avatar_url} size={28} />
            <span className="min-w-0 flex-1">
              <span className="block font-display text-xl font-extrabold uppercase [overflow-wrap:anywhere]">{r.song}</span>
              <span className="block truncate text-sm text-ink-soft">
                {r.name}
                {r.added_at && <> · added {formatDateTime(r.added_at)}</>}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
