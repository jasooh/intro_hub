import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass, EmptyState, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { zonedDayKey } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { SessionTemplate } from "@/lib/types";
import { TemplateRow } from "./template-row";

export const metadata: Metadata = {
  title: "Weekly schedule",
};

export default function TemplatesPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Templates />
    </Suspense>
  );
}

async function Templates() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("session_templates").select("*").order("weekday").order("start_time");
  const templates = (data ?? []) as SessionTemplate[];
  const today = zonedDayKey(new Date().toISOString());

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle
          sub={`Each active weekly session creates its next session automatically, about a week ahead. Times are in ${env.timezone()}.`}
        >
          Weekly schedule
        </PageTitle>
        <Link href="/admin/templates/new" className={`${buttonClass()} w-full sm:w-auto`}>
          + New weekly session
        </Link>
      </div>

      <Sheet label={`Weekly sessions · ${templates.length}`} className="reveal" style={reveal(1)}>
        {templates.length === 0 ? (
          <EmptyState>
            No weekly sessions yet.{" "}
            <Link href="/admin/templates/new" className="text-line underline decoration-2 underline-offset-4">
              Set one up
            </Link>
          </EmptyState>
        ) : (
          <ul className="divide-y divide-ink/25">
            {templates.map((t) => (
              <TemplateRow key={t.id} t={t} today={today} />
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}
