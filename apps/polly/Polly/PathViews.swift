import SwiftUI

// Agentic Learning Mode, the app side (backend: src/lib/polly/path.ts).
//
//   PathCard            the one card on top of Topics. Before the level check:
//                       "Talk to Polly". After: the journey — a trail of
//                       stepping-stones (done / current / writing / locked)
//                       and the current lesson with a Start button. The •••
//                       menu holds Talk again / Start over / Hide.
//   PlacementFlowView   intro → the voice level check → "building your
//                       plan" → the result (level, can do, shaky, lesson 1).
//   LessonStepsCard     on a lesson's topic screen: Talk, Words, Grammar.

// MARK: - Topics card

/// Agentic Learning Mode on the Topics screen. ONE friendly card that *is* the
/// path: a header, a row of stepping-stones for the lessons, and the current
/// lesson with a big Start button. Before the level check it's the "Talk to
/// Polly" invitation instead. The ••• menu holds Talk again / Start over /
/// Hide. Redesigned 2026-09-18 (Bart: the old card plus a separate path list
/// below it were cluttered and not fun — folded into this one).
struct PathCard: View {
    let path: PollyPath
    /// Topics by id, to turn a lesson into a navigation value.
    let topics: [PollyTopic]
    var onStartCheck: () -> Void
    var onDismiss: () -> Void
    var onDelete: () -> Void

