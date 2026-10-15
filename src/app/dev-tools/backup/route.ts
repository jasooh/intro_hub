import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { canUseDevTools } from "@/lib/auth";
import { BACKUP_COOKIE, databaseName } from "@/lib/dev-tools";
import { createClient } from "@/lib/supabase/server";

// Every table as one JSON file. Downloading it unlocks Reset for an hour.
export async function GET() {
  if (!(await canUseDevTools())) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("devtools_backup");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  (await cookies()).set(BACKUP_COOKIE, stamp, { path: "/dev-tools", maxAge: 3600, httpOnly: true, sameSite: "lax" });
  return new NextResponse(JSON.stringify({ database: databaseName(), takenAt: new Date().toISOString(), tables: data }, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="intro-hub-${databaseName().toLowerCase()}-${stamp}.json"`,
      "cache-control": "no-store",
    },
  });
}
