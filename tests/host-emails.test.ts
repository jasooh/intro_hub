import { expect, it } from "vitest";

// Hosts save their host email settings from the account page (column-level grants).
import { asUser, createDb, createUser } from "./db-harness";

it("a host can save their host email settings", async () => {
  const db = await createDb();
  const host = await createUser(db, "Host", { admin: true });
  await asUser(db, host, `update public.profiles set host_emails = false, host_digest = 'daily', host_session_day = false where id = $1`, [host]);
  const r = await db.query<{ host_digest: string }>(`select host_digest from public.profiles where id = $1`, [host]);
  expect(r.rows[0].host_digest).toBe("daily");
});
