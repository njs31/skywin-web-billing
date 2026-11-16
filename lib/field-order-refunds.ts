import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sales } from "@/db/schema";
import { remainingRefundPaise } from "@/lib/field-order-refund-rules";
import { getRazorpayPayment, refundRazorpayPayment } from "@/lib/payments/razorpay";
import { razorpayPaymentIdFromNotes } from "@/lib/queries/field-orders";

export { refundAmountPaise, remainingRefundPaise } from "@/lib/field-order-refund-rules";

/**
 * Refund a field order through Razorpay.
 * Pass amountPaise null to refund whatever is still captured (used when an admin cancels).
 * Orders with no Razorpay payment are left unchanged so a cash invoice can still be cancelled.
 */
export async function refundFieldPayment(input: {
  saleId: number;
  amountPaise: number | null;
  reason: string;
  actorName: string;
}) {
  return db.transaction(async (tx) => {
    const [sale] = await tx
      .select({
        id: sales.id,
        invoiceNo: sales.invoiceNo,
        status: sales.status,
        notes: sales.notes,
      })
      .from(sales)
      .where(eq(sales.id, input.saleId))
      .for("update")
      .limit(1);

    if (!sale) throw new Error("Order not found.");
    if (sale.status === "cancelled") {
      throw new Error(`Invoice ${sale.invoiceNo} is already cancelled.`);
    }

    const paymentId = razorpayPaymentIdFromNotes(sale.notes);
    if (!paymentId) {
      if (input.amountPaise == null) {
        return { skipped: true as const, paymentId: null, refundId: null, amountRupees: 0 };
      }
      throw new Error("This order has no Razorpay payment, so it cannot be refunded.");
    }

    const payment = await getRazorpayPayment(paymentId);
    const remaining = remainingRefundPaise(Number(payment.amount) || 0, Number(payment.amount_refunded) || 0);
    const already = Number(payment.amount_refunded) || 0;
    if (input.amountPaise != null) {
      if (input.amountPaise < 100) throw new Error("The minimum refund is ₹1.");
      if (input.amountPaise > remaining) {
        throw new Error(`Only ₹${(remaining / 100).toFixed(2)} is left to refund.`);
      }
    }
    const paise = input.amountPaise == null ? remaining : input.amountPaise;
    if (paise <= 0) {
      await tx
        .update(sales)
        .set({ refundedAmount: (already / 100).toFixed(2) })
        .where(eq(sales.id, sale.id));
      return { skipped: true as const, paymentId, refundId: null, amountRupees: 0 };
    }

    const refund = await refundRazorpayPayment({
      paymentId,
      amountPaise: paise,
      receipt: `sale-${sale.id}-${already + paise}`.slice(0, 40),
      notes: {
        invoice: sale.invoiceNo,
        reason: input.reason.slice(0, 200),
        actor: input.actorName.slice(0, 80),
      },
    });
    const refundedPaise = already + (Number(refund.amount) || paise);
    const amountRupees = (Number(refund.amount) || paise) / 100;
    const notes = [sale.notes?.trim(), `Refund ${refund.id} ₹${amountRupees.toFixed(2)}`].filter(Boolean).join(" · ");
    await tx
      .update(sales)
      .set({
        refundedAmount: (refundedPaise / 100).toFixed(2),
        notes,
      })
      .where(eq(sales.id, sale.id));
    return {
      skipped: false as const,
      paymentId,
      refundId: refund.id ?? null,
      amountRupees,
    };
  });
}
