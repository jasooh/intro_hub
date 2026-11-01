import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { createSession } from "@/app/admin/actions";
import { BackLink, PageSpinner, PageTitle, reveal } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getHostChoices } from "@/lib/queries";
import { SessionForm } from "../session-form";

export const metadata: Metadata = {
  title: "New session",
};

export default function NewSessionPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <NewSession />
    </Suspense>
  );
}

async function NewSession() {
  const me = await requireAdmin();
  // A one-off session starts hosted by whoever creates it (they can untick or add others).
  const hostChoices = { ...(await getHostChoices()), selected: [me.id] };
  return (
    <div className="space-y-10">
      <div>
        <BackLink href="/admin">Sessions</BackLink>
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
      <div className="reveal" style={reveal(1)}>
        <SessionForm action={createSession} submitLabel="Create session" hostChoices={hostChoices} />
      </div>
    </div>
  );
}
