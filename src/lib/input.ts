// Cleaning and validation for what players type into their profile.
// Pure functions, shared by the form (live formatting) and the server action.

/** "(416) 555-0100" for North American numbers, "+44 2071234567"-style for others. */
export function normalizePhone(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  const international = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");

  if (international && !digits.startsWith("1")) {
    if (digits.length < 8 || digits.length > 15) return { ok: false, error: "That international number doesn't look right" };
    return { ok: true, value: `+${digits}` };
  }
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return { ok: false, error: "Please enter a 10-digit phone number, e.g. (416) 555-0100" };
  if (/^[01]/.test(digits) || /^\d{3}[01]/.test(digits)) {
    return { ok: false, error: "That phone number doesn't look right" };
  }
  return { ok: true, value: `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` };
}

/** Progressive formatting while typing: "4" -> "(4", "416555" -> "(416) 555", ... */
export function formatPhoneAsTyped(raw: string): string {
  if (raw.trim().startsWith("+") && !raw.replace(/\D/g, "").startsWith("1")) {
    return `+${raw.replace(/\D/g, "").slice(0, 15)}`;
  }
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Trim, collapse runs of spaces, keep single line breaks (max one blank line), drop control characters. */
export function cleanText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}' .\-]*$/u;

/** A person's name: tidy spacing, letters plus ' - . and spaces only. */
export function cleanName(raw: string): { ok: true; value: string } | { ok: false } {
  const value = cleanText(raw).replace(/\n/g, " ");
  return value && NAME_RE.test(value) ? { ok: true, value } : { ok: false };
}

/** Comma/semicolon/line separated names, de-duplicated (case-insensitive), at most `max`. */
export function cleanNameList(raw: string, max = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\n]/)) {
    const name = cleanText(part).slice(0, 60);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length === max) break;
  }
  return out;
}
