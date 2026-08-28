/**
 * Send labels to the POSiFLOW label printer over USB.
 *
 * Never uses the browser's Print dialog: that hands the printer a PDF or
 * PostScript stream, which a raw thermal printer happily prints as pages of
 * source code. We build the printer's own command language and push the bytes
 * down a bulk endpoint ourselves.
 */
import { renderLabelRaster, type LabelProduct, type LabelRaster } from "@/lib/label-render";
import {
  buildTsplCalibration,
  buildTsplJob,
  concatBytes,
  type TsplOptions,
} from "@/lib/tspl-print";

export type PrinterLanguage = "tspl" | "escpos";

export type EscPosRaster = {
  bytesPerRow: number;
  height: number;
  bytes: Uint8Array;
};

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
    0x1b, 0x40, // initialize
    0x1b, 0x33, 0x18, // compact line spacing after the image
    // GS v 0: print a monochrome raster image at native dot pitch.
    0x1d, 0x76, 0x30, 0x00,
    bytesPerRow & 0xff,
    (bytesPerRow >> 8) & 0xff,
    height & 0xff,
    (height >> 8) & 0xff,
  ]);
  const footer = Uint8Array.from([0x0a, 0x1b, 0x64, 0x02]);
  return concatBytes([header, raster, footer]);
}

export function buildEscPosJob(rasters: LabelRaster[], copies = 1) {
  const qty = Math.max(1, Math.min(99, Math.trunc(copies)));
  const parts: Uint8Array[] = [];
  for (const raster of rasters) {
    const label = buildEscPosRasterCommand(raster);
    for (let i = 0; i < qty; i++) parts.push(label);
  }
  return concatBytes(parts);
}

export type PrintJobOptions = TsplOptions & { language?: PrinterLanguage };

/** Turn products into a finished byte stream for the chosen printer language. */
export async function buildLabelJob(
  products: LabelProduct[],
  options: PrintJobOptions = {}
) {
  const { language = "tspl", copies = 1 } = options;
  const rasters: LabelRaster[] = [];
  for (const product of products) {
    rasters.push(await renderLabelRaster(product));
  }
  return language === "escpos"
    ? buildEscPosJob(rasters, copies)
    : buildTsplJob(rasters, options);
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
 * Reuse a printer the user already picked. Chrome remembers the grant per
 * site, so after the first time there is no chooser dialog at all.
 */
async function acquirePrinter() {
  const granted = await navigator.usb!.getDevices();
  const remembered = granted.find((device) =>
    device.configurations.some((config) =>
      config.interfaces.some((iface) =>
        iface.alternates.some((alt) => alt.interfaceClass === 7)
      )
    )
  );
  return remembered ?? (await navigator.usb!.requestDevice({ filters: [] }));
}

/**
 * Where to go to release the printer from the OS.
 *
 * A printer installed as a system printer is owned by the kernel print
 * driver, and Chrome is then refused access to it entirely. This is the
 * single most common reason direct printing fails.
 */
function releaseInstructions() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/Windows/i.test(ua)) {
    return (
      "On Windows: Settings → Bluetooth & devices → Printers & scanners → " +
      "POSiFLOW → Remove. Then unplug the USB cable and plug it back in."
    );
  }
  if (/Mac OS X|Macintosh/i.test(ua)) {
    return (
      "On Mac: System Settings → Printers & Scanners → POSiFLOW → Remove " +
      "Printer. Then unplug the USB cable and plug it back in."
    );
  }
  if (/Linux|X11/i.test(ua)) {
    return "On Linux: remove the printer from CUPS, or add a udev rule granting access.";
  }
  return "Remove the POSiFLOW from your computer's printer list, then replug the cable.";
}

