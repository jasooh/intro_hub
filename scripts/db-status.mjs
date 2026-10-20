#!/usr/bin/env node
// Which migrations are applied on dev and prod? Run before merging to main.
//
//   npm run db:status            pending migrations per project
//   npm run db:status -- --drift also compare every function/column/index/policy between dev and prod
//
// Needs DEV_DB_URL and PROD_DB_URL in .env.local (Supabase > Project Settings > Database > Connection string,
// "Session pooler"). Read-only: it only runs SELECTs.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const root = join(import.meta.dirname, "..");
try {
  for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const local = readdirSync(join(root, "supabase", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => ({ version: f.split("_")[0], name: f.replace(/^\d+_|\.sql$/g, "") }));

const envs = [
  { label: "dev", url: process.env.DEV_DB_URL },
  { label: "prod", url: process.env.PROD_DB_URL },
];
const missing = envs.filter((e) => !e.url).map((e) => `${e.label.toUpperCase()}_DB_URL`);
if (missing.length) {
  console.error(`Missing ${missing.join(" and ")} in .env.local (see scripts/db-status.mjs).`);
  process.exit(2);
}

async function query(url, sql) {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    return (await client.query(sql)).rows;
  } finally {
    await client.end();
  }
}

let bad = false;
const applied = {};
for (const e of envs) {
  const rows = await query(e.url, "select version from supabase_migrations.schema_migrations");
  applied[e.label] = new Set(rows.map((r) => r.version));
  const pending = local.filter((m) => !applied[e.label].has(m.version));
  const unknown = [...applied[e.label]].filter((v) => !local.some((m) => m.version === v)).sort();
  console.log(`\n${e.label.toUpperCase()}: ${local.length - pending.length}/${local.length} migrations applied`);
  for (const m of pending) console.log(`  ✘ pending  ${m.version} ${m.name}`);
  for (const v of unknown) console.log(`  ? not in repo  ${v} (history out of step with the files: see supabase/README.md)`);
  if (pending.length || unknown.length) bad = true;
}

const behind = local.filter((m) => applied.dev.has(m.version) && !applied.prod.has(m.version));
if (behind.length) console.log(`\nProd is behind dev by ${behind.length}: apply before merging to main.`);

if (process.argv.includes("--drift")) {
  const sql = readFileSync(join(root, "supabase", "setup", "fingerprint.sql"), "utf8");
  const [dev, prod] = await Promise.all(envs.map((e) => query(e.url, sql)));
  const key = (r) => `${r.kind} ${r.name}`;
  const d = new Map(dev.map((r) => [key(r), r.hash]));
  const p = new Map(prod.map((r) => [key(r), r.hash]));
  const diffs = [...new Set([...d.keys(), ...p.keys()])].sort().filter((k) => d.get(k) !== p.get(k));
  console.log(`\nDrift: ${diffs.length === 0 ? "none (dev and prod match)" : `${diffs.length} difference(s)`}`);
  for (const k of diffs) console.log(`  ${!p.has(k) ? "only on dev " : !d.has(k) ? "only on prod" : "differs     "}  ${k}`);
  if (diffs.length) bad = true;
}

process.exit(bad ? 1 : 0);
