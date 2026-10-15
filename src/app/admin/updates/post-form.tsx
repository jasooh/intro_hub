import { RichTextEditor } from "@/components/rich-text-editor";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { Post } from "@/lib/types";

/** Create/edit form for an Updates post. Drafts can be saved or published; published posts just save. */
export function PostForm({
  action,
  post,
  recipients,
}: {
  action: (formData: FormData) => Promise<void>;
  post?: Post;
  /** How many players would get the email. */
  recipients: number;
}) {
  const published = Boolean(post?.published_at);
  return (
    <form action={action} className="space-y-6">
      <Field label="Title">
        <input
          name="title"
          defaultValue={post?.title}
          required
          maxLength={120}
          placeholder="e.g. We're in Gym 3 this Saturday"
          className={`${inputClass} font-display text-2xl font-black uppercase`}
        />
      </Field>

      <div className="space-y-2">
        <p className="font-display text-sm font-bold tracking-[0.15em] uppercase">Post</p>
        <RichTextEditor name="body_html" defaultValue={post?.body_html ?? ""} />
      </div>

      <div className="space-y-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="featured"
            defaultChecked={post?.featured ?? false}
            className="mt-1 size-5 shrink-0 accent-[var(--line)]"
          />
          <span>
            <b>Show on the home page</b>
            <span className="block text-sm text-ink-soft">
              Pinned above the next session as an announcement. Replaces any other post that&apos;s there. Only
              applies once published.
            </span>
          </span>
        </label>

        {post?.emailed_at ? (
          <p className="flex items-start gap-3 text-sm text-ink-soft">
            <span aria-hidden className="mt-0.5 font-bold text-ok">
              ✓
            </span>
            Emailed to players on {formatDateTime(post.emailed_at)}. Edits won&apos;t be re-sent.
          </p>
        ) : (
          <label className="flex items-start gap-3">
            <input type="checkbox" name="email" className="mt-1 size-5 shrink-0 accent-[var(--line)]" />
            <span>
              <b>
                Also email all players ({recipients} opted in)
              </b>
              <span className="block text-sm text-ink-soft">
                Sent once, when the post is published. Players who turned off announcements are skipped.
              </span>
            </span>
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-4 border-t border-ink/25 pt-5">
        {published ? (
          <SubmitButton name="intent" value="save" requireChange={Boolean(post)}>
            Save
          </SubmitButton>
        ) : (
          <>
            <SubmitButton name="intent" value="publish">
              Publish
            </SubmitButton>
            <SubmitButton name="intent" value="draft" variant="secondary" requireChange={Boolean(post)}>
              Save draft
            </SubmitButton>
          </>
        )}
      </div>
    </form>
  );
}
