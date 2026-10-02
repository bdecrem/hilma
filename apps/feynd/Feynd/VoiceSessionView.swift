import SwiftUI

/// Voice mode, jelly edition (JellyVoice.swift): the dodo itself is the
/// voice. It stands on a jelly cushion and performs the session — looking
/// around while it tunes in, wide-eyed while you talk, eyes up while it
/// thinks, talking with ripples behind it. Hands-free shows a row of jelly
/// bars under it; hold-to-talk swaps them for one big squishy key. The
/// subject rides on a ribbon; jelly bubbles drift up the backdrop.
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
    @State private var client: any DodoVoiceClient
    @State private var muted = false
    @State private var ending = false
    /// Hold-to-talk (Voice settings, per device). Read once at init so the
    /// session and its controls agree for the whole call.
    private let holdToTalk: Bool
    /// `-VoiceMockMood <mood>` (simulator): show that mood with no session.
    private let mockMood: VoiceMood?

    init(mode: String, threadId: String? = nil, cardIds: [String]? = nil,
         title: String? = nil, onFinished: ((String?) -> Void)? = nil) {
        self.mode = mode
        self.threadId = threadId
        self.title = title
        self.onFinished = onFinished
        let hold = UserDefaults.standard.bool(forKey: VoiceSettingsView.holdToTalkKey)
        self.holdToTalk = hold
        #if targetEnvironment(simulator)
        self.mockMood = UserDefaults.standard.string(forKey: "VoiceMockMood").flatMap(VoiceMood.init(rawValue:))
        #else
        self.mockMood = nil
        #endif
        // GPT-Live or ElevenLabs + Claude — the Voice engine setting.
        _client = State(initialValue: makeDodoVoiceClient(mode: mode, threadId: threadId, cardIds: cardIds,
                                                          holdToTalk: hold))
    }

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()
            JellyBubbleBackdrop().ignoresSafeArea()

            VStack(spacing: 0) {
                headerRow

                Text("TALKING ABOUT")
                    .font(.system(size: 11, weight: .bold))
                    .tracking(2.2)
                    .foregroundStyle(FeyndTheme.text3)
                    .padding(.top, 14)
                JellyRibbonView(text: tapeText, col: 0x8F63F2, size: 12.5)
                    .frame(maxWidth: 310)
                    .padding(.top, 8)

                Spacer(minLength: 0)

                JellyVoiceStage(mood: mood)

                Group {
                    if holdToTalk {
                        JellyTalkKey(mood: mood,
                                     onKeyDown: { client.beginTalking() },
                                     onKeyUp: { client.endTalking() })
                    } else {
                        JellyVoiceBars(mood: mood)
                    }
                }
                .padding(.top, 2)

                Spacer(minLength: 0)

                Text(transcriptText)
                    .font(.custom("Fredoka", size: 19).weight(.medium))
                    .foregroundStyle(FeyndTheme.text)
                    .multilineTextAlignment(.center)
                    .textSelection(.enabled)
                    .padding(.horizontal, 36)

                controls
                    .padding(.top, 24)
                    .padding(.bottom, 44)
            }
        }
        .task {
            if mockMood != nil { return }
            await client.start()
            #if targetEnvironment(simulator) || (DEBUG && targetEnvironment(macCatalyst))
            // `-VoiceLiveTest 1` — headless GPT-Live drill; read the
            // F2_LIVE_TEST lines in the sim log.
            if UserDefaults.standard.bool(forKey: "VoiceLiveTest") {
                await runLiveDrill()
            }
            #endif
        }
        .onDisappear { client.stop() }
    }

    /// What the ribbon reads — the session's subject.
    private var tapeText: String {
        (title ?? "Dodo voice session").uppercased()
    }

    /// The dodo's mood, derived from the client's phase and, in hold-to-talk,
    /// whether the key is held or a reply is pending.
    private var mood: VoiceMood {
        if let mockMood { return mockMood }
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
            .padding(.leading, 10)
            .padding(.trailing, 12)
            .padding(.vertical, 7)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().stroke(.white.opacity(0.35), lineWidth: 1))

            Spacer()

            Button {
                client.stop()
                if let onFinished { onFinished(nil) } else { closeModal(dismiss) }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(FeyndTheme.text2)
                    .frame(width: 34, height: 34)
                    .background(.ultraThinMaterial, in: Circle())
                    .overlay(Circle().stroke(.white.opacity(0.35), lineWidth: 1))
            }
            .buttonStyle(JellyPressStyle())
            .keyboardShortcut(.cancelAction)
        }
        .padding(.horizontal, 18)
        .padding(.top, 12)
        .padding(.bottom, 4)
    }

    private var transcriptText: String {
        if let mockMood {
            switch mockMood {
            case .tuning: return "Tuning in…"
            case .listening: return holdToTalk ? "Press and hold the button to talk." : "Dodo is listening — just talk."
            case .talking: return "Listening…"
            case .thinking: return "Dodo is thinking…"
            case .speaking: return holdToTalk ? "Dodo is speaking — press the button to cut in." : "Dodo is speaking…"
            case .ended: return "Session ended."
            }
        }
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
    /// `-VoiceLiveTest 1` — headless GPT-Live drill. The sim mic is silent,
    /// so it checks the protocol, not the speech: session starts, Dodo
    /// speaks (its scripted opening, or a nudged greeting in Talk mode),
    /// audio actually arrives, a hold-to-talk press/release leaves the
    /// session healthy, and End closes gracefully + uploads the transcript.
    private func runLiveDrill() async {
        func log(_ m: String) { NSLog("F2_LIVE_TEST %@ phase=%@ status=%@", m, String(describing: client.phase), client.status) }
        func waitFor(_ ok: @escaping () -> Bool, _ seconds: Double) async -> Bool {
            let deadline = Date().addingTimeInterval(seconds)
            while Date() < deadline {
                if ok() { return true }
                try? await Task.sleep(for: .milliseconds(100))
            }
            return ok()
        }
        let up = await waitFor({ client.debugSessionStarted && client.debugChannelOpen }, 30)
        log(up ? "PASS session-started" : "FAIL never-started")
        guard up else { log("done"); return }

        if mode == "global" || mode == "topic" {
            // Talk mode waits for the user; an appended instruction alone
            // does not reliably start the model, so follow the docs'
            // greeting recipe: instruction, then a commentary prompt.
            client.debugInstruct("Greet the user by name in one short sentence and ask what they'd like to talk about. Speak now, without waiting for them, then listen.")
            client.debugCommentary("Begin the conversation now, following the instructions provided.")
            log("nudged-greeting")
        }
        let spoke = await waitFor({ !client.debugLastAssistantText.isEmpty }, 25)
        log(spoke ? "PASS dodo-spoke text=\(client.debugLastAssistantText.prefix(120))" : "FAIL dodo-silent")

        let before = await client.debugInboundAudio()
        try? await Task.sleep(for: .seconds(2))
        let after = await client.debugInboundAudio()
        let energy = (after?.energy ?? 0) - (before?.energy ?? 0)
        log(energy > 0 ? "PASS audio-arrived energy=\(energy)" : "FAIL no-audio energy=\(energy)")

        if holdToTalk {
            client.beginTalking(); log("press")
            try? await Task.sleep(for: .milliseconds(600))
            client.endTalking(); log("release")
            let settled = await waitFor({ client.phase == .connected || client.phase == .speaking }, 10)
            log(settled ? "PASS ptt-settled" : "FAIL ptt-unsettled")
        }
        // Let Dodo finish its opening so the transcript has a real turn.
        _ = await waitFor({ client.phase == .connected && client.status != "Thinking" }, 20)

        let id = await client.end()
        log(client.debugCloseReason == "close_requested" ? "PASS closed-gracefully" : "FAIL close-reason=\(client.debugCloseReason ?? "none")")
        log(id != nil && client.debugTranscriptUploaded ? "PASS transcript-uploaded turns=\(client.debugTurnCount)" : "FAIL transcript-not-uploaded")
        log("done")
    }
    #endif

    private var controls: some View {
        HStack(spacing: 16) {
            // Hold-to-talk: the jelly key is the mic control; only End
            // lives down here.
            if !holdToTalk {
                CircleControlButton(
                    label: muted ? "Unmute" : "Mute", systemImage: muted ? "mic.slash.fill" : "mic.fill",
                    danger: false, active: muted
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

// MARK: - Jelly control button

/// A round jelly control under the stage: frosted jelly for the quiet ones,
/// lemon while a toggle is on (muted), cherry for End. Squashes on press.
struct CircleControlButton: View {
    let label: String
    let systemImage: String
    let danger: Bool
    var active: Bool = false
    var action: () -> Void

    @Environment(\.colorScheme) private var scheme

    private var triad: JellyTriad {
        if danger { return .cherry }
        if active { return .gold }
        return scheme == .dark ? .glassNight : .glass
    }

    private var iconColor: Color {
        if danger { return .white }
        if active { return Color(hex: Jelly.ink) }
        return FeyndTheme.text
    }

    var body: some View {
        VStack(spacing: 10) {
            Button(action: action) {
                ZStack {
                    JellyBall(triad: triad, diameter: 60, drop: 5)
                    Image(systemName: systemImage)
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(iconColor)
                        .shadow(color: danger ? Color(hex: 0x7A0A12).opacity(0.5) : .clear, radius: 1, y: 1)
                }
                .shadow(color: danger ? Color(hex: 0xFF2B36).opacity(0.35) : jellyRGBA(60, 30, 60, 0.18),
                        radius: danger ? 14 : 10, y: 6)
            }
            .buttonStyle(JellyPressStyle())

            Text(label)
                .font(.custom("Fredoka", size: 12.5).weight(.medium))
                .foregroundStyle(danger ? Color(hex: 0xE8444C) : FeyndTheme.text2)
        }
    }
}
