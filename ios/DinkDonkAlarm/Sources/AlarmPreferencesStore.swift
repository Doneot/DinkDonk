import Foundation

/// Persists which subscriptions the user has muted (the alarm won't fire for
/// them) locally on this device via UserDefaults - a purely client-side
/// preference the DinkDonk backend has no concept of, so there's nothing to
/// sync. Opt-out, not opt-in: a streamerId with no entry here is treated as
/// alarm-enabled, so a newly added subscription rings by default without the
/// user needing to visit the subscriptions screen first.
enum AlarmPreferencesStore {
    private static let key = "com.dinkdonk.alarm.mutedStreamerIds"

    static func allMuted() -> Set<String> {
        Set(UserDefaults.standard.stringArray(forKey: key) ?? [])
    }

    static func setMuted(_ muted: Bool, for streamerId: String) {
        var ids = allMuted()

        if muted {
            ids.insert(streamerId)
        } else {
            ids.remove(streamerId)
        }

        UserDefaults.standard.set(Array(ids), forKey: key)
    }
}
