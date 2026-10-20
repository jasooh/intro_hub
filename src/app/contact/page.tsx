import type { Metadata } from "next";
import { Suspense } from "react";
import { CopyButton } from "@/components/copy-button";
import { PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { getProfile } from "@/lib/auth";
import { FeedbackForm } from "./feedback-form";
import { CONTACT_EMAIL } from "./limits";

export const metadata: Metadata = {
  title: "Contact & feedback",
  description: "Get in touch with Intro 2 Volleyball, or send the host feedback (anonymously if you like).",
};

export default function ContactPage() {
  return (
    <div className="max-w-2xl space-y-12">
      <PageTitle eyebrow="Intro 2 Volleyball" sub="Questions, ideas, or something we could do better? We read everything.">
        Contact
      </PageTitle>

      <Sheet label="Get in touch" className="reveal" style={reveal(1)}>
        <dl className="divide-y divide-ink/20">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
            <div className="min-w-0">
              <dt className="font-display text-sm font-bold tracking-[0.15em] text-ink-soft uppercase">Email</dt>
              <dd>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-lg underline decoration-line decoration-2 underline-offset-4 [overflow-wrap:anywhere] hover:text-line"
                >
                  {CONTACT_EMAIL}
                </a>
              </dd>
            </div>
            <CopyButton value={CONTACT_EMAIL} label="Email" />
          </div>
          <div className="py-3">
            <dt className="font-display text-sm font-bold tracking-[0.15em] text-ink-soft uppercase">Instagram</dt>
            <dd>
              <a
                href="https://www.instagram.com/intro2volleyball/"
                target="_blank"
                rel="noreferrer"
                className="text-lg underline decoration-line decoration-2 underline-offset-4 hover:text-line"
              >
                @intro2volleyball
              </a>
              <span className="text-ink-soft"> · DMs open</span>
            </dd>
          </div>
        </dl>
      </Sheet>

      <Sheet label="Feedback" className="reveal" style={reveal(2)}>
        <p className="mb-6 text-ink-soft">
          Tell the host what you think. Leave your name if you&apos;d like a reply, or send it anonymously.
        </p>
        <Suspense fallback={<PageSpinner />}>
          <Feedback />
        </Suspense>
      </Sheet>
    </div>
  );
}

async function Feedback() {
  const profile = await getProfile();
  if (!profile) return <FeedbackForm signedIn={false} />;
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.display_name || "";
  return <FeedbackForm signedIn defaultName={name} defaultEmail={profile.email} />;
}
