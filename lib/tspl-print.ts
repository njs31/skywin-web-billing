/**
 * Send labels to a real TSPL label printer — the replacement for the
 * POSiFLOW P58D's undocumented ESC/POS clone firmware (see
 * thermal-usb-print.ts / escpos-print.ts for that printer's history).
 *
 * TSPL is a real, documented protocol (TSC's command language, also
 * spoken by most Xprinter/Zebra-compatible label printers). Three things
 * that were guesswork on the P58D become facts here:
 *
 *  1. Media geometry (`SIZE`/`GAP`) is *told* to the printer, which
 *     calibrates its own gap sensor against it — not a hand-tuned "print
 *     band" cropped out of an assumed head offset.
 *  2. Repeating one label N times is the printer's own job (`PRINT 1,N`),
 *     not a JS-side loop guessing inter-label timing. This is the single
 *     biggest reliability difference from the P58D path: there is no
 *     "pace bytes so the buffer doesn't overflow between labels" problem
 *     to have, because there is no between-labels from the browser's side
 *     — one job, one command, the printer's own firmware feeds itself.
 *  3. `~HS` (Host Status) is a real, documented status query most TSPL
 *     printers answer, so "is it done yet" can be *asked* instead of
 *     guessed with a fixed delay — the closest this app gets to genuine
 *     flow control anywhere in its printing code.
 *
 * NOT verified against real hardware (none was available while writing
 * this — see each constant's own comment for what to check once the
 * printer is in hand): the exact `GAP` value, `DENSITY`/`SPEED` defaults,
 * and the `~HS` response format. Every one of these fails safe: a wrong
 * GAP just means running the printer's own calibration; a wrong DENSITY/
 * SPEED prints too light/dark, not wrong; and `~HS` never answering just
 * means this falls back to a fixed wait, same as the P58D always had to.
 */
import {
  renderLabelRasterTspl,
  renderTestLabelRasterTspl,
  type LabelProduct,
  type LabelRaster,
} from "@/lib/label-render";
import {
  TSPL_LABEL_W_MM,
  TSPL_LABEL_H_MM,
  TSPL_GAP_MM,
} from "@/lib/label-print-config";

/**
 * Print darkness, 0–15. Mid-range default — raise it if prints come out
 * light/grey, lower it if text blobs or the paper scorches. Tune once the
 * printer is in hand; there is no way to know the right value for an
 * unknown thermal head in advance.
 */
const TSPL_DENSITY = 8;

/** Print speed, inches/second. Most TSPL printers accept 2–6; a slower
 *  speed is generally the safer first try for a printer never used before. */
const TSPL_SPEED = 3;

/**
 * 0 or 1 — some firmwares print upside-down/mirrored at the wrong value.
 * 1 is the more common "right way up off the roll" default for this class
 * of printer. If the first test label comes out upside down, flip this.
 */
const TSPL_DIRECTION = 1;

