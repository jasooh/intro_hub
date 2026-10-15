import type { Metadata } from "next";
import { BackLink, PageTitle, reveal, Sheet } from "@/components/ui";
import { INCLUSION_CHARTER_URL, WAIVER_AGREEMENT, WAIVER_PARAGRAPHS, WAIVER_VERSION } from "@/lib/agreements";
import { pad2 } from "@/lib/format";

export const metadata: Metadata = {
  title: "Waiver",
  description: "The waiver every Intro 2 Volleyball player accepts before playing.",
};

export default function WaiverPage() {
  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <BackLink href="/">Home</BackLink>
        <PageTitle eyebrow="Legal" sub={`Every player accepts this in their profile before playing. Version ${WAIVER_VERSION}.`}>
          Waiver
        </PageTitle>
      </div>
      <Sheet label="Acknowledgements" className="reveal" style={reveal(1)}>
        <ol className="space-y-4 text-ink">
          {WAIVER_PARAGRAPHS.map((p, i) => (
            <li key={p.slice(0, 24)} className="flex gap-3">
              <span className="font-score font-black text-line">{pad2(i + 1)}</span>
              <span>{p}</span>
            </li>
          ))}
        </ol>
      </Sheet>
      <Sheet label="Agreement" className="reveal" style={reveal(2)}>
        <p className="border-l-4 border-ink pl-4 text-lg">{WAIVER_AGREEMENT}</p>
        {INCLUSION_CHARTER_URL && (
          <p className="mt-4 text-sm text-ink-soft">
            See the{" "}
            <a href={INCLUSION_CHARTER_URL} target="_blank" rel="noreferrer" className="text-mat underline underline-offset-2">
              City of Markham Inclusion Charter
            </a>
            .
          </p>
        )}
      </Sheet>
    </div>
  );
}
