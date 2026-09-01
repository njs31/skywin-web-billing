import Foundation

struct Product: Identifiable, Hashable {
    let id: Int
    let name: String
    let code: String
    let mrp: String
    let stock: String
}

enum ApiError: LocalizedError {
    case notConfigured
    case unauthorized
    case http(Int, String)
    case empty

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Set the server address in Settings first."
        case .unauthorized: return "The server rejected the API key. Check it in Settings."
        case .http(let code, let detail): return "Server error \(code). \(detail.prefix(200))"
        case .empty: return "The server returned an empty print job."
        }
    }
}

/**
 * Client for the Skywin server.
 *
 * Deliberately thin, exactly like the Android app: the server renders the
 * label and returns finished ESC/POS bytes, so the label design lives in one
 * place and changing it does not need a new build of this app.
 */
enum Api {
    private static func request(_ path: String) throws -> URLRequest {
        let base = AppSettings.serverUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/ "))
        guard !base.isEmpty, let url = URL(string: base + path) else { throw ApiError.notConfigured }
        var request = URLRequest(url: url)
        request.setValue(AppSettings.apiKey, forHTTPHeaderField: "x-api-key")
        request.timeoutInterval = 30
        return request
    }

    private static func fetch(_ path: String) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: try request(path))
        guard let http = response as? HTTPURLResponse else { return data }
        switch http.statusCode {
        case 200: return data
        case 401: throw ApiError.unauthorized
        default: throw ApiError.http(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
    }

    static func searchProducts(_ query: String) async throws -> [Product] {
        let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        let data = try await fetch("/api/labels/products?limit=100&q=\(encoded)")
        let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let rows = payload?["products"] as? [[String: Any]] ?? []
        return rows.compactMap { row in
            guard let id = row["id"] as? Int, let name = row["name"] as? String else { return nil }
            return Product(
                id: id,
                name: name,
                code: row["code"] as? String ?? "",
                mrp: row["mrp"] as? String ?? "",
                stock: String(describing: row["stock"] ?? "")
            )
        }
    }

    /// Finished printer bytes for the chosen products.
    static func labelBytes(ids: [Int], copies: Int) async throws -> Data {
        let list = ids.map(String.init).joined(separator: ",")
        let data = try await fetch("/api/labels/print?ids=\(list)&copies=\(copies)")
        guard !data.isEmpty else { throw ApiError.empty }
        return data
    }

    /// One diagnostic label: no product, no database row, just the printer.
    static func testLabelBytes() async throws -> Data {
        let data = try await fetch("/api/labels/test-print")
        guard !data.isEmpty else { throw ApiError.empty }
        return data
    }
}
