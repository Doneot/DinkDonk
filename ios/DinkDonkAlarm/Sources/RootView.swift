import SwiftUI

struct RootView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        Group {
            if appState.isLoggedIn {
                StatusView()
            } else {
                LoginView(serverURL: Config.serverURL) { cookie in
                    appState.completeLogin(cookie: cookie)
                }
            }
        }
    }
}

struct StatusView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: appState.isAlarming ? "bell.fill" : "bell")
                .font(.system(size: 64))
                .foregroundStyle(appState.isAlarming ? .red : .secondary)
                .symbolEffect(.pulse, isActive: appState.isAlarming)

            Text(statusText)
                .font(.headline)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            if appState.isAlarming {
                Button(role: .destructive) {
                    appState.stopAlarm()
                } label: {
                    Text("Stop Alarm")
                        .font(.title2.bold())
                        .frame(maxWidth: .infinity)
                        .padding()
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
                .padding(.horizontal)
            }

            Spacer()

            Button("Log Out") {
                appState.logOut()
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
            .padding(.bottom)
        }
        .padding()
    }

    private var statusText: String {
        if appState.isAlarming {
            return "A streamer you're tracking just went live!"
        }
        switch appState.connectionState {
        case .connected:
            return "Connected — listening for streamers going live."
        case .connecting:
            return "Connecting…"
        case .disconnected:
            return "Disconnected — retrying…"
        }
    }
}
