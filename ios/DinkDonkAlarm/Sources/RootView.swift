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
    @State private var isShowingSubscriptions = false

    var body: some View {
        NavigationStack {
            ZStack {
                backgroundGradient

                VStack(spacing: 28) {
                    Spacer()

                    orb

                    VStack(spacing: 10) {
                        Text(headline)
                            .font(.title2.bold())
                            .multilineTextAlignment(.center)
                            .contentTransition(.opacity)

                        if !appState.isAlarming {
                            connectionBadge
                        }
                    }
                    .padding(.horizontal)

                    if appState.isAlarming {
                        Button(role: .destructive) {
                            appState.stopAlarm()
                        } label: {
                            Label("Stop Alarm", systemImage: "stop.fill")
                                .font(.title3.bold())
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 6)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.red)
                        .clipShape(Capsule())
                        .shadow(color: .red.opacity(0.35), radius: 20, y: 8)
                        .padding(.horizontal, 32)
                        .transition(.scale.combined(with: .opacity))
                    }

                    Spacer()
                    Spacer()

                    Button {
                        appState.logOut()
                    } label: {
                        Label("Log Out", systemImage: "rectangle.portrait.and.arrow.right")
                            .font(.footnote.weight(.medium))
                    }
                    .foregroundStyle(.secondary)
                    .padding(.bottom, 8)
                }
                .padding()
                .animation(.spring(response: 0.4, dampingFraction: 0.7), value: appState.isAlarming)
            }
            .navigationTitle("DinkDonk Alarm")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        isShowingSubscriptions = true
                    } label: {
                        Image(systemName: "switch.2")
                    }
                    .accessibilityLabel("Alarm Subscriptions")
                }
            }
            .sheet(isPresented: $isShowingSubscriptions) {
                SubscriptionsView()
            }
            .sensoryFeedback(.warning, trigger: appState.isAlarming)
        }
    }

    private var backgroundGradient: some View {
        LinearGradient(
            colors: [orbColor.opacity(0.16), Color(.systemBackground)],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }

    private var orb: some View {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [orbColor, orbColor.opacity(0.6)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 200, height: 200)
                .shadow(color: orbColor.opacity(0.4), radius: 30, y: 10)

            Image(systemName: appState.isAlarming ? "bell.fill" : "bell")
                .font(.system(size: 72, weight: .semibold))
                .foregroundStyle(.white)
                .symbolEffect(.pulse, isActive: appState.isAlarming)
        }
        .scaleEffect(appState.isAlarming ? 1.05 : 1.0)
    }

    private var connectionBadge: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(connectionColor)
                .frame(width: 8, height: 8)

            Text(connectionLabel)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(.thinMaterial, in: Capsule())
    }

    private var orbColor: Color {
        if appState.isAlarming { return .red }
        switch appState.connectionState {
        case .connected: return Theme.accent
        case .connecting: return .orange
        case .disconnected: return .gray
        }
    }

    private var connectionColor: Color {
        switch appState.connectionState {
        case .connected: return .green
        case .connecting: return .orange
        case .disconnected: return .red
        }
    }

    private var connectionLabel: String {
        switch appState.connectionState {
        case .connected: return "Connected"
        case .connecting: return "Connecting…"
        case .disconnected: return "Disconnected — retrying…"
        }
    }

    private var headline: String {
        if appState.isAlarming {
            return "A streamer you're tracking just went live!"
        }
        switch appState.connectionState {
        case .connected: return "All quiet for now"
        case .connecting: return "Connecting…"
        case .disconnected: return "Reconnecting…"
        }
    }
}
