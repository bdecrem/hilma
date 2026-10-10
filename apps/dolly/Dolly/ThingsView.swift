import SwiftUI

/// Part 2: three things from the call. Dolly says it, you say it back, she
/// says you got it. A second short voice session; the app steers her with
/// the server's cues — thing by thing, then the close.
struct ThingsView: View {
    let onDone: (DayView) -> Void
    let onLeave: () -> Void

    private enum Phase { case listen, repeatIt, hearing, got, closing }

    @Environment(AppState.self) private var state
    @State private var client: any DollyVoiceClient
    @State private var index = 0
    @State private var phase: Phase = .listen
    @State private var userTurns = 0
    @State private var assistantTurns = 0
    @State private var ending = false
    private let holdToTalk: Bool
    private let skin = Skin.current

    init(onDone: @escaping (DayView) -> Void, onLeave: @escaping () -> Void) {
        self.onDone = onDone
        self.onLeave = onLeave
        let hold = UserDefaults.standard.bool(forKey: AppState.holdToTalkKey)
        holdToTalk = hold
        _client = State(initialValue: makeVoiceClient(mode: "things", holdToTalk: hold))
    }

    private var things: [Thing] { state.day?.things ?? [] }
    private var thing: Thing? { things.indices.contains(index) ? things[index] : nil }

    var body: some View {
        ZStack {
            skin.background.ignoresSafeArea()
            VStack(spacing: 18) {
                HStack {
                    CloseButton { leave() }
                    Spacer()
                    Text("Three things from today").font(skin.displayMedium(17)).foregroundStyle(skin.ink)
                    Spacer()
                    Segments(states: things.indices.map { $0 < index ? .done : $0 == index ? .cur : .todo })
                        .frame(width: 36)
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)

                if let thing {
                    Card(padding: 24) {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Tag(text: thing.kindLabel, color: tagColor(thing.kind))
                                Spacer()
                                if phase == .got || phase == .closing {
                                    ZStack {
                                        Circle().fill(skin.good).frame(width: 30, height: 30)
                                        Image(systemName: "checkmark").font(.system(size: 14, weight: .heavy)).foregroundStyle(skin.onGood)
                                    }
                                    .transition(.scale.combined(with: .opacity))
                                }
                            }
                            Text(thing.target).font(skin.display(34)).foregroundStyle(skin.word).lineLimit(3).minimumScaleFactor(0.6)
                            if let pinyin = thing.pinyin, !pinyin.isEmpty {
                                Text(pinyin).font(skin.uiBold(17)).foregroundStyle(skin.ink2)
                            }
                            Text(thing.native).font(skin.uiBold(19)).foregroundStyle(skin.ink)
                            Text(thing.source).font(skin.ui(14)).foregroundStyle(skin.ink3).padding(.top, 2)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.horizontal, 20)
                    .id(index)
                    .transition(.move(edge: .trailing).combined(with: .opacity))
                }

                HStack(spacing: 14) {
                    Mascot(size: 96, mood: mood)
                    Text(coachLine)
                        .font(skin.uiBold(17))
                        .foregroundStyle(skin.ink)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Color.white))
                        .shadow(color: skin.shadow, radius: 10, y: 8)
                }
                .padding(.horizontal, 24)
                .padding(.top, 10)

                Spacer(minLength: 0)

