import SwiftUI

/// Voice mode — the Dodo Radio (v3, "the dial": DodoRadioDial.swift). A
/// small tabletop set with a sprout antenna and a glass tuning window; the
/// red needle is the expression. Hands-free shows a speaker with a VU
/// meter; hold-to-talk swaps it for one big press-to-talk key. The sky
/// behind it matches the app's modes: sunny morning in light, starry dusk
/// in dark. Palette comes straight from BRANDING.md / the Peck map.
struct VoiceSessionView: View {
    let mode: String
    let threadId: String?
    /// Optional header override ("Flash round · Big History").
    let title: String?
    /// When set, End hands the finished session off instead of dismissing:
    /// the transcript upload is AWAITED, then this runs with the voice
    /// session id (nil = abandoned via X / never connected). The host owns
    /// dismissal + whatever grading happens next.
    let onFinished: ((String?) -> Void)?

    @Environment(\.dismiss) private var dismiss
    @State private var client: RealtimeVoiceClient
    @State private var muted = false
    @State private var ending = false
    /// Hold-to-talk (Voice settings, per device). Read once at init so the
    /// session and its controls agree for the whole call.
    private let holdToTalk: Bool

    init(mode: String, threadId: String? = nil, cardIds: [String]? = nil,
         title: String? = nil, onFinished: ((String?) -> Void)? = nil) {
        self.mode = mode
        self.threadId = threadId
        self.title = title
        self.onFinished = onFinished
        let hold = UserDefaults.standard.bool(forKey: VoiceSettingsView.holdToTalkKey)
        self.holdToTalk = hold
        _client = State(initialValue: RealtimeVoiceClient(mode: mode, threadId: threadId, cardIds: cardIds,
                                                          holdToTalk: hold))
    }

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()
            VoiceSkyBackdrop().ignoresSafeArea()

