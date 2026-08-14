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
    @Published private(set) var subscriptions: [SubscribedStreamer] = []
    @Published private(set) var isLoadingSubscriptions = false
    @Published private(set) var subscriptionsLoadError: String?
    @Published private(set) var mutedStreamerIds: Set<String> = AlarmPreferencesStore.allMuted()

    private let socketManager = LiveSocketManager(serverURL: Config.serverURL)
    private let audioController = AlarmAudioController()
    private let notificationManager = NotificationManager()
    private var sessionCookie: String?

    private var cancellables = Set<AnyCancellable>()

    init() {
        let cookie = KeychainStore.load()
        isLoggedIn = cookie != nil
        sessionCookie = cookie

        socketManager.$state
            .receive(on: DispatchQueue.main)
            .assign(to: &$connectionState)

        socketManager.onStreamerWentLive = { [weak self] streamerId in
            self?.handleStreamerWentLive(streamerId)
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
        sessionCookie = cookie
        isLoggedIn = true
        startListening(cookie: cookie)
    }

    func logOut() {
        KeychainStore.clear()
        socketManager.disconnect()
        isLoggedIn = false
        sessionCookie = nil
        subscriptions = []
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

    func loadSubscriptions() async {
        guard let cookie = sessionCookie else { return }

        isLoadingSubscriptions = true
        subscriptionsLoadError = nil

        defer { isLoadingSubscriptions = false }

        do {
            subscriptions = try await DinkDonkAPI.fetchSubscribedStreamers(
                serverURL: Config.serverURL,
                sessionCookie: cookie
            )
        } catch {
            subscriptionsLoadError = "Couldn't load your subscriptions. Pull to retry."
        }
    }

    func isAlarmEnabled(for streamerId: String) -> Bool {
        !mutedStreamerIds.contains(streamerId)
    }

    func setAlarmEnabled(_ enabled: Bool, for streamerId: String) {
        AlarmPreferencesStore.setMuted(!enabled, for: streamerId)

        if enabled {
            mutedStreamerIds.remove(streamerId)
        } else {
            mutedStreamerIds.insert(streamerId)
        }
    }

    private func startListening(cookie: String) {
        socketManager.connect(sessionCookie: cookie)
        audioController.startKeepAlive()
    }

    // Muting a subscription (setAlarmEnabled(false, for:)) suppresses the
    // alarm entirely for that streamer - not just the sound, but the
    // lock-screen notification too, since notifyStreamerLive() exists purely
    // to accompany/control the alarm (see NotificationManager's doc comment).
    private func handleStreamerWentLive(_ streamerId: String) {
        guard isAlarmEnabled(for: streamerId) else { return }

        triggerAlarm()
    }

    private func triggerAlarm() {
        isAlarming = true
        audioController.triggerAlarm()
        notificationManager.notifyStreamerLive()
    }
}
