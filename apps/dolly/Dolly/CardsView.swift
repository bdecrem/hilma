import SwiftUI

/// Where the cards come from: the day's (or the star round's / a refresher's,
/// which the server hands over as the day's while they are open), or a flash
/// set of ten dealt here.
enum CardSource {
    case day
    case flash
}

/// Part 3: ten questions, no voice. Pick five, type five. The card reacts
/// at once (Grader.swift decides as the server will) and moves on; the
/// answer goes to the server behind it, in order, which grades it for real
/// and keeps the place, so × leaves and the map says Resume. Flash sets run
/// through the same screen, both ways round.
struct CardsView: View {
    var source: CardSource = .day
    let onDone: () -> Void
    let onLeave: () -> Void

    @Environment(AppState.self) private var state
    @State private var pick: Int?
    @State private var typed = ""
    @State private var result: (ok: Bool, target: String)?
    @State private var busy = false
    @State private var dealing = false
    /// Waiting for the server's word on the last card (the day completes there).
    @State private var finishing = false
    @State private var error: String?
    /// Answers shown before the server has them (ahead of `serverAnswers`).
    @State private var localAnswers: [Answer] = []
    /// The sends, one after another.
    @State private var queue: Task<Bool, Never>?
    @FocusState private var focused: Bool
    private let skin = Skin.current

    private var day: DayView? { state.day }
    private var questions: [Question] {
        switch source {
        case .day: return day?.questions ?? []
        case .flash: return state.flash?.questions ?? []
        }
    }
    private var serverAnswers: [Answer] {
        switch source {
        case .day: return day?.answers ?? []
        case .flash: return state.flash?.answers ?? []
        }
    }
    private var answers: [Answer] {
        let server = serverAnswers
        return localAnswers.count > server.count ? localAnswers : server
    }
    private var rightCount: Int { answers.filter(\.ok).count }
    private var index: Int { answers.count }
    private var question: Question? {
        guard questions.indices.contains(index) else { return nil }
        return questions[index]
    }