                foot
                    .padding(.bottom, 28)
            }

            if ending {
                VStack(spacing: 14) {
                    Mascot(size: 110, mood: .thinking)
                    Text("Writing your cards…").font(skin.display(22)).foregroundStyle(skin.ink)
                    ProgressView()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(skin.bgMid.opacity(0.94).ignoresSafeArea())
                .transition(.opacity)
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: index)
        .animation(.easeInOut(duration: 0.25), value: phase)
        .task { await client.start() }
        .onChange(of: client.turns.count) { _, _ in turnsChanged() }
        .onChange(of: client.phase) { _, p in phaseChanged(p) }
        .onDisappear { if !ending { client.stop() } }
    }

    // MARK: Flow

    private func turnsChanged() {
        let users = client.turns.filter { $0.role == "user" }.count
        let assistants = client.turns.filter { $0.role == "assistant" }.count
        defer {
            userTurns = users
            assistantTurns = assistants
        }
        if users > userTurns, phase == .repeatIt || phase == .listen {
            phase = .hearing
        }
        if assistants > assistantTurns {
            switch phase {
            case .hearing:
                phase = .got
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { advance() }
            case .closing:
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { Task { await finish() } }
            default:
                break
            }
        }
    }

    /// Dolly stopped speaking while introducing a thing: their turn.
    private func phaseChanged(_ p: VoicePhase) {
        if p == .connected, phase == .listen, assistantTurns > 0 || client.turns.contains(where: { $0.role == "assistant" }) {
            phase = .repeatIt
        }
        if case .failed = p { Task { await finish() } }
        if p == .ended, !ending { Task { await finish() } }
    }

    private func advance() {
        guard let cues = client.config?.cues else { return }
        if index + 1 < things.count {
            index += 1
            phase = .listen
            if cues.indices.contains(index) { client.sendCue(cues[index]) }
        } else {
            phase = .closing
            if let last = cues.last { client.sendCue(last) }
            // If the close never comes back, finish anyway.
            DispatchQueue.main.asyncAfter(deadline: .now() + 9) { Task { await finish() } }
        }
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

    private func leave() {
        guard !ending else { return }
        client.stop()
        onLeave()
    }

    // MARK: Looks

    private var mood: Mascot.Mood {
        switch phase {
        case .listen: return client.phase == .speaking ? .talking : .idle
        case .repeatIt: return .listening
        case .hearing: return .thinking
        case .got: return .happy
        case .closing: return client.phase == .speaking ? .talking : .happy
        }
    }

    private var coachLine: String {
        switch phase {
        case .listen: return client.phase == .speaking ? "Listen." : "Calling…"
        case .repeatIt: return holdToTalk ? "Your turn. Hold the mic and say it." : "Your turn. Say it."
        case .hearing: return "Listening…"
        case .got: return "You got it!"
        case .closing: return "All three. Cards next."
        }
    }

    private func tagColor(_ kind: String) -> Color {
        switch kind {
        case "fix": return skin.fix
        case "word": return skin.word
        default: return skin.phrase
        }
    }

    private var foot: some View {
        VStack(spacing: 10) {
            ZStack {
                switch phase {
                case .listen, .closing:
                    Circle().fill(Color.white).frame(width: 84, height: 84)
                        .background(Circle().fill(skin.trailNext).offset(y: 6))
                    Image(systemName: "speaker.wave.2.fill").font(.system(size: 30, weight: .bold)).foregroundStyle(skin.ink3)
                case .repeatIt:
                    Circle().fill(LinearGradient(colors: [skin.primaryHi, skin.primary], startPoint: .top, endPoint: .bottom)).frame(width: 84, height: 84)
                        .background(Circle().fill(skin.primaryDeep).offset(y: 6))
                        .shadow(color: skin.primary.opacity(0.4), radius: 16, y: 12)
                    Image(systemName: "mic.fill").font(.system(size: 32, weight: .bold)).foregroundStyle(.white)
                case .hearing:
                    Circle().fill(LinearGradient(colors: [skin.voiceTop, skin.voiceBottom], startPoint: .top, endPoint: .bottom)).frame(width: 84, height: 84)
                        .background(Circle().fill(Color(hex: 0x4F32C8)).offset(y: 6))
                    Bars()
                case .got:
                    Circle().fill(LinearGradient(colors: [Color(hex: 0x9CF7DA), Color(hex: 0x3FE0AB)], startPoint: .top, endPoint: .bottom)).frame(width: 84, height: 84)
                        .background(Circle().fill(skin.goodDeep).offset(y: 6))
                    Image(systemName: "checkmark").font(.system(size: 34, weight: .heavy)).foregroundStyle(skin.onGood)
                }
            }
            .frame(height: 96)
            .contentShape(Circle())
            .gesture(
                holdToTalk
                    ? DragGesture(minimumDistance: 0)
                        .onChanged { _ in if phase == .repeatIt || phase == .hearing { client.beginTalking() } }
                        .onEnded { _ in client.endTalking() }
                    : nil
            )
            Text(footHint).font(skin.uiBold(13)).foregroundStyle(skin.ink3).frame(height: 18)
        }
    }

    private var footHint: String {
        switch phase {
        case .listen: return "Dolly says it first"
        case .repeatIt: return holdToTalk ? "Hold, then say it" : "Say it out loud"
        case .hearing: return holdToTalk && client.talking ? "Listening" : " "
        default: return " "
        }
    }
}
