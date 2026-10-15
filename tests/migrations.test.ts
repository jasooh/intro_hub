import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Supabase runs API requests with the safeupdate extension, which rejects any
// DELETE or UPDATE without a WHERE clause, even inside SECURITY DEFINER
// functions. PGlite (tests/db-harness.ts) doesn't have it, so check the SQL.
describe("migrations", () => {
  it("never DELETE or UPDATE without a WHERE clause", () => {
    const dir = join(__dirname, "..", "supabase", "migrations");
    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
      const sql = readFileSync(join(dir, file), "utf8").replace(/--[^\n]*/g, "");
      for (const statement of sql.split(";")) {
        const s = statement.trim().replace(/\s+/g, " ");
        if (/^(delete from|update) /i.test(s.replace(/^.*\b(begin|then|else|loop)\s+/i, "")) && !/\bwhere\b/i.test(s)) {
          offenders.push(`${file}: ${s.slice(0, 80)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
