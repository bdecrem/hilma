import SwiftUI

/// The star round: a scripted dialogue. Dolly says her lines in order; the
/// screen shows the current line in the language with the English under
/// it, and a suggested reply in English (the language behind a tap). Follow
/// it or wander; she comes back to the script. Her turns carry a hidden
/// step marker the server strips and keeps; the screen asks for it after
/// each of her turns.
struct StarScriptView: View {
    let onDone: (DayView) -> Void
    let onLeave: () -> Void

    @Environment(AppState.self) private var state
    @State private var client: any DollyVoiceClient
    @State private var step = 0
    @State private var reveal = false
    @State private var ending = false
    private let holdToTalk: Bool
    private let skin = Skin.current

    init(onDone: @escaping (DayView) -> Void, onLeave: @escaping () -> Void) {
        self.onDone = onDone
        self.onLeave = onLeave
        let hold = UserDefaults.standard.bool(forKey: AppState.holdToTalkKey)
        holdToTalk = hold
        _client = State(initialValue: makeVoiceClient(mode: "star", holdToTalk: hold))
    }

    private var script: [ScriptStep] { client.config?.script ?? [] }
    /// The line on screen: the one Dolly last said, or the first while she starts.
    private var shown: Int { min(max(step, 1), max(script.count, 1)) }
    private var current: ScriptStep? { script.indices.contains(shown - 1) ? script[shown - 1] : nil }

    var body: some View {
        ZStack {
            skin.voiceBackground.ignoresSafeArea()
            VStack(spacing: 0) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Day \(state.day?.n ?? 0) · Star round".uppercased()).font(skin.uiBold(11)).tracking(1.2).foregroundStyle(.white.opacity(0.7))
                        Text(script.isEmpty ? "Writing the dialogue…" : "Line \(shown) of \(script.count)").font(skin.displayMedium(18)).foregroundStyle(.white)
                    }
                    Spacer()
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        Text(mmss(client.elapsed)).font(skin.display(20)).foregroundStyle(.white.opacity(0.9)).monospacedDigit()
                    }
                }
                .padding(.horizontal, 22)
                .padding(.top, 10)

                HStack(spacing: 14) {
                    Mascot(size: 86, mood: mood)
                    Text(statusLine).font(skin.uiBold(14)).foregroundStyle(.white.opacity(0.8))
                    Spacer()
                }
                .padding(.horizontal, 22)
                .padding(.top, 12)

                ScrollView {
                    VStack(spacing: 12) {
                        if let line = current {
                            Card(padding: 20) {
                                VStack(alignment: .leading, spacing: 10) {
                                    Text("Dolly says".uppercased()).font(skin.uiBold(11)).tracking(1).foregroundStyle(skin.ink3)
                                    Text(line.dolly).font(skin.display(26)).foregroundStyle(skin.word).fixedSize(horizontal: false, vertical: true)
                                    Text(line.dollyEn).font(skin.ui(16)).foregroundStyle(skin.ink2).fixedSize(horizontal: false, vertical: true)
                                    Rectangle().fill(skin.line).frame(height: 1.5).padding(.vertical, 4)
                                    Text("You could say".uppercased()).font(skin.uiBold(11)).tracking(1).foregroundStyle(skin.ink3)
                                    Text(line.youEn).font(skin.uiBold(19)).foregroundStyle(skin.ink).fixedSize(horizontal: false, vertical: true)
                                    if reveal {
                                        Text(line.you).font(skin.display(21)).foregroundStyle(skin.primary).fixedSize(horizontal: false, vertical: true)
                                            .transition(.opacity)
                                    } else {
                                        Button {
                                            withAnimation(.easeInOut(duration: 0.2)) { reveal = true }
                                        } label: {
                                            Text(state.user?.language == "zh" ? "Show it in Mandarin" : "Show it in Spanish")
                                                .font(skin.uiBold(14)).foregroundStyle(skin.primary)
                                                .padding(.horizontal, 12).padding(.vertical, 7)
                                                .background(Capsule().fill(skin.bgTop))
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .id(shown)
                            .transition(.move(edge: .trailing).combined(with: .opacity))
                        }

                        // What was actually said, when it isn't the script line.
                        if let dolly = lastDollyAside {
                            bubble(dolly, you: false)
                        }
                        if let you = client.turns.last(where: { $0.role == "user" }) {
                            bubble(you.text, you: true)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 14)
                    .padding(.bottom, 10)
                }
                .scrollBounceBehavior(.basedOnSize)

                controls
                    .padding(.top, 10)
                    .padding(.bottom, 24)
            }

            if ending {
                VStack(spacing: 14) {
                    Mascot(size: 110, mood: .thinking)
                    Text("Reading the round…").font(skin.display(22)).foregroundStyle(.white)
                    ProgressView().tint(.white)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(skin.voiceBottom.ignoresSafeArea())
                .transition(.opacity)
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: shown)
        .task { await client.start() }
        .task { await runClock() }
        .onChange(of: client.turns.count) { _, _ in
            // Dolly's turn landed: ask the server which line it was.
            guard client.turns.last?.role == "assistant" else { return }
            Task { await fetchStep() }
        }
        .onChange(of: shown) { _, _ in reveal = false }
        .onDisappear { if !ending { client.stop() } }
    }

    private func fetchStep() async {
        guard let id = client.voiceSessionId else { return }
        // The marker is written as the turn streams; a beat later it is there.
        try? await Task.sleep(for: .milliseconds(400))
        if let n = try? await DollyAPI.shared.voiceStep(id: id), n > 0 { step = n }
    }

    /// Dolly's last line, when it carried more than the script line (a
    /// reaction, an answer to a question).
    private var lastDollyAside: String? {
        guard let last = client.turns.last(where: { $0.role == "assistant" }), let line = current else { return nil }
        let said = last.text.trimmingCharacters(in: .whitespacesAndNewlines)
        let scripted = line.dolly.trimmingCharacters(in: .whitespacesAndNewlines)
        if said == scripted || said.isEmpty { return nil }
        // Keep only what came before the script line, when it is in there.
        if let r = said.range(of: scripted) {
            let before = said[..<r.lowerBound].trimmingCharacters(in: .whitespacesAndNewlines)
            return before.isEmpty ? nil : before
        }
        return said
    }

    private func bubble(_ text: String, you: Bool) -> some View {
        Text(text)
            .font(skin.uiBold(15))
            .foregroundStyle(you ? .white : skin.ink)
            .lineLimit(4)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(you ? Color.white.opacity(0.24) : Color.white.opacity(0.92)))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(you ? Color.white.opacity(0.5) : .clear, lineWidth: 1))
            .frame(maxWidth: .infinity, alignment: you ? .trailing : .leading)
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
            if holdToTalk { return client.talking ? "Listening" : client.status == "Thinking" ? "Dolly is thinking" : "Your turn — hold the key" }
            return client.status == "Thinking" ? "Dolly is thinking" : "Your turn — just talk"
        case .speaking: return "Dolly is speaking"
        case .failed(let m): return m
        case .ended: return "Round ended"
        }
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

    private func runClock() async {
        while client.phase != .connected && client.phase != .speaking {
            if case .failed = client.phase { return }
            if client.phase == .ended { return }
            try? await Task.sleep(for: .milliseconds(200))
        }
        guard let wrap = client.config?.wrap else { return }
        try? await Task.sleep(for: .milliseconds(wrap.afterMs))
        guard !ending, client.phase != .ended else { return }
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
            await state.refresh()
            onLeave()
        }
    }
}