            VStack(spacing: 0) {
                headerRow

                Text("TALKING ABOUT")
                    .font(.system(size: 11, weight: .bold))
                    .tracking(2.2)
                    .foregroundStyle(FeyndTheme.text3)
                    .padding(.top, 14)

                Spacer(minLength: 0)

                DodoRadioDial(
                    tape: tapeText,
                    mood: mood,
                    holdToTalk: holdToTalk,
                    onKeyDown: { client.beginTalking() },
                    onKeyUp: { client.endTalking() }
                )

                Spacer(minLength: 0)

                Text(transcriptText)
                    .font(.custom("Fredoka", size: 19).weight(.medium))
                    .foregroundStyle(FeyndTheme.text)
                    .multilineTextAlignment(.center)
                    .textSelection(.enabled)
                    .padding(.horizontal, 36)

                controls
                    .padding(.top, 26)
                    .padding(.bottom, 50)
            }
        }
        .task {
            await client.start()
            #if targetEnvironment(simulator) || (DEBUG && targetEnvironment(macCatalyst))
            // `-VoiceCutInTest 1` — headless hold-to-talk drill: one turn,
            // then press again while Dodo is still speaking. Read the
            // F2_REALTIME_TEST / F2_REALTIME_CUT_IN lines in the sim log.
            if holdToTalk, UserDefaults.standard.bool(forKey: "VoiceCutInTest") {
                await runCutInDrill()
            }
            #endif
        }
        .onDisappear { client.stop() }
    }

    /// What the radio's label tape reads — the session's subject.
    private var tapeText: String {
        (title ?? "Dodo voice session").uppercased()
    }

    /// The radio's mood, derived from the client's phase and, in hold-to-talk,
    /// whether the key is held or a reply is pending.
    private var mood: DodoRadioDial.Mood {
        switch client.phase {
        case .idle, .requestingPermission, .creatingSession, .connecting:
            return .tuning
        case .connected:
            if client.talking { return .talking }
            if holdToTalk && client.status == "Thinking" { return .thinking }
            return .listening
        case .speaking:
            return client.talking ? .talking : .speaking
        case .failed, .ended:
            return .ended
        }
    }

    // MARK: - Sections

    private var headerRow: some View {
        HStack {
            // Green-dot status pill.
            HStack(spacing: 6) {
                Circle()
                    .fill(Color(hex: 0x46D18A))
                    .frame(width: 6, height: 6)
                    .shadow(color: Color(hex: 0x46D18A).opacity(0.8), radius: 4)
                Text("Voice session")
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(FeyndTheme.text2)
            }
            .padding(.leading, 8)
            .padding(.trailing, 10)
            .padding(.vertical, 6)
            .background(FeyndTheme.surface.opacity(0.7), in: Capsule())
            .overlay(Capsule().stroke(FeyndTheme.border, lineWidth: 1))

            Spacer()

            Button {
                client.stop()
                if let onFinished { onFinished(nil) } else { closeModal(dismiss) }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(FeyndTheme.text2)
                    .frame(width: 32, height: 32)
                    .background(FeyndTheme.surface2, in: Circle())
                    .overlay(Circle().stroke(FeyndTheme.border, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .keyboardShortcut(.cancelAction)
        }
        .padding(.horizontal, 18)
        .padding(.top, 12)
        .padding(.bottom, 4)
    }

    private var transcriptText: String {
        switch client.phase {
        case .idle, .requestingPermission, .creatingSession, .connecting:
            return "Tuning in…"
        case .connected:
            if holdToTalk {
                return client.talking ? "Listening…"
                    : client.status == "Thinking" ? "Dodo is thinking…"
                    : "Press and hold the button to talk."
            }
            return "Dodo is listening — just talk."
        case .speaking:
            return holdToTalk ? "Dodo is speaking — press the button to cut in." : "Dodo is speaking…"
        case .failed(let m): return m
        case .ended: return "Session ended."
        }
    }

    #if targetEnvironment(simulator) || (DEBUG && targetEnvironment(macCatalyst))
    private func runCutInDrill() async {
        func log(_ m: String) { NSLog("F2_REALTIME_TEST %@ phase=%@ status=%@", m, String(describing: client.phase), client.status) }
        func waitFor(_ ok: @escaping () -> Bool, _ seconds: Double) async -> Bool {
            let deadline = Date().addingTimeInterval(seconds)
            while Date() < deadline {
                if ok() { return true }
                try? await Task.sleep(for: .milliseconds(100))
            }
            return ok()
        }
        let up = await waitFor({ client.phase == .connected && client.debugChannelOpen }, 25)
        log(up ? "connected" : "FAIL never-connected")

        // Turn 1: a long answer, so there is plenty of audio to cut into.
        client.debugSay("Tell me about the Battle of Hastings in great detail. Talk for at least a full minute without stopping.", cutIn: false)
        log("say-1")
        let playing = await waitFor({ client.debugAudioPlaying }, 25)
        log(playing ? "dodo-audio-playing" : "FAIL no-audio-for-turn-1")
        try? await Task.sleep(for: .seconds(4))
        let before = await client.debugInboundAudio()
        try? await Task.sleep(for: .seconds(1))
        let e0 = await client.debugInboundAudio()
        log("old-audio-rate=\((e0?.energy ?? 0) - (before?.energy ?? 0)) per s")

        // Cut in with a topic change. Old audio must stop arriving; the
        // reply must answer the NEW question.
        client.debugSay("Stop. Different question: what is the capital of France? Answer only that, in one short sentence.", cutIn: true)
        log("cut-in")
        var prev = e0
        var leaked = 0.0
        var newAudioAt: Double? = nil
        for i in 1...30 {
            try? await Task.sleep(for: .milliseconds(200))
            let e = await client.debugInboundAudio()
            let dE = (e?.energy ?? 0) - (prev?.energy ?? 0)
            let playing = client.debugAudioPlaying
            NSLog("F2_REALTIME_TEST inbound t=%.1fs dE=%.6f playing=%d", Double(i) * 0.2, dE, playing ? 1 : 0)
            // Energy that arrives after the first 400ms while nothing new
            // is playing is the old reply leaking through.
            if i > 2, !playing { leaked += dE }
            if playing, newAudioAt == nil { newAudioAt = Double(i) * 0.2 }
            prev = e
            if playing, i > 5 { break }
        }
        log(leaked < 0.0005 ? "PASS old-audio-stopped leaked=\(leaked)" : "FAIL old-audio-leaked leaked=\(leaked)")
        log("new-audio-at=\(newAudioAt.map { String($0) } ?? "never")")
        _ = await waitFor({ client.debugLastAssistantText.localizedCaseInsensitiveContains("Paris") }, 25)
        let reply = client.debugLastAssistantText
        log(reply.localizedCaseInsensitiveContains("Paris") ? "PASS new-question-answered" : "FAIL reply-ignored-cut-in reply=\(reply.prefix(120))")

        // Quick tap mid-speech: Dodo must stop and stay quiet.
        _ = await waitFor({ client.debugAudioPlaying }, 10)
        client.beginTalking(); log("press-tap")
        try? await Task.sleep(for: .milliseconds(80))
        client.endTalking(); log("release-tap")
        try? await Task.sleep(for: .seconds(5))
        log(client.debugAudioPlaying || client.phase == .speaking ? "FAIL tap produced audio" : "PASS tap-stayed-quiet")
        log("done")
    }
    #endif

    private var controls: some View {
        HStack(spacing: 16) {
            // Hold-to-talk: the radio's key is the mic control; only End
            // lives down here.
            if !holdToTalk {
                CircleControlButton(
                    label: muted ? "Unmute" : "Mute", systemImage: muted ? "mic.slash.fill" : "mic.fill",
                    danger: false
                ) {
                    muted.toggle()
                    client.setMuted(muted)
                }
                CircleControlButton(label: "Keyboard", systemImage: "keyboard", danger: false) { }
            }
            CircleControlButton(label: ending ? "…" : "End", systemImage: "phone.down.fill", danger: true) {
                guard !ending else { return }
                if let onFinished {
                    // Flash / Final Review: wait for the transcript to land,
                    // then hand off for grading — the host dismisses.
                    ending = true
                    Task {
                        let id = await client.end()
                        onFinished(id)
                    }
                } else {
                    client.stop()
                    closeModal(dismiss)
                }
            }
        }
    }
}

// MARK: - Sky backdrop (starry dusk / sunny morning, like the Peck map)

private struct VoiceSkyBackdrop: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            if scheme == .dark {
                // Dusk glow + crescent moon + a few calm stars.
                RadialGradient(
                    colors: [Color(hex: 0x4A3D63).opacity(0.55), Color(hex: 0x4A3D63).opacity(0)],
                    center: UnitPoint(x: 0.5, y: 0.30),
                    startRadius: 10, endRadius: w * 0.85
                )
                ZStack {
                    Circle().fill(Color(hex: 0xF3E3B2))
                        .frame(width: 44, height: 44)
                    Circle().fill(Color(hex: 0x1E2440).opacity(0.92))
                        .frame(width: 44, height: 44)
                        .offset(x: 13, y: -4)
                }
                .position(x: 62, y: 118)
                ForEach(0..<8, id: \.self) { i in
                    let fi = Double(i)
                    Circle()
                        .fill(Color(hex: 0xF3E9C8).opacity(0.30 + 0.35 * ((fi * 0.618).truncatingRemainder(dividingBy: 1))))
                        .frame(width: 3, height: 3)
                        .position(
                            x: w * (0.10 + 0.82 * ((fi * 0.618 + 0.21).truncatingRemainder(dividingBy: 1))),
                            y: 70 + 620 * ((fi * 0.755).truncatingRemainder(dividingBy: 1))
                        )
                }
            } else {
                // Morning: one soft sun.
                Circle()
                    .fill(Color(hex: 0xFFD469))
                    .frame(width: 56, height: 56)
                    .background(
                        Circle().fill(Color(hex: 0xFFD469).opacity(0.28))
                            .frame(width: 92, height: 92)
                    )
                    .position(x: 66, y: 122)
            }
        }
        .allowsHitTesting(false)
    }

}

// MARK: - Circle control button

struct CircleControlButton: View {
    let label: String
    let systemImage: String
    let danger: Bool
    var action: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            Button(action: action) {
                Image(systemName: systemImage)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(danger ? .white : FeyndTheme.text)
                    .frame(width: 58, height: 58)
                    .background(
                        Circle().fill(danger ? Color(hex: 0xC84A3C) : FeyndTheme.surface2)
                    )
                    .overlay(
                        Circle().stroke(danger ? Color(hex: 0xE0635A) : FeyndTheme.border, lineWidth: 1)
                    )
                    .shadow(color: danger ? Color(hex: 0xC84A3C).opacity(0.4) : .black.opacity(0.3),
                            radius: danger ? 18 : 14, y: 4)
            }
            .buttonStyle(.plain)

            Text(label)
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.2)
                .foregroundStyle(danger ? Color(hex: 0xE88A82) : FeyndTheme.text2)
        }
    }
}
