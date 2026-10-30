import Link from "next/link";
import { EmptyState, Mark } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { isUnread, whoName, type ThreadRow, type Viewer } from "@/lib/message-data";

/** Inbox rows: subject, who it's with, a one-line preview and when. Unread threads get a mark and a heavier subject. */
export function ThreadList({
  rows,
  viewer,
  basePath,
  empty,
}: {
  rows: ThreadRow[];
  viewer: Viewer;
  basePath: "/me/messages" | "/admin/messages";
  empty: string;
}) {
  if (rows.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <ul className="divide-y divide-ink/20 border-y-2 border-ink">
      {rows.map((t) => {
        const unread = isUnread(t, viewer);
        return (
          <li key={t.id}>
            <Link href={`${basePath}/${t.id}`} className="block space-y-1 px-1 py-4 transition-colors hover:bg-maple-deep/40 sm:px-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <p
                  className={`min-w-0 font-display text-2xl uppercase [overflow-wrap:anywhere] ${unread ? "font-black" : "font-semibold"}`}
                >
                  {t.subject}
                </p>
                {unread && (
                  <Mark tone="line" glyph="●">
                    New
                  </Mark>
                )}
              </div>
              <p className="flex flex-wrap gap-x-3 text-sm text-ink-soft">
                {viewer === "host" && <span className="[overflow-wrap:anywhere]">{whoName(t.player)}</span>}
                <time dateTime={t.last_message_at}>{formatDateTime(t.last_message_at)}</time>
              </p>
              {t.snippet && <p className="line-clamp-1 text-ink-soft [overflow-wrap:anywhere]">{t.snippet}</p>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
