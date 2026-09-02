import Foundation

/**
 * The two ways to reach a POSiFLOW P58D from a Mac, with no driver installed.
 *
 * Both paths write the same finished ESC/POS bytes the server produces; only
 * the wire differs. Neither goes through CUPS: a print queue transforms the
 * job through a PPD, and the vendor PPDs for this printer either emit a raster
 * dialect it ignores or PostScript it prints as characters.
 */
enum PrinterError: LocalizedError {
    case noUsbPrinter
    case usb(String)
    case noSerialPort
    case serialAsleep(String)
    case serial(String)

    var errorDescription: String? {
        switch self {
        case .noUsbPrinter:
            return "No USB printer found. Check the cable, and that the printer is switched on — a battery printer charges over USB without powering up."
        case .usb(let detail):
            return "USB print failed: \(detail)"
        case .noSerialPort:
            return "No Bluetooth printer port found. Pair the printer in System Settings first."
        case .serialAsleep(let path):
            return "\(path) did not answer within 8 seconds.\n\nThe printer is almost certainly switched off or asleep — macOS establishes the Bluetooth link inside open(), so a sleeping printer blocks instead of failing. Switch it on and try again."
        case .serial(let detail):
            return "Bluetooth print failed: \(detail)"
        }
    }
}

/**
 * Flow control, copied from the web and Android clients.
 *
 * The P58D has roughly an 8 KB input buffer and applies no backpressure: fed a
 * whole label at once it stops accepting data and silently drops the rest, so
 * the sticker prints about three quarters down and never feeds out. The pause
 * must keep the sender under the ~10 KB/s the head consumes, or a run of labels
 * overruns the buffer even though a single label is fine.
 */
private let paceBytes = 2048
private let paceInterval: useconds_t = 300_000 // microseconds

// MARK: - USB

enum UsbTransport {
    /// USB printer class. The one interface class worth looking for.
    private static let printerClass: UInt8 = 7

    struct Found {
        let handle: OpaquePointer
        let interface: Int32
        let endpoint: UInt8
    }

    /// Is a printer-class device on the bus right now?
    static func isPresent() -> Bool {
        var context: OpaquePointer?
        guard libusb_init(&context) == 0 else { return false }
        defer { libusb_exit(context) }
        return withDeviceList(context, fallback: false) { devices, count in
            for index in 0..<count where describe(devices[index]) != nil {
                return true
            }
            return false
        }
    }

    /// A human-readable line for the status area, or nil when nothing is there.
    static func describePresent() -> String? {
        var context: OpaquePointer?
        guard libusb_init(&context) == 0 else { return nil }
        defer { libusb_exit(context) }
        return withDeviceList(context, fallback: nil) { devices, count -> String? in
            for index in 0..<count {
                guard let match = describe(devices[index]) else { continue }
                return String(format: "USB printer %04x:%04x", match.vendor, match.product)
            }
            return nil
        }
    }

    static func send(_ payload: Data, progress: @escaping (Int, Int) -> Void) throws {
        var context: OpaquePointer?
        guard libusb_init(&context) == 0 else { throw PrinterError.usb("libusb would not start") }
        defer { libusb_exit(context) }

        var list: UnsafeMutablePointer<OpaquePointer?>?
        let count = libusb_get_device_list(context, &list)
        guard count > 0, let devices = list else { throw PrinterError.noUsbPrinter }
        defer { libusb_free_device_list(devices, 1) }

        var opened: Found?
        for index in 0..<Int(count) {
            guard let device = devices[index], let match = describe(device) else { continue }
            var handle: OpaquePointer?
            guard libusb_open(device, &handle) == 0, let handle else { continue }
            // A no-op on macOS, but harmless, and correct if this ever runs on Linux.
            libusb_set_auto_detach_kernel_driver(handle, 1)
            if libusb_claim_interface(handle, match.interface) != 0 {
                libusb_close(handle)
                throw PrinterError.usb(
                    "the printer is claimed by another program. If you added it in Printers & Scanners, remove that queue — the print system holds the port exclusively."
                )
            }
            opened = Found(handle: handle, interface: match.interface, endpoint: match.endpoint)
            break
        }

        guard let target = opened else { throw PrinterError.noUsbPrinter }
        defer {
            libusb_release_interface(target.handle, target.interface)
            libusb_close(target.handle)
        }

        var sent = 0
        var buffer = [UInt8](payload)
        while sent < buffer.count {
            let size = min(paceBytes, buffer.count - sent)
            var transferred: Int32 = 0
            let result = buffer.withUnsafeMutableBufferPointer { raw -> Int32 in
                libusb_bulk_transfer(
                    target.handle,
                    target.endpoint,
                    raw.baseAddress! + sent,
                    Int32(size),
                    &transferred,
                    10_000
                )
            }
            if result != 0 {
                throw PrinterError.usb("transfer stopped after \(sent) of \(buffer.count) bytes (code \(result))")
            }
            sent += Int(transferred)
            progress(sent, buffer.count)
            usleep(paceInterval)
        }
    }

    // MARK: internals

    private struct Match {
        let interface: Int32
        let endpoint: UInt8
        let vendor: UInt16
        let product: UInt16
    }

