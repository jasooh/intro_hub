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
      covered_by: null as string | null,
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
      select: () => ({
        gte: async () => ({ data: state.candidates, error: null }),
        // A ref code on a confirmed sign-up: check whether only a host's "Mark paid" covers it.
        eq: () => ({ is: async () => ({ data: [], error: null }) }),
      }),
      update: (patch: { note: string }) => ({
        eq: async (_col: string, id: string) => {
          state.notes.push({ id, note: patch.note });
          return { error: null };
        },
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      if (fn === "ingest_apply_group_payment") {
        // The payer and every friend they cover are confirmed.
        const ids = [args.p_payer_registration_id, ...state.candidates.filter((c) => c.covered_by === args.p_payer_registration_id).map((c) => c.id)];
        return { data: ids.map((id) => ({ event: "confirmed", registration_id: id })), error: null };
      }
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
    expect(await res.json()).toEqual({ ok: true, new: 2, matched: 1, cancelled: 0 });
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
    expect(await res.json()).toEqual({ ok: true, new: 0, matched: 0, cancelled: 0 });
  });

  it("rejects malformed payloads", async () => {
    const res = await POST(request({ messages: [{ id: "x", amountCents: -5 }] }));
    expect(res.status).toBe(400);
  });

  it("hands cancelled e-Transfers to ingest_reverse_payment, once each", async () => {
    const cancelled = {
      id: "c1",
      kind: "cancelled",
      senderName: null,
      amountCents: 1400,
      memo: null,
      sentOn: "2026-10-19",
      receivedAt: "2026-10-20T15:00:00Z",
    };
    const res = await POST(request({ messages: [cancelled] }));
    expect(await res.json()).toEqual({ ok: true, new: 0, matched: 0, cancelled: 1 });
    expect(state.rpcCalls).toEqual([
      { fn: "ingest_reverse_payment", args: { p_cancellation_id: "pay-c1", p_timezone: expect.any(String) } },
    ]);
    await POST(request({ messages: [cancelled] }));
    expect(state.rpcCalls).toHaveLength(1);
  });
});

describe("POST /api/payments/ingest, paying for friends", () => {
  const friend = {
    id: "reg-2",
    covered_by: "reg-1" as string | null,
    ref_code: "VB-AB23",
    status: "pending_payment",
    amount_cents: 1000,
    profile: { display_name: "Sam", full_name: "Sam Lee", first_name: "Sam", last_name: "Lee", etransfer_names: [] },
  };
  beforeEach(() => {
    state.candidates.splice(1);
    state.candidates.push({ ...friend });
    state.candidates[0].status = "pending_payment";
  });

  it("splits a transfer with the payer's code across the group", async () => {
    const res = await POST(
      request({ messages: [{ id: "g1", senderName: "Someone", amountCents: 2000, memo: "VB-7K3Q", receivedAt: "2026-10-12T15:00:00Z" }] }),
    );
    expect(await res.json()).toEqual({ ok: true, new: 1, matched: 1, cancelled: 0 });
    expect(state.rpcCalls).toEqual([
      {
        fn: "ingest_apply_group_payment",
        args: { p_payment_id: "pay-g1", p_payer_registration_id: "reg-1", p_matched_by: "ref" },
      },
    ]);
  });

  it("sees the group as paid for a second transfer in the same batch", async () => {
    await POST(
      request({
        messages: [
          { id: "g2", senderName: "Someone", amountCents: 2000, memo: "VB-7K3Q", receivedAt: "2026-10-12T15:00:00Z" },
          { id: "g3", senderName: "Someone", amountCents: 1000, memo: "VB-7K3Q", receivedAt: "2026-10-12T15:01:00Z" },
        ],
      }),
    );
    // The second one finds a confirmed payer with nobody left to cover: not another group split.
    expect(state.rpcCalls.map((c) => c.fn)).toEqual(["ingest_apply_group_payment"]);
    expect(state.notes).toEqual([{ id: "pay-g3", note: expect.stringContaining("confirmed") }]);
  });
});
