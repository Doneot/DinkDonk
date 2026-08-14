import Foundation
import SocketIO

/// Wraps the `socket.io-client-swift` connection to DinkDonk's realtime
/// server (see server/src/realtime/socketServer.ts), reusing the exact same
/// channel the web dashboard uses. Named `Live*` (not just `SocketManager`)
/// to avoid colliding with `SocketIO.SocketManager` from the package.
@MainActor
final class LiveSocketManager: ObservableObject {
    enum ConnectionState {
        case disconnected
        case connecting
        case connected
    }

    @Published private(set) var state: ConnectionState = .disconnected

    /// Fired on the main thread whenever the server reports a subscribed
    /// streamer going live (mirrors client/src/shared/socket.ts's
    /// `streamer_live_changed` payload: `{ streamerId, isLive, liveSince }`).
    var onStreamerWentLive: ((String) -> Void)?

    private let serverURL: URL
    private var manager: SocketIO.SocketManager?
    private var socket: SocketIOClient?

    init(serverURL: URL) {
        self.serverURL = serverURL
    }

    /// Connects using the DinkDonk session cookie (`connect.sid`) captured
    /// during login - the server authenticates sockets off that cookie the
    /// same way it authenticates a browser tab, so there's nothing else to
    /// send in the handshake.
    func connect(sessionCookie: String) {
        disconnect()

        let config: SocketIOClientConfiguration = [
            .log(false),
            .forceWebsockets(true),
            .extraHeaders(["Cookie": "connect.sid=\(sessionCookie)"]),
            .reconnects(true),
            .reconnectWait(2),
            .reconnectWaitMax(30),
        ]

        let mgr = SocketIO.SocketManager(socketURL: serverURL, config: config)
        let sock = mgr.defaultSocket

        sock.on(clientEvent: .connect) { [weak self] _, _ in
            Task { @MainActor in self?.state = .connected }
        }
        sock.on(clientEvent: .disconnect) { [weak self] _, _ in
            Task { @MainActor in self?.state = .disconnected }
        }
        sock.on(clientEvent: .error) { [weak self] _, _ in
            Task { @MainActor in self?.state = .disconnected }
        }
        sock.on("streamer_live_changed") { [weak self] data, _ in
            guard let payload = data.first as? [String: Any],
                  let streamerId = payload["streamerId"] as? String,
                  let isLive = payload["isLive"] as? Bool
            else { return }

            if isLive {
                Task { @MainActor in self?.onStreamerWentLive?(streamerId) }
            }
        }

        manager = mgr
        socket = sock
        state = .connecting
        sock.connect()
    }

    func disconnect() {
        socket?.disconnect()
        socket = nil
        manager = nil
        state = .disconnected
    }
}
