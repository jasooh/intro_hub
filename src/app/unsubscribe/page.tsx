import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SubmitButton } from "@/components/submit-button";
import { buttonClass, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { isUnsubscribeKind, UNSUBSCRIBE_LABELS, verifyUnsubscribe } from "@/lib/unsubscribe";
import { applyUnsubscribe } from "@/lib/unsubscribe-apply";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false },
};

export default function UnsubscribePage(props: PageProps<"/unsubscribe">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Unsubscribe searchParams={props.searchParams} />
    </Suspense>
  );
}

async function stopEmails(formData: FormData) {
  "use server";
  const [u, k, t] = ["u", "k", "t"].map((f) => String(formData.get(f) ?? ""));
  const ok = await applyUnsubscribe(u, k, t);
  redirect(`/unsubscribe?u=${encodeURIComponent(u)}&k=${encodeURIComponent(k)}&t=${encodeURIComponent(t)}&${ok ? "done=1" : "bad=1"}`);
}

async function Unsubscribe({ searchParams }: { searchParams: PageProps<"/unsubscribe">["searchParams"] }) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const [u, k, t] = [one(q.u), one(q.k), one(q.t)];
  const valid = verifyUnsubscribe(u, k, t) && !q.bad;
  const what = isUnsubscribeKind(k) ? UNSUBSCRIBE_LABELS[k] : "these emails";
  const settings = k === "host" ? "/me#host-notifications" : "/me";

  return (
    <div className="max-w-xl space-y-10">
      <PageTitle eyebrow="Emails">{q.done ? "Unsubscribed" : "Unsubscribe"}</PageTitle>
      <Sheet label={q.done ? "Done" : "Stop emails"} className="reveal" style={reveal(1)}>
        {!valid ? (
          <p className="text-ink-soft">
            This link doesn&apos;t work any more. You can change which emails you get on your{" "}
            <Link href={settings} className="text-mat underline underline-offset-2">
              Account page
            </Link>
            .
          </p>
        ) : q.done ? (
          <div className="space-y-4">
            <p className="text-lg">You won&apos;t get {what} any more.</p>
            <p className="text-ink-soft">
              Emails about your own sign-ups and payments still come through. Changed your mind? Turn them back on from
              your Account page.
            </p>
            <Link href={settings} className={buttonClass("secondary", "sm")}>
              Email settings
            </Link>
          </div>
        ) : (
          <form action={stopEmails} className="space-y-4">
            <input type="hidden" name="u" value={u} />
            <input type="hidden" name="k" value={k} />
            <input type="hidden" name="t" value={t} />
            <p className="text-lg">Stop getting {what}?</p>
            <p className="text-ink-soft">Emails about your own sign-ups and payments will still come through.</p>
            <div className="flex flex-wrap items-center gap-4">
              <SubmitButton>Stop these emails</SubmitButton>
              <Link href={settings} className="text-mat underline underline-offset-2">
                Choose which emails instead
              </Link>
            </div>
          </form>
        )}
      </Sheet>
    </div>
  );
}
