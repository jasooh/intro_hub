#!/usr/bin/env node
// Rebuilds supabase/README.md: for each public SQL function, the migration that holds its live version.
// Run `npm run db:functions` after adding a migration.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const dir = join(root, "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const fns = new Map(); // name -> { file, versions }
for (const file of files) {
  const sql = readFileSync(join(dir, file), "utf8").replace(/--[^\n]*/g, "");
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_0-9]+)/gi)) {
    const cur = fns.get(m[1]) ?? { file, versions: 0 };
    fns.set(m[1], { file, versions: cur.versions + 1 });
  }
  for (const m of sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?public\.([a-z_0-9]+)/gi)) {
    // Dropped and re-created with new arguments is common; only forget it if nothing re-creates it later in this file.
    const recreated = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${m[1]}\\b`, "i").test(sql);
    if (!recreated) fns.delete(m[1]);
  }
}

const rows = [...fns.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, { file, versions }]) => `| \`${name}\` | \`${file}\` | ${versions} |`);

const readme = `# Supabase

Two projects: **dev** (\`goomasgmwhafvkbmheex\`: localhost and Vercel previews) and **prod** (\`tbxicooonmntknjrrnzh\`: the live site). Their schemas are meant to be identical; they differ only in cron setup (\`setup/cron-dev.sql\` runs \`run_tick()\` in the database, \`setup/cron.sql\` calls the app's \`/api/cron/tick\`).

## Adding a migration

1. Add \`migrations/<next number>_<name>.sql\`. The number is the file's version everywhere (repo, dev, prod), so keep them in order. Never edit a migration that has been applied; write a new one.
2. To change a function, \`create or replace\` the **whole** function in the new file (copy the current version from the file listed below).
3. \`npx vitest run\`: the tests replay every migration in memory (PGlite).
4. Apply to **dev**: \`supabase db push --db-url "$DEV_DB_URL"\`. Try it.
5. \`npm run db:status -- --drift\`: shows what is still pending on dev and prod and whether the two have drifted.
6. Right before merging to \`main\`, apply to **prod**: \`supabase db push --db-url "$PROD_DB_URL"\`. Don't use the Supabase MCP \`apply_migration\` for this: it stamps its own version number, which is how the histories got out of step.
7. \`npm run db:functions\` to refresh the table below, and commit it with the migration.

\`DEV_DB_URL\` / \`PROD_DB_URL\` are the projects' connection strings (Project Settings > Database), kept in \`.env.local\`.

## Where each function lives now

Open the file listed for the current version; older copies in earlier migrations are history.

| Function | Latest version in | Times defined |
|---|---|---|
${rows.join("\n")}
`;
writeFileSync(join(root, "supabase", "README.md"), readme);
console.log(`Wrote supabase/README.md (${rows.length} functions).`);