    private static func withDeviceList<T>(
        _ context: OpaquePointer?,
        fallback: T,
        _ body: (UnsafeMutablePointer<OpaquePointer?>, Int) -> T
    ) -> T {
        var list: UnsafeMutablePointer<OpaquePointer?>?
        let count = libusb_get_device_list(context, &list)
        guard count > 0, let devices = list else { return fallback }
        defer { libusb_free_device_list(devices, 1) }
        return body(devices, Int(count))
    }

    /// The printer-class interface and its bulk OUT endpoint, if this is one.
    private static func describe(_ device: OpaquePointer?) -> Match? {
        guard let device else { return nil }
        var descriptor = libusb_device_descriptor()
        guard libusb_get_device_descriptor(device, &descriptor) == 0 else { return nil }

        var configPointer: UnsafeMutablePointer<libusb_config_descriptor>?
        guard libusb_get_active_config_descriptor(device, &configPointer) == 0,
              let config = configPointer else { return nil }
        defer { libusb_free_config_descriptor(config) }

        let settings = config.pointee
        for interfaceIndex in 0..<Int(settings.bNumInterfaces) {
            let interface = settings.interface[interfaceIndex]
            for altIndex in 0..<Int(interface.num_altsetting) {
                let alt = interface.altsetting[altIndex]
                guard alt.bInterfaceClass == printerClass else { continue }
                for endpointIndex in 0..<Int(alt.bNumEndpoints) {
                    let endpoint = alt.endpoint[endpointIndex]
                    let isOut = (endpoint.bEndpointAddress & 0x80) == 0
                    let isBulk = (endpoint.bmAttributes & 0x03) == 2
                    guard isOut, isBulk else { continue }
                    return Match(
                        interface: Int32(alt.bInterfaceNumber),
                        endpoint: endpoint.bEndpointAddress,
                        vendor: descriptor.idVendor,
                        product: descriptor.idProduct
                    )
                }
            }
        }
        return nil
    }
}

// MARK: - Bluetooth

enum SerialTransport {
    /**
     * Candidate ports, newest-looking first.
     *
     * Only `cu.*` is offered. The matching `tty.*` port waits for a carrier
     * signal the printer never asserts, so opening it blocks forever — the
     * single most common way this printer appears "broken".
     */
    static func ports() -> [String] {
        let entries = (try? FileManager.default.contentsOfDirectory(atPath: "/dev")) ?? []
        return entries
            .filter { $0.hasPrefix("cu.") }
            .filter { !$0.contains("debug-console") && !$0.contains("Bluetooth-Incoming") }
            .sorted()
            .map { "/dev/\($0)" }
    }

    static func preferredPort() -> String? {
        if !AppSettings.serialPort.isEmpty { return AppSettings.serialPort }
        let all = ports()
        return all.first { $0.localizedCaseInsensitiveContains("p58") }
            ?? all.first { $0.localizedCaseInsensitiveContains("pos") }
            ?? all.first
    }

    /**
     * Open the port without letting a sleeping printer freeze the app.
     *
     * macOS establishes the Bluetooth RFCOMM link inside `open()` and ignores
     * O_NONBLOCK, so if the printer is asleep the call never returns and the
     * calling thread wedges uninterruptibly — `kill -9` will not clear it, and
     * it holds the port against every later opener. So the open happens on a
     * throwaway thread and we give up waiting after `timeout`. The stranded
     * thread is deliberate: it cannot be cancelled, but it costs one thread and
     * it releases itself the moment the printer comes back.
     */
    private static func openWithTimeout(_ path: String, timeout: TimeInterval) throws -> Int32 {
        let semaphore = DispatchSemaphore(value: 0)
        let result = UnsafeMutablePointer<Int32>.allocate(capacity: 1)
        result.pointee = -1

        Thread.detachNewThread {
            let fd = open(path, O_WRONLY | O_NOCTTY)
            result.pointee = fd
            semaphore.signal()
        }

        if semaphore.wait(timeout: .now() + timeout) == .timedOut {
            throw PrinterError.serialAsleep(path)
        }
        let fd = result.pointee
        result.deallocate()
        guard fd >= 0 else { throw PrinterError.serial("could not open \(path)") }
        return fd
    }

    static func send(_ payload: Data, progress: @escaping (Int, Int) -> Void) throws {
        guard let path = preferredPort() else { throw PrinterError.noSerialPort }
        let fd = try openWithTimeout(path, timeout: 8)
        defer { close(fd) }

        var options = termios()
        tcgetattr(fd, &options)
        cfmakeraw(&options)
        cfsetspeed(&options, speed_t(B9600))
        options.c_cflag |= tcflag_t(CLOCAL | CREAD)
        tcsetattr(fd, TCSANOW, &options)

        let bytes = [UInt8](payload)
        var sent = 0
        while sent < bytes.count {
            let size = min(paceBytes, bytes.count - sent)
            let written = bytes.withUnsafeBufferPointer { raw in
                write(fd, raw.baseAddress! + sent, size)
            }
            if written <= 0 { throw PrinterError.serial("the port stopped accepting data after \(sent) bytes") }
            sent += written
            progress(sent, bytes.count)
            usleep(paceInterval)
        }
        // Let the buffer drain before the descriptor closes, or the tail of the
        // job — including the gap seek — is discarded.
        tcdrain(fd)
    }
}
