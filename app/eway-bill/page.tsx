import { Truck } from "lucide-react";
import { getEinvoiceCandidates } from "@/lib/queries/einvoice";
import { formatCurrency, formatDateIST } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GenerateEwbButton } from "@/components/einvoice/generate-ewb-button";

const STATUS_LABEL: Record<string, string> = {
  none: "Not generated",
  pending: "Pending",
  generated: "Generated",
  failed: "Failed",
  cancelled: "Cancelled",
};

export default async function EwayBillPage() {
  // Same candidate list as the e-Invoice page (it already carries ewb*
  // fields) — in practice an e-way bill is generated close to dispatch
  // time, so it's fine that this is scoped to the same recent window.
  const rows = await getEinvoiceCandidates();
  const needsEwb = rows.filter((r) => !r.ewbNo || r.ewbStatus === "failed");
  const done = rows.filter((r) => r.ewbNo && r.ewbStatus !== "failed");

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Truck className="h-8 w-8 text-emerald-600" />
        <div>
          <h1 className="text-2xl font-bold">e-Way Bill</h1>
          <p className="text-sm text-slate-500">
            Generate an e-way bill for a dispatched consignment — vehicle
            number, transporter and approximate distance are entered per
            invoice when you generate it.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending ({needsEwb.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {needsEwb.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Nothing waiting — every recent B2B invoice already has an
              e-way bill.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {needsEwb.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.invoiceNo}</TableCell>
                    <TableCell>{formatDateIST(row.date)}</TableCell>
                    <TableCell>{row.customerName}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(row.grandTotal)}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-slate-500">
                        {STATUS_LABEL[row.ewbStatus] ?? row.ewbStatus}
                      </span>
                      {row.ewbError && (
                        <p className="max-w-[240px] text-[11px] text-red-600">
                          {row.ewbError}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <GenerateEwbButton
                        saleId={row.id}
                        ewbNo={row.ewbNo}
                        ewbStatus={row.ewbStatus}
                        ewbValidUntil={
                          row.ewbValidUntil
                            ? formatDateIST(row.ewbValidUntil)
                            : null
                        }
                        ewbError={row.ewbError}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {done.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Generated ({done.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">e-Way Bill</TableHead>
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
                      <GenerateEwbButton
                        saleId={row.id}
                        ewbNo={row.ewbNo}
                        ewbStatus={row.ewbStatus}
                        ewbValidUntil={
                          row.ewbValidUntil
                            ? formatDateIST(row.ewbValidUntil)
                            : null
                        }
                        ewbError={row.ewbError}
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
