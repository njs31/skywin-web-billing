/**
 * Which command language the label printer on this machine speaks.
 *
 * A per-machine choice, not a per-shop one — same reasoning as
 * TRANSPORT_KEY in thermal-usb-print.ts: it lives in browser storage
 * rather than Settings because it describes hardware plugged into this
 * specific computer, not a shop-wide preference. Defaults to "escpos"
 * so every machine still printing on the P58D needs no change at all;
 * switch to "tspl" once a TSPL printer replaces it here.
 */
export type PrinterLanguage = "escpos" | "tspl";

const PRINTER_LANGUAGE_KEY = "skywin.labelPrinterLanguage";

export function getPrinterLanguage(): PrinterLanguage {
  try {
    return localStorage.getItem(PRINTER_LANGUAGE_KEY) === "tspl" ? "tspl" : "escpos";
  } catch {
    // Private windows and locked-down browsers throw on access.
    return "escpos";
  }
}

export function setPrinterLanguage(language: PrinterLanguage) {
  try {
    localStorage.setItem(PRINTER_LANGUAGE_KEY, language);
  } catch {
    // Not remembering is survivable; it only means picking again.
  }
}
