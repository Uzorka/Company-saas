"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { chartColors } from "@/lib/reports/palette";

/**
 * Chart marks follow one spec throughout: bars capped at 24px so the band keeps
 * some air, a 4px rounded data-end with a square baseline, hairline solid
 * gridlines on the horizontal only, and a 2px surface-coloured gap separating
 * touching marks. Axis and tooltip text wear text tokens — a series colour is
 * for the mark, never the words.
 */

const axisProps = {
  stroke: chartColors.grid,
  tick: { fill: chartColors.axis, fontSize: 11 },
  tickLine: false,
} as const;

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border bg-bg px-3 py-2 shadow-e2">
      <p className="text-small font-medium">{label}</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {payload.map((entry) => (
          <li key={entry.name} className="flex items-center gap-2 text-small">
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ background: entry.color }}
              aria-hidden
            />
            <span className="text-text-2">{entry.name}</span>
            <span className="ml-auto font-mono text-text" data-numeric>
              {unit === "money"
                ? Number(entry.value ?? 0).toLocaleString()
                : entry.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Check-ins per day, split by where they happened. Part-to-whole over time. */
export function AttendanceChart({
  data,
}: {
  data: { day: string; "At office": number; Remote: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
        <CartesianGrid vertical={false} stroke={chartColors.grid} />
        <XAxis dataKey="day" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: chartColors.grid, opacity: 0.35 }} />
        <Legend
          wrapperStyle={{ fontSize: 12, color: chartColors.axis, paddingTop: 8 }}
          iconType="square"
          iconSize={10}
        />
        {/* stroke in the surface colour is the 2px gap between stacked segments */}
        <Bar
          dataKey="At office"
          stackId="a"
          fill={chartColors.office}
          stroke={chartColors.surface}
          strokeWidth={2}
          maxBarSize={24}
        />
        <Bar
          dataKey="Remote"
          stackId="a"
          fill={chartColors.remote}
          stroke={chartColors.surface}
          strokeWidth={2}
          maxBarSize={24}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * A single series over time. One hue, no legend — the title names the series,
 * so a legend box would only repeat it.
 *
 * `preserveStartEnd` lets Recharts drop labels that will not fit. Forcing every
 * tick was the first version, and thirty dates in a 400px card collapsed into
 * an unreadable smear — which is what screenshotting it at phone width showed.
 */
export function TimeSeriesChart({
  data,
  dataKey,
  labelKey,
  height = 220,
}: {
  data: Record<string, string | number>[];
  dataKey: string;
  labelKey: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
        <CartesianGrid vertical={false} stroke={chartColors.grid} />
        <XAxis dataKey={labelKey} {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} allowDecimals={false} />
        <Tooltip
          content={<ChartTooltip />}
          cursor={{ fill: chartColors.grid, opacity: 0.35 }}
        />
        <Bar
          dataKey={dataKey}
          fill={chartColors.single}
          maxBarSize={24}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Magnitude across named categories — horizontal.
 *
 * Department names are long and there are seven of them. As columns they
 * overlapped into each other at phone width; rotating them would have made a
 * chart you read with your head tilted. Horizontal bars give every label a full
 * line of its own, which is the standard answer for long category names rather
 * than a workaround.
 */
export function CategoryBarChart({
  data,
  dataKey,
  labelKey,
  unit,
}: {
  data: Record<string, string | number>[];
  dataKey: string;
  labelKey: string;
  unit?: string;
}) {
  // Each bar needs a row; 34px keeps a 24px bar with air around it.
  const height = Math.max(140, data.length * 34 + 24);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 12, bottom: 0, left: 0 }}
      >
        <CartesianGrid horizontal={false} stroke={chartColors.grid} />
        <XAxis type="number" {...axisProps} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey={labelKey}
          {...axisProps}
          width={110}
          interval={0}
        />
        <Tooltip
          content={<ChartTooltip unit={unit} />}
          cursor={{ fill: chartColors.grid, opacity: 0.35 }}
        />
        <Bar
          dataKey={dataKey}
          fill={chartColors.single}
          maxBarSize={24}
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
