export const PRINT_SIZES = ["RECEIPT", "A5", "A4", "A3"] as const;
export type PrintSize = (typeof PRINT_SIZES)[number];

export const PRINT_SIZE_STORAGE_KEY = "skywin-print-size";
export const DEFAULT_PRINT_SIZE: PrintSize = "A4";

const PAGE_MARGINS: Record<PrintSize, string> = {
  RECEIPT: "2mm",
  A5: "8mm",
  A4: "10mm",
  A3: "12mm",
};

/** CSS `@page { size: … }` value — a keyword for sheets, a width for the roll. */
const PAGE_SIZE_RULE: Record<PrintSize, string> = {
  RECEIPT: "80mm auto",
  A5: "A5",
  A4: "A4",
  A3: "A3",
};

export const PRINT_SIZE_LABELS: Record<PrintSize, string> = {
  RECEIPT: "Receipt (80mm)",
  A5: "A5",
  A4: "A4",
  A3: "A3",
};

export function isPrintSize(value: string | null | undefined): value is PrintSize {
  return (PRINT_SIZES as readonly string[]).includes(value ?? "");
}

export function getStoredPrintSize(): PrintSize {
  if (typeof window === "undefined") return DEFAULT_PRINT_SIZE;
  try {
    const stored = window.localStorage.getItem(PRINT_SIZE_STORAGE_KEY);
    return isPrintSize(stored) ? stored : DEFAULT_PRINT_SIZE;
  } catch {
    return DEFAULT_PRINT_SIZE;
  }
}

export function setStoredPrintSize(size: PrintSize) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRINT_SIZE_STORAGE_KEY, size);
  } catch {
    // ignore quota / private mode
  }
}

export function resolvePrintSize(
  value: string | null | undefined
): PrintSize {
  return isPrintSize(value) ? value : getStoredPrintSize();
}

/** Apply paper size hint before calling window.print(). */
export function applyPrintSize(size?: PrintSize) {
  const next = size ?? getStoredPrintSize();
  document.documentElement.dataset.printSize = next;

  // @page cannot be toggled via attribute selectors reliably — inject a style tag.
  let style = document.getElementById(
    "skywin-print-page-size"
  ) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "skywin-print-page-size";
    document.head.appendChild(style);
  }
  style.textContent = `@page { size: ${PAGE_SIZE_RULE[next]}; margin: ${PAGE_MARGINS[next]}; }`;
  return next;
}

export function triggerPrint(size?: PrintSize) {
  const next = applyPrintSize(size);
  setStoredPrintSize(next);
  window.print();
}

export function buildPrintHref(pathname: string, size: PrintSize) {
  const url = new URL(pathname, "http://local");
  url.searchParams.set("print", "1");
  url.searchParams.set("size", size);
  return `${url.pathname}?${url.searchParams.toString()}`;
}
