/* WebUSB — direct TagPro printing from Chrome/Edge on desktop. */

interface Navigator {
  usb?: USB;
}

interface USB {
  requestDevice(options: { filters: USBDeviceFilter[] }): Promise<USBDevice>;
  /** Printers the user has already granted this site access to. */
  getDevices(): Promise<USBDevice[]>;
}

interface USBDeviceFilter {
  vendorId?: number;
  productId?: number;
}

interface USBDevice {
  configuration: USBConfiguration | null;
  configurations: USBConfiguration[];
  productName?: string;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  selectAlternateInterface(
    interfaceNumber: number,
    alternateSetting: number
  ): Promise<void>;
  transferOut(
    endpointNumber: number,
    data: BufferSource
  ): Promise<USBOutTransferResult>;
}

interface USBConfiguration {
  interfaces: USBInterface[];
}

interface USBInterface {
  interfaceNumber: number;
  alternates: USBAlternateInterface[];
}

interface USBAlternateInterface {
  alternateSetting: number;
  /** USB class code; 7 is the printer class. */
  interfaceClass: number;
  endpoints: USBEndpoint[];
}

interface USBEndpoint {
  endpointNumber: number;
  direction: "in" | "out";
  packetSize: number;
}

interface USBOutTransferResult {
  bytesWritten: number;
  status: "ok" | "stall" | "babble";
}
