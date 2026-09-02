/**
 * Send labels to the POSiFLOW P58D label printer, with no driver installed.
 *
 * Never uses the browser's Print dialog: that hands the printer a PDF or
 * PostScript stream, which a raw thermal printer prints as pages of source
 * code. We build the printer's own ESC/POS bytes (see lib/escpos-print.ts) and
 * push them down a bulk endpoint or a serial port ourselves.
 */
import {
  renderLabelRaster,
  renderTestLabelRaster,
  type LabelProduct,
  type LabelRaster,
} from "@/lib/label-render";
import { buildEscPosJob, type EscPosOptions } from "@/lib/escpos-print";

export type PrintJobOptions = EscPosOptions;

/**
 * Flow control. The P58D has roughly an 8 KB input buffer and does not apply
 * backpressure: fed a label faster than the head can burn it, it stalls its USB
 * pipe and silently drops the rest of the job. macOS's own CUPS backend writes
 * in 8 KB blocks and hits this — a label then prints about three quarters of
 * the way down and the trailing feed command never arrives, so the sticker
 * never advances out.
 *
 * The pause is what keeps the send slower than the print, and it has to be
 * sized against the printer rather than picked. A label is about 7 KB, and the
 * head takes roughly 0.7 s to burn 18 mm and seek the next gap — call it
 * 10 KB/s. At 60 ms the sender ran at 33 KB/s, three times faster, so it gained
 * half a second on every label; the 8 KB buffer holds barely one, and from the
 * third label onward bytes were dropped mid-raster. That is why single labels
 * were fine and runs came out wrong.
 *
 * 300 ms puts the sender at 2048 / 0.3 ≈ 6.8 KB/s, comfortably under what the
 * head consumes, so the buffer drains as fast as it fills however long the run.
 * A single label costs about 0.9 s more; a run now sends in roughly the time it
 * takes to print, which is the point.
 */
const PACE_BYTES = 2048;
const PACE_MS = 300;

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

/**
 * Print the diagnostic label over USB.
 *
 * Deliberately not gated on a product being selected: when a print does not
 * come out, the first question is whether the printer is reachable at all, and
 * this answers it without a trip to the catalogue.
 */
