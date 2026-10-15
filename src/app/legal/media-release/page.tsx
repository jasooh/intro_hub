import type { Metadata } from "next";
import { BackLink, PageTitle, reveal, Sheet } from "@/components/ui";
import { MEDIA_RELEASE } from "@/lib/agreements";

export const metadata: Metadata = {
  title: "Media release",
  description: "How Intro 2 Volleyball uses photos and videos taken at sessions.",
};

export default function MediaReleasePage() {
  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <BackLink href="/">Home</BackLink>
        <PageTitle
          eyebrow="Legal"
          sub="Players choose in their profile whether they agree to this. You can change your answer any time in your account."
        >
          Media release
        </PageTitle>
      </div>
      <Sheet label="Consent" className="reveal" style={reveal(1)}>
        <p className="leading-relaxed text-ink">{MEDIA_RELEASE}</p>
      </Sheet>
    </div>
  );
}
