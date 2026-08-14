import UserNotifications

/// Posts a lock-screen notification alongside the alarm sound so there's a
/// visible record of what triggered it, and offers a "Stop" action so the
/// alarm can be silenced without unlocking into the app. The sound itself
/// comes from AlarmAudioController, not this notification - the two would
/// otherwise compete.
final class NotificationManager: NSObject, ObservableObject {
    private static let stopActionID = "STOP_ALARM"
    private static let categoryID = "STREAMER_LIVE"

    /// Invoked (main thread) when the user taps "Stop" on the notification,
    /// or taps the notification itself.
    var onStopRequested: (() -> Void)?

    func requestAuthorization() {
        let stopAction = UNNotificationAction(
            identifier: Self.stopActionID,
            title: "Stop",
            options: [.foreground]
        )
        let category = UNNotificationCategory(
            identifier: Self.categoryID,
            actions: [stopAction],
            intentIdentifiers: [],
            options: []
        )

        let center = UNUserNotificationCenter.current()
        center.setNotificationCategories([category])
        center.delegate = self
        center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

    func notifyStreamerLive() {
        let content = UNMutableNotificationContent()
        content.title = "DinkDonk Alarm"
        content.body = "A streamer you're tracking just went live."
        content.categoryIdentifier = Self.categoryID
        // No content.sound - AlarmAudioController already owns the loud,
        // looping, mute-switch-bypassing sound; a second system sound here
        // would just compete with it.

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }
}

extension NotificationManager: UNUserNotificationCenterDelegate {
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        if response.actionIdentifier == Self.stopActionID
            || response.actionIdentifier == UNNotificationDefaultActionIdentifier
        {
            let callback = onStopRequested
            DispatchQueue.main.async { callback?() }
        }
        completionHandler()
    }
}
