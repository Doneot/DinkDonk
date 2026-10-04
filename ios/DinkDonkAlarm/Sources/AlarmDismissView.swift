import SwiftUI

/// Full-screen alarm face shown whenever `AppState.isAlarming` is true (see
/// RootView's `.fullScreenCover`). Modeled on iOS's own lock-screen alarm:
/// the only way to silence it is a deliberate drag all the way across the
/// track, not a single tap - a notification action or an in-app button, both
/// of which this app used to offer, are too easy to hit half asleep without
/// actually waking up.
struct AlarmDismissView: View {
    @EnvironmentObject private var appState: AppState

    @GestureState private var dragTranslation: CGFloat = 0
    @State private var trackWidth: CGFloat = 0
    @State private var isCompleting = false

    private let thumbDiameter: CGFloat = 64
    private let trackInset: CGFloat = 6
    /// Fraction of the available travel the thumb must cross before a
    /// release counts as "dismissed" rather than snapping back.
    private let completionThreshold: CGFloat = 0.9

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.red.opacity(0.55), .black],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 40) {
                Spacer()

                Image(systemName: "bell.fill")
                    .font(.system(size: 88, weight: .bold))
                    .foregroundStyle(.white)
                    .symbolEffect(.pulse, isActive: true)

                VStack(spacing: 8) {
                    Text("DinkDonk Alarm")
                        .font(.largeTitle.bold())
                    Text("A streamer you're tracking just went live.")
                        .font(.body)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.white.opacity(0.8))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 32)

                Spacer()

                slideToStop
                    .padding(.horizontal, 24)
                    .padding(.bottom, 40)
            }
        }
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
    }

    private var maxDrag: CGFloat {
        max(trackWidth - thumbDiameter - trackInset * 2, 0)
    }

    private var thumbOffset: CGFloat {
        min(max(dragTranslation, 0), maxDrag)
    }

    private var slideToStop: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(.white.opacity(0.15))

                Text(isCompleting ? "Stopping…" : "Slide to stop")
                    .font(.headline)
                    .foregroundStyle(.white.opacity(0.85))
                    .frame(maxWidth: .infinity)

                Circle()
                    .fill(.white)
                    .frame(width: thumbDiameter, height: thumbDiameter)
                    .overlay(
                        Image(systemName: "stop.fill")
                            .font(.title2.bold())
                            .foregroundStyle(.red)
                    )
                    .padding(.leading, trackInset)
                    .offset(x: thumbOffset)
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .updating($dragTranslation) { value, state, _ in
                                state = value.translation.width
                            }
                            .onEnded { value in
                                guard maxDrag > thumbDiameter else { return }
                                if value.translation.width >= maxDrag * completionThreshold {
                                    completeDismiss()
                                }
                            }
                    )
                    .animation(.interactiveSpring(), value: dragTranslation)
            }
            .frame(height: thumbDiameter + trackInset * 2)
            .onAppear { trackWidth = geo.size.width }
            .onChange(of: geo.size.width) { _, newValue in trackWidth = newValue }
        }
        .frame(height: thumbDiameter + trackInset * 2)
    }

    private func completeDismiss() {
        guard !isCompleting else { return }
        isCompleting = true
        appState.stopAlarm()
    }
}