function tsplText(command: string): Uint8Array {
  return new TextEncoder().encode(command + "\r\n");
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Media setup, sent once at the start of a job. `SIZE`/`GAP` are what let
 * the printer calibrate its own gap sensor against real, declared numbers
 * instead of the P58D's "we don't actually know" workarounds.
 */
function tsplHeader(): Uint8Array {
  return concatBytes([
    tsplText(`SIZE ${TSPL_LABEL_W_MM} mm,${TSPL_LABEL_H_MM} mm`),
    tsplText(`GAP ${TSPL_GAP_MM} mm,0 mm`),
    tsplText(`DIRECTION ${TSPL_DIRECTION}`),
    tsplText("REFERENCE 0,0"),
    tsplText(`DENSITY ${TSPL_DENSITY}`),
    tsplText(`SPEED ${TSPL_SPEED}`),
  ]);
}

/**
 * One `BITMAP` command: draws the raster at (0,0), mode 0 (OVERWRITE).
 *
 * Bit convention: 1 = ink, matching LabelRaster's own convention (see
 * label-render.ts) and TSPL's documented default for BITMAP. If a real
 * print comes out as a white label with a black border (inverted), this
 * printer's firmware wants the opposite polarity — invert `raster.bytes`
 * here rather than anywhere else, so every other command stays correct.
 */
function tsplBitmapCommand(raster: LabelRaster): Uint8Array {
  const prefix = tsplText(
    `BITMAP 0,0,${raster.bytesPerRow},${raster.height},0,`
  );
  // The line above ends in "\r\n", but BITMAP's binary payload must follow
  // the trailing comma directly with no line break — the length in the
  // command header is what tells the printer where the binary data ends,
  // not a delimiter. Rebuild without that trailing CRLF, then append the
  // raw bytes, then the real line terminator.
  const withoutCrlf = prefix.subarray(0, prefix.length - 2);
  return concatBytes([withoutCrlf, raster.bytes, tsplText("")]);
}

/**
 * One full job: header, one label design, printed `copies` times.
 *
 * `PRINT 1,N` is the printer's own repeat — see the file header for why
 * that matters more than anything else here. One job, one round trip,
 * no JS-side loop to get the timing of wrong.
 */
export function buildTsplJob(raster: LabelRaster, copies: number): Uint8Array {
  const count = Math.max(1, Math.min(999, Math.round(copies) || 1));
  return concatBytes([
    tsplHeader(),
    tsplText("CLS"),
    tsplBitmapCommand(raster),
    tsplText(`PRINT 1,${count}`),
  ]);
}

/** `~HS` — Host Status. A real, documented query most TSPL printers
 *  answer; see queryStatus in this file's transports for how the answer
 *  (or lack of one) is used. */
const HOST_STATUS_QUERY = tsplText("~HS");

export { HOST_STATUS_QUERY };

/* ------------------------------------------------------------------ *
 * USB transport
 * ------------------------------------------------------------------ */

export function isUsbPrintSupported() {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.usb !== "undefined" &&
    typeof window !== "undefined"
  );
}

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

function releaseInstructions() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/Windows/i.test(ua)) {
    return (
      "On Windows: Settings → Bluetooth & devices → Printers & scanners → " +
      "remove this printer's queue. Then unplug the USB cable and plug it back in."
    );
  }
  if (/Mac OS X|Macintosh/i.test(ua)) {
    return (
      "On Mac: System Settings → Printers & Scanners → remove this printer's " +
      "queue. Then unplug the USB cable and plug it back in."
    );
  }
  if (/Linux|X11/i.test(ua)) {
    return "On Linux: remove the printer from CUPS, or add a udev rule granting access.";
  }
  return "Remove the printer from your computer's printer list, then replug the cable.";
}

async function openDevice(device: USBDevice) {
  try {
    await device.open();
  } catch {
    throw new Error(
      "Your computer's printing system is holding the printer, so the browser " +
        "cannot talk to it directly.\n\n" +
        releaseInstructions() +
        "\n\nAlso close any other tab or app printing to it."
    );
  }
}

type UsbEndpoints = {
  interfaceNumber: number;
  alternateSetting: number;
  outEndpoint: number;
  outPacketSize: number;
  inEndpoint: number | null;
};

function findEndpoints(device: USBDevice): UsbEndpoints {
  if (device.configuration === null) {
    throw new Error("USB device has no configuration selected");
  }
  const config = device.configuration;
  for (const iface of config.interfaces) {
    for (const alt of iface.alternates) {
      const outEp = alt.endpoints.find((e: USBEndpoint) => e.direction === "out");
      if (outEp) {
        const inEp = alt.endpoints.find((e: USBEndpoint) => e.direction === "in");
        return {
          interfaceNumber: iface.interfaceNumber,
          alternateSetting: alt.alternateSetting,
          outEndpoint: outEp.endpointNumber,
          outPacketSize: outEp.packetSize,
          inEndpoint: inEp?.endpointNumber ?? null,
        };
      }
    }
  }
  throw new Error("No USB output endpoint found on this device");
}

/**
 * Flow control for the raw bytes of a job, same reasoning as the P58D's
 * PACE_BYTES/PACE_MS (see thermal-usb-print.ts) — a printer's input
 * buffer can still overflow if fed faster than it drains, TSPL or not.
 * Kept identical to the P58D's tuned values as a starting point; a real
 * TSPL printer's spec sheet will say its actual buffer size once bought,
 * and this can likely be raised (sent faster) once that's known — TSPL
 * printers typically have larger buffers and `~HS` to check with, which
 * is the whole point of preferring status polling over this where possible.
 */
const PACE_BYTES = 2048;
const PACE_MS = 300;

