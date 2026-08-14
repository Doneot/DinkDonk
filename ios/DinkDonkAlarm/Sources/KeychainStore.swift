import Foundation
import Security

/// Persists the DinkDonk session cookie (see server/src/http/configureMiddleware.ts's
/// `connect.sid`) across launches so login only has to happen once every ~30
/// days (the server's session maxAge), not every cold start.
enum KeychainStore {
    private static let service = "com.dinkdonk.alarm.session"
    private static let account = "sessionCookie"

    private static var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    static func save(_ value: String) {
        SecItemDelete(baseQuery as CFDictionary)

        var attributes = baseQuery
        attributes[kSecValueData as String] = Data(value.utf8)
        // .afterFirstUnlock (not .whenUnlocked) - the app reads this while
        // running in the background with the phone locked, e.g. right after
        // a streamer_live_changed event arrives overnight.
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock

        SecItemAdd(attributes as CFDictionary, nil)
    }

    static func load() -> String? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func clear() {
        SecItemDelete(baseQuery as CFDictionary)
    }
}
