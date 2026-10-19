import type { Metadata } from "next";
import { Suspense } from "react";
import { StatsView } from "@/components/stats-view";
import { PageSpinner } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { STAT_RANGES, statWindow, type StatRange, type Stats } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Stats",
};

export default function StatsPage(props: PageProps<"/admin/stats">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <StatsData searchParams={props.searchParams} />
    </Suspense>
  );
}

async function StatsData({ searchParams }: { searchParams: PageProps<"/admin/stats">["searchParams"] }) {
  await requireAdmin();
  const params = await searchParams;
  const range = (STAT_RANGES.find((r) => r.key === params.range)?.key ?? "3m") as StatRange;

  const supabase = await createClient();
  const { from, to, now } = statWindow(range);
  const { data, error } = await supabase.rpc("admin_stats", { p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) throw error;

  return <StatsView stats={data as Stats} range={range} now={now} />;
}
