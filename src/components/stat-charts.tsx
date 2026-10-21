"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";

// The Stats page's charts (shadcn charts on Recharts), dressed like the rest of the site: square
// bars, ink axes, one orange for money and highlights, mat blue for counts, values written on the
// bars and in a scoreboard-style tooltip, so nothing depends on colour alone.

export type ChartRow = { label: string; value: number; /** Second value, drawn stacked on top (money: still owed). */ extra?: number; detail?: string };

/** How a chart writes its numbers. A name, not a function: the sections that pick it run on the server. */
export type ChartFormat = "number" | "percent" | "money";
const FORMATTERS: Record<ChartFormat, (n: number) => string> = {
  number: (n) => String(n),
  percent: (n) => `${n}%`,
  money: (cents) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100),
};

const INK = "var(--ink)";
const TICK = { fontSize: 12, fill: "var(--ink-soft)" };
const AXIS_LINE = { stroke: INK, strokeWidth: 2 };
const OWED = "color-mix(in oklab, var(--line) 35%, var(--maple))";

function StatTooltip({
  active,
  payload,
  label,
  format,
  extraLabel,
}: {
  active?: boolean;
  payload?: { payload: ChartRow }[];
  label?: string;
  format: (n: number) => string;
  extraLabel?: string;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="grid min-w-[8rem] gap-1 border-2 border-ink bg-board px-3 py-2 text-xs text-maple shadow-[3px_3px_0_var(--line)]">
      <p className="font-display text-sm font-bold tracking-wide uppercase">{label ?? row.label}</p>
      <p className="font-score text-base font-black text-led">{format(row.value)}</p>
      {row.extra != null && row.extra > 0 && (
        <p className="text-maple/80">
          + <span className="font-score font-black">{format(row.extra)}</span> {extraLabel}
        </p>
      )}
      {row.detail && <p className="text-maple/70">{row.detail}</p>}
    </div>
  );
}

/** Columns by month or by session. `extra` stacks a lighter second value (e.g. money still owed). */
export function ColumnChart({
  rows,
  format: formatName = "number",
  color = "var(--mat)",
  extraLabel = "more",
  label,
  height = 240,
}: {
  rows: ChartRow[];
  format?: ChartFormat;
  color?: string;
  extraLabel?: string;
  label: string;
  height?: number;
}) {
  const format = FORMATTERS[formatName];
  const config = { value: { label, color }, extra: { label: extraLabel, color: OWED } } satisfies ChartConfig;
  const showValues = rows.length <= 8;
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }} role="img" aria-label={label}>
      <BarChart accessibilityLayer data={rows} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={INK} strokeOpacity={0.15} />
        <XAxis dataKey="label" tickLine={false} axisLine={AXIS_LINE} tick={TICK} interval="preserveStartEnd" />
        <YAxis width={44} tickLine={false} axisLine={false} tick={TICK} tickFormatter={(n: number) => format(n)} allowDecimals={false} />
        <ChartTooltip cursor={{ fill: "var(--maple-deep)", opacity: 0.6 }} content={<StatTooltip format={format} extraLabel={extraLabel} />} />
        <Bar dataKey="value" stackId="a" fill="var(--color-value)" radius={0} maxBarSize={44}>
          {showValues && !rows.some((r) => r.extra) && (
            <LabelList dataKey="value" position="top" formatter={(n: unknown) => format(Number(n))} className="fill-ink font-score text-[11px] font-black" />
          )}
        </Bar>
        {rows.some((r) => r.extra) && <Bar dataKey="extra" stackId="a" fill="var(--color-extra)" radius={0} maxBarSize={44} />}
      </BarChart>
    </ChartContainer>
  );
}

/** Horizontal bars for a handful of categories, value written at the end of each bar. */
export function HBarChart({
  rows,
  format: formatName = "number",
  color = "var(--mat)",
  label,
}: {
  rows: ChartRow[];
  format?: ChartFormat;
  color?: string;
  label: string;
}) {
  const format = FORMATTERS[formatName];
  const config = { value: { label, color } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: rows.length * 38 + 12 }} role="img" aria-label={label}>
      <BarChart accessibilityLayer data={rows} layout="vertical" margin={{ top: 0, right: 64, left: 0, bottom: 0 }} barCategoryGap={8}>
        <XAxis type="number" hide domain={[0, "dataMax"]} />
        <YAxis dataKey="label" type="category" width={118} tickLine={false} axisLine={AXIS_LINE} tick={TICK} />
        <ChartTooltip cursor={{ fill: "var(--maple-deep)", opacity: 0.6 }} content={<StatTooltip format={format} />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={0} background={{ fill: INK, fillOpacity: 0.05 }}>
          <LabelList
            dataKey="value"
            position="right"
            formatter={(n: unknown) => format(Number(n))}
            className="fill-ink font-score text-[12px] font-black"
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/** A line with a soft fill, for a value over time (e.g. how full each session was). */
export function TrendChart({
  rows,
  format: formatName = "number",
  label,
  max,
  height = 220,
}: {
  rows: ChartRow[];
  format?: ChartFormat;
  label: string;
  max?: number;
  height?: number;
}) {
  const format = FORMATTERS[formatName];
  const config = { value: { label, color: "var(--line)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }} role="img" aria-label={label}>
      <AreaChart accessibilityLayer data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={INK} strokeOpacity={0.15} />
        <XAxis dataKey="label" tickLine={false} axisLine={AXIS_LINE} tick={TICK} interval="preserveStartEnd" />
        <YAxis width={44} tickLine={false} axisLine={false} tick={TICK} tickFormatter={(n: number) => format(n)} domain={[0, max ?? "auto"]} />
        <ChartTooltip cursor={{ stroke: INK, strokeWidth: 1 }} content={<StatTooltip format={format} />} />
        <Area
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={3}
          fill="var(--color-value)"
          fillOpacity={0.15}
          dot={{ r: 4, fill: "var(--color-value)", stroke: INK, strokeWidth: 2 }}
          activeDot={{ r: 6, fill: "var(--color-value)", stroke: INK, strokeWidth: 2 }}
        />
      </AreaChart>
    </ChartContainer>
  );
}
