import Foundation

enum Config {
    /// Your DinkDonk deployment's public origin - the same value as
    /// SERVER_URL / CLIENT_ORIGIN in deploy/.env.example. Must be reachable
    /// over HTTPS (App Transport Security blocks plain HTTP by default,
    /// which is what you want for anything but local dev).
    static let serverURL = URL(string: "https://example.com")!
}
