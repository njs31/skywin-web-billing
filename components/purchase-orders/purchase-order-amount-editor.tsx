"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePurchaseOrderAmounts } from "@/lib/actions/purchase-orders";
import { formatCurrency, toNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type EditItem = {
  id: number;
  name: string;
  hsnCode: string | null;
  qty: string;
  rate: string;
  amount: string;
};

export function PurchaseOrderAmountEditor({
  purchaseOrderId,
  items,
}: {
  purchaseOrderId: number;
  items: Array<{
    id: number;
    productName: string | null;
    customName: string | null;
    hsnCode: string | null;
    qty: string;
    rate: string;
    amount: string;
  }>;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<EditItem[]>(
    items.map((item) => ({
      id: item.id,
      name: item.productName ?? item.customName ?? "Item",
      hsnCode: item.hsnCode,
      qty: String(toNumber(item.qty)),
      rate: String(toNumber(item.rate)),
      amount: item.amount,
    }))
  );
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const total = useMemo(
    () =>
      rows.reduce((sum, row) => {
        const qty = parseFloat(row.qty) || 0;
        const rate = parseFloat(row.rate) || 0;
        return sum + Math.round(qty * rate * 100) / 100;
      }, 0),
    [rows]
  );

  const save = () => {
    setError("");
    const payload = rows.map((row) => ({
      id: row.id,
      qty: parseFloat(row.qty),
      rate: parseFloat(row.rate),
    }));
    if (payload.some((p) => !Number.isFinite(p.qty) || p.qty <= 0)) {
      setError("Each line quantity must be greater than 0.");
      return;
    }
    if (payload.some((p) => !Number.isFinite(p.rate) || p.rate < 0)) {
      setError("Each line rate must be a valid number.");
      return;
    }
    startTransition(async () => {
      try {
        await updatePurchaseOrderAmounts({
          id: purchaseOrderId,
          items: payload,
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update PO");
      }
    });
  };

  return (
    <Card className="no-print mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Edit Purchase Order Amounts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="w-28">Qty</TableHead>
              <TableHead className="w-32">Rate</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => {
              const qty = parseFloat(row.qty) || 0;
              const rate = parseFloat(row.rate) || 0;
              const amount = Math.round(qty * rate * 100) / 100;
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-medium">{row.name}</p>
                    {row.hsnCode && (
                      <p className="text-xs text-slate-500">HSN {row.hsnCode}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={row.qty}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, qty: e.target.value } : r
                          )
                        )
                      }
                      className="h-9"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.rate}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, rate: e.target.value } : r
                          )
                        )
                      }
                      className="h-9"
                    />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(amount)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">
            New Total: {formatCurrency(total)}
          </p>
          <Button onClick={save} disabled={isPending}>
            {isPending ? "Saving…" : "Save Amounts"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
