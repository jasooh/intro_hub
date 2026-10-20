import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ListFilters } from "@/components/list-filters";
import { SignupRow } from "@/components/signup-row";
import { EmptyState, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { OPTION_LABELS } from "@/lib/profile";
import { getMySignups } from "@/lib/queries";
import { type OptionFilter, SIGNUP_VIEW_LABELS, signupMatches, type SignupView } from "@/lib/signups";

const VIEWS: SignupView[] = ["upcoming", "past", "cancelled"];
const OPTION_CHIPS: { key: OptionFilter; label: string }[] = [
  { key: "any", label: "Any" },
  { key: "full", label: OPTION_LABELS.full },
  { key: "dropin", label: OPTION_LABELS.dropin },
  { key: "instructional", label: OPTION_LABELS.instructional },
];

export const metadata: Metadata = {
  title: "My sign-ups",
  robots: { index: false },
};

export default function MySignupsPage(props: PageProps<"/me/signups">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <MySignups searchParams={props.searchParams} />
    </Suspense>
  );
}

async function MySignups({ searchParams }: { searchParams: PageProps<"/me/signups">["searchParams"] }) {
  const profile = await requireProfile("/me/signups");
  const params = await searchParams;
  const view = VIEWS.includes(params.view as SignupView) ? (params.view as SignupView) : "upcoming";
  const option = OPTION_CHIPS.some((c) => c.key === params.option) ? (params.option as OptionFilter) : "any";
  const q = typeof params.q === "string" ? params.q : "";

  const all = await getMySignups(profile.id);
  const matching = all.filter((r) =>
    signupMatches(
      [
        r.session.title,
        r.session.location,
        formatDateTime(r.session.starts_at),
        r.ref_code,
        formatMoney(r.amount_cents),
        OPTION_LABELS[r.option],
      ],
      q,
    ),
  );
  const viewCount = (v: SignupView) => matching.filter((r) => r.view === v).length;
  const inView = matching.filter((r) => r.view === view);
  const optionCount = (o: OptionFilter) => inView.filter((r) => o === "any" || r.option === o).length;
  const shown = inView.filter((r) => option === "any" || r.option === option);

  return (
    <div className="space-y-10">
      <PageTitle sub="Everything you've signed up for. Pay, cancel or check your code from here.">My sign-ups</PageTitle>

      <Sheet label="Sign-ups" className="reveal" style={reveal(1)}>
        <ListFilters
          path="/me/signups"
          tabs={{
            param: "view",
            value: view,
            options: VIEWS.map((v) => ({ key: v, label: SIGNUP_VIEW_LABELS[v], count: viewCount(v) })),
          }}
          chips={{ param: "option", value: option, options: OPTION_CHIPS.map((c) => ({ ...c, count: optionCount(c.key) })) }}
          q={q}
          placeholder="Search session, date, place, code"
        >
          {shown.length === 0 ? (
            <EmptyState>
              {q ? (
                <>Nothing matches &ldquo;{q}&rdquo;.</>
              ) : view === "upcoming" ? (
                <>
                  No upcoming sign-ups.{" "}
                  <Link href="/sessions" className="text-line underline decoration-2 underline-offset-4">
                    Find a session
                  </Link>
                </>
              ) : view === "past" ? (
                "No past sessions yet."
              ) : (
                "Nothing cancelled."
              )}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-ink/25">
              {shown.map((r) => (
                <SignupRow key={r.id} reg={r} actionable={r.view === "upcoming"} returnTo="/me/signups" />
              ))}
            </ul>
          )}
        </ListFilters>
      </Sheet>
    </div>
  );
}
