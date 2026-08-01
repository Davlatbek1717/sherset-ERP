'use client';

// Dashboard charts — extracted into a separate client component so recharts
// (~150-200 kB) is DYNAMICALLY imported (next/dynamic, ssr:false) instead of
// bloating the dashboard's initial JS bundle. Perf audit 2026-07-23.

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type ChartRow = Record<string, string | number>;

const axisTick = { fontSize: 11, fill: 'var(--ms-text-muted)' } as const;
const tooltipContentStyle = {
  background: 'var(--ms-bg-surface)',
  border: '1px solid var(--ms-border-default)',
  fontSize: '12px',
} as const;
const fmt = (value: unknown): [string, string] => {
  const n = typeof value === 'number' ? value : 0;
  return [`${n.toLocaleString('uz-UZ')} сум`, ''];
};

/** «Продажи» sales line chart (moysklad parity: straight teal segments). */
export function SalesLineChart({ data }: { data: ChartRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 0, height: 200 }}>
      <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--ms-border-default)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={axisTick}
          axisLine={{ stroke: 'var(--ms-border-default)' }}
          tickLine={false}
        />
        <YAxis
          tick={axisTick}
          axisLine={{ stroke: 'var(--ms-border-default)' }}
          tickLine={false}
          width={40}
        />
        <Tooltip formatter={fmt} contentStyle={tooltipContentStyle} />
        <Line
          type="linear"
          dataKey="sum"
          stroke="#3e9f9f"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** «Деньги» inflow/outflow bars + balance line (moysklad parity). */
export function CashComposedChart({ data }: { data: ChartRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 0, height: 200 }}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--ms-border-default)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={axisTick}
          axisLine={{ stroke: 'var(--ms-border-default)' }}
          tickLine={false}
        />
        <YAxis
          tick={axisTick}
          axisLine={{ stroke: 'var(--ms-border-default)' }}
          tickLine={false}
          width={40}
        />
        <Tooltip formatter={fmt} contentStyle={tooltipContentStyle} />
        <Bar dataKey="inflow" fill="#daf3c0" stroke="#9fcf6a" />
        <Bar dataKey="outflow" fill="#ffabab" stroke="#d04a49" />
        <Line type="linear" dataKey="balance" stroke="#6ab0cf" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
