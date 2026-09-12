import { getEinvoiceCandidates, EINVOICE_REPORTING_WINDOW_DAYS } from "@/lib/queries/einvoice";
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
import { PushEinvoiceButton } from "@/components/einvoice/push-einvoice-button";
import { GenerateEwbButton } from "@/components/einvoice/generate-ewb-button";

/**
 * e-Invoice / e-Way Bill queue — NOT linked from the sidebar nav yet.
 * See the "build the Zoho e-invoice/e-way feature" work: this page, its two
 * action buttons, and lib/zoho/* + lib/actions/einvoice.ts are built and
 * typechecked but deliberately not deployed — no schema migration has been
 * run against the live database and this route isn't reachable until both
 * happen on purpose.
 */

function daysUntilExpiry(date: Date) {
  const deadline = new Date(date);
  deadline.setDate(deadline.getDate() + EINVOICE_REPORTING_WINDOW_DAYS);
  return Math.ceil((deadline.getTime() - Date.now()) / 86_400_000);
}

export default async function EinvoicePage() {
  const rows = await getEinvoiceCandidates();

  const pending = rows.filter(
    (r) => r.einvoiceStatus === "none" || r.einvoiceStatus === "pending"
  );
  const pushed = rows.filter((r) => r.einvoiceStatus === "pushed");
  const failed = rows.filter((r) => r.einvoiceStatus === "failed");

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">e-Invoice / e-Way Bill</h1>
        <p className="text-sm text-slate-500">
          B2B sales (customer GSTIN present) from the last {EINVOICE_REPORTING_WINDOW_DAYS}{" "}
          days — the IRP won&apos;t accept anything older. Generate an e-Way Bill only for
          consignments that actually need one under your state&apos;s threshold; this list
          doesn&apos;t compute that for you.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Pending e-Invoice ({pending.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pending.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">Nothing pending.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Deadline</TableHead>
                  <TableHead className="text-right">e-Invoice</TableHead>
                  <TableHead className="text-right">e-Way Bill</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((r) => {
                  const daysLeft = daysUntilExpiry(new Date(r.date));
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.invoiceNo}</TableCell>
                      <TableCell>{formatDateIST(r.date)}</TableCell>
                      <TableCell>{r.customerName}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(r.grandTotal)}
                      </TableCell>
                      <TableCell
                        className={`text-right ${daysLeft <= 5 ? "font-semibold text-red-600" : "text-slate-500"}`}
                      >
                        {daysLeft}d
                      </TableCell>
                      <TableCell className="text-right">
                        <PushEinvoiceButton
                          saleId={r.id}
                          irn={r.irn}
                          einvoiceStatus={r.einvoiceStatus}
                          einvoiceError={r.einvoiceError}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <GenerateEwbButton
                          saleId={r.id}
                          ewbNo={r.ewbNo}
                          ewbStatus={r.ewbStatus}
                          ewbValidUntil={
                            r.ewbValidUntil ? formatDateIST(r.ewbValidUntil) : null
                          }
                          ewbError={r.ewbError}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {failed.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-base text-red-700">
              Failed ({failed.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {failed.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 text-sm">
                <span className="font-medium">{r.invoiceNo}</span>
                <span className="flex-1 truncate text-red-600">{r.einvoiceError}</span>
                <PushEinvoiceButton
                  saleId={r.id}
                  irn={r.irn}
                  einvoiceStatus={r.einvoiceStatus}
                  einvoiceError={r.einvoiceError}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pushed ({pushed.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pushed.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">None yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">IRN</TableHead>
                  <TableHead className="text-right">e-Way Bill</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pushed.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.invoiceNo}</TableCell>
                    <TableCell>{formatDateIST(r.date)}</TableCell>
                    <TableCell>{r.customerName}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(r.grandTotal)}
                    </TableCell>
                    <TableCell className="text-right">
                      <PushEinvoiceButton
                        saleId={r.id}
                        irn={r.irn}
                        einvoiceStatus={r.einvoiceStatus}
                        einvoiceError={r.einvoiceError}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <GenerateEwbButton
                        saleId={r.id}
                        ewbNo={r.ewbNo}
                        ewbStatus={r.ewbStatus}
                        ewbValidUntil={
                          r.ewbValidUntil ? formatDateIST(r.ewbValidUntil) : null
                        }
                        ewbError={r.ewbError}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
