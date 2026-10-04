import UserNotifications

/// Posts a lock-screen notification alongside the alarm sound so there's a
/// visible record of what triggered it. The sound itself comes from
/// AlarmAudioController, not this notification - the two would otherwise
/// compete.
///
/// Deliberately has no "Stop" quick action: silencing the alarm requires
/// opening the app and completing AlarmDismissView's slide-to-stop gesture
/// (wired to `AppState.isAlarming` in RootView) - a lock-screen button that
/// stops it with one tap would defeat the point of a wake-up check.
final class NotificationManager: NSObject, ObservableObject {
    func requestAuthorization() {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

    func notifyStreamerLive() {
        let content = UNMutableNotificationContent()
        content.title = "DinkDonk Alarm"
        content.body = "A streamer you're tracking just went live. Open the app to stop the alarm."
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
}
