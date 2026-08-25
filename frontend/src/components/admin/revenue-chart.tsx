"use client";

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/src/components/ui/chart";
import type { RevenueTimeseriesPoint } from "@/src/lib/commissions";
import { formatPrice } from "@/src/lib/format";

const chartConfig = {
  revenueCollected: {
    label: "Encaissé",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

/**
 * Courbe d'encaissement, 30 derniers jours.
 *
 * Seule série disponible pour l'instant : `paidAt` est le seul horodatage
 * fiable pour un montant réel (règle n° 11 — pas de créance imaginaire), les
 * commissions et le dû aux auteurs n'existent qu'agrégés sur toute la période.
 */
export function RevenueChart({ data }: { data: RevenueTimeseriesPoint[] }) {
  const points = data.map((point) => ({
    date: point.date,
    revenueCollected: Number(point.revenueCollected),
  }));

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <AreaChart data={points} margin={{ left: 8, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-revenueCollected)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-revenueCollected)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(value: string) =>
            new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
          }
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value) =>
                new Date(String(value)).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                })
              }
              formatter={(value) => [formatPrice(String(value)), " Encaissé"]}
            />
          }
        />
        <Area
          dataKey="revenueCollected"
          type="monotone"
          fill="url(#fillRevenue)"
          stroke="var(--color-revenueCollected)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
