import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

/** Next's own control-flow "errors" (redirect, notFound…) aren't problems. */
const IGNORED = /^(NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK|NEXT_NOT_FOUND|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/;

/**
 * Called from src/instrumentation.ts for every server error: saves a short
 * record the dev account can see in /dev-tools (cleared after 30 days by run_tick).
 * Query strings are dropped (they can hold tokens).
 */
export async function logServerError(
  err: unknown,
  request: { path: string; method: string },
  context: { routeType: string; routePath: string },
) {
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : null;
  if (digest && IGNORED.test(digest)) return;
  const message = (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).slice(0, 1000);
  await createAdminClient()
    .from("app_errors")
    .insert({
      message,
      digest,
      path: (context.routePath || request.path.split("?")[0]).slice(0, 300),
      method: request.method,
      kind: context.routeType,
    });
}

export type AppErrorGroup = { message: string; count: number; last: string; path: string | null; kind: string | null };

/** The latest errors grouped by message, newest first (dev tools). */
export function groupErrors(rows: { message: string; at: string; path: string | null; kind: string | null }[]): AppErrorGroup[] {
  const groups = new Map<string, AppErrorGroup>();
  for (const r of rows) {
    const g = groups.get(r.message);
    if (g) g.count += 1;
    else groups.set(r.message, { message: r.message, count: 1, last: r.at, path: r.path, kind: r.kind });
  }
  return [...groups.values()];
}
