import SwiftUI

enum TransportChoice: String, CaseIterable, Identifiable {
    case auto = "Auto"
    case usb = "USB"
    case bluetooth = "Bluetooth"
    var id: String { rawValue }
}

struct SkywinLabelsApp: App {
    var body: some Scene {
        WindowGroup("Skywin Labels") {
            LabelPrinterView()
                .frame(minWidth: 620, minHeight: 460)
        }
        .defaultSize(width: 720, height: 560)
    }
}

struct LabelPrinterView: View {
    @State private var query = ""
    @State private var products: [Product] = []
    @State private var selection = Set<Int>()
    @State private var copies = 1
    @State private var transport: TransportChoice = .auto
    @State private var busy = false
    @State private var status = ""
    @State private var isError = false
    @State private var progress: Double?
    @State private var usbStatus: String?
    @State private var serialPort: String?
    @State private var showSettings = false

    private var labelCount: Int { selection.count * max(1, copies) }

    var body: some View {
        VStack(spacing: 0) {
            searchBar
            Divider()
            productList
            Divider()
            controls
        }
        .sheet(isPresented: $showSettings) { SettingsView() }
        .task {
            refreshTransports()
            await load()
        }
    }

    private var searchBar: some View {
        HStack(spacing: 8) {
            TextField("Search products", text: $query)
                .textFieldStyle(.roundedBorder)
                .onSubmit { Task { await load() } }
            Button("Search") { Task { await load() } }
            Button {
                showSettings = true
            } label: {
                Image(systemName: "gearshape")
            }
            .help("Server address and API key")
        }
        .padding(10)
    }

    private var productList: some View {
        List(products, selection: $selection) { product in
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(product.name).font(.system(size: 12, weight: .medium))
                    Text(product.code).font(.system(size: 10)).foregroundStyle(.secondary)
                }
                Spacer()
                Text("MRP \(product.mrp)").font(.system(size: 11, weight: .semibold))
            }
            .tag(product.id)
        }
        .listStyle(.inset)
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Stepper("Copies each: \(copies)", value: $copies, in: 1...99)
                    .frame(width: 160)

                Picker("", selection: $transport) {
                    ForEach(TransportChoice.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .frame(width: 220)

                Button(busy ? "Printing…" : "Print \(labelCount) label\(labelCount == 1 ? "" : "s")") {
                    Task { await printSelected() }
                }
                .keyboardShortcut(.defaultAction)
                .disabled(busy || selection.isEmpty)

                Button("Test print") { Task { await printTest() } }
                    .disabled(busy)
            }

            if let progress {
                ProgressView(value: progress)
            }

            HStack(spacing: 6) {
                Circle()
                    .fill(usbStatus != nil || serialPort != nil ? .green : .secondary)
                    .frame(width: 8, height: 8)
                Text(transportSummary)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Rescan") { refreshTransports() }
                    .buttonStyle(.link)
                    .font(.system(size: 11))
            }

            if !status.isEmpty {
                Text(status)
                    .font(.system(size: 11))
                    .foregroundStyle(isError ? .red : .secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(10)
    }

    private var transportSummary: String {
        var parts: [String] = []
        if let usbStatus { parts.append(usbStatus) }
        if let serialPort { parts.append("Bluetooth \(serialPort)") }
        return parts.isEmpty ? "No printer found on USB or Bluetooth" : parts.joined(separator: " · ")
    }

    private func refreshTransports() {
        usbStatus = UsbTransport.describePresent()
        serialPort = SerialTransport.preferredPort()
    }

    private func load() async {
        do {
            products = try await Api.searchProducts(query)
            report("\(products.count) product\(products.count == 1 ? "" : "s") loaded", error: false)
        } catch {
            report(error.localizedDescription, error: true)
        }
    }

    private func printSelected() async {
        let ids = products.map(\.id).filter { selection.contains($0) }
        await run {
            try await Api.labelBytes(ids: ids, copies: copies)
        }
    }

    private func printTest() async {
        await run { try await Api.testLabelBytes() }
    }

    /// Fetch bytes, then push them down whichever wire is chosen.
    private func run(_ fetch: () async throws -> Data) async {
        busy = true
        progress = 0
        defer { busy = false; progress = nil }
        do {
            let payload = try await fetch()
            let choice = transport
            try await Task.detached(priority: .userInitiated) {
                let onProgress: (Int, Int) -> Void = { sent, total in
                    Task { @MainActor in progress = Double(sent) / Double(total) }
                }
                switch choice {
                case .usb:
                    try UsbTransport.send(payload, progress: onProgress)
                case .bluetooth:
                    try SerialTransport.send(payload, progress: onProgress)
                case .auto:
                    if UsbTransport.isPresent() {
                        try UsbTransport.send(payload, progress: onProgress)
                    } else {
                        try SerialTransport.send(payload, progress: onProgress)
                    }
                }
            }.value
            report("Sent \(payload.count) bytes to the printer.", error: false)
        } catch {
            report(error.localizedDescription, error: true)
        }
        refreshTransports()
    }

    private func report(_ message: String, error: Bool) {
        status = message
        isError = error
    }
}

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var serverUrl = AppSettings.serverUrl
    @State private var apiKey = AppSettings.apiKey
    @State private var serialPort = AppSettings.serialPort

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Settings").font(.headline)

            TextField("Server address, e.g. http://localhost:3000", text: $serverUrl)
            SecureField("API key", text: $apiKey)

            Picker("Bluetooth port", selection: $serialPort) {
                Text("Automatic").tag("")
                ForEach(SerialTransport.ports(), id: \.self) { Text($0).tag($0) }
            }

            Text("Only cu.* ports are listed. The matching tty.* port waits for a signal the printer never sends, so opening it blocks forever.")
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                Button("Save") {
                    AppSettings.serverUrl = serverUrl
                    AppSettings.apiKey = apiKey
                    AppSettings.serialPort = serialPort
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(16)
        .frame(width: 460)
    }
}
