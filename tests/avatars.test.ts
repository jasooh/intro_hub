import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/avatar/[style]/[seed]/route";
import { AVATAR_BACKGROUNDS, AVATAR_STYLE_KEYS, avatarPath, randomSeed } from "@/lib/avatars";
import { asUser, createDb, createUser, type Db } from "./db-harness";

let db: Db;

beforeEach(async () => {
  db = await createDb();
});

type AvatarRow = { avatar_style: string; avatar_seed: string; avatar_url: string };

const avatarOf = async (id: string) =>
  (await db.query<AvatarRow>(`select avatar_style, avatar_seed, avatar_url from public.profiles where id = $1`, [id]))
    .rows[0];

describe("DiceBear avatars in the database", () => {
  it("gives every new player a random DiceBear avatar instead of their Google photo", async () => {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'g@example.com', $1)`, [
      { full_name: "Google Person", picture: "https://lh3.googleusercontent.com/photo.jpg" },
    ]);
    const g = (await db.query<{ id: string }>(`select id from public.profiles where email = 'g@example.com'`)).rows[0].id;
    const a = await createUser(db, "A");

    const [ga, aa] = [await avatarOf(g), await avatarOf(a)];
    expect(ga.avatar_style).toBe("thumbs");
    expect(ga.avatar_seed).toMatch(/^[a-z0-9]{12}$/);
    expect(ga.avatar_url).toBe(avatarPath("thumbs", ga.avatar_seed));
    expect(ga.avatar_seed).not.toBe(aa.avatar_seed);
  });

  it("follows the player's own style and seed, but never a URL they set", async () => {
    const a = await createUser(db, "A");
    await asUser(db, a, `update public.profiles set avatar_style = 'fun-emoji', avatar_seed = 'abc123' where id = $1`, [a]);
    expect(await avatarOf(a)).toEqual({
      avatar_style: "fun-emoji",
      avatar_seed: "abc123",
      avatar_url: "/api/avatar/fun-emoji/abc123",
    });

    await expect(
      asUser(db, a, `update public.profiles set avatar_url = 'https://evil.example/x.png' where id = $1`, [a]),
    ).rejects.toThrow(/permission denied/);
    // Another player's avatar is out of reach (RLS: the update matches no row).
    const b = await createUser(db, "B");
    const before = await avatarOf(b);
    await asUser(db, a, `update public.profiles set avatar_seed = 'zzz' where id = $1`, [b]);
    expect(await avatarOf(b)).toEqual(before);
  });

  it("rejects unknown styles and odd seeds", async () => {
    const a = await createUser(db, "A");
    for (const sql of [
      `update public.profiles set avatar_style = 'pixel-art' where id = $1`,
      `update public.profiles set avatar_seed = 'Has Spaces' where id = $1`,
      `update public.profiles set avatar_seed = '' where id = $1`,
      `update public.profiles set avatar_seed = repeat('a', 33) where id = $1`,
    ]) {
      await expect(asUser(db, a, sql, [a]), sql).rejects.toThrow(/check constraint/);
    }
  });
});

describe("avatar image route", () => {
  const get = (style: string, seed: string) =>
    GET(new Request(`http://localhost/api/avatar/${style}/${seed}`), { params: Promise.resolve({ style, seed }) });

  it("draws an SVG for every style", async () => {
    for (const style of AVATAR_STYLE_KEYS) {
      const res = await get(style, randomSeed());
      expect(res.status, style).toBe(200);
      expect(res.headers.get("content-type")).toContain("image/svg+xml");
      expect(res.headers.get("cache-control")).toContain("max-age=86400");
      const svg = await res.text();
      expect(svg).toMatch(/^<svg/);
      // Always a solid theme fill, never transparent or the page's maple.
      const fill = svg.match(/<rect[^>]*fill="#([0-9a-f]{6})"/i)?.[1].toLowerCase();
      expect(AVATAR_BACKGROUNDS, style).toContain(fill);
    }
  });

  it("is the same picture for the same seed", async () => {
    expect(await (await get("thumbs", "abc")).text()).toBe(await (await get("thumbs", "abc")).text());
  });

  it("404s on unknown styles and bad seeds", async () => {
    expect((await get("pixel-art", "abc")).status).toBe(404);
    expect((await get("thumbs", "ABC")).status).toBe(404);
    expect((await get("thumbs", "a".repeat(33))).status).toBe(404);
    expect((await get("__proto__", "abc")).status).toBe(404);
  });

  it("makes 12-character lowercase seeds", () => {
    expect(randomSeed()).toMatch(/^[a-z0-9]{12}$/);
  });
});

describe("display name and avatar cooldown", () => {
  const onboard = (id: string) => db.query(`update public.profiles set onboarded_at = now() where id = $1`, [id]);
  const asPlayer = (id: string, set: string) => asUser(db, id, `update public.profiles set ${set} where id = $1`, [id]);

  it("allows 3 changes a day, counting a name + avatar save once", async () => {
    const a = await createUser(db, "A");
    await onboard(a);
    await asPlayer(a, `display_name = 'Ace', avatar_seed = 'one'`); // 1 (both fields, one change)
    await asPlayer(a, `avatar_style = 'fun-emoji'`); // 2
    await asPlayer(a, `display_name = 'Ace 2'`); // 3
    await expect(asPlayer(a, `avatar_seed = 'four'`)).rejects.toThrow(/identity_change_limit/);
    expect((await avatarOf(a)).avatar_seed).toBe("one");

    // Other fields and same-value saves still go through.
    await asPlayer(a, `phone = '555-0111', display_name = 'Ace 2', avatar_style = 'fun-emoji'`);

    // A day later the oldest change has aged out.
    await db.query(
      `update public.profiles set identity_changed_at = array(select t - interval '25 hours' from unnest(identity_changed_at) t) where id = $1`,
      [a],
    );
    await asPlayer(a, `avatar_seed = 'four'`);
    expect((await avatarOf(a)).avatar_seed).toBe("four");
  });

  it("doesn't count onboarding or someone else's edits, and players can't reset the counter", async () => {
    const a = await createUser(db, "A", { incomplete: true });
    await db.query(`update public.profiles set onboarded_at = null where id = $1`, [a]);
    for (const seed of ["s1", "s2", "s3", "s4"]) await asPlayer(a, `avatar_seed = '${seed}'`);
    await onboard(a);
    // Service role / hosts / dev tools edit freely.
    for (const seed of ["h1", "h2", "h3", "h4"]) await db.query(`update public.profiles set avatar_seed = $2 where id = $1`, [a, seed]);
    await expect(asPlayer(a, `identity_changed_at = '{}'`)).rejects.toThrow(/permission denied/);
    await asPlayer(a, `avatar_seed = 'mine'`);
    const n = await db.query<{ n: number }>(`select cardinality(identity_changed_at) as n from public.profiles where id = $1`, [a]);
    expect(n.rows[0].n).toBe(1);
  });
});
