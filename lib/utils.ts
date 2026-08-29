import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | string) {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(num || 0);
}

export function formatNumber(value: number | string, decimals = 2) {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num || 0);
}

/**
 * Format a GST / tax rate for display: up to 2 decimals, trailing zeros trimmed.
 * `2.5 -> "2.5"`, `9 -> "9"`, `2.25 -> "2.25"`. Use this instead of
 * `formatNumber(rate, 0)` so a 2.5% half-rate does not round up to 3%.
 */
export function formatRate(value: number | string) {
  const num = typeof value === "string" ? parseFloat(value) : value;
  const safe = Number.isFinite(num) ? num : 0;
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(safe);
}

export function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const num = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(num) ? num : 0;
}

export function formatDateTimeIST(date: Date | string | number) {
  return new Date(date).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  });
}

export function formatDateIST(date: Date | string | number) {
  return new Date(date).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
  });
}