export async function printTestLabelViaUsb(options: PrintJobOptions = {}) {
  assertSupported();
  await sendToPrinter(buildEscPosJob([await renderTestLabelRaster()], options));
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

const OPEN_FAILED_MESSAGE =
  "The printer did not answer.\n\n" +
  "1. Check it is switched on. A battery printer that has gone to sleep " +
  "does not answer, and macOS then blocks on the port until it does \u2014 " +
  "this is by far the most common cause.\n\n" +
  "2. If it is on, the port may be the wrong one. On a Mac choose the " +
  "entry beginning with “cu.” (for example cu.P58D), not the plain name: " +
  "that is the “tty” port, which waits for a signal the printer never " +
  "sends.\n\n" +
  "Use “Choose a different port” to pick again.";

async function acquireSerialPort() {
  // Deliberately not reusing a remembered port without checking it: a
  // Bluetooth port exposes no vendor or product id, so a previously granted
  // bad port is indistinguishable from a good one and would be picked forever.
  const granted = await navigator.serial!.getPorts();
  return granted[0] ?? (await navigator.serial!.requestPort());
}

/**
 * Open the port, or fail with something the shopkeeper can act on.
 *
 * Deliberately does *not* forget the grant when the open fails. It used to: a
 * `tty.*` port never opens, and dropping the grant was the only way to let the
 * user pick again. But the far more common failure is a printer that has gone
 * to sleep, and there the grant is perfectly good — discarding it means a port
 * chooser on every single print, which is indistinguishable from Bluetooth
 * being broken. The two cases cannot be told apart from here (both are just a
 * blocked open), so the message names both, and re-picking is an explicit
 * action instead: see `forgetSerialPrinter`.
 */
async function openSerialPort(port: SerialPort, baudRate: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      port.open({ baudRate }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(OPEN_FAILED_MESSAGE)), OPEN_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Drop every remembered serial port, so the next print asks again.
 *
 * The escape hatch for a port that really is the wrong one. A Bluetooth port
 * exposes no vendor or product id, so a bad grant is indistinguishable from a
 * good one and nothing but the user can tell them apart.
 */
export async function forgetSerialPrinter() {
  if (!isSerialPrintSupported()) return;
  const granted = await navigator.serial!.getPorts().catch(() => []);
  await Promise.all(granted.map((port) => port.forget?.().catch(() => {})));
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

/** Print the diagnostic label over Bluetooth. */
export async function printTestLabelViaSerial(
  options: PrintJobOptions & { baudRate?: number } = {}
) {
  if (!isSerialPrintSupported()) {
    throw new Error(
      "Serial printing needs Google Chrome or Edge on a computer. Update the browser and try again."
    );
  }
  await sendViaSerial(
    buildEscPosJob([await renderTestLabelRaster()], options),
    options.baudRate ?? 9600
  );
}

/* ------------------------------------------------------------------ *
 * Status
 * ------------------------------------------------------------------ */

export type PrinterAccess = {
  usbSupported: boolean;
  serialSupported: boolean;
  /** A device/port already granted to this site, openable with no chooser. */
  usbPaired: boolean;
  serialPaired: boolean;
};

/**
 * What this browser can reach right now.
 *
 * There is deliberately no server endpoint for this. The printer is plugged
 * into the machine holding the mouse, not into the machine running Next.js —
 * in production that is a VPS in a datacentre, which can never see it. Only
 * the browser can answer the question, so only the browser is asked.
 *
 * "Paired" means a grant already exists, so printing will not raise a chooser.
 * It is not a promise the printer is powered on: neither WebUSB nor Web Serial
 * will tell us that without opening the device, and opening it to find out
 * would be indistinguishable from a print job to a printer that is awake.
 */
export type Transport = "usb" | "bluetooth";

const TRANSPORT_KEY = "skywin.labelTransport";

/**
 * Which wire this machine prints over.
 *
 * A per-machine choice, not a per-shop one, so it lives in browser storage
 * rather than Settings: the same shop can have a Mac on USB and a Windows till
 * on Bluetooth, and on Windows USB is not a preference but an impossibility —
 * `usbprint.sys` owns printer-class devices and Chrome is refused the
 * interface whatever driver is installed.
 */
export function rememberedTransport(): Transport | null {
  try {
    const value = localStorage.getItem(TRANSPORT_KEY);
    return value === "usb" || value === "bluetooth" ? value : null;
  } catch {
    // Private windows and locked-down browsers throw on access.
    return null;
  }
}

function rememberTransport(transport: Transport) {
  try {
    localStorage.setItem(TRANSPORT_KEY, transport);
  } catch {
    // Not remembering is survivable; it only means asking again.
  }
}

/**
 * The transport to print over without asking, or null if the operator has to
 * choose.
 *
 * An existing grant is the real memory here — the browser holds it, it
 * survives restarts, and printing through it raises no chooser. The stored
 * preference only breaks a tie when both are granted.
 */
export async function resolveTransport(): Promise<Transport | null> {
  const access = await getPrinterAccess();
  const remembered = rememberedTransport();
  if (remembered === "usb" && access.usbPaired) return "usb";
  if (remembered === "bluetooth" && access.serialPaired) return "bluetooth";
  if (access.usbPaired) return "usb";
  if (access.serialPaired) return "bluetooth";
  return null;
}

/** Print over a named wire, and remember it worked. */
export async function printLabelsVia(
  transport: Transport,
  products: LabelProduct[],
  options: PrintJobOptions = {}
) {
  if (transport === "usb") await printLabelsViaUsb(products, options);
  else await printLabelsViaSerial(products, options);
  rememberTransport(transport);
}

/** Print the diagnostic label over a named wire. */
export async function printTestLabelVia(
  transport: Transport,
  options: PrintJobOptions = {}
) {
  if (transport === "usb") await printTestLabelViaUsb(options);
  else await printTestLabelViaSerial(options);
  rememberTransport(transport);
}

export async function getPrinterAccess(): Promise<PrinterAccess> {
  const usbSupported = isUsbPrintSupported();
  const serialSupported = isSerialPrintSupported();

  const [usbPaired, serialPaired] = await Promise.all([
    usbSupported
      ? navigator
          .usb!.getDevices()
          .then((devices) => devices.length > 0)
          .catch(() => false)
      : Promise.resolve(false),
    serialSupported
      ? navigator
          .serial!.getPorts()
          .then((ports) => ports.length > 0)
          .catch(() => false)
      : Promise.resolve(false),
  ]);

  return { usbSupported, serialSupported, usbPaired, serialPaired };
}
