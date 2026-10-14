import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deleteTemplate, saveTemplate } from "@/app/admin/actions";
import { SubmitButton } from "@/components/submit-button";
import { BackLink, Notice, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { SessionTemplate } from "@/lib/types";
import { TemplateForm, WEEKDAYS } from "../template-form";

export const metadata: Metadata = {
  title: "Edit weekly session",
};

export default function EditTemplatePage(props: PageProps<"/admin/templates/[id]">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <EditTemplate params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function EditTemplate({
  params,
  searchParams,
}: {
  params: PageProps<"/admin/templates/[id]">["params"];
  searchParams: PageProps<"/admin/templates/[id]">["searchParams"];
}) {
  await requireAdmin();
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: template } = await supabase.from("session_templates").select("*").eq("id", id).maybeSingle<SessionTemplate>();
  if (!template) notFound();

  return (
    <div className="space-y-10">
      <div>
        <BackLink href="/admin/templates">Weekly schedule</BackLink>
        <PageTitle
          eyebrow={`Every ${WEEKDAYS[template.weekday]}`}
          sub="Changes apply to sessions created from now on. Edit sessions that already exist from the dashboard."
        >
          {template.title}
        </PageTitle>
      </div>
      {typeof error === "string" && <Notice tone="bad">{error}</Notice>}
      <Sheet label="Details" className="reveal" style={reveal(1)}>
        <TemplateForm action={saveTemplate.bind(null, template.id)} template={template} submitLabel="Save changes" />
      </Sheet>
      <section className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-bad pt-4">
        <p className="text-ink-soft">
          Deleting stops new sessions being created. Sessions already created stay on the schedule.
        </p>
        <form action={deleteTemplate.bind(null, template.id)}>
          <SubmitButton
            variant="danger"
            confirm={{
              title: `Delete ${WEEKDAYS[template.weekday]} ${template.title}?`,
              description:
                "No new sessions will be created from it. Sessions it already created stay; cancel those from the dashboard if needed.",
              action: "Delete",
            }}
          >
            Delete weekly session
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
