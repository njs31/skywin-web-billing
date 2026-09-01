import Foundation

/**
 * Entry point.
 *
 * `--selftest` reports what the machine can reach and exits, so the transports
 * can be checked from a terminal without a window — which is also the only way
 * to check them over SSH or from a build script.
 */
if CommandLine.arguments.contains("--selftest") {
    print("Skywin Labels self-test")
    print("  server:    \(AppSettings.serverUrl)")
    print("  api key:   \(AppSettings.apiKey.isEmpty ? "(not set)" : "set")")
    print("  USB:       \(UsbTransport.describePresent() ?? "no printer-class device found")")
    let ports = SerialTransport.ports()
    print("  cu. ports: \(ports.isEmpty ? "none" : ports.joined(separator: ", "))")
    print("  will use:  \(SerialTransport.preferredPort() ?? "no Bluetooth port")")
    exit(0)
}

SkywinLabelsApp.main()
