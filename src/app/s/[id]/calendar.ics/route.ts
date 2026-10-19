import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { sessionIcs } from "@/lib/ics";
import { createClient } from "@/lib/supabase/server";
import type { Session } from "@/lib/types";

/** "Add to calendar" file for a session. Sessions are public, so no sign-in needed. */
export async function GET(request: Request, ctx: RouteContext<"/s/[id]/calendar.ics">) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: session } = await supabase.from("sessions").select("*").eq("id", id).maybeSingle<Session>();
  if (!session || session.status === "cancelled") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const instructionalOnly = new URL(request.url).searchParams.get("option") === "instructional";
  // The local date (an evening session can already be tomorrow in UTC).
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: env.timezone() }).format(new Date(session.starts_at));
  const body = sessionIcs(session, `${env.appUrl()}/s/${id}`, { instructionalOnly });
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="intro-2-volleyball-${day}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
