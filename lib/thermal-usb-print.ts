/**
 * Send labels to the POSiFLOW P58D label printer, with no driver installed.
 *
 * Never uses the browser's Print dialog: that hands the printer a PDF or
 * PostScript stream, which a raw thermal printer prints as pages of source
 * code. We build the printer's own ESC/POS bytes (see lib/escpos-print.ts) and
 * push them down a bulk endpoint or a serial port ourselves.
 */
import { renderLabelRaster, type LabelProduct, type LabelRaster } from "@/lib/label-render";
import { buildEscPosJob, type EscPosOptions } from "@/lib/escpos-print";

export type PrintJobOptions = EscPosOptions;

/**
 * Flow control. The P58D has roughly an 8 KB input buffer and does not apply
 * backpressure: fed a label faster than the head can burn it, it stalls its USB
 * pipe and silently drops the rest of the job. macOS's own CUPS backend writes
 * in 8 KB blocks and hits this — a label then prints about three quarters of
 * the way down and the trailing feed command never arrives, so the sticker
 * never advances out. We stay well under the buffer and give the head time.
 */
const PACE_BYTES = 2048;
const PACE_MS = 60;

const pause = () => new Promise((resolve) => setTimeout(resolve, PACE_MS));

/** Turn products into a finished byte stream for the printer. */
export async function buildLabelJob(
  products: LabelProduct[],
  options: PrintJobOptions = {}
) {
  const rasters: LabelRaster[] = [];
  for (const product of products) {
    rasters.push(await renderLabelRaster(product));
  }
  return buildEscPosJob(rasters, options);
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
      "the POSiFLOW → Remove. Then unplug the USB cable and plug it back in."
    );
  }
  if (/Mac OS X|Macintosh/i.test(ua)) {
    return (
      "On Mac: System Settings → Printers & Scanners → remove every POS58 / " +
      "POS80 / Caysn queue. Then unplug the USB cable and plug it back in."
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
      "Your computer's printing system is holding the printer, so the browser " +
        "cannot talk to it directly.\n\n" +
        releaseInstructions() +
        "\n\nAlso close the POSiFLOW app and any other tab printing to it." +
        "\n\nIf you would rather keep the printer installed, use " +
        "“Print via printer driver” instead."
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
      let sincePause = 0;
      for (let i = 0; i < payload.length; i += chunk) {
        await device.transferOut(
          ep.endpointNumber,
          new Uint8Array(payload.subarray(i, i + chunk))
        );
        sincePause += chunk;
        if (sincePause >= PACE_BYTES) {
          sincePause = 0;
          await pause();
        }
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
      "USB print needs Google Chrome or Edge on a computer with the printer plugged in by USB."
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

/* ------------------------------------------------------------------ *
 * Serial transport
 *
 * On Windows a USB printer-class device is owned by usbprint.sys and
 * WebUSB is refused outright, whether or not a working vendor driver is
 * installed. A serial port is not locked that way, so pairing the printer
 * over Bluetooth (it shows up as a COM port) lets the identical ESC/POS job
 * through with no driver at all.
 * ------------------------------------------------------------------ */

export function isSerialPrintSupported() {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.serial !== "undefined" &&
    typeof window !== "undefined"
  );
}

/**
 * How long to wait for the port to open before giving up.
 *
 * macOS exposes a Bluetooth printer twice: `cu.NAME` and `tty.NAME`. Opening
 * the `tty` one blocks forever waiting for a carrier-detect signal a printer
 * never asserts, so without this the print button hangs silently with no error
 * to show. A real port opens in milliseconds.
 */
const OPEN_TIMEOUT_MS = 5000;

const WRONG_PORT_MESSAGE =
  "That serial port did not respond.\n\n" +
  "On a Mac, choose the entry beginning with “cu.” (for example cu.P58D). " +
  "The plain name is the “tty” port, which waits for a signal the printer " +
  "never sends.\n\n" +
  "Click Print over Bluetooth again to choose a different port.";

async function acquireSerialPort() {
  // Deliberately not reusing a remembered port without checking it: a
  // Bluetooth port exposes no vendor or product id, so a previously granted
  // bad port is indistinguishable from a good one and would be picked forever.
  const granted = await navigator.serial!.getPorts();
  return granted[0] ?? (await navigator.serial!.requestPort());
}

/** Open the port, or drop the grant so the user can pick a different one. */
async function openSerialPort(port: SerialPort, baudRate: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      port.open({ baudRate }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(WRONG_PORT_MESSAGE)), OPEN_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    // Forget it, otherwise getPorts() hands back the same dead port next time
    // and the button looks broken forever.
    await port.forget?.().catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function sendViaSerial(payload: Uint8Array, baudRate: number) {
  const port = await acquireSerialPort();
  await openSerialPort(port, baudRate);
  try {
    const writable = port.writable;
    if (!writable) throw new Error("The selected serial port cannot be written to.");
    const writer = writable.getWriter();
    try {
      // Bluetooth SPP links drop bytes if a whole label is pushed at once, and
      // the printer stalls if fed past its buffer — see PACE_BYTES.
      const chunk = 1024;
      let sincePause = 0;
      for (let i = 0; i < payload.length; i += chunk) {
        await writer.write(new Uint8Array(payload.subarray(i, i + chunk)));
        sincePause += chunk;
        if (sincePause >= PACE_BYTES) {
          sincePause = 0;
          await pause();
        }
      }
      // Let the link drain before the port closes, or the tail is discarded
      // and the bottom of the label silently goes missing.
      await new Promise((resolve) => setTimeout(resolve, 1500));
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
