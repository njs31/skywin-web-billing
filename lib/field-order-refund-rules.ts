/** Rupees typed by an admin, checked against the paise still held by Razorpay. */
export function refundAmountPaise(amount: string, remainingPaise: number) {
  const trimmed = amount.trim();
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Enter a refund amount in rupees, with up to 2 decimal places.");
  }
  const paise = Math.round(Number(trimmed) * 100);
  if (paise < 100) throw new Error("The minimum refund is ₹1.");
  if (paise > remainingPaise) {
    throw new Error(`Only ₹${(Math.max(0, remainingPaise) / 100).toFixed(2)} is left to refund.`);
  }
  return paise;
}

export function remainingRefundPaise(capturedPaise: number, refundedPaise: number) {
  const captured = Number.isFinite(capturedPaise) ? Math.round(capturedPaise) : 0;
  const refunded = Number.isFinite(refundedPaise) ? Math.round(refundedPaise) : 0;
  return Math.max(0, captured - refunded);
}
