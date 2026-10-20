import { describe, expect, it } from "vitest";
import { classifyEmailError } from "@/lib/email/errors";
import { asUser, createDb, createUser } from "./db-harness";

describe("classifyEmailError", () => {
  it("spots Gmail's daily sending limit", () => {
    expect(classifyEmailError({ responseCode: 550, response: "550 5.4.5 Daily user sending limit exceeded." })).toBe("quota");
    expect(classifyEmailError({ message: "Message rejected: daily sending quota exceeded" })).toBe("quota");
  });
  it("spots a rejected app password", () => {
    expect(classifyEmailError({ code: "EAUTH", responseCode: 535, response: "535-5.7.8 Username and Password not accepted." })).toBe(
      "auth",
    );
  });
  it("spots a bad address (just that email fails)", () => {
    expect(classifyEmailError({ code: "EENVELOPE", response: "550 5.1.1 The email account that you tried to reach does not exist." })).toBe(
      "recipient",
    );
  });
  it("treats anything else as a hiccup to retry", () => {
    expect(classifyEmailError({ code: "ETIMEDOUT", message: "Connection timeout" })).toBe("transient");
    expect(classifyEmailError({ responseCode: 421, response: "421 4.7.0 Try again later" })).toBe("transient");
    expect(classifyEmailError(undefined)).toBe("transient");
  });
});

describe("email tables", () => {
  it("only hosts can read them, and nobody writes them from the browser", async () => {
    const db = await createDb();
    const host = await createUser(db, "Host", { admin: true });
    const player = await createUser(db, "Player");
    await db.query(`insert into public.email_sends (to_email, subject, status) values ('a@b.c', 'Hi', 'queued')`);
    expect((await asUser(db, host, `select * from public.email_sends`)).rows).toHaveLength(1);
    expect((await asUser(db, host, `select * from public.email_health`)).rows).toHaveLength(1);
    expect((await asUser(db, player, `select * from public.email_sends`)).rows).toHaveLength(0);
    expect((await asUser(db, player, `select * from public.email_health`)).rows).toHaveLength(0);
    await expect(asUser(db, host, `update public.email_health set paused_until = null`)).rejects.toThrow(/permission denied/);
  });
});
