import type { Metadata } from "next";
import { Suspense } from "react";
import { StatsShell } from "@/components/stats-shell";
import { StatsView } from "@/components/stats-view";
import { PageSpinner, PageTitle } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { zonedLocalToUtc } from "@/lib/format";
import { customDates, STAT_RANGES, statWindow, type StatRange, type Stats } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Stats",
};

export default function StatsPage(props: PageProps<"/admin/stats">) {
  return (
    <div className="space-y-12">
      <PageTitle eyebrow="Host bench" sub="Money in, how full sessions were, and who's coming back.">
        Stats
      </PageTitle>
      {/* The controls show at once; the numbers stream in behind the bouncing ball. */}
      <Suspense fallback={<PageSpinner />}>
        <StatsShell>
          <Suspense fallback={<PageSpinner />}>
            <StatsData searchParams={props.searchParams} />
          </Suspense>
        </StatsShell>
      </Suspense>
    </div>
  );
}

async function StatsData({ searchParams }: { searchParams: PageProps<"/admin/stats">["searchParams"] }) {
  await requireAdmin();
  const params = await searchParams;
  const custom = params.range === "custom" ? customDates(params.from, params.to) : null;
  const range: StatRange = custom ? "custom" : ((STAT_RANGES.find((r) => r.key === params.range)?.key ?? "3m") as StatRange);

  const supabase = await createClient();
  const preset = statWindow(range === "custom" ? "all" : range);
  // Custom: sessions starting from the first day through the end of the last (local dates).
  const from = custom ? zonedLocalToUtc(`${custom.from}T00:00`) : preset.from;
  const to = custom ? new Date(zonedLocalToUtc(`${custom.to}T00:00`).getTime() + 86_400_000) : preset.to;
  const { data, error } = await supabase.rpc("admin_stats", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_tz: env.timezone(),
  });
  if (error) throw error;

  return <StatsView stats={data as Stats} now={preset.now} />;
}
