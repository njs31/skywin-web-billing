import type { OrderView } from "@/lib/field-order-view";

/**
 * Every word typed must appear somewhere in the order: order id, invoice, farmer, phone,
 * officer, payment id, waybill or a product name. Phone numbers match with or without spaces.
 */
export function orderMatches(o: OrderView, query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const phone = o.farmerPhone.replace(/\D/g, "");
  const text = [
    o.orderId,
    o.invoiceNo,
    o.farmerName,
    o.farmerPhone,
    phone,
    o.placedBy,
    o.paymentId,
    o.waybill,
    o.source === "qwicks" ? "qwicksapp qwicks" : "field app",
    ...o.goods.map((g) => g.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const compactPhoneQuery = query.replace(/[\s+-]/g, "");
  if (/^\d{4,}$/.test(compactPhoneQuery) && (phone.includes(compactPhoneQuery) || phone.includes(compactPhoneQuery.slice(-10)))) return true;
  return words.every((w) => text.includes(w));
}
