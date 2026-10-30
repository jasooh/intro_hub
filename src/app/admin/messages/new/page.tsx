import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BackLink, PageSpinner, PageTitle, reveal } from "@/components/ui";
import { AUDIENCES, audienceOf, type Audience } from "@/lib/audiences";
import { requireAdmin } from "@/lib/auth";
import { whoName } from "@/lib/message-data";
import { createClient } from "@/lib/supabase/server";
import { ComposeForm, type ComposeTarget } from "./compose-form";

export const metadata: Metadata = {
  title: "New message",
};

const UUID = /^[0-9a-f-]{36}$/i;

export default function NewAdminMessagePage(props: PageProps<"/admin/messages/new">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <NewAdminMessage searchParams={props.searchParams} />
    </Suspense>
  );
}

async function NewAdminMessage({ searchParams }: { searchParams: PageProps<"/admin/messages/new">["searchParams"] }) {
  await requireAdmin();
  const params = await searchParams;
  const to = typeof params.to === "string" && UUID.test(params.to) ? params.to : null;
  const sessionId = typeof params.session === "string" && UUID.test(params.session) ? params.session : null;
  const supabase = await createClient();

  let target: ComposeTarget | null = null;
  let back = { href: "/admin/messages", label: "Messages" };

  if (to) {
    const { data: p } = await supabase
      .from("profiles")
      .select("display_name, full_name, email, guest")
      .eq("id", to)
      .maybeSingle();
    if (!p || p.guest) notFound(); // guests have no account to message
    target = { kind: "player", id: to, name: whoName(p) };
  } else if (sessionId) {
    const [{ data: session }, { data: regs }] = await Promise.all([
      supabase.from("sessions").select("id, title").eq("id", sessionId).maybeSingle(),
      supabase.from("registrations").select("status, option").eq("session_id", sessionId),
    ]);
    if (!session) notFound();
    const counts = Object.fromEntries(AUDIENCES.map((a) => [a, 0])) as Record<Audience, number>;
    for (const r of regs ?? []) {
      const a = audienceOf(r);
      if (a) counts[a] += 1;
    }
    target = { kind: "session", id: session.id, title: session.title, counts };
    back = { href: `/admin/sessions/${session.id}`, label: "Session" };
  } else {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div>
        <BackLink href={back.href}>{back.label}</BackLink>
        <PageTitle sub="Players see this in their inbox and can reply. Any host can answer.">New message</PageTitle>
      </div>
      <div className="reveal" style={reveal(1)}>
        <ComposeForm target={target} />
      </div>
    </div>
  );
}