async function openDevice(device: USBDevice) {
  try {
    await device.open();
  } catch {
    throw new Error(
      "Your computer's printing system is holding the POSiFLOW, so the browser " +
        "cannot talk to it directly.\n\n" +
        releaseInstructions() +
        "\n\nAlso close the POSiFLOW / Easy Label app and any other tab printing " +
        "to it.\n\nIf you would rather keep the printer installed, use " +
        "“Print via printer driver” instead — that prints the same label through " +
        "the driver you already have."
    );
  }
}

async function sendToPrinter(payload: Uint8Array) {
  const device = await acquirePrinter();
  await openDevice(device);
  try {
    const ep = await findBulkOutEndpoint(device);
    try {
      await device.claimInterface(ep.interfaceNumber);
    } catch {
      throw new Error(
        "The printer opened but is still held by the system print driver.\n\n" +
          releaseInstructions()
      );
    }
    try {
      await device.selectAlternateInterface(ep.interfaceNumber, ep.alternateSetting);
      const chunk = Math.max(ep.packetSize, 64);
      for (let i = 0; i < payload.length; i += chunk) {
        await device.transferOut(
          ep.endpointNumber,
          new Uint8Array(payload.subarray(i, i + chunk))
        );
      }
    } finally {
      await device.releaseInterface(ep.interfaceNumber);
    }
  } finally {
    await device.close();
  }
}

function assertSupported() {
  if (!isUsbPrintSupported()) {
    throw new Error(
      "USB print needs Google Chrome or Edge on a computer with the POSiFLOW plugged in by USB."
    );
  }
}

/** Print labels over USB. Chrome/Edge + USB cable only. */
export async function printLabelsViaUsb(
  products: LabelProduct[],
  options: PrintJobOptions = {}
) {
  assertSupported();
  if (products.length === 0) return;
  await sendToPrinter(await buildLabelJob(products, options));
}

/**
 * Ask the printer to re-measure the gap between stickers. Run this when
 * labels start creeping up or down the roll.
 */
export async function calibrateLabelGap(options: TsplOptions = {}) {
  assertSupported();
  await sendToPrinter(buildTsplCalibration(options));
}

/* ------------------------------------------------------------------ *
 * Serial transport
 *
 * On Windows a USB printer-class device is owned by usbprint.sys and
 * WebUSB is refused outright, whether or not a working vendor driver is
 * installed. A serial port is not locked that way, so pairing the printer
 * over Bluetooth (it shows up as a COM port) lets the identical TSPL job
 * through with no driver at all.
 * ------------------------------------------------------------------ */

export function isSerialPrintSupported() {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.serial !== "undefined" &&
    typeof window !== "undefined"
  );
}

async function acquireSerialPort() {
  const granted = await navigator.serial!.getPorts();
  return granted[0] ?? (await navigator.serial!.requestPort());
}

async function sendViaSerial(payload: Uint8Array, baudRate: number) {
  const port = await acquireSerialPort();
  await port.open({ baudRate });
  try {
    const writable = port.writable;
    if (!writable) throw new Error("The selected serial port cannot be written to.");
    const writer = writable.getWriter();
    try {
      // Bluetooth SPP links drop bytes if a whole label is pushed at once.
      const chunk = 1024;
      for (let i = 0; i < payload.length; i += chunk) {
        await writer.write(new Uint8Array(payload.subarray(i, i + chunk)));
      }
    } finally {
      await writer.close().catch(() => writer.releaseLock());
    }
  } finally {
    await port.close().catch(() => {});
  }
}

/**
 * Print over a serial/Bluetooth port. Same bytes as the USB path — only the
 * wire differs.
 */
export async function printLabelsViaSerial(
  products: LabelProduct[],
  options: PrintJobOptions & { baudRate?: number } = {}
) {
  if (!isSerialPrintSupported()) {
    throw new Error(
      "Serial printing needs Google Chrome or Edge on a computer. Update the browser and try again."
    );
  }
  if (products.length === 0) return;
  await sendViaSerial(await buildLabelJob(products, options), options.baudRate ?? 9600);
}
