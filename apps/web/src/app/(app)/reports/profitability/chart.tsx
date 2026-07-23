'use client';

/**
 * «Прибыльность» chart — a minimal moysklad-style line chart over time buckets.
 * Primary series drives the left Y axis; an optional secondary series is drawn
 * in orange on its own right axis; an optional comparison period is a lighter
 * line on the primary axis. Self-contained inline SVG (no chart lib).
 */

import { useMemo } from 'react';

export type ChartBucket = {
  start: string;
  salesDocuments: number;
  salesQuantity: string;
  salesSumMinor: string;
  salesSumCostMinor: string;
  returnDocuments: number;
  returnQuantity: string;
  returnSumMinor: string;
  returnSumCostMinor: string;
  profitMinor: string;
  profitGoodsPct: string;
  profitSalesPct: string;
  avgCheckMinor: string;
};

export type SeriesKey =
  | 'salesDocuments'
  | 'salesQuantity'
  | 'salesSum'
  | 'salesSumCost'
  | 'returnDocuments'
  | 'returnQuantity'
  | 'returnSum'
  | 'returnSumCost'
  | 'profit'
  | 'profitGoodsPct'
  | 'profitSalesPct'
  | 'avgCheck';

/** value of a series for one bucket, in display units (money → major). */
export function seriesValue(b: ChartBucket, key: SeriesKey): number {
  switch (key) {
    case 'salesDocuments':
      return b.salesDocuments;
    case 'salesQuantity':
      return Number(b.salesQuantity);
    case 'salesSum':
      return Number(b.salesSumMinor) / 100;
    case 'salesSumCost':
      return Number(b.salesSumCostMinor) / 100;
    case 'returnDocuments':
      return b.returnDocuments;
    case 'returnQuantity':
      return Number(b.returnQuantity);
    case 'returnSum':
      return Number(b.returnSumMinor) / 100;
    case 'returnSumCost':
      return Number(b.returnSumCostMinor) / 100;
    case 'profit':
      return Number(b.profitMinor) / 100;
    case 'profitGoodsPct':
      return b.profitGoodsPct === '' ? 0 : Number(b.profitGoodsPct);
    case 'profitSalesPct':
      return b.profitSalesPct === '' ? 0 : Number(b.profitSalesPct);
    case 'avgCheck':
      return Number(b.avgCheckMinor) / 100;
  }
}

const VB_W = 1000;
const VB_H = 260;
const PAD_L = 46;
const PAD_R = 46;
const PAD_T = 12;
const PAD_B = 26;

function niceMax(max: number): number {
  if (max <= 0) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  const n = max / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : 10;
  return step * pow;
}

function fmtTick(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1)}k`;
  return String(Math.round(v * 100) / 100);
}

function fmtDate(iso: string): string {
  // bucket.start is the absolute UTC instant of the Tashkent-local bucket start;
  // shift +5h so the UTC date components read the Tashkent calendar day.
  const d = new Date(new Date(iso).getTime() + 5 * 3600 * 1000);
  const mon = [
    'янв.',
    'февр.',
    'мар.',
    'апр.',
    'мая',
    'июн.',
    'июл.',
    'авг.',
    'сент.',
    'окт.',
    'нояб.',
    'дек.',
  ][d.getUTCMonth()];
  return `${d.getUTCDate()} ${mon} ${d.getUTCFullYear()} г.`;
}

function pointsFor(
  buckets: ChartBucket[],
  key: SeriesKey,
  max: number,
): { x: number; y: number }[] {
  const n = buckets.length;
  const plotW = VB_W - PAD_L - PAD_R;
  const plotH = VB_H - PAD_T - PAD_B;
  return buckets.map((b, i) => {
    const x = PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const v = seriesValue(b, key);
    const y = PAD_T + plotH - (max <= 0 ? 0 : (v / max) * plotH);
    return { x, y };
  });
}

function polyline(pts: { x: number; y: number }[]): string {
  return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

export function ProfitabilityChart({
  buckets,
  compareBuckets,
  primary,
  secondary,
}: {
  buckets: ChartBucket[];
  compareBuckets: ChartBucket[] | null;
  primary: SeriesKey;
  secondary: SeriesKey | null;
}) {
  const model = useMemo(() => {
    const primVals = buckets.map((b) => seriesValue(b, primary));
    const cmpVals = compareBuckets?.map((b) => seriesValue(b, primary)) ?? [];
    const primMax = niceMax(Math.max(1, ...primVals, ...cmpVals));
    const secMax = secondary
      ? niceMax(Math.max(1, ...buckets.map((b) => seriesValue(b, secondary))))
      : 0;
    return { primMax, secMax };
  }, [buckets, compareBuckets, primary, secondary]);

  const plotH = VB_H - PAD_T - PAD_B;
  const primPts = pointsFor(buckets, primary, model.primMax);
  const cmpPts = compareBuckets ? pointsFor(compareBuckets, primary, model.primMax) : null;
  const secPts = secondary ? pointsFor(buckets, secondary, model.secMax) : null;

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const xLabelIdx =
    buckets.length <= 1
      ? [0]
      : [
          0,
          Math.floor(buckets.length / 3),
          Math.floor((2 * buckets.length) / 3),
          buckets.length - 1,
        ];

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full"
        style={{ minWidth: 640, height: 300 }}
        preserveAspectRatio="none"
        role="img"
        aria-label="Прибыльность график"
      >
        {/* Y grid + left ticks (primary) */}
        {ticks.map((t) => {
          const y = PAD_T + plotH - t * plotH;
          return (
            <g key={t}>
              <line
                x1={PAD_L}
                x2={VB_W - PAD_R}
                y1={y}
                y2={y}
                stroke="var(--ms-border-subtle,#eee)"
                strokeWidth={1}
              />
              <text
                x={PAD_L - 6}
                y={y + 3}
                textAnchor="end"
                fontSize={10}
                fill="var(--ms-text-muted,#8a97a8)"
              >
                {fmtTick(t * model.primMax)}
              </text>
              {secondary && (
                <text
                  x={VB_W - PAD_R + 6}
                  y={y + 3}
                  textAnchor="start"
                  fontSize={10}
                  fill="#e08726"
                >
                  {fmtTick(t * model.secMax)}
                </text>
              )}
            </g>
          );
        })}

        {/* X date labels */}
        {xLabelIdx.map((i) => {
          const b = buckets[i];
          if (!b) return null;
          const n = buckets.length;
          const plotW = VB_W - PAD_L - PAD_R;
          const x = PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
          return (
            <text
              key={i}
              x={x}
              y={VB_H - 8}
              textAnchor={i === 0 ? 'start' : i === buckets.length - 1 ? 'end' : 'middle'}
              fontSize={10}
              fill="var(--ms-text-muted,#8a97a8)"
            >
              {fmtDate(b.start)}
            </text>
          );
        })}

        {/* compare line (lighter) */}
        {cmpPts && cmpPts.length > 0 && (
          <polyline
            points={polyline(cmpPts)}
            fill="none"
            stroke="#9fdcec"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}

        {/* secondary line (orange, right axis) */}
        {secPts && secPts.length > 0 && (
          <polyline
            points={polyline(secPts)}
            fill="none"
            stroke="#e08726"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}

        {/* primary line (cyan) + dots */}
        <polyline
          points={polyline(primPts)}
          fill="none"
          stroke="#2eb6d8"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {primPts.map((p) => (
          <circle key={`${p.x}-${p.y}`} cx={p.x} cy={p.y} r={2.5} fill="#2eb6d8" />
        ))}
      </svg>
    </div>
  );
}
