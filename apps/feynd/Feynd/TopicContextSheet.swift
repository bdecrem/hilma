import SwiftUI

/// "View context" sheet — lists every source attached to a topic (primary
/// URL + content, plus each additional source) with size + a delete button.
///
/// Used to see what the AI is actually reading for this topic, and to remove
/// stale or duplicate material.
struct TopicContextSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(Session.self) private var session

    let topic: F2Topic

    @State private var sources: [F2API.TopicSource] = []
    @State private var summaries: [F2API.SummaryVersion] = []
    @State private var currentSummaryId: String? = nil
    @State private var readerTarget: F2API.SummaryVersion? = nil
    @State private var sourceReaderTarget: F2API.TopicSource? = nil
    @State private var loading = true
    @State private var loadError: String? = nil
    @State private var deleting: Set<String> = []
    @State private var confirmDelete: F2API.TopicSource? = nil
    // Add-context (a URL the AI pulls in) — mirrors the topics-list flow, but
    // available right here on the context sheet.
    @State private var showAddContext = false
    @State private var addURL = ""
    @State private var addBusy = false
    @State private var addError: String? = nil
    // Upload Notes — a .txt file that becomes the user's own notes on this
    // topic. Notes are covered point by point in audio summaries.
    @State private var showNotesImporter = false
    @State private var notesBusy = false
    @State private var notesError: String? = nil
    // Study focus — scopes flash cards, quizzes, and the Final Review to the
    // part of the material the user actually studied. Seeded from the server
    // in load() (the list's F2Topic can be stale after an earlier edit).
    @State private var studyFocus: String? = nil
    @State private var focusSeeded = false
    @State private var showFocusEditor = false
    @State private var focusDraft = ""
    @State private var focusBusy = false
    @State private var focusError: String? = nil
    @State private var deckRebuilding = false

    var body: some View {
        VStack(spacing: 0) {
            handle
            header
            ScrollView {
                VStack(spacing: 0) {
                    HStack(spacing: 8) {
                        addContextButton
                        uploadNotesButton
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 12)
                    .padding(.bottom, 4)
                    studyFocusSection
                    if loading {
                        ProgressView()
                            .tint(FeyndTheme.text2)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 40)
                    } else if let err = loadError {
                        Text(err)
                            .font(.system(size: 13))
                            .foregroundStyle(FeyndTheme.text3)
                            .padding(24)
                    } else if sources.isEmpty && summaries.isEmpty {
                        Text("No source material attached to this topic.")
                            .font(.system(size: 13))
                            .foregroundStyle(FeyndTheme.text3)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 32)
                            .padding(.vertical, 40)
                    } else {
                        if !summaries.isEmpty {
                            summariesSection
                        }
                        if !sources.isEmpty {
                            if !summaries.isEmpty { sectionEyebrow("Source material") }
                            ForEach(sources) { src in
                                row(src)
                                if src.id != sources.last?.id {
                                    Rectangle()
                                        .fill(FeyndTheme.borderSoft)
                                        .frame(height: 1)
                                        .padding(.horizontal, 14)
                                }
                            }
                        }
                    }
                }
                .padding(.bottom, 32)
            }
            .scrollIndicators(.hidden)
        }
        .background(FeyndTheme.bgRaised.ignoresSafeArea())
        .task { await load() }
        .alert("Add context",
               isPresented: $showAddContext) {
            TextField("https://…", text: $addURL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .keyboardType(.URL)
            Button("Cancel", role: .cancel) { addURL = ""; addError = nil }
            Button("Add") { Task { await commitAdd() } }
                .disabled(addBusy)
        } message: {
            Text(addError ?? "Paste a URL (article, YouTube, etc.) — Dodo pulls it in and adds it to this topic's context.")
        }
        .fileImporter(
            isPresented: $showNotesImporter,
            allowedContentTypes: [.plainText, .text],
            allowsMultipleSelection: false,
        ) { result in
            importNotes(result)
        }
        .alert("Upload notes",
               isPresented: Binding(get: { notesError != nil },
                                    set: { if !$0 { notesError = nil } })) {
            Button("OK") { notesError = nil }
        } message: {
            Text(notesError ?? "")
        }
        .alert("Study focus",
               isPresented: $showFocusEditor) {
            TextField("Only the first half…", text: $focusDraft)
            Button("Cancel", role: .cancel) { focusDraft = ""; focusError = nil }
            Button("Save") { Task { await commitFocus(focusDraft) } }
                .disabled(focusBusy)
        } message: {
            Text(focusError ?? "What should F2 test you on? Flash cards, quizzes, and the Final Review will stick to it — e.g. “Only the first half — I haven’t finished the book.”")
        }
        .alert("Remove this source?",
               isPresented: Binding(get: { confirmDelete != nil },
                                    set: { if !$0 { confirmDelete = nil } })) {
            Button("Cancel", role: .cancel) { confirmDelete = nil }
            Button("Remove", role: .destructive) {
                if let src = confirmDelete {
                    confirmDelete = nil
                    Task { await delete(src) }
                }
            }
        } message: {
            Text("The AI will no longer use this material when answering questions about \"\(topic.displayLabel)\".")
        }
        .sheet(item: $readerTarget) { version in
            TranscriptReaderView(
                topicLabel: topic.displayLabel,
                version: version,
                isCurrent: version.id == currentSummaryId,
            )
        }
        .sheet(item: $sourceReaderTarget) { src in
            SourceReaderView(topicId: topic.id, source: src, heading: readerHeading(src))
        }
    }

    // MARK: - Add context

    private var addContextButton: some View {
        Button { addURL = ""; addError = nil; showAddContext = true } label: {
            HStack(spacing: 7) {
                if addBusy {
                    ProgressView().controlSize(.mini).tint(FeyndTheme.text2)
                } else {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 15, weight: .semibold))
                }
                Text(addBusy ? "Adding…" : "Add context")
                    .font(.system(size: 14, weight: .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(FeyndTheme.accent)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(FeyndTheme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .disabled(addBusy)
    }

    /// Upload Notes — pick a .txt file; its contents become the user's own
    /// notes on this topic, covered point by point in audio summaries.
    private var uploadNotesButton: some View {
        Button { notesError = nil; showNotesImporter = true } label: {
            HStack(spacing: 7) {
                if notesBusy {
                    ProgressView().controlSize(.mini).tint(FeyndTheme.text2)
                } else {
                    Image(systemName: "note.text.badge.plus")
                        .font(.system(size: 15, weight: .semibold))
                }
                Text(notesBusy ? "Uploading…" : "Upload notes")
                    .font(.system(size: 14, weight: .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(FeyndTheme.accent)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(FeyndTheme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .disabled(notesBusy)
    }

    private func importNotes(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result, let fileURL = urls.first else { return }
        notesBusy = true
        Task {
            defer { notesBusy = false }
            do {
                // Files-app picks come security-scoped; without the access
                // call the read throws a permission error.
                let scoped = fileURL.startAccessingSecurityScopedResource()
                defer { if scoped { fileURL.stopAccessingSecurityScopedResource() } }
                let text = try String(contentsOf: fileURL, encoding: .utf8)
                guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    notesError = "That file is empty."
                    return
                }
                let title = fileURL.deletingPathExtension().lastPathComponent
                _ = try await F2API.shared.uploadTopicNotes(
                    id: topic.id,
                    text: text,
                    title: title.isEmpty ? nil : title,
                )
                await load()
            } catch {
                notesError = "Couldn't upload: \(error.localizedDescription)"
            }
        }
    }

    // MARK: - Study focus

    @ViewBuilder
    private var studyFocusSection: some View {
        Group {
            if let focus = studyFocus {
                VStack(alignment: .leading, spacing: 6) {
                    Text("STUDY FOCUS")
                        .font(.system(size: 10, weight: .bold))
                        .tracking(0.5)
                        .foregroundStyle(FeyndTheme.gold)
                    Text("“\(focus)”")
                        .font(.system(size: 14))
                        .italic()
                        .foregroundStyle(FeyndTheme.text)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 5) {
                        if deckRebuilding {
                            ProgressView().controlSize(.mini).tint(FeyndTheme.text2)
                        }
                        Text(deckRebuilding
                             ? "Rebuilding the flash deck to match…"
                             : "Flash cards, quizzes, and the Final Review stay inside this.")
                            .font(.system(size: 11))
                            .foregroundStyle(FeyndTheme.text2)
                    }
                    HStack(spacing: 16) {
                        Button("Edit") {
                            focusDraft = focus
                            focusError = nil
                            showFocusEditor = true
                        }
                        Button("Clear") { Task { await commitFocus("") } }
                    }
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(FeyndTheme.accent)
                    .buttonStyle(.plain)
                    .disabled(focusBusy)
                    .padding(.top, 2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(FeyndTheme.border, lineWidth: 1))
            } else {
                Button {
                    focusDraft = ""
                    focusError = nil
                    showFocusEditor = true
                } label: {
                    HStack(spacing: 8) {
                        if focusBusy {
                            ProgressView().controlSize(.mini).tint(FeyndTheme.text2)
                        } else {
                            Image(systemName: "scope")
                                .font(.system(size: 14, weight: .semibold))
                        }
                        Text("Set a study focus")
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .foregroundStyle(FeyndTheme.text2)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(FeyndTheme.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .disabled(focusBusy)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
    }

    /// Save ("" clears) the focus, then rebuild an existing deck to match —
    /// its cards were generated under the old focus. The rebuild Task is
    /// unstructured on purpose: it keeps running if the sheet is dismissed.
    private func commitFocus(_ newValue: String) async {
        focusBusy = true
        defer { focusBusy = false }
        let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let cardCount = try await F2API.shared.setStudyFocus(id: topic.id, focus: trimmed)
            studyFocus = trimmed.isEmpty ? nil : trimmed
            focusDraft = ""
            if cardCount > 0 {
                deckRebuilding = true
                let topicId = topic.id
                let instructions = trimmed.isEmpty
                    ? "My study focus was removed — rebuild the deck to cover the full source material evenly."
                    : "Rebuild the deck to match my study focus."
                Task {
                    _ = try? await F2API.shared.redoFlashDeck(topicId: topicId, instructions: instructions)
                    deckRebuilding = false
                }
            }
        } catch {
            focusError = "Couldn't save: \(error.localizedDescription)"
            showFocusEditor = true
        }
    }

    private func commitAdd() async {
        let url = addURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !url.isEmpty else { return }
        addBusy = true
        addError = nil
        defer { addBusy = false }
        do {
            _ = try await F2API.shared.addTopicSource(id: topic.id, url: url)
            addURL = ""
            await load()
        } catch {
            addError = "Couldn't add: \(error.localizedDescription)"
            showAddContext = true
        }
    }

    /// Heading for the source reader — the source's own title, else a label.
    private func readerHeading(_ src: F2API.TopicSource) -> String {
        if let t = src.title, !t.isEmpty, t != "- YouTube" { return t }
        if src.part == "transcript" { return "Transcript" }
        if src.kind == "primary" { return "Primary source" }
        return "Source"
    }

    /// A row carries readable body text (as opposed to a bare URL or a quote,
    /// which is already shown inline).
    private func isReadable(_ src: F2API.TopicSource) -> Bool {
        src.kind != "quote" && src.part != "url"
    }

    // MARK: - Summaries

    /// The audio-summary transcripts (base + augmented), newest last. Tapping a
    /// row opens the full transcript in a reader.
    @ViewBuilder
    private var summariesSection: some View {
        sectionEyebrow("Summaries")
        VStack(spacing: 0) {
            ForEach(summaries) { v in
                Button { readerTarget = v } label: { summaryRow(v) }
                    .buttonStyle(.plain)
                if v.id != summaries.last?.id {
                    Rectangle()
                        .fill(FeyndTheme.borderSoft)
                        .frame(height: 1)
                        .padding(.horizontal, 14)
                }
            }
        }
    }

    private func summaryRow(_ v: F2API.SummaryVersion) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(v.instructions == nil ? "BASE SUMMARY" : "REVISED")
                        .font(.system(size: 10, weight: .bold))
                        .tracking(0.5)
                        .foregroundStyle(v.instructions == nil ? FeyndTheme.text3 : FeyndTheme.accent)
                    if v.id == currentSummaryId {
                        Text("CURRENT · HAS AUDIO")
                            .font(.system(size: 10, weight: .bold))
                            .tracking(0.5)
                            .foregroundStyle(FeyndTheme.gold)
                    }
                }
                if let instr = v.instructions, !instr.isEmpty {
                    Text("“\(instr)”")
                        .font(.system(size: 14))
                        .italic()
                        .foregroundStyle(FeyndTheme.text)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text(summaryMeta(v))
                    .font(.system(size: 11))
                    .foregroundStyle(FeyndTheme.text2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 4) {
                Text("Read")
                    .font(.system(size: 12, weight: .semibold))
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
            }
            .foregroundStyle(FeyndTheme.text3)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .contentShape(Rectangle())
    }

    /// "SHORT · ~4 min · 612 words" — whatever pieces are known.
    private func summaryMeta(_ v: F2API.SummaryVersion) -> String {
        var bits: [String] = []
        if let scale = v.scale { bits.append(scale == "book" ? "Book length" : "Short") }
        if let secs = v.durationSecs, secs > 0 {
            let mins = max(1, Int((Double(secs) / 60).rounded()))
            bits.append("~\(mins) min")
        }
        let words = v.script.split(whereSeparator: { $0 == " " || $0 == "\n" }).count
        if words > 0 { bits.append("\(words) words") }
        return bits.joined(separator: " · ")
    }

    private func sectionEyebrow(_ text: String) -> some View {
        HStack {
            Text(text.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(FeyndTheme.text3)
            Spacer()
        }
        .padding(.horizontal, 18)
        .padding(.top, 16)
        .padding(.bottom, 6)
    }

    // MARK: - Pieces

    private var handle: some View {
        Capsule()
            .fill(FeyndTheme.surface3)
            .frame(width: 38, height: 4)
            .padding(.top, 8)
            .frame(maxWidth: .infinity)
    }

    private var header: some View {
        ZStack {
            VStack(spacing: 2) {
                Text("Topic context")
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(FeyndTheme.text)
                Text(topic.displayLabel)
                    .font(.system(size: 12))
                    .foregroundStyle(FeyndTheme.text3)
                    .lineLimit(1)
            }
            HStack {
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text2)
                        .frame(width: 36, height: 36)
                        .background(FeyndTheme.surface2, in: Circle())
                }
                .buttonStyle(.plain)
            }
            .padding(.trailing, 14)
        }
        .padding(.top, 12)
        .padding(.bottom, 14)
    }

    @ViewBuilder
    private func row(_ src: F2API.TopicSource) -> some View {
        let isDeleting = deleting.contains(src.id)
        HStack(alignment: .top, spacing: 12) {
            if src.kind == "quote" {
                quoteContent(src)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(rowTag(src))
                        .font(.system(size: 10, weight: .bold))
                        .tracking(0.5)
                        .foregroundStyle(
                            src.note == true ? FeyndTheme.gold
                            : src.kind == "primary" ? FeyndTheme.accent : FeyndTheme.text3)
                    if src.part != "url" {
                        Text(sizeLabel(src.contentLength))
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(FeyndTheme.text3)
                    }
                }
                if let title = src.title, !title.isEmpty, title != "- YouTube" {
                    Text(title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text)
                        .lineLimit(2)
                }
                // Body line. A URL renders as a tappable link that opens in the
                // browser; a transcript/pasted body gets a one-line descriptor.
                if src.part == "transcript" {
                    Text("Transcript of the linked \(src.topicKind == "audio" ? "audio" : "video")")
                        .font(.system(size: 11))
                        .foregroundStyle(FeyndTheme.text2)
                } else if let url = src.url, !url.isEmpty, let dest = URL(string: url) {
                    Link(destination: dest) {
                        Text(url)
                            .font(.system(size: 11))
                            .foregroundStyle(FeyndTheme.accent)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                } else if src.note == true {
                    Text("Your notes — audio summaries cover these point by point")
                        .font(.system(size: 11))
                        .foregroundStyle(FeyndTheme.text2)
                } else if src.kind == "primary" {
                    Text("Pasted text")
                        .font(.system(size: 11))
                        .foregroundStyle(FeyndTheme.text2)
                }
                if isReadable(src) {
                    Button { sourceReaderTarget = src } label: {
                        HStack(spacing: 4) {
                            Text("Read")
                                .font(.system(size: 12, weight: .semibold))
                            Image(systemName: "chevron.right")
                                .font(.system(size: 10, weight: .semibold))
                        }
                        .foregroundStyle(FeyndTheme.text3)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            }

            Button {
                confirmDelete = src
            } label: {
                if isDeleting {
                    ProgressView()
                        .controlSize(.mini)
                        .tint(FeyndTheme.text2)
                        .frame(width: 28, height: 28)
                } else {
                    Image(systemName: "trash")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text3)
                        .frame(width: 28, height: 28)
                        .background(FeyndTheme.surface2, in: Circle())
                }
            }
            .buttonStyle(.plain)
            .disabled(isDeleting)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
    }

    /// A captured quote — the quote text itself shown in quotes, italic.
    @ViewBuilder
    private func quoteContent(_ src: F2API.TopicSource) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("QUOTE")
                .font(.system(size: 10, weight: .bold))
                .tracking(0.5)
                .foregroundStyle(FeyndTheme.accent)
            Text("“\(src.title ?? "")”")
                .font(.system(size: 14))
                .italic()
                .foregroundStyle(FeyndTheme.text)
                .lineLimit(8)
                .fixedSize(horizontal: false, vertical: true)
            if let author = src.author, !author.isEmpty {
                Text("— \(author)")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(FeyndTheme.text3)
            }
        }
    }

    /// The little uppercase tag on the left of each row.
    ///   PRIMARY URL / PRIMARY TRANSCRIPT / PRIMARY
    ///   ADDITIONAL URL / ADDITIONAL TRANSCRIPT / ADDITIONAL
    ///   QUOTE
    private func rowTag(_ src: F2API.TopicSource) -> String {
        if src.kind == "quote" { return "QUOTE" }
        if src.note == true { return "NOTES" }
        let base = src.kind == "primary" ? "PRIMARY" : "ADDITIONAL"
        switch src.part {
        case "url": return "\(base) URL"
        case "transcript": return "\(base) TRANSCRIPT"
        default: return base
        }
    }

    // MARK: - Data

    private func load() async {
        loading = true
        loadError = nil
        do {
            // Sources are the primary content; summaries + thread (for the
            // study focus) are best-effort — a hiccup shouldn't blank the sheet.
            async let sourcesTask = F2API.shared.listTopicSources(id: topic.id)
            async let summariesTask = try? F2API.shared.listSummaries(id: topic.id)
            async let threadTask = try? F2API.shared.getThread(id: topic.id)
            sources = try await sourcesTask
            if let s = await summariesTask {
                summaries = s.summaries
                currentSummaryId = s.currentId
            }
            // Only seed once — a reload after the user saved a focus in this
            // sheet must not clobber their fresh edit with the fetched value.
            if !focusSeeded {
                focusSeeded = true
                let fetchedThread = await threadTask
                let fetched = fetchedThread?.studyFocus ?? topic.studyFocus
                let trimmed = (fetched ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                studyFocus = trimmed.isEmpty ? nil : trimmed
            }
        } catch {
            loadError = error.localizedDescription
        }
        loading = false
    }

    private func delete(_ src: F2API.TopicSource) async {
        deleting.insert(src.id)
        defer { deleting.remove(src.id) }
        do {
            try await F2API.shared.deleteTopicSource(
                id: topic.id,
                kind: src.kind,
                index: (src.kind == "additional" || src.kind == "quote") ? src.index : nil,
                part: src.part,
            )
            // Optimistic local update so the row vanishes immediately.
            sources.removeAll { $0.id == src.id }
        } catch {
            loadError = "Couldn't remove: \(error.localizedDescription)"
            // Reload so the UI matches server truth on failure.
            await load()
        }
    }

    private func sizeLabel(_ bytes: Int) -> String {
        if bytes == 0 { return "empty" }
        if bytes < 1000 { return "\(bytes) chars" }
        let k = Double(bytes) / 1000.0
        return String(format: "%.1fk chars", k)
    }
}
