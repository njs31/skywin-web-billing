/**
 * Send a label PNG to a USB thermal printer as ESC/POS raster data.
 * Works in Chrome/Edge on desktop with the printer connected by USB cable.
 * Does not use browser Print (which sends PostScript the TagPro cannot read).
 */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function pngDataUrlToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return canvas;
}

/** Convert label canvas to ESC/POS raster (GS v 0). */
export function canvasToEscPosRaster(canvas: HTMLCanvasElement): Uint8Array {
  const w = canvas.width;
  const h = canvas.height;
  const bytesPerRow = Math.ceil(w / 8);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  const { data } = ctx.getImageData(0, 0, w, h);

  const raster: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let bx = 0; bx < bytesPerRow; bx++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = bx * 8 + bit;
        if (x < w) {
          const i = (y * w + x) * 4;
          const gray =
            0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
          if (gray < 168) byte |= 0x80 >> bit;
        }
      }
      raster.push(byte);
    }
  }

  const xL = bytesPerRow & 0xff;
  const xH = (bytesPerRow >> 8) & 0xff;
  const yL = h & 0xff;
  const yH = (h >> 8) & 0xff;

  const out: number[] = [
    0x1b,
    0x40, // ESC @ init
    0x1b,
    0x61,
    0x01, // center align
    0x1d,
    0x76,
    0x30,
    0x00, // GS v 0 raster
    xL,
    xH,
    yL,
    yH,
    ...raster,
    0x1b,
    0x64,
    0x04, // feed 4 lines
  ];
  return new Uint8Array(out);
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

/**
 * Pick the TagPro on USB once and print one or more label PNGs.
 * Requires Chrome or Edge on desktop with a USB cable.
 */
export async function printLabelPngsViaUsb(dataUrls: string[]) {
  if (!isUsbPrintSupported()) {
    throw new Error(
      "Direct USB print needs Chrome or Edge on a computer with the printer plugged in by USB."
    );
  }
  if (dataUrls.length === 0) return;

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

      for (const dataUrl of dataUrls) {
        const canvas = await pngDataUrlToCanvas(dataUrl);
        const payload = canvasToEscPosRaster(canvas);
        for (let i = 0; i < payload.length; i += chunk) {
          const slice = payload.subarray(i, i + chunk);
          await device.transferOut(
            ep.endpointNumber,
            new Uint8Array(slice)
          );
        }
        if (dataUrls.length > 1) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    } finally {
      await device.releaseInterface(ep.interfaceNumber);
    }
  } finally {
    await device.close();
  }
}

/** Print a single label PNG via USB. */
export async function printLabelPngViaUsb(dataUrl: string) {
  await printLabelPngsViaUsb([dataUrl]);
}
