"use server";

import { requireNonDealer } from "@/lib/actions/auth";
import { getActivityLogs as getActivityLogsQuery } from "@/lib/queries/activity-logs";

export async function getActivityLogs(opts: {
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  await requireNonDealer();
  return getActivityLogsQuery(opts);
}
