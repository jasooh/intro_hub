import { Dropdown } from "@/components/dropdown";
import { Field, inputClass } from "@/components/ui";
import { inputKind, toInputValue, type ColumnInfo } from "@/lib/dev-tools";

/** One input per column, named `c:<column>`; read-only columns are shown as text. */
export function RowFields({ columns, row }: { columns: ColumnInfo[]; row: Record<string, unknown> }) {
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
                <Dropdown
                  name={name}
                  defaultValue={value}
                  options={[...(col.nullable ? [{ value: "", label: "null" }] : []), { value: "true", label: "true" }, { value: "false", label: "false" }]}
                />
              ) : kind === "enum" ? (
                <Dropdown
                  name={name}
                  defaultValue={value}
                  options={[...(col.nullable ? [{ value: "", label: "null" }] : []), ...col.enum!.map((e) => ({ value: e, label: e }))]}
                />
              ) : wide ? (
                <textarea
                  name={name}
                  defaultValue={value}
                  rows={kind === "json" ? Math.min(12, value.split("\n").length + 1) : 4}
                  className={`${inputClass} font-mono text-base sm:text-sm`}
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
