import SwiftUI

// Agentic Learning Mode, the app side (backend: src/lib/polly/path.ts).
//
//   PathCard            the card on top of Topics. Before the level check:
//                       "Talk to Polly". After: level, progress, the next
//                       lesson, Start. Dismissable either way; "Your path"
//                       in the sort menu's neighbour brings it back.
//   PathList            the lessons in order, joined by a line: done,
//                       current, being written, locked.
//   PlacementFlowView   intro → the voice level check → "building your
//                       plan" → the result (level, can do, shaky, lesson 1).
//   LessonStepsCard     on a lesson's topic screen: Talk, Words, Grammar.

// MARK: - Topics card

struct PathCard: View {
    let path: PollyPath
    /// Topics by id, to turn the current lesson into a navigation value.
    let topics: [PollyTopic]
    var onStartCheck: () -> Void
    var onDismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if path.isPlaced { placed } else { unplaced }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(PollyTheme.accentDim, lineWidth: 1))
    }

    // Before the level check.
    private var unplaced: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                MiniTopicGlyph(kind: "lesson", size: 40)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Talk to Polly")
                        .font(.custom("Fredoka", size: 19).weight(.semibold))
                        .foregroundStyle(PollyTheme.text)
                    Text("Two minutes of chatting in \(path.languageName), or in English if you're new. Then I'll build your first lesson.")
                        .font(.system(size: 13.5))
                        .foregroundStyle(PollyTheme.text2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                dismissButton
            }
            Button(action: onStartCheck) {
                Label("Start talking", systemImage: "mic.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(PollyTheme.inkOnAccent)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                    .background(PollyTheme.accent, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
        }
    }

    // After it: level, progress, the next lesson.
    private var placed: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text("\(path.languageName) · \(path.level ?? "")")
                    .font(.system(size: 11.5, weight: .bold))
                    .tracking(0.4)
                    .foregroundStyle(PollyTheme.inkOnAccent)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 4)
                    .background(PollyTheme.accent, in: Capsule())
                Text(path.isFinished ? "Path finished" : "Lesson \(min(path.doneCount + 1, path.lessons.count)) of \(path.lessons.count)")
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(PollyTheme.text2)
                Spacer(minLength: 0)
                Menu {
                    Button { onStartCheck() } label: { Label("Retake level check", systemImage: "mic") }
                    Button(role: .destructive) { onDismiss() } label: { Label("Hide this card", systemImage: "eye.slash") }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(PollyTheme.text3)
                        .frame(width: 28, height: 28)
                        .background(PollyTheme.surface2, in: Circle())
                }
                dismissButton
            }

            // Five segments, one per lesson.
            HStack(spacing: 4) {
                ForEach(path.lessons) { l in
                    Capsule()
                        .fill(l.state == "done" ? PollyTheme.accent
                              : l.state == "locked" ? PollyTheme.surface3 : PollyTheme.accentDim)
                        .frame(height: 5)
                }
            }

            if path.isFinished {
                Text("All \(path.lessons.count) lessons done. Talk to Polly again and I'll plan the next stretch.")
                    .font(.system(size: 13.5))
                    .foregroundStyle(PollyTheme.text2)
                Button(action: onStartCheck) { startLabel("Talk to Polly", systemImage: "mic.fill") }
                    .buttonStyle(.plain)
            } else if let next = path.current {
                VStack(alignment: .leading, spacing: 2) {
                    Text(next.title)
                        .font(.custom("Fredoka", size: 18).weight(.semibold))
                        .foregroundStyle(PollyTheme.text)
                    Text(next.state == "writing" ? "Polly is writing this lesson…" : next.grammar)
                        .font(.system(size: 13))
                        .foregroundStyle(PollyTheme.text2)
                        .lineLimit(2)
                }
                if let topic = topics.first(where: { $0.id == next.threadId }) {
                    NavigationLink(value: topic) {
                        startLabel(next.steps.doneCount == 0 ? "Start lesson" : "Continue · \(next.steps.doneCount) of 3 steps",
                                   systemImage: "play.fill")
                    }
                    .buttonStyle(.plain)
                } else {
                    HStack(spacing: 8) {
                        ProgressView().tint(PollyTheme.text3).scaleEffect(0.8)
                        Text("Ready in a minute").font(.system(size: 13)).foregroundStyle(PollyTheme.text3)
                    }
                }
            }
        }
    }

    private func startLabel(_ text: String, systemImage: String) -> some View {
        Label(text, systemImage: systemImage)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(PollyTheme.inkOnAccent)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .background(PollyTheme.accent, in: RoundedRectangle(cornerRadius: 12))
    }

    private var dismissButton: some View {
        Button(action: onDismiss) {
            Image(systemName: "xmark")
                .font(.system(size: 9.5, weight: .bold))
                .foregroundStyle(PollyTheme.text3)
                .frame(width: 28, height: 28)
                .background(PollyTheme.surface2, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Hide this card")
    }
}

// MARK: - The path list

struct PathList: View {
    let path: PollyPath
    let topics: [PollyTopic]

    private static let node: CGFloat = 28
    private static let rowHeight: CGFloat = 58

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(path.lessons.enumerated()), id: \.element.id) { idx, lesson in
                let topic = topics.first { $0.id == lesson.threadId }
                Group {
                    if let topic {
                        NavigationLink(value: topic) { row(lesson, idx: idx, tappable: true) }
                            .buttonStyle(.plain)
                    } else {
                        row(lesson, idx: idx, tappable: false)
                    }
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 4)
        .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(PollyTheme.border, lineWidth: 1))
    }

    private func row(_ l: PollyPath.Lesson, idx: Int, tappable: Bool) -> some View {
        let locked = l.state == "locked"
        return HStack(spacing: 12) {
            // The node, on a line that runs the row's full height except
            // above the first node and below the last.
            ZStack {
                VStack(spacing: 0) {
                    Rectangle().fill(idx == 0 ? Color.clear : lineColor(before: idx))
                        .frame(width: 2, height: Self.rowHeight / 2)
                    Rectangle().fill(idx == path.lessons.count - 1 ? Color.clear : lineColor(before: idx + 1))
                        .frame(width: 2, height: Self.rowHeight / 2)
                }
                nodeView(l)
            }
            .frame(width: Self.node, height: Self.rowHeight)

            VStack(alignment: .leading, spacing: 2) {
                Text(l.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(locked ? PollyTheme.text3 : PollyTheme.text)
                    .lineLimit(1)
                Text(subtitle(l))
                    .font(.system(size: 12))
                    .foregroundStyle(PollyTheme.text3)
                    .lineLimit(1)
            }
            Spacer(minLength: 6)
            if l.state == "current" {
                StepDots(steps: l.steps)
            } else if l.state == "writing" {
                ProgressView().tint(PollyTheme.text3).scaleEffect(0.75)
            } else if locked {
                Image(systemName: "lock.fill")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(PollyTheme.text4)
            }
            if tappable {
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(PollyTheme.text3)
            }
        }
        .frame(height: Self.rowHeight)
        .contentShape(Rectangle())
    }

    /// The line segment leading INTO lesson `idx` is lit once the lesson
    /// before it is done.
    private func lineColor(before idx: Int) -> Color {
        guard idx >= 1, idx - 1 < path.lessons.count else { return .clear }
        return path.lessons[idx - 1].state == "done" ? PollyTheme.accent : PollyTheme.surface3
    }

    @ViewBuilder
    private func nodeView(_ l: PollyPath.Lesson) -> some View {
        switch l.state {
        case "done":
            Circle().fill(PollyTheme.accent)
                .frame(width: Self.node, height: Self.node)
                .overlay(Image(systemName: "checkmark").font(.system(size: 12, weight: .bold))
                    .foregroundStyle(PollyTheme.inkOnAccent))
        case "current", "writing":
            Circle().fill(PollyTheme.surface)
                .frame(width: Self.node, height: Self.node)
                .overlay(Circle().stroke(PollyTheme.accent, lineWidth: 2))
                .overlay(Text("\(l.position)").font(.system(size: 13, weight: .bold))
                    .foregroundStyle(PollyTheme.accent))
        default:
            Circle().fill(PollyTheme.surface2)
                .frame(width: Self.node, height: Self.node)
                .overlay(Text("\(l.position)").font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(PollyTheme.text3))
        }
    }

    private func subtitle(_ l: PollyPath.Lesson) -> String {
        switch l.state {
        case "writing": return "Polly is writing this one…"
        default: return l.grammar
        }
    }
}

