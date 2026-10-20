import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deletePost, savePost } from "@/app/admin/actions";
import { SubmitButton } from "@/components/submit-button";
import { BackLink, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { countAnnouncementRecipients } from "@/lib/announcements";
import { getEmailHealth } from "@/lib/email/health";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Post } from "@/lib/types";
import { PostForm } from "../post-form";

export const metadata: Metadata = {
  title: "Edit post",
};

export default function EditPostPage(props: PageProps<"/admin/updates/[id]">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <EditPost params={props.params} />
    </Suspense>
  );
}

async function EditPost({ params }: { params: PageProps<"/admin/updates/[id]">["params"] }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const { data: post } = await supabase.from("posts").select("*").eq("id", id).maybeSingle<Post>();
  if (!post) notFound();
  const [recipients, health] = await Promise.all([countAnnouncementRecipients(), getEmailHealth()]);
  const emailsLeft = Math.max(env.emailDailyLimit() - health.sentToday, 0);

  return (
    <div className="space-y-10">
      <BackLink href="/admin/updates">All posts</BackLink>
      <PageTitle eyebrow={post.published_at ? "Published" : "Draft"}>Edit post</PageTitle>
      <Sheet label="Post" className="reveal max-w-3xl" style={reveal(1)}>
        <PostForm action={savePost.bind(null, post.id)} post={post} recipients={recipients} emailsLeft={health.paused ? 0 : emailsLeft} />
      </Sheet>
      <Sheet label="Delete" className="reveal max-w-3xl" style={reveal(2)}>
        <form action={deletePost.bind(null, post.id)} className="flex flex-wrap items-center gap-4">
          <p className="text-ink-soft">Removes it from the Updates page{post.featured ? " and the home page" : ""}.</p>
          <SubmitButton
            variant="danger"
            size="sm"
            confirm={{ title: "Delete this post?", description: "This can't be undone.", action: "Delete post" }}
          >
            Delete post
          </SubmitButton>
        </form>
      </Sheet>
    </div>
  );
}
