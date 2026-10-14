import { Suspense } from "react";
import { saveTemplate } from "@/app/admin/actions";
import { BackLink, Notice, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { TemplateForm } from "../template-form";

export default function NewTemplatePage(props: PageProps<"/admin/templates/new">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <NewTemplate searchParams={props.searchParams} />
    </Suspense>
  );
}

async function NewTemplate({ searchParams }: { searchParams: PageProps<"/admin/templates/new">["searchParams"] }) {
  await requireAdmin();
  const { error } = await searchParams;
  return (
    <div className="space-y-10">
      <div>
        <BackLink href="/admin/templates">Weekly schedule</BackLink>
        <PageTitle sub="Repeats every week. The next session is created right away, then each one about a week ahead.">
          New weekly session
        </PageTitle>
      </div>
      {typeof error === "string" && <Notice tone="bad">{error}</Notice>}
      <Sheet label="Details" className="reveal" style={reveal(1)}>
        <TemplateForm action={saveTemplate.bind(null, null)} submitLabel="Create weekly session" />
      </Sheet>
    </div>
  );
}
