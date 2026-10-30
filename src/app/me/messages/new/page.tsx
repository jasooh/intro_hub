import type { Metadata } from "next";
import { Suspense } from "react";
import { startThread } from "@/app/me/messages/actions";
import { SubmitButton } from "@/components/submit-button";
import { BackLink, cn, Field, inputClass, PageSpinner, PageTitle, reveal } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { MESSAGE_MAX, SUBJECT_MAX } from "@/lib/message-errors";

export const metadata: Metadata = {
  title: "Message the hosts",
  robots: { index: false },
};

export default function NewMessagePage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <NewMessage />
    </Suspense>
  );
}

async function NewMessage() {
  await requireProfile("/me/messages/new");
  return (
    <div className="space-y-8">
      <div>
        <BackLink href="/me/messages">Messages</BackLink>
        <PageTitle sub="This goes to all the hosts. You'll get an email when someone replies (you can turn that off in your profile).">
          Message the hosts
        </PageTitle>
      </div>
      <form action={startThread} className="reveal max-w-2xl space-y-6" style={reveal(1)}>
        <Field label="Subject" required>
          <input
            name="subject"
            required
            maxLength={SUBJECT_MAX}
            placeholder="e.g. Question about Saturday"
            className={cn(inputClass, "font-display text-2xl font-black uppercase")}
          />
        </Field>
        <Field label="Message" required>
          <textarea name="body" required rows={7} maxLength={MESSAGE_MAX} className={cn(inputClass, "resize-y")} />
        </Field>
        <SubmitButton>Send to the hosts</SubmitButton>
      </form>
    </div>
  );
}
