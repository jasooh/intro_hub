import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { createSession } from "@/app/admin/actions";
import { BackLink, Notice, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { SessionForm } from "../session-form";

export const metadata: Metadata = {
  title: "New session",
};

export default function NewSessionPage(props: PageProps<"/admin/sessions/new">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <NewSession searchParams={props.searchParams} />
    </Suspense>
  );
}

async function NewSession({ searchParams }: { searchParams: PageProps<"/admin/sessions/new">["searchParams"] }) {
  await requireAdmin();
  const { error } = await searchParams;
  return (
    <div className="space-y-10">
      <div>
        <BackLink href="/admin">Dashboard</BackLink>
        <PageTitle
          sub={
            <>
              For the regular weekly game, use the{" "}
              <Link href="/admin/templates" className="text-line underline decoration-2 underline-offset-4">
                weekly schedule
              </Link>{" "}
              instead and sessions are created automatically.
            </>
          }
        >
          One-off session
        </PageTitle>
      </div>
      {typeof error === "string" && <Notice tone="bad">{error}</Notice>}
      <Sheet label="Details" className="reveal" style={reveal(1)}>
        <SessionForm action={createSession} submitLabel="Create session" />
      </Sheet>
    </div>
  );
}
