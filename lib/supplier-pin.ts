/** Confirmation PIN required to edit or delete suppliers. */
export const SUPPLIER_CONFIRM_PIN = "7596";

export function assertSupplierConfirmPin(pin: string | undefined | null) {
  if (!pin || pin.trim() !== SUPPLIER_CONFIRM_PIN) {
    throw new Error("Incorrect PIN. Access denied.");
  }
}
