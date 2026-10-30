import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LiveThread } from "@/components/live-thread";
import { ThreadList } from "@/components/thread-list";
import { buttonClass, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { isUnread, loadThreads } from "@/lib/message-data";

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false },
};

export default function MessagesPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Messages />
    </Suspense>
  );
}

async function Messages() {
  await requireProfile("/me/messages");
  const rows = await loadThreads();
  const unread = rows.filter((t) => isUnread(t, "player")).length;

  return (
    <div className="space-y-12">
      <LiveThread />
      <PageTitle sub="Messages from the hosts, and anything you want to ask them.">Messages</PageTitle>
      <Sheet
        label={unread ? `Inbox · ${unread} new` : "Inbox"}
        action={
          <Link href="/me/messages/new" className={buttonClass("primary", "sm")}>
            Message the hosts
          </Link>
        }
        className="reveal"
        style={reveal(1)}
      >
        <ThreadList rows={rows} viewer="player" basePath="/me/messages" empty="No messages yet" />
      </Sheet>
    </div>
  );
}
