export const FIELD_PAYMENT_MODES = ["upi", "cash", "credit", "card", "cheque", "neft"] as const;
export type FieldPaymentMode = (typeof FIELD_PAYMENT_MODES)[number];

export function digitsPhone(phone?: string | null) {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function normalizePaymentMode(value: unknown): FieldPaymentMode | undefined {
  const mode = String(value ?? "").trim().toLowerCase();
  return (FIELD_PAYMENT_MODES as readonly string[]).includes(mode) ? (mode as FieldPaymentMode) : undefined;
}

export type FarmerFieldErrors = {
  name?: string;
  phone?: string;
  pin?: string;
  altPhone?: string;
  points?: string;
  acres?: string;
  payment?: string;
};

export function farmerFieldErrors(input: {
  name?: string;
  phone?: string;
  pinCode?: string;
  altPhone?: string;
  rewardPoints?: number;
  paymentMode?: string;
  farms?: Array<{ acres?: number }>;
  requirePhone?: boolean;
}): FarmerFieldErrors {
  const errors: FarmerFieldErrors = {};
  if (!input.name?.trim()) errors.name = "Name is required.";
  if (input.requirePhone) {
    const phone = digitsPhone(input.phone);
    if (phone.length !== 10) errors.phone = "Enter a 10-digit phone number.";
  }
  const pin = input.pinCode?.trim() ?? "";
  if (pin && !/^\d{6}$/.test(pin)) errors.pin = "PIN must be 6 digits.";
  const alt = input.altPhone?.trim() ?? "";
  if (alt && digitsPhone(alt).length !== 10) errors.altPhone = "Alternate phone must be 10 digits.";
  if (input.rewardPoints !== undefined && (!Number.isFinite(input.rewardPoints) || input.rewardPoints < 0)) {
    errors.points = "Reward points must be zero or more.";
  }
  if (input.paymentMode !== undefined && !normalizePaymentMode(input.paymentMode)) {
    errors.payment = "Choose a payment method.";
  }
  if (input.farms?.some((farm) => !Number.isFinite(farm.acres ?? 0) || (farm.acres ?? 0) < 0)) {
    errors.acres = "Acreage must be zero or more.";
  }
  return errors;
}

export function farmerFieldErrorList(errors: FarmerFieldErrors) {
  return Object.values(errors).filter((message): message is string => Boolean(message));
}

/** Login phone is the account key. A different number is a different account. */
export function loginPhoneChanged(current: string | null | undefined, next: string | null | undefined) {
  if (next === undefined || next === null) return false;
  const incoming = digitsPhone(next);
  if (!incoming) return false;
  return incoming !== digitsPhone(current);
}
