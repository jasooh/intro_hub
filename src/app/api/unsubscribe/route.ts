import { applyUnsubscribe } from "@/lib/unsubscribe-apply";

/**
 * One-click unsubscribe (RFC 8058): mail apps POST here from the
 * List-Unsubscribe header. Links people click go to /unsubscribe instead,
 * which asks first (so link scanners can't unsubscribe anyone).
 */
export async function POST(request: Request) {
  const q = new URL(request.url).searchParams;
  const ok = await applyUnsubscribe(q.get("u") ?? "", q.get("k") ?? "", q.get("t") ?? "");
  return new Response(ok ? "Unsubscribed" : "Invalid link", { status: ok ? 200 : 400 });
}
