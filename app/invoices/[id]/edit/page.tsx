import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSaleById, getSaleEditability } from "@/lib/queries/sales";
import { getCustomers } from "@/lib/queries/customers";
import { getSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  EditInvoiceForm,
  type EditableLine,
} from "@/components/invoices/edit-invoice-form";

let lineSeq = 0;

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const saleId = parseInt(id, 10);
  const [currentUser, sale, customers, settings] = await Promise.all([
    getCurrentUser(),
    getSaleById(saleId),
    getCustomers(),
    getSettings(),
  ]);
  if (currentUser?.role !== "admin") redirect("/invoices");
  if (!sale) notFound();

  const { editable, reasons } = await getSaleEditability(saleId);

  const initialLines: EditableLine[] = sale.items.map((it, i) => ({
    key: `existing-${it.id}-${i}-${lineSeq++}`,
    productId: it.productId,
    name: it.productName ?? it.customName ?? "Item",
    customName: it.customName ?? "",
    qty: String(it.qty ?? ""),
    rate: String(it.rate ?? ""),
    discountPercent: String(it.discountPercent ?? "0"),
    discountType: it.discountType === "value" ? "value" : "percent",
    discountValue: String(it.discountValue ?? it.discountPercent ?? "0"),
    gstRate: String(it.gstRate ?? ""),
    hsnCode: it.hsnCode ?? "",
    unit: it.unit ?? "",
  }));

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Edit {sale.invoiceNo}</h1>
          <p className="text-sm text-slate-500">
            Invoice number, date and bill type never change on edit.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/invoices/${sale.id}`}>Back to invoice</Link>
        </Button>
      </div>

      {!editable ? (
        <Card>
          <CardContent className="space-y-2 p-6">
            <p className="font-medium">This invoice can&apos;t be edited right now:</p>
            <ul className="list-disc pl-5 text-sm text-slate-600">
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <EditInvoiceForm
          saleId={sale.id}
          invoiceNo={sale.invoiceNo}
          initialLines={initialLines}
          initialCustomerId={sale.customerId}
          initialCustomerName={sale.customerName}
          initialPaymentMode={sale.paymentMode}
          initialCashAmount={String(sale.cashAmount ?? "0")}
          initialUpiAmount={String(sale.upiAmount ?? "0")}
          initialPaidAmount={String(sale.paidAmount ?? "0")}
          initialDiscountAmount={String(sale.discountAmount ?? "0")}
          initialNotes={sale.notes}
          initialVehicleNo={sale.vehicleNo}
          initialTransporterName={sale.transporterName}
          initialTransporterGstin={sale.transporterGstin}
          initialDistanceKm={sale.distanceKm}
          customers={customers.map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            gstin: c.gstin,
          }))}
          businessStateCode={settings.stateCode}
        />
      )}
    </div>
  );
}