async function writeChunked(
  write: (chunk: Uint8Array) => Promise<void>,
  payload: Uint8Array
) {
  let sincePause = 0;
  for (let i = 0; i < payload.length; i += 1024) {
    const chunk = payload.subarray(i, Math.min(i + 1024, payload.length));
    await write(chunk);
    sincePause += chunk.length;
    if (sincePause >= PACE_BYTES) {
      sincePause = 0;
      await new Promise((resolve) => setTimeout(resolve, PACE_MS));
    }
  }
}

/**
 * Ask the printer if it's still busy, and wait for either a real answer
 * or a bounded timeout — whichever comes first. This is genuine
 * backpressure, not a guess: a printer that answers `~HS` promptly lets
 * the caller move on as soon as it actually can, and one that never
 * answers (an older/cheaper clone, or a firmware that doesn't implement
 * it) degrades to exactly the fixed-wait behaviour the P58D always used.
 *
 * Deliberately does not parse the response's status bits — the exact
 * byte layout varies by firmware and guessing it wrong risks reading
 * "busy" as "ready" and printing over a label that hasn't fed out yet.
 * Any response at all is treated as "the printer is alive and has caught
 * up enough to answer," which is a real, if conservative, signal.
 */
async function usbQueryStatus(
  device: USBDevice,
  endpoints: UsbEndpoints,
  timeoutMs: number
): Promise<boolean> {
  if (endpoints.inEndpoint === null) return false;
  try {
    await device.transferOut(endpoints.outEndpoint, new Uint8Array(HOST_STATUS_QUERY));
    const result = await Promise.race([
      device.transferIn(endpoints.inEndpoint, 64),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return result !== null && (result as USBInTransferResult).data !== undefined;
  } catch {
    return false;
  }
}

async function sendToPrinter(payload: Uint8Array, settleMs: number) {
  const device = await acquirePrinter();
  await openDevice(device);
  try {
    const endpoints = findEndpoints(device);
    try {
      await device.claimInterface(endpoints.interfaceNumber);
    } catch {
      throw new Error(
        "The printer opened but is still held by the system print driver.\n\n" +
          releaseInstructions()
      );
    }
    try {
      await device.selectAlternateInterface(
        endpoints.interfaceNumber,
        endpoints.alternateSetting
      );
      await writeChunked(
        (chunk) =>
          device.transferOut(endpoints.outEndpoint, new Uint8Array(chunk)).then(() => {}),
        payload
      );
      await settleAfterSend(
        (timeoutMs) => usbQueryStatus(device, endpoints, timeoutMs),
        settleMs
      );
    } finally {
      await device.releaseInterface(endpoints.interfaceNumber);
    }
  } finally {
    await device.close();
  }
}

/**
 * Wait for the printer to report it's caught up, polling `queryStatus`
 * every 500ms, but never longer than `maxMs` total — the same "ask first,
 * fall back to a bound" shape as usbQueryStatus/serialQueryStatus, one
 * level up: this is for *the whole job* (all N copies of PRINT 1,N)
 * finishing, not one status round trip.
 */
async function settleAfterSend(
  queryStatus: (timeoutMs: number) => Promise<boolean>,
  maxMs: number
) {
  const start = Date.now();
  const POLL_INTERVAL_MS = 500;
  while (Date.now() - start < maxMs) {
    const answered = await queryStatus(800);
    if (answered) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

/**
 * How long a job of `copies` labels might take to physically finish, as a
 * ceiling for settleAfterSend when `~HS` never answers at all. Pure
 * guesswork calibrated the same way the P58D's numbers were: a
 * conservative per-label estimate (burn + feed) times the count, plus a
 * flat margin. Safe to raise if a real printer turns out slower; a
 * ceiling that is too high only costs time, never correctness, since
 * status polling already returns early the moment the printer answers.
 */
function estimateSettleMs(copies: number): number {
  const PER_LABEL_MS = 700;
  const MARGIN_MS = 1500;
  return Math.min(20000, copies * PER_LABEL_MS + MARGIN_MS);
}

function assertUsbSupported() {
  if (!isUsbPrintSupported()) {
    throw new Error(
      "USB print needs Google Chrome or Edge on a computer with the printer plugged in by USB."
    );
  }
}

/** Print one product, `copies` times, over USB — one TSPL job, printer's
 *  own PRINT 1,N repeat. */
export async function printLabelViaTsplUsb(
  product: LabelProduct,
  copies: number
): Promise<void> {
  assertUsbSupported();
  const raster = await renderLabelRasterTspl(product);
  const job = buildTsplJob(raster, copies);
  await sendToPrinter(job, estimateSettleMs(copies));
}

/** Print the diagnostic label over USB. */
export async function printTestLabelViaTsplUsb(): Promise<void> {
  assertUsbSupported();
  const raster = await renderTestLabelRasterTspl();
  const job = buildTsplJob(raster, 1);
  await sendToPrinter(job, estimateSettleMs(1));
}

/* ------------------------------------------------------------------ *
 * Serial (Bluetooth SPP) transport
 * ------------------------------------------------------------------ */

export function isSerialPrintSupported() {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.serial !== "undefined" &&
    typeof window !== "undefined"
  );
}

const OPEN_TIMEOUT_MS = 5000;

const OPEN_FAILED_MESSAGE =
  "The printer did not answer.\n\n" +
  "1. Check it is switched on. A battery printer that has gone to sleep " +
  "does not answer, and the port then blocks until it does.\n\n" +
  "2. On a Mac, choose the port beginning with “cu.”, not the plain name " +
  "or the “tty.” one — that waits for a signal the printer never sends.\n\n" +
  "Use “Choose a different port” to pick again.";

async function acquireSerialPort() {
  const granted = await navigator.serial!.getPorts();
  return granted[0] ?? (await navigator.serial!.requestPort());
}

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

/** Same reasoning as usbQueryStatus — any response at all counts. */
async function serialQueryStatus(port: SerialPort, timeoutMs: number): Promise<boolean> {
  const writable = port.writable;
  const readable = port.readable;
  if (!writable || !readable) return false;
  const writer = writable.getWriter();
  const reader = readable.getReader();
  try {
    await writer.write(HOST_STATUS_QUERY);
    const result = await Promise.race([
      reader.read(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return result !== null && !(result as ReadableStreamReadResult<Uint8Array>).done;
  } catch {
    return false;
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Already cancelled/closed — fine.
    }
    reader.releaseLock();
    writer.releaseLock();
  }
}

async function sendViaSerial(payload: Uint8Array, baudRate: number, settleMs: number) {
  const port = await acquireSerialPort();
  await openSerialPort(port, baudRate);
  try {
    const writable = port.writable;
    if (!writable) throw new Error("The selected serial port cannot be written to.");
    const writer = writable.getWriter();
    try {
      await writeChunked((chunk) => writer.write(chunk), payload);
      // Let the link drain before status queries fight over the port.
      await new Promise((resolve) => setTimeout(resolve, 200));
    } finally {
      await writer.close().catch(() => writer.releaseLock());
    }
    await settleAfterSend((timeoutMs) => serialQueryStatus(port, timeoutMs), settleMs);
  } finally {
    await port.close().catch(() => {});
  }
}

function assertSerialSupported() {
  if (!isSerialPrintSupported()) {
    throw new Error(
      "Serial printing needs Google Chrome or Edge on a computer. Update the browser and try again."
    );
  }
}

/** Print one product, `copies` times, over Bluetooth — one TSPL job. */
export async function printLabelViaTsplSerial(
  product: LabelProduct,
  copies: number,
  baudRate = 9600
): Promise<void> {
  assertSerialSupported();
  const raster = await renderLabelRasterTspl(product);
  const job = buildTsplJob(raster, copies);
  await sendViaSerial(job, baudRate, estimateSettleMs(copies));
}

/** Print the diagnostic label over Bluetooth. */
export async function printTestLabelViaTsplSerial(baudRate = 9600): Promise<void> {
  assertSerialSupported();
  const raster = await renderTestLabelRasterTspl();
  const job = buildTsplJob(raster, 1);
  await sendViaSerial(job, baudRate, estimateSettleMs(1));
}

/* ------------------------------------------------------------------ *
 * Transport-agnostic entry points
 * ------------------------------------------------------------------ */

export type Transport = "usb" | "bluetooth";

/** Print `copies` of one product over a named wire — the printer's own
 *  PRINT 1,N handles the repeat, so this is one job, not a loop. */
export async function printLabelViaTspl(
  transport: Transport,
  product: LabelProduct,
  copies: number
): Promise<void> {
  if (transport === "usb") await printLabelViaTsplUsb(product, copies);
  else await printLabelViaTsplSerial(product, copies);
}

/** Print the diagnostic label over a named wire. */
export async function printTestLabelViaTspl(transport: Transport): Promise<void> {
  if (transport === "usb") await printTestLabelViaTsplUsb();
  else await printTestLabelViaTsplSerial();
}
