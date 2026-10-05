import { db } from "@/db";
import { sql } from "drizzle-orm";
import {
  formatReceiptVoucherNo,
  getIndianFinancialYearBounds,
} from "@/lib/financial-year";

type TxLike = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

async function nextReceiptSeq(tx: TxLike, date = new Date()): Promise<{
  seq: number;
  shortLabel: string;
}> {
  const { start, end, shortLabel } = getIndianFinancialYearBounds(date);
  const like = `RCP/%/${shortLabel}`;
  const rows = (await tx.execute(sql`
    select coalesce(max(nullif(substring(voucher_no from 'RCP/0*([0-9]+)/'), '')::int), 0) + 1 as next_seq
    from party_payments
    where voucher_no like ${like}
      and date >= ${start.toISOString()}::timestamptz
      and date <= ${end.toISOString()}::timestamptz
  `)) as unknown as Array<{ next_seq: number | string }>;
  return { seq: Number(rows[0]?.next_seq ?? 1), shortLabel };
}

export async function allocateReceiptVoucherNo(
  tx: TxLike,
  date = new Date()
): Promise<string> {
  const { seq, shortLabel } = await nextReceiptSeq(tx, date);
  return formatReceiptVoucherNo(seq, shortLabel);
}

/** Preview only — the number is assigned at save and may skip ahead. */
export async function peekNextReceiptVoucherNo(): Promise<string> {
  const { seq, shortLabel } = await nextReceiptSeq(db);
  return formatReceiptVoucherNo(seq, shortLabel);
}
