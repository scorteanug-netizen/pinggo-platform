"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type LeadsTrendPoint = {
  date: string;
  newLeads: number;
  qualified: number;
  booked: number;
};

type LeadsTrendChartProps = {
  data: LeadsTrendPoint[];
};

export function LeadsTrendChart({ data }: LeadsTrendChartProps) {
  return (
    <section className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <div className="mb-3 shrink-0">
        <h2 className="text-lg font-fraunces font-bold text-slate-900">Trend Leaduri (7 Zile)</h2>
        <p className="mt-0.5 text-sm text-slate-600">
          Evolutia leadurilor noi, calificate si programate.
        </p>
      </div>

      <div className="min-h-0 w-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis
              dataKey="date"
              stroke="#6B7280"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "#E5E7EB" }}
            />
            <YAxis
              stroke="#6B7280"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "#E5E7EB" }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                padding: "10px 12px",
                fontSize: "12px",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "13px" }} iconType="line" />

            <Line
              type="monotone"
              dataKey="newLeads"
              name="Leaduri Noi"
              stroke="#F97316"
              strokeWidth={2}
              dot={{ fill: "#F97316", r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="qualified"
              name="Calificate"
              stroke="#8B5CF6"
              strokeWidth={2}
              dot={{ fill: "#8B5CF6", r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="booked"
              name="Programate"
              stroke="#10B981"
              strokeWidth={2}
              dot={{ fill: "#10B981", r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function LeadsTrendChartSkeleton() {
  return (
    <section className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <div className="mb-3 shrink-0 space-y-2">
        <div className="h-5 w-44 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-72 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="min-h-0 w-full flex-1 animate-pulse rounded-lg bg-slate-100" />
    </section>
  );
}
