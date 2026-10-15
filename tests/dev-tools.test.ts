import { describe, expect, it } from "vitest";
import { buildPatch, databaseName, type ColumnInfo } from "@/lib/dev-tools";

const col = (name: string, type: string, extra: Partial<ColumnInfo> = {}): ColumnInfo => ({
  name,
  type,
  nullable: true,
  editable: true,
  enum: null,
  ...extra,
});

const columns = [
  col("id", "uuid", { editable: false, nullable: false }),
  col("title", "text", { nullable: false }),
  col("notes", "text"),
  col("capacity", "integer", { nullable: false }),
  col("active", "boolean", { nullable: false }),
  col("status", "registration_status", { nullable: false, enum: ["confirmed", "cancelled"] }),
  col("etransfer_names", "text[]", { nullable: false }),
  col("hold_expires_at", "timestamp with time zone"),
];
const row = {
  id: "abc",
  title: "Intro",
  notes: null,
  capacity: 18,
  active: true,
  status: "confirmed",
  etransfer_names: ["Jane Doe"],
  hold_expires_at: "2026-10-15T20:00:00+00:00",
};
const form = (values: Record<string, string>) => {
  const f = new FormData();
  const base: Record<string, string> = {
    "c:title": "Intro",
    "c:notes": "",
    "c:capacity": "18",
    "c:active": "true",
    "c:status": "confirmed",
    "c:etransfer_names": JSON.stringify(["Jane Doe"], null, 2),
    "c:hold_expires_at": "2026-10-15T20:00:00+00:00",
    ...values,
  };
  for (const [k, v] of Object.entries(base)) f.set(k, v);
  return f;
};

describe("buildPatch", () => {
  it("sends only what changed, typed for the database", () => {
    expect(buildPatch(columns, row, form({}))).toEqual({});
    expect(
      buildPatch(
        columns,
        row,
        form({ "c:capacity": "20", "c:active": "false", "c:notes": "hi", "c:etransfer_names": '["Jane", "J Doe"]' }),
      ),
    ).toEqual({ capacity: 20, active: false, notes: "hi", etransfer_names: ["Jane", "J Doe"] });
  });

  it("turns a cleared nullable field into null, and ignores read-only columns", () => {
    expect(buildPatch(columns, row, form({ "c:hold_expires_at": "", "c:id": "zzz" }))).toEqual({ hold_expires_at: null });
  });

  it("rejects bad values with the column name", () => {
    expect(() => buildPatch(columns, row, form({ "c:capacity": "lots" }))).toThrow(/capacity must be a number/);
    expect(() => buildPatch(columns, row, form({ "c:capacity": "" }))).toThrow(/capacity can't be empty/);
    expect(() => buildPatch(columns, row, form({ "c:status": "maybe" }))).toThrow(/status must be one of/);
    expect(() => buildPatch(columns, row, form({ "c:etransfer_names": "[oops" }))).toThrow(/isn't valid JSON/);
  });
});

describe("databaseName", () => {
  it("knows prod from dev by the project ref", () => {
    expect(databaseName("https://tbxicooonmntknjrrnzh.supabase.co")).toBe("PROD");
    expect(databaseName("https://goomasgmwhafvkbmheex.supabase.co")).toBe("DEV");
  });
});
