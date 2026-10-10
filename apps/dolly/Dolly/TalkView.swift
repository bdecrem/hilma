import SwiftUI

/// Part 1: three minutes of conversation, full-bleed in the voice color — a
/// different room. The mascot fills the top half, the last turns are bubbles,
/// nothing to tap but End (and the hold-to-talk key when that is on).
struct TalkView: View {
    let onDone: (DayView) -> Void
    let onLeave: () -> Void

    @Environment(AppState.self) private var state
    @State private var client: any DollyVoiceClient
    @State private var ending = false
    @State private var wrapSent = false
    private let holdToTalk: Bool
    private let skin = Skin.current

    init(onDone: @escaping (DayView) -> Void, onLeave: @escaping () -> Void) {
        self.onDone = onDone
        self.onLeave = onLeave
        let hold = UserDefaults.standard.bool(forKey: AppState.holdToTalkKey)
        holdToTalk = hold
        _client = State(initialValue: makeVoiceClient(mode: "talk", holdToTalk: hold))
    }

    var body: some View {
        ZStack {
            skin.voiceBackground.ignoresSafeArea()
            VStack(spacing: 0) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Day \(state.day?.n ?? 0) · Talk".uppercased()).font(skin.uiBold(11)).tracking(1.2).foregroundStyle(.white.opacity(0.7))
                        Text(state.day?.topic ?? "").font(skin.displayMedium(18)).foregroundStyle(.white)
                    }
                    Spacer()
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        Text(mmss(client.elapsed)).font(skin.display(20)).foregroundStyle(.white.opacity(0.9)).monospacedDigit()
                    }
                }
                .padding(.horizontal, 22)
                .padding(.top, 10)

                Spacer(minLength: 10)
                Mascot(size: 230, mood: mood)
                Text(statusLine).font(skin.uiBold(14)).foregroundStyle(.white.opacity(0.75)).padding(.top, 6)
                Spacer(minLength: 10)

                bubbles
                    .padding(.horizontal, 20)
                    .frame(maxHeight: 220, alignment: .bottom)

                controls
                    .padding(.top, 18)
                    .padding(.bottom, 24)
            }

            if ending {
                VStack(spacing: 14) {
                    Mascot(size: 110, mood: .thinking)
                    Text("Picking three things…").font(skin.display(22)).foregroundStyle(.white)
                    ProgressView().tint(.white)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(skin.voiceBottom.ignoresSafeArea())
                .transition(.opacity)
            }
        }
        .task {
            await client.start()
            #if targetEnvironment(simulator)
            if UserDefaults.standard.bool(forKey: "VoiceDrill") { await drill() }
            #endif
        }
        .task { await runClock() }
        .onDisappear { if !ending { client.stop() } }
    }

    private var mood: Mascot.Mood {
        switch client.phase {
        case .speaking: return .talking
        case .connected: return client.talking ? .listening : client.status == "Thinking" ? .thinking : .listening
        case .failed, .ended: return .sleepy
        default: return .idle
        }
    }

    private var statusLine: String {
        switch client.phase {
        case .idle, .requestingPermission, .creatingSession, .connecting: return "Calling…"
        case .connected:
            if holdToTalk { return client.talking ? "Listening" : client.status == "Thinking" ? "Dolly is thinking" : "Hold the key and talk" }
            return client.status == "Thinking" ? "Dolly is thinking" : "Dolly is listening — just talk"
        case .speaking: return holdToTalk ? "Dolly is speaking — hold the key to cut in" : "Dolly is speaking"
        case .failed(let m): return m
        case .ended: return "Call ended"
        }
    }

    private var bubbles: some View {
        VStack(spacing: 8) {
            ForEach(client.turns.suffix(3)) { turn in
                let you = turn.role == "user"
                Text(turn.text)
                    .font(skin.uiBold(16))
                    .foregroundStyle(you ? .white : skin.ink)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 11)
                    .background(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .fill(you ? Color.white.opacity(0.24) : Color.white)
                    )
                    .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(you ? Color.white.opacity(0.5) : .clear, lineWidth: 1))
                    .frame(maxWidth: .infinity, alignment: you ? .trailing : .leading)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: client.turns.count)
    }

    private var controls: some View {
        HStack(spacing: 18) {
            if holdToTalk {
                Text(client.talking ? "Listening…" : "Hold to talk")
                    .font(skin.display(18))
                    .foregroundStyle(client.talking ? skin.onVoice : skin.voiceBottom)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 18)
                    .background(Capsule().fill(client.talking ? skin.primary : Color.white))
                    .background(Capsule().fill(client.talking ? skin.primaryDeep : Color.white.opacity(0.4)).offset(y: 5))
                    .gesture(DragGesture(minimumDistance: 0)
                        .onChanged { _ in client.beginTalking() }
                        .onEnded { _ in client.endTalking() })
            }
            Button {
                Task { await finish() }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "phone.down.fill").font(.system(size: 16, weight: .bold))
                    Text("End").font(skin.display(18))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 26)
                .padding(.vertical, 18)
                .background(Capsule().fill(Color(hex: 0xE0405C)))
                .background(Capsule().fill(Color(hex: 0xA82840)).offset(y: 5))
            }
            .buttonStyle(PressStyle())
            .disabled(ending)
        }
        .padding(.horizontal, 24)
    }

    /// The wrap-up cue at the server's time, and the end after it.
    private func runClock() async {
        while client.phase != .connected && client.phase != .speaking {
            if case .failed = client.phase { return }
            if client.phase == .ended { return }
            try? await Task.sleep(for: .milliseconds(200))
        }
        guard let wrap = client.config?.wrap else { return }
        try? await Task.sleep(for: .milliseconds(wrap.afterMs))
        guard !ending, client.phase != .ended else { return }
        wrapSent = true
        client.sendCue(wrap.cue)
        try? await Task.sleep(for: .milliseconds(max(1000, wrap.endMs - wrap.afterMs)))
        guard !ending, client.phase != .ended else { return }
        await finish()
    }

    private func finish() async {
        guard !ending else { return }
        withAnimation { ending = true }
        let day = await client.end()
        if let day {
            onDone(day)
        } else {
            // The finish did not land (offline, a server error): back to the map, nothing lost.
            await state.refresh()
            onLeave()
        }
    }

    #if targetEnvironment(simulator)
    /// `-VoiceDrill 1`: the simulator mic is silent, so this proves the
    /// protocol — session up, Dolly spoke, audio arrived, a clean end with
    /// the finish landing. Read the DOLLY_DRILL lines in the sim log.
    private func drill() async {
        func log(_ m: String) { NSLog("DOLLY_DRILL %@ phase=%@ status=%@", m, String(describing: client.phase), client.status) }
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
        let spoke = await waitFor({ client.turns.contains { $0.role == "assistant" } }, 25)
        log(spoke ? "PASS dolly-spoke text=\(client.turns.last?.text.prefix(120) ?? "")" : "FAIL dolly-silent")
        let before = await client.debugInboundAudio()
        try? await Task.sleep(for: .seconds(2))
        let after = await client.debugInboundAudio()
        let energy = (after?.energy ?? 0) - (before?.energy ?? 0)
        log(energy > 0 ? "PASS audio-arrived energy=\(energy)" : "FAIL no-audio energy=\(energy)")
        if holdToTalk {
            client.beginTalking()
            try? await Task.sleep(for: .milliseconds(600))
            client.endTalking()
            let settled = await waitFor({ client.phase == .connected || client.phase == .speaking }, 10)
            log(settled ? "PASS ptt-settled" : "FAIL ptt-unsettled")
        }
        _ = await waitFor({ client.phase == .connected && client.status != "Thinking" }, 20)
        withAnimation { ending = true }
        let day = await client.end()
        log(day != nil ? "PASS finished state=\(day!.state) turns=\(client.turns.count)" : "FAIL finish-failed")
        log("done")
        if let day { onDone(day) } else { onLeave() }
    }
    #endif
}
