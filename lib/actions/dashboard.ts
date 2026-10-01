"use server";

import { requireUser } from "@/lib/actions/auth";
import { getSalesTrend, getSalesTrendRange } from "@/lib/queries/dashboard";

export type TrendRangeInput =
  | { preset: 7 | 30 | 90 }
  | { preset: "custom"; from: string; to: string };

/**
 * Trend data for the dashboard range switcher. Returns the same point
 * shape the server-rendered chart uses; custom ranges are capped
 * server-side and malformed dates fall back to the last 30 days.
 */
export async function getSalesTrendData(input: TrendRangeInput) {
  await requireUser();
  if (input.preset === "custom") {
    const from = new Date(`${input.from}T00:00:00`);
    const to = new Date(`${input.to}T23:59:59`);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from.getTime() > to.getTime()
    ) {
      return getSalesTrend(30);
    }
    return getSalesTrendRange(from, to);
  }
  const days = input.preset === 7 || input.preset === 90 ? input.preset : 30;
  return getSalesTrend(days);
}