    @State private var confirmDelete = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if path.isPlaced { placed } else { unplaced }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(PollyTheme.surface))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(PollyTheme.accentDim, lineWidth: 1))
        .confirmationDialog("Delete this path?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete path", role: .destructive) { onDelete() }
            Button("Keep it", role: .cancel) {}
        } message: {
            Text("Polly forgets this plan and the card goes back to \"Talk to Polly\". Lessons you've already started stay as topics.")
        }
    }

    // MARK: before the level check

    private var unplaced: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                mascot(52)
                VStack(alignment: .leading, spacing: 3) {
                    Text(L("Let's find your level", "Troviamo il tuo livello", "Trouvons ton niveau", "레벨을 알아봐요"))
                        .font(.custom("Fredoka", size: 20).weight(.semibold))
                        .foregroundStyle(PollyTheme.text)
                    Text("Chat with me for two minutes in \(path.languageName) — English is fine if you're new — and I'll build your first lesson.")
                        .font(.system(size: 13.5))
                        .foregroundStyle(PollyTheme.text2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                hideButton
            }
            bigButton(L("Talk to Polly", "Parla con Polly", "Parle avec Polly", "Polly와 대화"), "mic.fill", action: onStartCheck)
        }
    }

    // MARK: after it — the journey

    private var placed: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 9) {
                mascot(34)
                Text(L("Your \(path.languageName) journey", "Il tuo percorso", "Ton parcours", "나의 학습 경로"))
                    .font(.custom("Fredoka", size: 18).weight(.semibold))
                    .foregroundStyle(PollyTheme.text)
                if let level = path.level {
                    Text(level)
                        .font(.system(size: 11, weight: .bold)).tracking(0.3)
                        .foregroundStyle(PollyTheme.inkOnAccent)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(PollyTheme.gold, in: Capsule())
                }
                Spacer(minLength: 0)
                menu
            }
            trail
            if path.isFinished { finished } else if let next = path.current { current(next) }
        }
    }

    /// The stepping-stones: one per lesson, joined by a line that lights as you go.
    private var trail: some View {
        HStack(spacing: 0) {
            ForEach(Array(path.lessons.enumerated()), id: \.element.id) { idx, lesson in
                stop(lesson)
                if idx < path.lessons.count - 1 {
                    Capsule()
                        .fill(lesson.state == "done" ? PollyTheme.accent : PollyTheme.surface3)
                        .frame(height: 3)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(.horizontal, 2)
    }

    @ViewBuilder
    private func stop(_ l: PollyPath.Lesson) -> some View {
        if let topic = topics.first(where: { $0.id == l.threadId }) {
            NavigationLink(value: topic) { stopDot(l) }.buttonStyle(.plain)
        } else {
            stopDot(l)
        }
    }

    @ViewBuilder
    private func stopDot(_ l: PollyPath.Lesson) -> some View {
        switch l.state {
        case "done":
            Circle().fill(PollyTheme.accent).frame(width: 30, height: 30)
                .overlay(Image(systemName: "checkmark").font(.system(size: 13, weight: .bold))
                    .foregroundStyle(PollyTheme.inkOnAccent))
        case "current":
            Circle().fill(PollyTheme.surface).frame(width: 36, height: 36)
                .overlay(Circle().stroke(PollyTheme.accent, lineWidth: 2.5))
                .overlay(Text("\(l.position)").font(.custom("Fredoka", size: 16).weight(.semibold))
                    .foregroundStyle(PollyTheme.accent))
                .shadow(color: PollyTheme.accent.opacity(0.35), radius: 5)
        case "writing":
            Circle().fill(PollyTheme.surface).frame(width: 36, height: 36)
                .overlay(Circle().stroke(PollyTheme.accentDim, lineWidth: 2.5))
                .overlay(ProgressView().tint(PollyTheme.accent).scaleEffect(0.7))
        default:
            Circle().fill(PollyTheme.surface2).frame(width: 26, height: 26)
                .overlay(Text("\(l.position)").font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(PollyTheme.text3))
        }
    }

    private func current(_ next: PollyPath.Lesson) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(next.title)
                    .font(.custom("Fredoka", size: 18).weight(.semibold))
                    .foregroundStyle(PollyTheme.text)
                Text(next.state == "writing" ? L("Polly is writing this lesson…", "Polly sta scrivendo questa lezione…", "Polly écrit cette leçon…", "Polly가 이 레슨을 쓰는 중…")
                     : (next.scene.isEmpty ? next.grammar : next.scene))
                    .font(.system(size: 13))
                    .foregroundStyle(PollyTheme.text2)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let topic = topics.first(where: { $0.id == next.threadId }) {
                NavigationLink(value: topic) {
                    bigLabel(next.steps.doneCount == 0
                             ? L("Start lesson", "Inizia la lezione", "Commencer la leçon", "레슨 시작")
                             : L("Continue · \(next.steps.doneCount)/3", "Continua · \(next.steps.doneCount)/3", "Continuer · \(next.steps.doneCount)/3", "계속 · \(next.steps.doneCount)/3"), "play.fill")
                }.buttonStyle(.plain)
            } else {
                HStack(spacing: 8) {
                    ProgressView().tint(PollyTheme.text3).scaleEffect(0.8)
                    Text(L("Ready in a minute", "Pronta tra un minuto", "Prête dans une minute", "잠시 후 준비돼요")).font(.system(size: 13)).foregroundStyle(PollyTheme.text3)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(PollyTheme.surface2.opacity(0.6), in: RoundedRectangle(cornerRadius: 13))
            }
        }
    }

    private var finished: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("You finished all \(path.lessons.count) lessons! Talk to me again and I'll plan the next stretch.")
                .font(.system(size: 14))
                .foregroundStyle(PollyTheme.text2)
                .fixedSize(horizontal: false, vertical: true)
            bigButton(L("Talk to Polly", "Parla con Polly", "Parle avec Polly", "Polly와 대화"), "mic.fill", action: onStartCheck)
        }
    }

    // MARK: bits

    private func mascot(_ size: CGFloat) -> some View {
        ZStack {
            Circle().fill(PollyTheme.accentSoft).frame(width: size, height: size)
            DodoMiniMark(size: size * 0.82)
        }
    }

    private var menu: some View {
        Menu {
            Button { onStartCheck() } label: { Label("Talk to Polly again", systemImage: "mic") }
            Button { onDismiss() } label: { Label("Hide", systemImage: "eye.slash") }
            Button(role: .destructive) { confirmDelete = true } label: {
                Label("Delete path", systemImage: "trash")
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(PollyTheme.text3)
                .frame(width: 30, height: 30)
                .background(PollyTheme.surface2, in: Circle())
        }
    }

    private var hideButton: some View {
        Button(action: onDismiss) {
            Image(systemName: "xmark")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(PollyTheme.text3)
                .frame(width: 28, height: 28)
                .background(PollyTheme.surface2, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Hide this card")
    }

    private func bigButton(_ text: String, _ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { bigLabel(text, symbol) }.buttonStyle(.plain)
    }

    private func bigLabel(_ text: String, _ symbol: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: symbol).font(.system(size: 14, weight: .bold))
            Text(text).font(.system(size: 15.5, weight: .semibold))
        }
        .foregroundStyle(PollyTheme.inkOnAccent)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 13)
        .background(PollyTheme.accent, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

// MARK: - The level check

struct PlacementFlowView: View {
    let languageName: String
    /// Called with the fresh path (nil = closed without finishing) and, when
    /// the learner tapped Start lesson, the lesson's topic id.
    var onClose: (PollyPath?, String?) -> Void

    private enum Stage: Equatable {
        case intro, talking, building
        case result(PollyAPI.PlacementResponse)
        case failed(String)
        static func == (a: Stage, b: Stage) -> Bool {
            switch (a, b) {
            case (.intro, .intro), (.talking, .talking), (.building, .building): return true
            case (.result, .result), (.failed, .failed): return true
            default: return false
            }
        }
    }
    @State private var stage: Stage = .intro
    @State private var voiceSessionId: String? = nil

    var body: some View {
        ZStack {
            PollyTheme.bg.ignoresSafeArea()
            switch stage {
            case .intro: intro
            case .talking:
                VoiceSessionView(mode: "placement", title: L("Getting to know you", "Facciamo conoscenza", "On fait connaissance", "서로 알아가기")) { id in
                    guard let id else { onClose(nil, nil); return }
                    voiceSessionId = id
                    build(id)
                }
            case .building: building
            case .result(let res): result(res)
            case .failed(let message): failed(message)
            }
        }
        .task {
            #if targetEnvironment(simulator) || (DEBUG && targetEnvironment(macCatalyst))
            // `-PlacementSession <voice session id>` — skip the call and build
            // the plan from an existing level-check transcript (the sim has
            // no microphone). Screenshot loops for the building + result screens.
            if let id = UserDefaults.standard.string(forKey: "PlacementSession"), !id.isEmpty {
                UserDefaults.standard.removeObject(forKey: "PlacementSession")
                voiceSessionId = id
                build(id)
            }
            // `-PlacementAutoStart 1` — skip the intro and start the call (the
            // sim's silent mic then exercises the greeting + English nudge;
            // read F2_LIVE_NUDGE / F2_LIVE_TRANSCRIPT in the log).
            if UserDefaults.standard.bool(forKey: "PlacementAutoStart") {
                UserDefaults.standard.removeObject(forKey: "PlacementAutoStart")
                stage = .talking
            }
            #endif
        }
    }

    private var closeButton: some View {
        HStack {
            Spacer()
            Button { onClose(nil, nil) } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(PollyTheme.text2)
                    .frame(width: 32, height: 32)
                    .background(PollyTheme.surface2, in: Circle())
                    .overlay(Circle().stroke(PollyTheme.border, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .keyboardShortcut(.cancelAction)
        }
        .padding(.horizontal, 18)
        .padding(.top, 12)
    }

    private var intro: some View {
        VStack(spacing: 0) {
            closeButton
            Spacer()
            MiniTopicGlyph(kind: "lesson", size: 64)
            Text(L("Let's talk for two minutes", "Parliamo due minuti", "Parlons deux minutes", "2분만 이야기해요"))
                .font(.custom("Fredoka", size: 26).weight(.semibold))
                .foregroundStyle(PollyTheme.text)
                .multilineTextAlignment(.center)
                .padding(.top, 20)
            VStack(alignment: .leading, spacing: 14) {
                introLine("1", "I'll say hello in \(languageName). Answer in \(languageName) if you can — in English if you can't. Both are fine.")
                introLine("2", "We chat. No corrections, no score.")
                introLine("3", "I work out your level and build your first lesson: a conversation, the words for it, one bit of grammar.")
            }
            .padding(.top, 26)
            .padding(.horizontal, 30)
            Spacer()
            Button { stage = .talking } label: {
                Label(L("Start talking", "Iniziamo a parlare", "Commencer à parler", "말하기 시작"), systemImage: "mic.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(PollyTheme.inkOnAccent)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(PollyTheme.accent, in: RoundedRectangle(cornerRadius: 14))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 24)
            .padding(.bottom, 34)
        }
        .pollyContentColumn()
    }

    private func introLine(_ n: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(n)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(PollyTheme.accent)
                .frame(width: 24, height: 24)
                .background(PollyTheme.accentSoft, in: Circle())
            Text(text)
                .font(.system(size: 15))
                .foregroundStyle(PollyTheme.text2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var building: some View {
        VStack(spacing: 18) {
            Spacer()
            ProgressView().tint(PollyTheme.accent).scaleEffect(1.3)
            Text(L("Building your plan", "Preparo il tuo piano", "Je prépare ton plan", "학습 계획 만드는 중"))
                .font(.custom("Fredoka", size: 22).weight(.semibold))
                .foregroundStyle(PollyTheme.text)
            Text("Polly is going back over your conversation and writing lesson 1. About a minute.")
                .font(.system(size: 14.5))
                .foregroundStyle(PollyTheme.text2)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Spacer()
        }
    }

    private func failed(_ message: String) -> some View {
        VStack(spacing: 16) {
            closeButton
            Spacer()
            Text(message)
                .font(.system(size: 15))
                .foregroundStyle(PollyTheme.text2)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 36)
            if let id = voiceSessionId {
                Button("Try again") { build(id) }
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(PollyTheme.accent)
            }
            Spacer()
        }
    }

    private func result(_ res: PollyAPI.PlacementResponse) -> some View {
        let path = res.path
        let first = path.lessons.first
        return VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(L("YOUR LEVEL", "IL TUO LIVELLO", "TON NIVEAU", "나의 레벨"))
                            .font(.system(size: 11, weight: .bold)).tracking(1.6)
                            .foregroundStyle(PollyTheme.text3)
                        Text("\(path.languageName) · \(path.level ?? "")")
                            .font(.custom("Fredoka", size: 30).weight(.semibold))
                            .foregroundStyle(PollyTheme.text)
                    }
                    if let p = path.placement {
                        verdictRow("checkmark", PollyTheme.sprout, p.canDo)
                        verdictRow("arrow.triangle.2.circlepath", PollyTheme.accent, p.shaky)
                    }
                    if let first {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("LESSON 1")
                                .font(.system(size: 11, weight: .bold)).tracking(1.6)
                                .foregroundStyle(PollyTheme.text3)
                            Text(first.title)
                                .font(.custom("Fredoka", size: 21).weight(.semibold))
                                .foregroundStyle(PollyTheme.text)
                            Text(first.scene)
                                .font(.system(size: 14.5))
                                .foregroundStyle(PollyTheme.text2)
                                .fixedSize(horizontal: false, vertical: true)
                            Text("Grammar: \(first.grammar)")
                                .font(.system(size: 13.5, weight: .medium))
                                .foregroundStyle(PollyTheme.text2)
                                .padding(.top, 2)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(PollyTheme.accentDim, lineWidth: 1))
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text("THEN")
                            .font(.system(size: 11, weight: .bold)).tracking(1.6)
                            .foregroundStyle(PollyTheme.text3)
                        ForEach(path.lessons.dropFirst()) { l in
                            HStack(spacing: 10) {
                                Text("\(l.position)")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(PollyTheme.text3)
                                    .frame(width: 22, height: 22)
                                    .background(PollyTheme.surface2, in: Circle())
                                Text(l.title)
                                    .font(.system(size: 14.5))
                                    .foregroundStyle(PollyTheme.text2)
                            }
                        }
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 44)
                .padding(.bottom, 20)
            }
            VStack(spacing: 10) {
                Button { onClose(path, res.lessonThreadId) } label: {
                    Label(L("Start lesson 1", "Inizia la lezione 1", "Commencer la leçon 1", "레슨 1 시작"), systemImage: "play.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(PollyTheme.inkOnAccent)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(PollyTheme.accent, in: RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)
                HStack(spacing: 22) {
                    Button(L("Not right? Talk again", "Non ti convince? Riparliamone", "Pas d’accord\u{202F}? On en reparle", "아닌 것 같아요? 다시 대화")) { stage = .talking }
                    Button(L("Later", "Più tardi", "Plus tard", "나중에")) { onClose(path, nil) }
                }
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(PollyTheme.text2)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 30)
        }
        .pollyContentColumn()
    }

    private func verdictRow(_ symbol: String, _ tint: Color, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 11) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(tint)
                .frame(width: 26, height: 26)
                .background(tint.opacity(0.15), in: Circle())
            Text(text)
                .font(.system(size: 15))
                .foregroundStyle(PollyTheme.text)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func build(_ id: String) {
        stage = .building
        Task {
            do {
                let res = try await PollyAPI.shared.submitPlacement(voiceSessionId: id)
                stage = .result(res)
            } catch {
                stage = .failed(error.localizedDescription)
            }
        }
    }
}

// MARK: - A lesson's three steps

struct LessonStepsCard: View {
    let thread: PollyThread
    /// True while a step's card set is being fetched.
    var startingStep: String? = nil
    var onPlan: () -> Void
    var onTalk: () -> Void
    var onCards: (String) -> Void

    var body: some View {
        let steps = thread.lessonSteps
        let done = thread.lessonDoneAt != nil
        return VStack(alignment: .leading, spacing: 10) {
            Button(action: onPlan) {
                HStack(spacing: 11) {
                    MiniTopicGlyph(kind: "lesson", size: 30, verified: done)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(thread.pathPosition.map { "Lesson \($0)" } ?? "Lesson")
                            .font(.system(size: 13.5, weight: .semibold))
                            .foregroundStyle(PollyTheme.text)
                        Text(thread.lesson?.scene ?? "")
                            .font(.system(size: 11.5))
                            .foregroundStyle(PollyTheme.text3)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                    Spacer(minLength: 8)
                    Text(L("Read it", "Leggila", "Lis-la", "읽기"))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(PollyTheme.accent)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(PollyTheme.text3)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            HStack(spacing: 8) {
                step(L("Talk", "Parla", "Parle", "말하기"), "mic.fill", done: steps?.talk != nil, busy: false) { onTalk() }
                step(L("Words", "Parole", "Mots", "단어"), "rectangle.on.rectangle.angled", done: steps?.words != nil,
                     busy: startingStep == "words") { onCards("words") }
                step(L("Grammar", "Grammatica", "Grammaire", "문법"), "puzzlepiece.fill", done: steps?.grammar != nil,
                     busy: startingStep == "grammar") { onCards("grammar") }
            }
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 11)
        .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(done ? PollyTheme.accentDim : PollyTheme.border, lineWidth: 1))
        .padding(.horizontal, 16)
    }

    private func step(_ title: String, _ symbol: String, done: Bool, busy: Bool,
                      action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 5) {
                ZStack {
                    if busy {
                        ProgressView().tint(PollyTheme.text3).scaleEffect(0.8)
                    } else {
                        Image(systemName: done ? "checkmark" : symbol)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(done ? PollyTheme.inkOnAccent : PollyTheme.accent)
                    }
                }
                .frame(width: 34, height: 34)
                .background(done ? PollyTheme.accent : PollyTheme.accentSoft, in: Circle())
                Text(title)
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(PollyTheme.text)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 9)
            .background(PollyTheme.surface2.opacity(0.6), in: RoundedRectangle(cornerRadius: 11))
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }
}
