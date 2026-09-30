import { gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { labelPrints } from "@/db/schema";

/** Sources recorded in label_prints.source. */
export const LABEL_PRINT_SOURCES = ["products-page", "api"] as const;
export type LabelPrintSource = (typeof LABEL_PRINT_SOURCES)[number];

/** Server-local midnight, same convention as the dashboard's "today" totals. */
export function startOfToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

export async function getTodayLabelCount(): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${labelPrints.labelCount}), 0)::int`,
    })
    .from(labelPrints)
    .where(gte(labelPrints.createdAt, startOfToday()));
  return row?.total ?? 0;
}

export async function logLabelPrint(args: {
  productId?: number | null;
  labelCount: number;
  source: LabelPrintSource;
}) {
  const labelCount = Math.floor(args.labelCount);
  if (!Number.isFinite(labelCount) || labelCount < 1) {
    throw new Error("labelCount must be a positive integer");
  }
  await db.insert(labelPrints).values({
    productId: args.productId ?? null,
    labelCount,
    source: args.source,
  });
}