/// Three small dots: Talk, Words, Grammar.
struct StepDots: View {
    let steps: PollyPath.Lesson.Steps
    var body: some View {
        HStack(spacing: 4) {
            ForEach([steps.talk, steps.words, steps.grammar].indices, id: \.self) { i in
                Circle()
                    .fill([steps.talk, steps.words, steps.grammar][i] ? PollyTheme.accent : PollyTheme.surface3)
                    .frame(width: 7, height: 7)
            }
        }
        .accessibilityLabel("\(steps.doneCount) of 3 steps done")
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
                VoiceSessionView(mode: "placement", title: "Getting to know you") { id in
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
            Text("Let's talk for two minutes")
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
                Label("Start talking", systemImage: "mic.fill")
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
            Text("Building your plan")
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
                        Text("YOUR LEVEL")
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
                    Label("Start lesson 1", systemImage: "play.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(PollyTheme.inkOnAccent)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(PollyTheme.accent, in: RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)
                HStack(spacing: 22) {
                    Button("Not right? Talk again") { stage = .talking }
                    Button("Later") { onClose(path, nil) }
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
                    Text("Read it")
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
                step("Talk", "mic.fill", done: steps?.talk != nil, busy: false) { onTalk() }
                step("Words", "rectangle.on.rectangle.angled", done: steps?.words != nil,
                     busy: startingStep == "words") { onCards("words") }
                step("Grammar", "puzzlepiece.fill", done: steps?.grammar != nil,
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
