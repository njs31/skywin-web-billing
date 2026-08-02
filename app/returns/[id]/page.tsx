import Link from "next/link";
import { notFound } from "next/navigation";
import { getSaleReturnById } from "@/lib/queries/returns";
import { formatCurrency, formatDateIST, formatNumber, toNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function CreditNoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const creditNote = await getSaleReturnById(parseInt(id, 10));
  if (!creditNote) notFound();

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Credit Note {creditNote.returnNo}
          </h1>
          <p className="text-sm text-slate-500">
            {formatDateIST(creditNote.date)}
            {creditNote.reason ? ` · ${creditNote.reason}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {creditNote.saleId && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/invoices/${creditNote.saleId}`}>Original Invoice</Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/returns">Back</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-slate-500">Subtotal</p>
            <p className="text-xl font-semibold">
              {formatCurrency(creditNote.subtotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-slate-500">CGST / SGST</p>
            <p className="text-xl font-semibold">
              {formatCurrency(creditNote.cgst)} / {formatCurrency(creditNote.sgst)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-slate-500">Grand Total</p>
            <p className="text-xl font-semibold text-emerald-700">
              {formatCurrency(creditNote.grandTotal)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>HSN</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {creditNote.items.map((item, idx) => (
                <TableRow key={idx}>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell className="font-medium">
                    {item.productName ?? item.customName ?? "Item"}
                  </TableCell>
                  <TableCell>{item.hsnCode ?? "-"}</TableCell>
                  <TableCell className="text-right">
                    {formatNumber(item.qty, 2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(item.rate)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(item.amount)}
                  </TableCell>
                </TableRow>
              ))}
              {creditNote.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-400">
                    No line items
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {(toNumber(creditNote.cgst) > 0 || toNumber(creditNote.sgst) > 0) && (
        <p className="text-xs text-slate-500">
          Tax breakdown is taken from the credit note totals recorded at return time.
        </p>
      )}
    </div>
  );
}
