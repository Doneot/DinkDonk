import Combine
import Foundation

/// Wires together login state, the realtime connection, the alarm audio, and
/// local notifications. One instance, owned by the App struct and shared via
/// `@EnvironmentObject`.
@MainActor
final class AppState: ObservableObject {
    @Published private(set) var isLoggedIn: Bool
    @Published private(set) var connectionState: LiveSocketManager.ConnectionState = .disconnected
    @Published private(set) var isAlarming = false

    private let socketManager = LiveSocketManager(serverURL: Config.serverURL)
    private let audioController = AlarmAudioController()
    private let notificationManager = NotificationManager()

    private var cancellables = Set<AnyCancellable>()

    init() {
        isLoggedIn = KeychainStore.load() != nil

        socketManager.$state
            .receive(on: DispatchQueue.main)
            .assign(to: &$connectionState)

        socketManager.onStreamerWentLive = { [weak self] _ in
            self?.triggerAlarm()
        }

        notificationManager.onStopRequested = { [weak self] in
            self?.stopAlarm()
        }
        notificationManager.requestAuthorization()

        if let cookie = KeychainStore.load() {
            startListening(cookie: cookie)
        }
    }

    func completeLogin(cookie: String) {
        KeychainStore.save(cookie)
        isLoggedIn = true
        startListening(cookie: cookie)
    }

    func logOut() {
        KeychainStore.clear()
        socketManager.disconnect()
        isLoggedIn = false
    }

    /// Call when the app returns to the foreground - cheap no-op if already
    /// connected, and the fastest recovery path if a long background stretch
    /// let iOS suspend the process (see AlarmAudioController's doc comment).
    func ensureConnected() {
        guard isLoggedIn, connectionState == .disconnected, let cookie = KeychainStore.load() else { return }
        startListening(cookie: cookie)
    }

    func stopAlarm() {
        isAlarming = false
        audioController.stopAlarm()
    }

    private func startListening(cookie: String) {
        socketManager.connect(sessionCookie: cookie)
        audioController.startKeepAlive()
    }

    private func triggerAlarm() {
        isAlarming = true
        audioController.triggerAlarm()
        notificationManager.notifyStreamerLive()
    }
}
