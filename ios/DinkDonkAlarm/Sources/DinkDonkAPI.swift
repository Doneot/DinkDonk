import Foundation

/// The subset of a streamer's info this app needs to show in the alarm
/// subscription list - name/avatar come from POST /api/streamers/info
/// (server/src/http/routes/apiRoutes.ts), the id itself from the
/// subscriptions array on GET /api/auth/user.
struct SubscribedStreamer: Identifiable, Equatable {
    let id: String
    let name: String
    let avatar: String?
}

enum DinkDonkAPIError: Error {
    case requestFailed
}

/// Talks to the same JSON API the web dashboard uses, reusing the
/// `connect.sid` session cookie captured at login (see LiveSocketManager,
/// which authenticates the realtime channel the exact same way) rather than
/// URLSession's own cookie storage, which WKWebView's login flow never
/// populates.
enum DinkDonkAPI {
    static func fetchSubscribedStreamers(
        serverURL: URL,
        sessionCookie: String
    ) async throws -> [SubscribedStreamer] {
        let ids = try await fetchSubscriptionIds(serverURL: serverURL, sessionCookie: sessionCookie)

        guard !ids.isEmpty else { return [] }

        return try await fetchStreamerInfo(
            ids: ids,
            serverURL: serverURL,
            sessionCookie: sessionCookie
        )
    }

    private static func fetchSubscriptionIds(
        serverURL: URL,
        sessionCookie: String
    ) async throws -> [String] {
        struct UserResponse: Decodable {
            struct Subscription: Decodable { let id: String }
            let subscriptions: [Subscription]?
        }

        var request = URLRequest(url: serverURL.appendingPathComponent("api/auth/user"))
        request.setValue("connect.sid=\(sessionCookie)", forHTTPHeaderField: "Cookie")

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw DinkDonkAPIError.requestFailed
        }

        let decoded = try JSONDecoder().decode(UserResponse.self, from: data)
        return decoded.subscriptions?.map(\.id) ?? []
    }

    // batchStreamerInfoSchema caps this at 50 ids server-side; not chunked
    // here since a personal alarm companion's subscription list realistically
    // never approaches that.
    private static func fetchStreamerInfo(
        ids: [String],
        serverURL: URL,
        sessionCookie: String
    ) async throws -> [SubscribedStreamer] {
        struct StreamerInfo: Decodable {
            let id: String
            let name: String
            let avatar: String?
        }

        var request = URLRequest(url: serverURL.appendingPathComponent("api/streamers/info"))
        request.httpMethod = "POST"
        request.setValue("connect.sid=\(sessionCookie)", forHTTPHeaderField: "Cookie")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["ids": ids])

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw DinkDonkAPIError.requestFailed
        }

        let decoded = try JSONDecoder().decode([StreamerInfo].self, from: data)
        return decoded.map { SubscribedStreamer(id: $0.id, name: $0.name, avatar: $0.avatar) }
    }
}
