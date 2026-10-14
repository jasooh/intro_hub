import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "test-secret";
process.env.INGEST_SECRET = SECRET;

// A tiny fake of the supabase-js calls the route makes.
const state = vi.hoisted(() => ({
  seen: new Set<string>(),
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
  notes: [] as { id: string; note: string }[],
  candidates: [
    {
      id: "reg-1",
      ref_code: "VB-7K3Q",
      status: "pending_payment",
      amount_cents: 1000,
      profile: { display_name: "Jane", full_name: "Jane Doe", first_name: "Jane", last_name: "Doe", etransfer_names: ["JANE DOE"] },
    },
  ],
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: (rows: { gmail_message_id: string }[]) => ({
        select: async () => {
          const fresh = rows.filter((r) => !state.seen.has(r.gmail_message_id));
          fresh.forEach((r) => state.seen.add(r.gmail_message_id));
          return { data: fresh.map((r) => ({ id: `pay-${r.gmail_message_id}`, gmail_message_id: r.gmail_message_id })), error: null };
        },
      }),
      select: () => ({ gte: async () => ({ data: state.candidates, error: null }) }),
      update: (patch: { note: string }) => ({
        eq: async (_col: string, id: string) => {
          state.notes.push({ id, note: patch.note });
          return { error: null };
        },
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      return { data: [{ event: "confirmed", registration_id: args.p_registration_id }], error: null };
    },
  }),
}));

vi.mock("@/lib/registrations", () => ({
  dispatchEvents: vi.fn(async () => {}),
  parseEvents: (d: unknown) => (Array.isArray(d) ? d : []),
}));

const { POST } = await import("@/app/api/payments/ingest/route");

function request(body: unknown, signature?: string) {
  const raw = JSON.stringify(body);
  return new Request("http://localhost/api/payments/ingest", {
    method: "POST",
    body: raw,
    headers: { "x-signature": signature ?? createHmac("sha256", SECRET).update(raw).digest("hex") },
  });
}

const messages = [
  { id: "m1", senderName: "Someone", amountCents: 1000, memo: "vb 7k3q", receivedAt: "2026-10-12T15:00:00Z" },
  { id: "m2", senderName: "Stranger", amountCents: 4200, memo: null, receivedAt: "2026-10-12T15:01:00Z" },
];

beforeEach(() => {
  state.seen.clear();
  state.rpcCalls.length = 0;
  state.notes.length = 0;
});

describe("POST /api/payments/ingest", () => {
  it("rejects a bad signature", async () => {
    const res = await POST(request({ messages }, "deadbeef"));
    expect(res.status).toBe(401);
  });

  it("confirms ref-code matches and notes the rest", async () => {
    const res = await POST(request({ messages }));
    expect(await res.json()).toEqual({ ok: true, new: 2, matched: 1 });
    expect(state.rpcCalls).toEqual([
      {
        fn: "ingest_apply_payment",
        args: { p_payment_id: "pay-m1", p_registration_id: "reg-1", p_matched_by: "ref" },
      },
    ]);
    expect(state.notes).toEqual([{ id: "pay-m2", note: expect.stringContaining("Stranger") }]);
  });

  it("skips messages it has already seen", async () => {
    await POST(request({ messages }));
    const res = await POST(request({ messages }));
    expect(await res.json()).toEqual({ ok: true, new: 0, matched: 0 });
  });

  it("rejects malformed payloads", async () => {
    const res = await POST(request({ messages: [{ id: "x", amountCents: -5 }] }));
    expect(res.status).toBe(400);
  });
});
