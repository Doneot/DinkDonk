import SwiftUI

/// Lets the user mute the alarm per-subscription (see AppState's
/// mutedStreamerIds/setAlarmEnabled and AlarmPreferencesStore) without
/// touching their actual DinkDonk subscriptions - this only controls whether
/// *this device* rings for a streamer, not whether the account follows them.
struct SubscriptionsView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if let error = appState.subscriptionsLoadError {
                    ContentUnavailableView {
                        Label("Couldn't Load Subscriptions", systemImage: "wifi.slash")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Retry") {
                            Task { await appState.loadSubscriptions() }
                        }
                    }
                } else if appState.subscriptions.isEmpty {
                    if appState.isLoadingSubscriptions {
                        ProgressView()
                    } else {
                        ContentUnavailableView {
                            Label("No Subscriptions", systemImage: "person.crop.circle.badge.questionmark")
                        } description: {
                            Text("Subscribe to streamers on the DinkDonk dashboard to see them here.")
                        }
                    }
                } else {
                    List {
                        Section {
                            ForEach(appState.subscriptions) { streamer in
                                SubscriptionRow(streamer: streamer)
                            }
                        } footer: {
                            Text("Muting a streamer only silences the alarm on this device - it doesn't change your DinkDonk subscriptions.")
                        }
                    }
                    .listStyle(.insetGrouped)
                    .refreshable {
                        await appState.loadSubscriptions()
                    }
                }
            }
            .navigationTitle("Alarm Subscriptions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .task {
                await appState.loadSubscriptions()
            }
        }
    }
}

private struct SubscriptionRow: View {
    @EnvironmentObject private var appState: AppState
    let streamer: SubscribedStreamer

    var body: some View {
        Toggle(
            isOn: Binding(
                get: { appState.isAlarmEnabled(for: streamer.id) },
                set: { appState.setAlarmEnabled($0, for: streamer.id) }
            )
        ) {
            HStack(spacing: 12) {
                avatar
                Text(streamer.name)
                    .font(.body)
            }
        }
    }

    @ViewBuilder
    private var avatar: some View {
        if let avatarURL = streamer.avatar.flatMap(URL.init) {
            AsyncImage(url: avatarURL) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFill()
                } else {
                    placeholder
                }
            }
            .frame(width: 36, height: 36)
            .clipShape(Circle())
        } else {
            placeholder
        }
    }

    private var placeholder: some View {
        Circle()
            .fill(Color.secondary.opacity(0.2))
            .frame(width: 36, height: 36)
            .overlay(
                Image(systemName: "person.fill")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            )
    }
}
