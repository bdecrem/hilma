import SwiftUI

/// Per-topic flash hub, presented as a sheet from the Topics … menu or the
/// topic's Flash chip. Generate the deck, pick a mode, review history,
/// manage cards.
struct FlashCardsView: View {
    let topicId: String
    let topicLabel: String

    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var cards: [FlashCard] = []
    @State private var sets: [FlashSetRecord] = []
    @State private var stars = 0
    @State private var loading = true
    @State private var generateCount = 15
    @State private var errorMessage: String? = nil
    @State private var activeSet: FlashStart? = nil
    @State private var voiceSet: FlashStart? = nil
    @State private var startingMode: String? = nil
    @State private var editTarget: FlashCard? = nil
    @State private var showCards = false
    @State private var newQuestion = ""
    @State private var addingCard = false
    @State private var remakeInstructions = ""

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                if loading {
                    ProgressView().tint(FeyndTheme.text2)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if cards.isEmpty {
                    generateHero
                } else {
                    content
                }
            }
        }
        .task {
            await load()
            #if targetEnvironment(simulator)
            // `-EditFirstCard 1` — open the edit sheet on the deck's first
            // card, and `-ShowCardList 1` — expand the card list.
            if UserDefaults.standard.bool(forKey: "ShowCardList") {
                UserDefaults.standard.removeObject(forKey: "ShowCardList")
                showCards = true
            }
            if UserDefaults.standard.bool(forKey: "EditFirstCard"), let first = cards.first {
                UserDefaults.standard.removeObject(forKey: "EditFirstCard")
                try? await Task.sleep(for: .milliseconds(600))
                editTarget = first
            }
            #endif
        }
        // If a background build for THIS topic finishes while the sheet is
        // open, pull in the fresh deck.
        .onChange(of: FlashDeckBuilder.shared.buildingTopicIds) { old, new in
            if old.contains(topicId) && !new.contains(topicId) {
                Task { await load() }
            }
        }
        .fullScreenCover(item: $activeSet) { start in
            FlashSetView(start: start, topicLabel: topicLabel) { _ in
                Task { await load() }
            }
            .environment(session)
        }
        .fullScreenCover(item: $voiceSet) { start in
            FlashVoiceView(start: start, topicLabel: topicLabel) { _ in
                Task { await load() }
            }
            .environment(session)
        }
        .sheet(item: $editTarget) { card in
            FlashCardEditSheet(card: card) { edited in
                if let i = cards.firstIndex(where: { $0.id == edited.id }) { cards[i] = edited }
            } onDelete: {
                cards.removeAll { $0.id == card.id }
            }
        }
        .alert("Flash cards", isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .center) {
            IconCircleButton(systemImage: "chevron.down", fg: FeyndTheme.text, cancelShortcut: true) { closeModal(dismiss) }
            VStack(spacing: 3) {
                Text("FLASH CARDS")
                    .font(.system(size: 11, weight: .bold))
                    .tracking(1.2)
                    .foregroundStyle(FeyndTheme.accent)
                Text(topicLabel)
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.3)
                    .foregroundStyle(FeyndTheme.text)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            Color.clear.frame(width: 36, height: 36)
        }
        .padding(.horizontal, 14)
        .padding(.top, 12)
        .padding(.bottom, 10)
    }

    // MARK: - Empty deck → generate

    private var generateHero: some View {
        VStack(spacing: 18) {
            Spacer()
            if FlashDeckBuilder.shared.isBuilding(topicId) {
                // A build kicked off earlier is still running — the sheet was
                // dismissed then, but the user peeked back in.
                ProgressView().tint(FeyndTheme.accent).scaleEffect(1.3)
                Text("Dodo is writing your cards…")
                    .font(.system(size: 22, weight: .bold))
                    .tracking(-0.4)
                    .foregroundStyle(FeyndTheme.text)
                Text("You can close this — a notification will pop up when the deck is ready.")
                    .font(.system(size: 14))
                    .lineSpacing(3)
                    .foregroundStyle(FeyndTheme.text2)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            } else {
                Image(systemName: "bolt.circle.fill")
                    .font(.system(size: 54))
                    .foregroundStyle(FeyndTheme.accent)
                Text("Build this topic's deck")
                    .font(.system(size: 22, weight: .bold))
                    .tracking(-0.4)
                    .foregroundStyle(FeyndTheme.text)
                Text("Dodo reads everything you've saved here and writes flash cards that test the ideas that matter.")
                    .font(.system(size: 14))
                    .lineSpacing(3)
                    .foregroundStyle(FeyndTheme.text2)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)

                countPicker
                generateButton
            }
            Spacer()
            Spacer()
        }
    }

    private var countPicker: some View {
        HStack(spacing: 6) {
            ForEach([10, 15, 20, 25, 40, 50, 75], id: \.self) { n in
                Button {
                    generateCount = n
                } label: {
                    Text("\(n)")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(generateCount == n ? FeyndTheme.inkOnAccent : FeyndTheme.text2)
                        .frame(width: 44, height: 40)
                        .background(
                            generateCount == n ? FeyndTheme.accent : FeyndTheme.surface,
                            in: RoundedRectangle(cornerRadius: 12)
                        )
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(FeyndTheme.border, lineWidth: generateCount == n ? 0 : 1))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 6)
    }

    private var generateButton: some View {
        Button {
            generate()
        } label: {
            Text("Generate \(generateCount) cards")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(FeyndTheme.inkOnAccent)
                .padding(.horizontal, 26)
                .padding(.vertical, 14)
                .background(FeyndTheme.accent, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Deck exists → modes + history + manage

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                deckStrip
                modeButtons
                starLadderHint
                if !sets.isEmpty { historySection }
                manageSection
                Color.clear.frame(height: 30)
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
        }
        .scrollIndicators(.hidden)
    }

    private var deckStrip: some View {
        HStack(spacing: 8) {
            Text("\(cards.count) CARDS IN DECK")
                .font(.system(size: 12, weight: .semibold))
                .tracking(0.3)
                .foregroundStyle(FeyndTheme.text3)
            Text("·").foregroundStyle(FeyndTheme.text3)
            StarRow(value: stars, size: 11, gap: 2)
            Spacer()
            Button {
                generate()
            } label: {
                let building = FlashDeckBuilder.shared.isBuilding(topicId)
                HStack(spacing: 4) {
                    if building {
                        ProgressView().tint(FeyndTheme.text2).scaleEffect(0.7)
                    } else {
                        Image(systemName: "plus")
                            .font(.system(size: 11, weight: .bold))
                    }
                    Text(building ? "Writing…" : "More cards")
                        .font(.system(size: 12.5, weight: .semibold))
                }
                .foregroundStyle(FeyndTheme.text2)
                .padding(.horizontal, 11)
                .padding(.vertical, 6)
                .background(FeyndTheme.surface, in: Capsule())
                .overlay(Capsule().stroke(FeyndTheme.border, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .disabled(FlashDeckBuilder.shared.isBuilding(topicId))
        }
    }

    private var modeButtons: some View {
        VStack(spacing: 10) {
            modeButton("mixed", icon: "square.split.2x1", title: "Mixed round",
                       sub: "Half choices, half typing — the all-rounder")
            modeButton("choice", icon: "square.grid.2x2", title: "Multiple choice",
                       sub: "Tap the right answer — instant feedback")
            modeButton("text", icon: "keyboard", title: "Type answers",
                       sub: "Write it in your own words, Dodo grades")
            modeButton("voice", icon: "mic.fill", title: "Voice round",
                       sub: "Dodo quizzes you out loud, game-show style")
        }
    }

    private func modeButton(_ mode: String, icon: String, title: String, sub: String) -> some View {
        Button {
            startSet(mode: mode)
        } label: {
            HStack(spacing: 13) {
                Image(systemName: icon)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(FeyndTheme.accent)
                    .frame(width: 40, height: 40)
                    .background(FeyndTheme.accentSoft, in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text)
                    Text(sub)
                        .font(.system(size: 12.5))
                        .foregroundStyle(FeyndTheme.text3)
                }
                Spacer()
                if startingMode == mode {
                    ProgressView().tint(FeyndTheme.text2)
                } else {
                    Image(systemName: "play.fill")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text3)
                }
            }
            .padding(13)
            .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(FeyndTheme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .disabled(startingMode != nil)
    }

    /// Where this topic stands on the star-2 grind, so the bar is visible.
    @ViewBuilder
    private var starLadderHint: some View {
        if stars < 2 {
            let streak = currentHighStreak
            HStack(spacing: 8) {
                Image(systemName: "star")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(FeyndTheme.gold)
                Text(streak == 1
                     ? "9+ round banked — one more in a row earns the second star."
                     : "Score 9/10 or better twice in a row to earn the second star.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(FeyndTheme.text2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var currentHighStreak: Int {
        guard let last = sets.first else { return 0 }
        return (last.total >= 10 && last.score >= 9) ? 1 : 0
    }

    private var historySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("PAST ROUNDS")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.0)
                .foregroundStyle(FeyndTheme.text3)
            ForEach(sets) { s in
                HStack(spacing: 10) {
                    Image(systemName: iconForMode(s.mode))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(FeyndTheme.accent)
                        .frame(width: 26)
                    Text("\(s.score)/\(s.total)")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(s.score >= 9 ? FeyndTheme.gold : FeyndTheme.text)
                        .frame(width: 46, alignment: .leading)
                    Text("+\(s.xp) XP")
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text3)
                    Spacer()
                    Text(relative(s.createdAt))
                        .font(.system(size: 12))
                        .foregroundStyle(FeyndTheme.text3)
                }
                .padding(.vertical, 9)
                .padding(.horizontal, 12)
                .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(FeyndTheme.borderSoft, lineWidth: 1))
            }
        }
    }

    private func iconForMode(_ mode: String) -> String {
        switch mode {
        case "text": return "keyboard"
        case "voice": return "mic.fill"
        default: return "square.grid.2x2"
        }
    }

    private var manageSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation(.easeOut(duration: 0.2)) { showCards.toggle() }
            } label: {
                HStack(spacing: 6) {
                    Text("ALL CARDS")
                        .font(.system(size: 11, weight: .bold))
                        .tracking(1.0)
                    Image(systemName: showCards ? "chevron.down" : "chevron.right")
                        .font(.system(size: 9, weight: .bold))
                }
                .foregroundStyle(FeyndTheme.text3)
            }
            .buttonStyle(.plain)

            if showCards {
                ForEach(cards) { card in
                    cardRow(card)
                }

                addQuestionRow
                remakeBox
            }
        }
    }

    /// One card in the manage list. Buried cards stay visible here (dimmed)
    /// so a thumbs-down is never a one-way door — tapping the thumb again
    /// puts the card straight back into rotation.
    private func cardRow(_ card: FlashCard) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Button { editTarget = card } label: {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        if card.isPriority {
                            Text("PRIORITY")
                                .font(.system(size: 9, weight: .bold))
                                .tracking(0.5)
                                .foregroundStyle(FeyndTheme.gold)
                        }
                        if card.isBuried {
                            Text("BURIED")
                                .font(.system(size: 9, weight: .bold))
                                .tracking(0.5)
                                .foregroundStyle(FeyndTheme.text3)
                        }
                    }
                    Text(card.question)
                        .font(.system(size: 13.5, weight: .medium))
                        .foregroundStyle(FeyndTheme.text)
                        .multilineTextAlignment(.leading)
                    Text(card.answer)
                        .font(.system(size: 12.5))
                        .foregroundStyle(FeyndTheme.accent)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            VStack(spacing: 4) {
                Button { setRating(card, card.isBuried ? nil : "down") } label: {
                    Image(systemName: card.isBuried ? "hand.thumbsdown.fill" : "hand.thumbsdown")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(card.isBuried ? Color(hex: 0xE0635A) : FeyndTheme.text3)
                        .frame(width: 34, height: 22)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Button { setRating(card, card.isPriority ? nil : "priority") } label: {
                    DoubleThumbsUp(active: card.isPriority, size: 12)
                        .frame(width: 34, height: 22)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(11)
        .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(FeyndTheme.borderSoft, lineWidth: 1))
        .opacity(card.isBuried ? 0.55 : 1)
    }


    private func setRating(_ card: FlashCard, _ rating: String?) {
        guard let i = cards.firstIndex(where: { $0.id == card.id }) else { return }
        let previous = cards[i].rating
        cards[i].rating = rating
        Task {
            do {
                _ = try await F2API.shared.rateFlashCard(cardId: card.id, rating: rating)
            } catch {
                // Put the old state back so the UI never lies about the deck.
                if let j = cards.firstIndex(where: { $0.id == card.id }) {
                    cards[j].rating = previous
                }
                errorMessage = "Couldn't update that card: \(error.localizedDescription)"
            }
        }
    }

    /// Write-your-own card: the user types a question (typos welcome), F2
    /// polishes it and fills in the answer + wrong choices.
    private var addQuestionRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("ADD YOUR OWN")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.0)
                .foregroundStyle(FeyndTheme.text3)
                .padding(.top, 8)
            HStack(spacing: 8) {
                TextField("Write a question — Dodo fills in the answer…", text: $newQuestion, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.system(size: 14))
                    .foregroundStyle(FeyndTheme.text)
                    .tint(FeyndTheme.accent)
                    .lineLimit(1...3)
                    .padding(.horizontal, 13)
                    .padding(.vertical, 11)
                    .background(FeyndTheme.bgRaised, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(FeyndTheme.border, lineWidth: 1))

                Button {
                    addCard()
                } label: {
                    Group {
                        if addingCard {
                            ProgressView().tint(FeyndTheme.inkOnAccent).scaleEffect(0.8)
                        } else {
                            Image(systemName: "plus")
                                .font(.system(size: 14, weight: .heavy))
                                .foregroundStyle(FeyndTheme.inkOnAccent)
                        }
                    }
                    .frame(width: 38, height: 38)
                    .background(FeyndTheme.accent, in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(addingCard || newQuestion.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .opacity(newQuestion.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.5 : 1)
            }
        }
    }

    /// Remake-the-deck box: free-form instructions, whole deck regenerated
    /// in the background (replaces every card).
    private var remakeBox: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("REMAKE THIS DECK")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.0)
                .foregroundStyle(FeyndTheme.text3)
                .padding(.top, 8)
            TextField("e.g. more anecdotal, with a few big-picture questions…", text: $remakeInstructions, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.system(size: 14))
                .foregroundStyle(FeyndTheme.text)
                .tint(FeyndTheme.accent)
                .lineLimit(2...5)
                .padding(.horizontal, 13)
                .padding(.vertical, 11)
                .background(FeyndTheme.bgRaised, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(FeyndTheme.border, lineWidth: 1))
            HStack {
                Text("Replaces all \(cards.count) cards.")
                    .font(.system(size: 12))
                    .foregroundStyle(FeyndTheme.text3)
                Spacer()
                Button {
                    remakeDeck()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "wand.and.stars")
                            .font(.system(size: 12, weight: .semibold))
                        Text("Remake deck")
                            .font(.system(size: 13.5, weight: .bold))
                    }
                    .foregroundStyle(FeyndTheme.inkOnAccent)
                    .padding(.horizontal, 15)
                    .padding(.vertical, 9)
                    .background(FeyndTheme.gold, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(remakeInstructions.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                          || FlashDeckBuilder.shared.isBuilding(topicId))
                .opacity(remakeInstructions.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.5 : 1)
            }
        }
        .padding(.bottom, 10)
    }

    // MARK: - Data

    private func load() async {
        loading = cards.isEmpty && sets.isEmpty
        defer { loading = false }
        do {
            let flash = try await F2API.shared.getTopicFlash(id: topicId)
            cards = flash.cards
            sets = flash.sets
            stars = flash.stars
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Hand the build to FlashDeckBuilder and close this sheet immediately —
    /// generation takes up to a minute and shouldn't hold the UI hostage.
    /// A toast announces the finished deck wherever the user is by then.
    private func generate() {
        FlashDeckBuilder.shared.generate(
            topicId: topicId,
            topicLabel: topicLabel,
            count: generateCount,
            model: F2ChatModel.current.rawValue
        )
        closeModal(dismiss)
    }

    /// Inline await — a single card takes a few seconds, worth watching.
    private func addCard() {
        let question = newQuestion.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty, !addingCard else { return }
        addingCard = true
        Task {
            do {
                let card = try await F2API.shared.authorFlashCard(
                    topicId: topicId, question: question, model: F2ChatModel.current.rawValue)
                cards.append(card)
                newQuestion = ""
                FlashSFX.shared.play(.correct)
            } catch {
                errorMessage = "Couldn't add the card: \(error.localizedDescription)"
            }
            addingCard = false
        }
    }

    /// Whole-deck remake runs in the background (it's a full regeneration) —
    /// close the sheet, toast on completion, same as building a new deck.
    private func remakeDeck() {
        let instructions = remakeInstructions.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !instructions.isEmpty else { return }
        FlashDeckBuilder.shared.redo(
            topicId: topicId,
            topicLabel: topicLabel,
            instructions: instructions,
            model: F2ChatModel.current.rawValue
        )
        closeModal(dismiss)
    }

    private func startSet(mode: String) {
        guard startingMode == nil else { return }
        startingMode = mode
        Task {
            do {
                let start = try await F2API.shared.startFlashSet(threadId: topicId, mode: mode)
                if mode == "voice" {
                    voiceSet = start
                } else {
                    activeSet = start
                }
            } catch {
                errorMessage = error.localizedDescription
            }
            startingMode = nil
        }
    }
}

// FlashStart needs Identifiable for fullScreenCover(item:).
extension FlashStart: Identifiable {
    var id: String { questions.map(\.cardId).joined(separator: "-") }
}

// MARK: - Card edit sheet

/// Edit a card's question / answer / wrong choices, or delete it. Reachable
/// from the deck list AND inline from the multiple-choice set UI.
struct FlashCardEditSheet: View {
    let card: FlashCard
    var onSaved: (FlashCard) -> Void
    var onDelete: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var question: String
    @State private var answer: String
    @State private var d1: String
    @State private var d2: String
    @State private var d3: String
    @State private var busy = false
    @State private var errorMessage: String? = nil

    init(card: FlashCard, onSaved: @escaping (FlashCard) -> Void, onDelete: @escaping () -> Void) {
        self.card = card
        self.onSaved = onSaved
        self.onDelete = onDelete
        _question = State(initialValue: card.question)
        _answer = State(initialValue: card.answer)
        let d = card.distractors + ["", "", ""]
        _d1 = State(initialValue: d[0])
        _d2 = State(initialValue: d[1])
        _d3 = State(initialValue: d[2])
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Question") {
                    TextField("Question", text: $question, axis: .vertical)
                        .lineLimit(1...4)
                }
                Section("Answer") {
                    TextField("Correct answer", text: $answer, axis: .vertical)
                        .lineLimit(1...3)
                }
                Section("Wrong choices (multiple choice)") {
                    TextField("Wrong choice 1", text: $d1)
                    TextField("Wrong choice 2", text: $d2)
                    TextField("Wrong choice 3", text: $d3)
                }
                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
                Section {
                    Button(role: .destructive) {
                        delete()
                    } label: {
                        HStack {
                            Spacer()
                            Text(busy ? "Working…" : "Delete this card")
                            Spacer()
                        }
                    }
                    .disabled(busy)
                }
            }
            .navigationTitle("Edit card")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { closeModal(dismiss) }.keyboardShortcut(.cancelAction)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Saving…" : "Save") { save() }
                        .disabled(busy
                                  || question.trimmingCharacters(in: .whitespaces).isEmpty
                                  || answer.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func save() {
        busy = true
        Task {
            do {
                let distractors = [d1, d2, d3]
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
                let updated = try await F2API.shared.updateFlashCard(
                    cardId: card.id,
                    question: question.trimmingCharacters(in: .whitespacesAndNewlines),
                    answer: answer.trimmingCharacters(in: .whitespacesAndNewlines),
                    distractors: distractors
                )
                onSaved(updated)
                closeModal(dismiss)
            } catch {
                errorMessage = error.localizedDescription
            }
            busy = false
        }
    }

    private func delete() {
        busy = true
        Task {
            do {
                try await F2API.shared.deleteFlashCard(cardId: card.id)
                onDelete()
                closeModal(dismiss)
            } catch {
                errorMessage = error.localizedDescription
            }
            busy = false
        }
    }
}
