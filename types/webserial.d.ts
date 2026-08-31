/*
 * Web Serial — the escape hatch on Windows.
 *
 * A USB printer-class device is claimed exclusively by usbprint.sys, so
 * WebUSB can never open it. A serial port is a different device class that
 * Windows does not lock, so the same ESC/POS bytes get through: pair the
 * printer over Bluetooth (it appears as a COM port) or use its USB-serial
 * interface, and printing works with no vendor driver at all.
 */
interface Navigator {
  serial?: Serial;
}

interface Serial {
  requestPort(options?: { filters?: SerialPortFilter[] }): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
}

interface SerialPortFilter {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialPort {
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  readonly writable: WritableStream<Uint8Array> | null;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
  /**
   * Revoke this origin's permission for the port. Not in every browser, hence
   * optional. We need it because a Bluetooth port reports no vendor or product
   * id, so a bad choice cannot be told apart from a good one afterwards — the
   * only way to let the user pick again is to drop the grant.
   */
  forget?(): Promise<void>;
}

interface SerialOptions {
  baudRate: number;
  dataBits?: number;
  stopBits?: number;
  parity?: "none" | "even" | "odd";
  bufferSize?: number;
  flowControl?: "none" | "hardware";
}
