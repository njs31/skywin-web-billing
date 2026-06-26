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

export function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const num = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(num) ? num : 0;
}
