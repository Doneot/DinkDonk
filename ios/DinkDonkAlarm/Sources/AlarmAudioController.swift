import AVFoundation

/// Owns the app's single AVAudioSession and is the entire reason this needs
/// to be a native app instead of a web push notification: an
/// `AVAudioSession` in the `.playback` category plays through the phone's
/// physical Ring/Silent switch by design (the same reason a podcast app
/// isn't silenced by it) - no entitlement, no Apple approval needed.
///
/// It also doubles as the app's background-keepalive mechanism: with
/// `UIBackgroundModes: [audio]` enabled (set via Xcode's Signing &
/// Capabilities tab - see ios/DinkDonkAlarm/README.md) and this session
/// continuously looping *something*, iOS keeps the process resident in the
/// background so LiveSocketManager's connection stays open. Swapping the
/// quiet loop for the loud one is how a `streamer_live_changed` event
/// becomes an audible alarm.
@MainActor
final class AlarmAudioController: ObservableObject {
    @Published private(set) var isAlarming = false

    private var engine = AVAudioEngine()
    private var player = AVAudioPlayerNode()
    private let sampleRate: Double = 44_100

    private lazy var keepAliveBuffer = Self.makeToneBuffer(
        frequency: 0,
        amplitude: 0.0001,
        duration: 1.0,
        sampleRate: sampleRate
    )

    private lazy var alarmBuffer = Self.makeAlarmBuffer(sampleRate: sampleRate)

    init() {
        wireEngine()
        observeInterruptions()
    }

    private func wireEngine() {
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: alarmBuffer.format)
    }

    /// Call once, after login succeeds (or on cold launch if already logged
    /// in). Configures the session to play nicely alongside whatever else
    /// might already be playing on the phone.
    func startKeepAlive() {
        configureSession(mixWithOthers: true)
        guard !engine.isRunning else { return }
        try? engine.start()
        player.scheduleBuffer(keepAliveBuffer, at: nil, options: .loops)
        player.play()
    }

    /// Switches to the loud loop. Deliberately does *not* mix with other
    /// audio - if the user's listening to music, the alarm should take over,
    /// not compete quietly underneath it.
    func triggerAlarm() {
        isAlarming = true
        configureSession(mixWithOthers: false)
        player.stop()
        if !engine.isRunning { try? engine.start() }
        player.scheduleBuffer(alarmBuffer, at: nil, options: .loops)
        player.play()
    }

    func stopAlarm() {
        isAlarming = false
        configureSession(mixWithOthers: true)
        player.stop()
        if !engine.isRunning { try? engine.start() }
        player.scheduleBuffer(keepAliveBuffer, at: nil, options: .loops)
        player.play()
    }

    /// Called periodically by AppState's watchdog timer. The keep-alive loop
    /// can silently stop (an interruption that never resumed cleanly, a
    /// route change, an edge case the notification-based handlers miss) and
    /// once it does, the background process has nothing keeping it resident
    /// - this is the safety net that notices and restarts it without waiting
    /// for the user to reopen the app.
    func ensureRunning() {
        guard !engine.isRunning else { return }
        if isAlarming {
            triggerAlarm()
        } else {
            startKeepAlive()
        }
    }

    private func configureSession(mixWithOthers: Bool) {
        let session = AVAudioSession.sharedInstance()
        let options: AVAudioSession.CategoryOptions = mixWithOthers ? [.mixWithOthers] : []
        try? session.setCategory(.playback, mode: .default, options: options)
        try? session.setActive(true)
    }

    private func observeInterruptions() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMediaServicesReset),
            name: AVAudioSession.mediaServicesWereResetNotification,
            object: nil
        )
    }

    // Media services resetting (rare, but happens - e.g. after certain
    // CarPlay/AirPlay route changes) invalidates the engine and everything
    // connected to it; Apple's docs say the fix is to throw the old engine
    // away and rebuild from scratch, not just restart it.
    @objc private func handleMediaServicesReset() {
        Task { @MainActor in
            self.engine = AVAudioEngine()
            self.player = AVAudioPlayerNode()
            self.wireEngine()
            if self.isAlarming {
                self.triggerAlarm()
            } else {
                self.startKeepAlive()
            }
        }
    }

    // A phone call or another app briefly taking over audio interrupts the
    // session; without resuming afterward, the keepalive (and therefore the
    // background connection) silently dies until the app is reopened.
    @objc private func handleInterruption(_ notification: Notification) {
        guard let info = notification.userInfo,
              let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue),
              type == .ended
        else { return }

        Task { @MainActor in
            if self.isAlarming {
                self.triggerAlarm()
            } else {
                self.startKeepAlive()
            }
        }
    }

    private static func makeToneBuffer(
        frequency: Double,
        amplitude: Float,
        duration: Double,
        sampleRate: Double
    ) -> AVAudioPCMBuffer {
        let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!
        let frameCount = AVAudioFrameCount(sampleRate * duration)
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount)!
        buffer.frameLength = frameCount

        let channel = buffer.floatChannelData![0]
        for frame in 0..<Int(frameCount) {
            if frequency > 0 {
                let t = Double(frame) / sampleRate
                channel[frame] = Float(sin(2.0 * .pi * frequency * t)) * amplitude
            } else {
                channel[frame] = amplitude
            }
        }
        return buffer
    }

    /// A 1kHz beep, 0.3s on / 0.2s off, looping - loud and unmistakably an
    /// alarm rather than a notification chime.
    private static func makeAlarmBuffer(sampleRate: Double) -> AVAudioPCMBuffer {
        let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!
        let onDuration = 0.3
        let offDuration = 0.2
        let cycle = onDuration + offDuration
        let totalDuration = cycle * 4 // 4 beeps per loop iteration
        let frameCount = AVAudioFrameCount(sampleRate * totalDuration)
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount)!
        buffer.frameLength = frameCount

        let channel = buffer.floatChannelData![0]
        for frame in 0..<Int(frameCount) {
            let t = Double(frame) / sampleRate
            let posInCycle = t.truncatingRemainder(dividingBy: cycle)
            channel[frame] = posInCycle < onDuration
                ? Float(sin(2.0 * .pi * 1000.0 * t)) * 0.9
                : 0
        }
        return buffer
    }
}
