import { Field, inputClass } from "@/components/ui";
import { inputKind, toInputValue, type OwnerColumn } from "@/lib/owner";

/** One input per column, named `c:<column>`; read-only columns are shown as text. */
export function RowFields({ columns, row }: { columns: OwnerColumn[]; row: Record<string, unknown> }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
      {columns.map((col) => {
        const value = toInputValue(col, row[col.name]);
        const kind = inputKind(col);
        const hint = `${col.type}${col.nullable ? " · blank = null" : ""}`;
        const wide = kind === "json" || kind === "long";

        if (!col.editable) {
          return (
            <div key={col.name} className="space-y-1">
              <p className="font-display text-sm font-bold tracking-[0.15em] text-ink-soft uppercase">{col.name}</p>
              <p className="font-score text-sm break-all">{value || "—"}</p>
            </div>
          );
        }

        const name = `c:${col.name}`;
        return (
          <div key={col.name} className={wide ? "sm:col-span-2" : undefined}>
            <Field label={col.name} hint={hint} required={!col.nullable}>
              {kind === "bool" ? (
                <select name={name} defaultValue={value} className={inputClass}>
                  {col.nullable && <option value="">null</option>}
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : kind === "enum" ? (
                <select name={name} defaultValue={value} className={inputClass}>
                  {col.nullable && <option value="">null</option>}
                  {col.enum!.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              ) : wide ? (
                <textarea
                  name={name}
                  defaultValue={value}
                  rows={kind === "json" ? Math.min(12, value.split("\n").length + 1) : 4}
                  className={`${inputClass} font-mono text-sm`}
                />
              ) : (
                <input
                  name={name}
                  defaultValue={value}
                  inputMode={kind === "number" ? "decimal" : undefined}
                  className={`${inputClass} ${/time|date|uuid/.test(col.type) ? "font-mono text-base" : ""}`}
                />
              )}
            </Field>
          </div>
        );
      })}
    </div>
  );
}
