import type { Metadata } from "next";
import { Suspense } from "react";
import { saveTemplate } from "@/app/admin/actions";
import { BackLink, PageSpinner, PageTitle, reveal } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { TemplateForm } from "../template-form";

export const metadata: Metadata = {
  title: "New weekly session",
};

export default function NewTemplatePage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <NewTemplate />
    </Suspense>
  );
}

async function NewTemplate() {
  await requireAdmin();
  return (
    <div className="space-y-10">
      <div>
        <BackLink href="/admin/templates">Weekly schedule</BackLink>
        <PageTitle sub="Repeats every week. The next session is created right away, then each one about a week ahead.">
          New weekly session
        </PageTitle>
      </div>
      <div className="reveal" style={reveal(1)}>
        <TemplateForm action={saveTemplate.bind(null, null)} submitLabel="Create weekly session" />
      </div>
    </div>
  );
}
