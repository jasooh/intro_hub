import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { replyToThread } from "@/app/me/messages/actions";
import { LiveThread } from "@/components/live-thread";
import { MarkRead } from "@/components/mark-read";
import { MessageThread, ReplyForm } from "@/components/message-thread";
import { BackLink, PageSpinner, PageTitle, reveal } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { isUnread, loadThread } from "@/lib/message-data";

export const metadata: Metadata = {
  title: "Message",
  robots: { index: false },
};

export default function ThreadPage(props: PageProps<"/me/messages/[id]">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Thread params={props.params} />
    </Suspense>
  );
}

async function Thread({ params }: { params: PageProps<"/me/messages/[id]">["params"] }) {
  const { id } = await params;
  const me = await requireProfile(`/me/messages/${id}`);
  const data = await loadThread(id);
  // Hosts open their own conversations in the host inbox; a player only ever sees their own.
  if (!data || data.thread.profile_id !== me.id) notFound();
  const { thread, messages } = data;

  return (
    <div className="space-y-8">
      <LiveThread threadId={thread.id} />
      <MarkRead threadId={thread.id} unread={isUnread(thread, "player")} lastMessageAt={thread.last_message_at} />
      <div>
        <BackLink href="/me/messages">Messages</BackLink>
        <PageTitle sub="A conversation with the hosts.">{thread.subject}</PageTitle>
      </div>
      <div className="reveal max-w-2xl space-y-8" style={reveal(1)}>
        <MessageThread messages={messages} />
        <ReplyForm action={replyToThread.bind(null, thread.id)} />
      </div>
    </div>
  );
}
