/**
 * Send labels to POSiFLOW PSF20 over USB as ESC/POS raster graphics.
 * Does NOT use browser Print — that sends PostScript the printer prints as garbage.
 */
import { renderLabelRaster, type LabelProduct } from "@/lib/label-render";

export type EscPosRaster = {
  bytesPerRow: number;
  height: number;
  bytes: Uint8Array;
};

function concatBytes(...parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Encode a monochrome image with the ESC/POS GS v 0 raster-image command. */
export function buildEscPosRasterCommand({
  bytesPerRow,
  height,
  bytes: raster,
}: EscPosRaster): Uint8Array {
  if (bytesPerRow < 1 || bytesPerRow > 0xffff || height < 1 || height > 0xffff) {
    throw new Error("Label image dimensions are outside the printer's supported range.");
  }
  if (raster.length !== bytesPerRow * height) {
    throw new Error("Label image data does not match its declared dimensions.");
  }

  const header = Uint8Array.from([
    0x1b,
    0x40, // initialize
    0x1b,
    0x33,
    0x18, // compact line spacing after the image
    // GS v 0: print a monochrome raster image, native 203 DPI label pixels.
    0x1d,
    0x76,
    0x30,
    0x00,
    bytesPerRow & 0xff,
    (bytesPerRow >> 8) & 0xff,
    height & 0xff,
    (height >> 8) & 0xff,
  ]);
  const footer = Uint8Array.from([
    0x0a,
    0x1b,
    0x64,
    0x02, // feed just enough to clear the tear edge
  ]);
  return concatBytes(header, raster, footer);
}

/** Build one label as native ESC/POS raster bytes (not PostScript or HTML). */
export async function buildEscPosLabel(product: LabelProduct): Promise<Uint8Array> {
  return buildEscPosRasterCommand(await renderLabelRaster(product));
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
      "USB print needs Google Chrome on a computer with the POSiFLOW plugged in by USB."
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
        const payload = await buildEscPosLabel(product);
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
