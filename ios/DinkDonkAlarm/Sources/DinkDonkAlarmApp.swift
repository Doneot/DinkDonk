import SwiftUI

@main
struct DinkDonkAlarmApp: App {
    @StateObject private var appState = AppState()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
                .tint(Theme.accent)
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                appState.ensureConnected()
            }
        }
    }
}