    var body: some View {
        ZStack {
            skin.background.ignoresSafeArea()
            VStack(spacing: 14) {
                HStack {
                    CloseButton { onLeave() }
                    Spacer()
                    Text(source == .flash ? "Flash cards" : "Cards").font(skin.displayMedium(17)).foregroundStyle(skin.ink)
                    Spacer()
                    Text("\(rightCount) / \(questions.count)").font(skin.display(17)).foregroundStyle(skin.ink2)
                        .frame(width: 56, alignment: .trailing)
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)

                if !questions.isEmpty {
                    Segments(states: questions.indices.map { k in
                        if let a = answers.first(where: { $0.q == k }) { return a.ok ? .ok : .miss }
                        if let result, k == index { return result.ok ? .ok : .miss }
                        return k == index ? .cur : .todo
                    }, wide: true)
                    .padding(.horizontal, 20)
                }

                if let q = question {
                    card(q)
                        .padding(.horizontal, 20)
                        .id(index)
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                    Text(hint(q)).font(skin.ui(13)).foregroundStyle(skin.ink3)
                } else if dealing || finishing {
                    ProgressView().padding(.top, 60)
                    Text(dealing ? "Dealing ten…" : "Adding it up…").font(skin.uiBold(14)).foregroundStyle(skin.ink2)
                } else if source == .day, day?.dayState == .done {
                    Spacer()
                } else if source == .flash, error != nil {
                    BigButton(title: "Back to the map", ghost: true) { onLeave() }.padding(.horizontal, 24).padding(.top, 20)
                } else if source == .day {
                    Text("No cards today.").font(skin.uiBold(16)).foregroundStyle(skin.ink2).padding(.top, 40)
                }
                if let error {
                    Text(error).font(skin.uiBold(13)).foregroundStyle(skin.bad)
                }
                Spacer(minLength: 0)
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: index)
        .animation(.easeInOut(duration: 0.2), value: result?.ok)
        .task {
            switch source {
            case .day:
                if let day, day.dayState == .done { onDone() }
            case .flash:
                // A fresh set unless one is under way.
                if let set = state.flash, !set.done { break }
                dealing = true
                defer { dealing = false }
                do {
                    state.flash = try await DollyAPI.shared.dealFlash()
                } catch {
                    self.error = error.localizedDescription
                }
            }
            localAnswers = serverAnswers
        }
    }

    private func hint(_ q: Question) -> String {
        if q.reversed { return q.kind == "pick" ? "Tap the English." : "Type the English; close is fine." }
        if q.kind == "pick" { return "Tap the one that matches." }
        return state.user?.language == "zh" ? "Characters or pinyin; tones are optional." : "Accents and el/la are optional."
    }

    private func card(_ q: Question) -> some View {
        let answered = result != nil
        let ok = result?.ok ?? false
        return Card(padding: 22) {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Tag(text: q.from.label, color: q.from == .new ? skin.primary : q.from == .grammar ? skin.word : skin.ink3)
                    Spacer()
                    Text("\(index + 1) · \(q.reversed ? (q.kind == "pick" ? "In English" : "Type the English") : (q.kind == "pick" ? "Pick it" : "Type it"))").font(skin.uiBold(13)).foregroundStyle(skin.ink3)
                }
                Text(q.native).font(skin.display(28)).foregroundStyle(q.reversed ? skin.word : skin.ink).fixedSize(horizontal: false, vertical: true)
                if q.reversed, let p = q.pinyin, !p.isEmpty {
                    Text(p).font(skin.uiBold(15)).foregroundStyle(skin.ink2)
                }

                if q.kind == "pick", let options = q.options {
                    VStack(spacing: 10) {
                        ForEach(Array(options.enumerated()), id: \.offset) { k, o in
                            let isRight = answered && o == result?.target
                            let isWrong = answered && k == pick && !isRight
                            Button {
                                guard !answered, !busy else { return }
                                pick = k
                                Task { await submit(o) }
                            } label: {
                                Text(o)
                                    .font(skin.uiBold(18))
                                    .foregroundStyle(isRight ? skin.onGood : isWrong ? skin.onBad : skin.ink)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 14)
                                    .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(isRight ? skin.good : isWrong ? skin.bad : skin.bgTop.opacity(0.5)))
                                    .opacity(answered && !isRight && !isWrong ? 0.45 : 1)
                            }
                            .buttonStyle(PressStyle())
                            .disabled(answered)
                        }
                    }
                } else {
                    VStack(spacing: 12) {
                        InputField(placeholder: q.reversed ? "Type it in English" : state.user?.language == "zh" ? "Type it in Mandarin or pinyin" : "Type it in Spanish", text: $typed, disabled: answered) { Task { await submit(typed) } }
                            .focused($focused)
                            .onAppear { focused = true }
                        if answered {
                            HStack {
                                Text(result?.target ?? q.target).font(skin.display(22)).foregroundStyle(skin.word)
                                Spacer()
                                HStack(spacing: 6) {
                                    Text(ok ? "Nice" : "Not yet").font(skin.uiBold(15))
                                    if ok { Image(systemName: "checkmark").font(.system(size: 13, weight: .heavy)) }
                                }
                                .foregroundStyle(ok ? skin.onGood : skin.onBad)
                                .padding(.horizontal, 12).padding(.vertical, 7)
                                .background(Capsule().fill(ok ? skin.good : skin.bad))
                            }
                            .padding(.horizontal, 14).padding(.vertical, 12)
                            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(skin.bgTop.opacity(0.5)))
                        } else {
                            HStack(spacing: 14) {
                                BigButton(title: busy ? "…" : "Check") { Task { await submit(typed) } }
                                    .disabled(typed.trimmingCharacters(in: .whitespaces).isEmpty || busy)
                                    .opacity(typed.trimmingCharacters(in: .whitespaces).isEmpty ? 0.5 : 1)
                                Button("Skip") { Task { await submit("") } }
                                    .font(skin.uiBold(15)).foregroundStyle(skin.ink2)
                                    .disabled(busy)
                            }
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .overlay(
            RoundedRectangle(cornerRadius: skin.rCard, style: .continuous)
                .stroke(answered ? (ok ? skin.good : skin.bad) : .clear, lineWidth: 3)
        )
    }

    private func submit(_ answer: String) async {
        guard result == nil, !finishing, let q = question else { return }
        error = nil
        let qIndex = index
        let lang = state.user?.language ?? "es"
        // The verdict, now.
        let ok = Grader.grade(lang: lang, question: q, answer: answer)
        result = (ok, q.target)
        if ok { UIImpactFeedbackGenerator(style: .light).impactOccurred() } else { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
        // The send, behind it and in order; `true` when it completed the set.
        let setId = state.flash?.id
        let previous = queue
        let send = Task<Bool, Never> { @MainActor in
            _ = await previous?.value
            do {
                switch source {
                case .day:
                    let res = try await DollyAPI.shared.answer(q: qIndex, answer: answer)
                    state.apply(res.day)
                    return res.complete
                case .flash:
                    guard let setId else { return false }
                    let res = try await DollyAPI.shared.answerFlash(id: setId, q: qIndex, answer: answer)
                    state.flash = res.set
                    if let day = res.day { state.apply(day) }
                    return res.complete
                }
            } catch {
                self.error = error.localizedDescription
                // The server may be a card ahead (a retried request): re-sync and fall back in line.
                switch source {
                case .day: await state.refresh()
                case .flash: if let set = try? await DollyAPI.shared.openFlash() { state.flash = set }
                }
                localAnswers = serverAnswers
                return false
            }
        }
        queue = send
        try? await Task.sleep(for: .milliseconds(ok ? 800 : 1400))
        // On to the next card without waiting for the server.
        if localAnswers.count == qIndex { localAnswers.append(Answer(q: qIndex, ok: ok, answer: answer)) }
        result = nil
        pick = nil
        typed = ""
        if qIndex + 1 >= questions.count {
            finishing = true
            let complete = await send.value
            finishing = false
            if complete { onDone() }
        }
    }
}
