import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { hostReply } from "@/app/admin/messages/actions";
import { LiveThread } from "@/components/live-thread";
import { MarkRead } from "@/components/mark-read";
import { MessageThread, ReplyForm } from "@/components/message-thread";
import { BackLink, PageSpinner, PageTitle, reveal } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { isUnread, loadThread, whoName } from "@/lib/message-data";

export const metadata: Metadata = {
  title: "Message",
};

export default function AdminThreadPage(props: PageProps<"/admin/messages/[id]">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Thread params={props.params} />
    </Suspense>
  );
}

async function Thread({ params }: { params: PageProps<"/admin/messages/[id]">["params"] }) {
  const { id } = await params;
  await requireAdmin();
  const data = await loadThread(id);
  if (!data) notFound();
  const { thread, messages } = data;
  const player = whoName(thread.player);

  return (
    <div className="space-y-8">
      <LiveThread threadId={thread.id} />
      <MarkRead threadId={thread.id} unread={isUnread(thread, "host")} lastMessageAt={thread.last_message_at} />
      <div>
        <BackLink href="/admin/messages">Messages</BackLink>
        <PageTitle
          sub={
            <>
              With <b className="[overflow-wrap:anywhere]">{player}</b>
              {thread.session_id && (
                <>
                  {" "}
                  ·{" "}
                  <Link href={`/admin/sessions/${thread.session_id}`} className="text-mat underline">
                    about a session
                  </Link>
                </>
              )}
              . Any host can reply.
            </>
          }
        >
          {thread.subject}
        </PageTitle>
      </div>
      <div className="reveal max-w-2xl space-y-8" style={reveal(1)}>
        <MessageThread messages={messages} />
        <ReplyForm action={hostReply.bind(null, thread.id)} placeholder={`Reply to ${player}…`} />
      </div>
    </div>
  );
}
