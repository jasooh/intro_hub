import Link from "next/link";
import { Suspense } from "react";
import { createSession } from "@/app/admin/actions";
import { Card, PageSpinner } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { SessionForm } from "../session-form";

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
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">New one-off session</h1>
      <p className="text-sm text-stone-600">
        For the regular weekly game, use the <Link href="/admin/templates" className="underline">weekly schedule</Link> instead
        and sessions are created automatically.
      </p>
      {typeof error === "string" && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <Card>
        <SessionForm action={createSession} submitLabel="Create session" />
      </Card>
    </div>
  );
}
