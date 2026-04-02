"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { runtimeSeries } from "@/lib/mock-data";

export function RuntimeChart() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Runtime volume</CardTitle>
        <CardDescription>Runs and approval checks across the latest six reporting windows.</CardDescription>
      </CardHeader>
      <CardContent className="h-[280px] pt-2">
        {mounted ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={runtimeSeries}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  border: "1px solid var(--border)",
                  borderRadius: "16px",
                  background: "var(--bg-card)",
                  color: "var(--text-primary)"
                }}
              />
              <Line
                type="monotone"
                dataKey="runs"
                stroke="var(--text-primary)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="approvals"
                stroke="var(--text-secondary)"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full rounded-2xl border border-border bg-background" />
        )}
      </CardContent>
    </Card>
  );
}
