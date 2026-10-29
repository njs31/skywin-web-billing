"use server";

import { requireMatrix, requireNonDealer } from "@/lib/actions/auth";
import { getActivityLogs as getActivityLogsQuery } from "@/lib/queries/activity-logs";

export async function getActivityLogs(opts: {
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  await requireNonDealer();
  await requireMatrix("logs", "view");
  return getActivityLogsQuery(opts);
}
