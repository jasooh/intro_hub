// Dev tools (/dev-tools): table editor config and helpers. The database does the
// real checks (devtools_* functions in supabase/migrations/20261023000000_dev_tools.sql).

/** Tables the editor can open, with the columns shown in its row list. */
export const EDITABLE_TABLES = {
  profiles: { label: "Players", summary: ["display_name", "email", "role"] },
  sessions: { label: "Sessions", summary: ["title", "starts_at", "status"] },
  registrations: { label: "Sign-ups", summary: ["ref_code", "status", "option", "amount_cents"] },
  payments: { label: "Payments", summary: ["sender_name", "amount_cents", "memo", "matched_by"] },
  session_templates: { label: "Weekly", summary: ["title", "weekday", "start_time", "active"] },
  session_teams: { label: "Teams", summary: ["name", "session_id", "position"] },
  posts: { label: "Posts", summary: ["title", "published_at", "featured"] },
  email_log: { label: "Email log", summary: ["kind", "dedupe_key", "sent_at"] },
} as const;

export type EditableTable = keyof typeof EDITABLE_TABLES;

export function isEditableTable(t: unknown): t is EditableTable {
  return typeof t === "string" && Object.hasOwn(EDITABLE_TABLES, t);
}

export type ColumnInfo = { name: string; type: string; nullable: boolean; editable: boolean; enum: string[] | null };

/** Which database this deployment talks to. Reset asks you to type it. */
export function databaseName(supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""): "PROD" | "DEV" {
  return supabaseUrl.includes("tbxicooonmntknjrrnzh") ? "PROD" : "DEV";
}

/** Set by the backup download; Reset stays locked without a fresh one (1 hour). */
export const BACKUP_COOKIE = "devtools_backup_at";

/** Settings the site reads; the health page shows whether each is set (never the value). */
export const ENV_CHECKS: { name: string; why: string; required: boolean }[] = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", why: "Database", required: true },
  { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", why: "Database (browser)", required: true },
  { name: "SUPABASE_SERVICE_ROLE_KEY", why: "Emails, cron, payments", required: true },
  { name: "APP_URL", why: "Links in emails", required: true },
  { name: "CRON_SECRET", why: "Every-minute job", required: true },
  { name: "INGEST_SECRET", why: "Gmail payment script", required: true },
  { name: "GMAIL_USER", why: "Sending emails", required: true },
  { name: "GMAIL_APP_PASSWORD", why: "Sending emails", required: true },
  { name: "ETRANSFER_EMAIL", why: "Payment instructions", required: true },
  { name: "ADMIN_EMAILS", why: "Who becomes a host", required: false },
  { name: "SPOTIFY_PLAYLIST_URL", why: "Home page playlist", required: false },
];

// ---------------------------------------------------------------------------
// Editing a value as text and back
// ---------------------------------------------------------------------------

export type InputKind = "bool" | "enum" | "number" | "json" | "text" | "long";

export function inputKind(col: ColumnInfo): InputKind {
  if (col.enum) return "enum";
  if (col.type === "boolean") return "bool";
  if (/^(smallint|integer|bigint|numeric|real|double precision)/.test(col.type)) return "number";
  if (col.type === "jsonb" || col.type === "json" || col.type.endsWith("[]")) return "json";
  if (col.type === "text" && /html|note|memo|message|goals|reason/.test(col.name)) return "long";
  return "text";
}

/** How a stored value appears in its input ("" = null). */
export function toInputValue(col: ColumnInfo, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (inputKind(col) === "json") return JSON.stringify(value, null, 2);
  return String(value);
}

/** Turns a submitted input back into the JSON value for devtools_update_row. Throws on bad input. */
function fromInputValue(col: ColumnInfo, raw: string): unknown {
  const kind = inputKind(col);
  if (raw.trim() === "" && kind !== "long" && kind !== "text") {
    if (!col.nullable) throw new Error(`${col.name} can't be empty`);
    return null;
  }
  switch (kind) {
    case "bool":
      return raw === "true";
    case "number": {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`${col.name} must be a number`);
      return n;
    }
    case "json":
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error(`${col.name} isn't valid JSON`);
      }
    case "enum":
      if (!col.enum?.includes(raw)) throw new Error(`${col.name} must be one of ${col.enum?.join(", ")}`);
      return raw;
    default:
      return raw === "" && col.nullable ? null : raw;
  }
}

/**
 * The columns whose submitted value differs from the stored one, parsed.
 * Inputs are named `c:<column>`.
 */
export function buildPatch(columns: ColumnInfo[], row: Record<string, unknown>, form: FormData) {
  const patch: Record<string, unknown> = {};
  for (const col of columns) {
    if (!col.editable) continue;
    const raw = form.get(`c:${col.name}`);
    if (typeof raw !== "string") continue;
    const normalized = raw.replace(/\r\n/g, "\n");
    if (normalized === toInputValue(col, row[col.name])) continue;
    patch[col.name] = fromInputValue(col, normalized);
  }
  return patch;
}

/** Short, readable cell text for row lists. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  const s = String(value);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}
