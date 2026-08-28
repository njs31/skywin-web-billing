/**
 * Send labels to TagPro over USB as ESC/POS commands (text + QR).
 * Does NOT use browser Print — that sends PostScript the printer prints as garbage.
 */
import { BUSINESS } from "@/lib/business";
import { getLabelFields, type LabelProduct } from "@/lib/label-render";

function asciiLine(text: string): number[] {
  const safe = text.replace(/[^\x20-\x7E]/g, " ").trim();
  return [...new TextEncoder().encode(safe), 0x0a];
}

/** ESC/POS QR code (model 2) for the product code. */
function escPosQr(data: string): number[] {
  const store = new TextEncoder().encode(data.slice(0, 200));
  const len = store.length + 3;
  return [
    // Model 2
    0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,
    // Module size 4
    0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x04,
    // Error correction M
    0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31,
    // Store data
    0x1d,
    0x28,
    0x6b,
    len & 0xff,
    (len >> 8) & 0xff,
    0x31,
    0x50,
    0x30,
    ...store,
    // Print QR
    0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30,
  ];
}

/** Build one label as native ESC/POS bytes (not PostScript, not PDF). */
export function buildEscPosLabel(product: LabelProduct): Uint8Array {
  const { code, rate, exp, name } = getLabelFields(product);
  const bytes: number[] = [
    0x1b,
    0x40, // init
    0x1b,
    0x61,
    0x01, // center
    0x1b,
    0x45,
    0x01, // bold on
    ...asciiLine(BUSINESS.name),
    0x1b,
    0x45,
    0x00,
    ...asciiLine(`(${BUSINESS.tagline})`),
    0x1b,
    0x45,
    0x01,
    ...asciiLine(name.slice(0, 36)),
    0x1b,
    0x45,
    0x00,
    0x1b,
    0x61,
    0x00, // left
    ...asciiLine(code),
    ...asciiLine(`EXP: ${exp}`),
    ...asciiLine(`RATE: ${rate.toFixed(2)}`),
    0x1b,
    0x61,
    0x01, // center QR
    ...escPosQr(code),
    0x1b,
    0x64,
    0x04, // feed
  ];
  return new Uint8Array(bytes);
}

async function findBulkOutEndpoint(device: USBDevice) {
  if (device.configuration === null) {
    await device.selectConfiguration(1);
  }
  const config = device.configuration;
  if (!config) throw new Error("USB device has no configuration");

  for (const iface of config.interfaces) {
    for (const alt of iface.alternates) {
      const outEp = alt.endpoints.find((e: USBEndpoint) => e.direction === "out");
      if (outEp) {
        return {
          interfaceNumber: iface.interfaceNumber,
          alternateSetting: alt.alternateSetting,
          endpointNumber: outEp.endpointNumber,
          packetSize: outEp.packetSize,
        };
      }
    }
  }
  throw new Error("No USB output endpoint found on this device");
}

export function isUsbPrintSupported() {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.usb !== "undefined" &&
    typeof window !== "undefined"
  );
}

/** Print labels over USB using ESC/POS. Chrome/Edge + USB cable only. */
export async function printLabelsViaUsb(products: LabelProduct[]) {
  if (!isUsbPrintSupported()) {
    throw new Error(
      "USB print needs Google Chrome on a computer with the TagPro plugged in by USB."
    );
  }
  if (products.length === 0) return;

  const device = await navigator.usb!.requestDevice({ filters: [] });
  await device.open();
  try {
    const ep = await findBulkOutEndpoint(device);
    await device.claimInterface(ep.interfaceNumber);
    try {
      await device.selectAlternateInterface(
        ep.interfaceNumber,
        ep.alternateSetting
      );
      const chunk = Math.max(ep.packetSize, 64);

      for (const product of products) {
        const payload = buildEscPosLabel(product);
        for (let i = 0; i < payload.length; i += chunk) {
          const slice = payload.subarray(i, i + chunk);
          await device.transferOut(ep.endpointNumber, new Uint8Array(slice));
        }
        if (products.length > 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    } finally {
      await device.releaseInterface(ep.interfaceNumber);
    }
  } finally {
    await device.close();
  }
}
