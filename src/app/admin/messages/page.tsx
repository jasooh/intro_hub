import type { Metadata } from "next";
import { Suspense } from "react";
import { ListFilters } from "@/components/list-filters";
import { LiveThread } from "@/components/live-thread";
import { ThreadList } from "@/components/thread-list";
import { PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { isUnread, loadThreads, whoName } from "@/lib/message-data";

const TABS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
] as const;
type View = (typeof TABS)[number]["key"];

export const metadata: Metadata = {
  title: "Messages",
};

export default function AdminMessagesPage(props: PageProps<"/admin/messages">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <AdminMessages searchParams={props.searchParams} />
    </Suspense>
  );
}

async function AdminMessages({ searchParams }: { searchParams: PageProps<"/admin/messages">["searchParams"] }) {
  await requireAdmin();
  const params = await searchParams;
  const view: View = TABS.find((t) => t.key === params.view)?.key ?? "all";
  const q = typeof params.q === "string" ? params.q : "";
  const needle = q.trim().toLowerCase();

  const all = await loadThreads();
  const matching = all.filter(
    (t) =>
      !needle ||
      [t.subject, t.snippet, t.player ? whoName(t.player) : null, t.player?.email].some((v) => v?.toLowerCase().includes(needle)),
  );
  const unreadCount = matching.filter((t) => isUnread(t, "host")).length;
  const shown = view === "unread" ? matching.filter((t) => isUnread(t, "host")) : matching;

  return (
    <div className="space-y-12">
      <LiveThread />
      <PageTitle sub="Every conversation with players, shared by all the hosts. Start one from a player's details or a session's roster.">
        Messages
      </PageTitle>
      <Sheet label={unreadCount ? `Inbox · ${unreadCount} unread` : "Inbox"} className="reveal" style={reveal(1)}>
        <ListFilters
          path="/admin/messages"
          tabs={{
            param: "view",
            value: view,
            options: [
              { ...TABS[0], count: matching.length },
              { ...TABS[1], count: unreadCount },
            ],
          }}
          q={q}
          placeholder="Search subject, message or player"
        >
          <ThreadList
            rows={shown}
            viewer="host"
            basePath="/admin/messages"
            empty={needle ? "No messages match" : view === "unread" ? "Nothing unread" : "No messages yet"}
          />
        </ListFilters>
      </Sheet>
    </div>
  );
}
