import Foundation

/**
 * Where the server is and how to authenticate to it.
 *
 * The same two values the Android app keeps: this app renders no labels of its
 * own, so without a server it has nothing to print.
 */
enum AppSettings {
    private static let serverKey = "serverUrl"
    private static let apiKeyKey = "apiKey"
    private static let portKey = "serialPort"

    static var serverUrl: String {
        get { UserDefaults.standard.string(forKey: serverKey) ?? "http://localhost:3000" }
        set { UserDefaults.standard.set(newValue, forKey: serverKey) }
    }

    static var apiKey: String {
        get { UserDefaults.standard.string(forKey: apiKeyKey) ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: apiKeyKey) }
    }

    /// Empty means "pick the first cu.* that looks like the printer".
    static var serialPort: String {
        get { UserDefaults.standard.string(forKey: portKey) ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: portKey) }
    }
}
