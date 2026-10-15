import type { Metadata } from "next";
import { Suspense } from "react";
import { savePost } from "@/app/admin/actions";
import { BackLink, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { countAnnouncementRecipients } from "@/lib/announcements";
import { requireAdmin } from "@/lib/auth";
import { PostForm } from "../post-form";

export const metadata: Metadata = {
  title: "New post",
};

export default function NewPostPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <NewPost />
    </Suspense>
  );
}

async function NewPost() {
  await requireAdmin();
  const recipients = await countAnnouncementRecipients();
  return (
    <div className="space-y-10">
      <BackLink href="/admin/updates">All posts</BackLink>
      <PageTitle sub="Shows on the Updates page. You can feature it on the home page and email it to players.">
        New post
      </PageTitle>
      <Sheet label="Post" className="reveal max-w-3xl" style={reveal(1)}>
        <PostForm action={savePost.bind(null, null)} recipients={recipients} />
      </Sheet>
    </div>
  );
}
