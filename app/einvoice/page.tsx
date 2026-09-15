import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import {
  getEinvoiceCandidates,
  einvoiceMissingFields,
  EINVOICE_REPORTING_WINDOW_DAYS,
} from "@/lib/queries/einvoice";
import { formatCurrency, formatDateIST } from "@/lib/utils";
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
import { PushEinvoiceButton } from "@/components/einvoice/push-einvoice-button";

export default async function EinvoicePage() {
  const rows = await getEinvoiceCandidates();
  const needsPush = rows.filter((r) => !r.irn || r.einvoiceStatus === "failed");
  const done = rows.filter((r) => r.irn && r.einvoiceStatus !== "failed");

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <FileCheck2 className="h-8 w-8 text-emerald-600" />
        <div>
          <h1 className="text-2xl font-bold">e-Invoice</h1>
          <p className="text-sm text-slate-500">
            Push B2B invoices to Zoho Books for a government IRN. Only active,
            GST invoices from the last {EINVOICE_REPORTING_WINDOW_DAYS} days
            are shown — the IRP won&apos;t accept anything older.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Pending push ({needsPush.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {needsPush.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Nothing waiting — every eligible invoice already has an IRN.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>GSTIN</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Readiness</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {needsPush.map((row) => {
                  const missing = einvoiceMissingFields(row);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.invoiceNo}</TableCell>
                      <TableCell>{formatDateIST(row.date)}</TableCell>
                      <TableCell>{row.customerName}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.customerGstin}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.grandTotal)}
                      </TableCell>
                      <TableCell>
                        {missing.length === 0 ? (
                          <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Ready to push
                          </span>
                        ) : (
                          <span className="text-xs text-amber-700">
                            Missing: {missing.join(", ")}
                          </span>
                        )}
                        {row.einvoiceStatus === "failed" && row.einvoiceError && (
                          <p className="max-w-[240px] text-[11px] text-red-600">
                            {row.einvoiceError}
                          </p>
                        )}
                        {row.zohoSyncError && (
                          <p className="max-w-[240px] text-[11px] text-red-600">
                            Sync error: {row.zohoSyncError}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {missing.length > 0 ? (
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/customers/${row.customerId}`}>
                              Fix customer details
                            </Link>
                          </Button>
                        ) : (
                          <PushEinvoiceButton
                            saleId={row.id}
                            irn={row.irn}
                            einvoiceStatus={row.einvoiceStatus}
                            einvoiceError={row.einvoiceError}
                            ackDate={row.ackDate?.toISOString() ?? null}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {done.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Already pushed ({done.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">IRN</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {done.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.invoiceNo}</TableCell>
                    <TableCell>{formatDateIST(row.date)}</TableCell>
                    <TableCell>{row.customerName}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(row.grandTotal)}
                    </TableCell>
                    <TableCell className="text-right">
                      <PushEinvoiceButton
                        saleId={row.id}
                        irn={row.irn}
                        einvoiceStatus={row.einvoiceStatus}
                        einvoiceError={row.einvoiceError}
                        ackDate={row.ackDate?.toISOString() ?? null}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
