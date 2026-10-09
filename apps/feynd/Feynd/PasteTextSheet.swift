import SwiftUI

/// Paste text — the third way into a topic's context, next to Add context
/// (a URL) and Upload notes (a .txt file): a plain multi-line field for
/// whatever is on the clipboard. The text is stored as source material on
/// the topic (not flagged as notes — the server still treats a short paste
/// as the user's annotations and a long one as bulk material), and shows on
/// the context sheet as "ADDITIONAL · Pasted text", readable and deletable
/// like any other source.
///
/// One layout for iOS and Catalyst: on the phone the field takes focus so
/// the paste bubble is one long-press away; on the Mac ⌘V pastes and ⌘↩
/// saves. The form is a sheet, not an alert, because an alert's text field
/// is a single line.
struct PasteTextSheet: View {
    @Environment(\.dismiss) private var dismiss

    let topicId: String
    let topicLabel: String
    /// Runs after a successful save — the context sheet reloads its list.
    var onSaved: () async -> Void = {}

    @State private var title = ""
    @State private var text = ""
    @State private var busy = false
    @State private var saveError: String? = nil
    @FocusState private var textFocused: Bool

    /// Mirrors the server's NOTES_UPLOAD_MAX_CHARS on the sources route.
    private let maxChars = 200_000

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var tooLong: Bool { trimmed.count > maxChars }
    private var canSave: Bool { !busy && !trimmed.isEmpty && !tooLong }

    var body: some View {
        VStack(spacing: 0) {
            handle
            header
            VStack(spacing: 10) {
                TextField("Title (optional)", text: $title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(FeyndTheme.text)
                    .textFieldStyle(.plain)
                    .submitLabel(.next)
                    .onSubmit { textFocused = true }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(FeyndTheme.border, lineWidth: 1))

                ZStack(alignment: .topLeading) {
                    TextEditor(text: $text)
                        .font(.system(size: 15))
                        .foregroundStyle(FeyndTheme.text)
                        .scrollContentBackground(.hidden)
                        .focused($textFocused)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 6)
                    if text.isEmpty {
                        // TextEditor has no placeholder of its own; this one
                        // sits where the first line of text lands.
                        Text("Paste or type text…")
                            .font(.system(size: 15))
                            .foregroundStyle(FeyndTheme.text3)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 14)
                            .allowsHitTesting(false)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(FeyndTheme.border, lineWidth: 1))

                HStack {
                    Text(countLabel)
                        .font(.system(size: 11))
                        .foregroundStyle(tooLong ? FeyndTheme.blush : FeyndTheme.text3)
                    Spacer()
                    if let saveError {
                        Text(saveError)
                            .font(.system(size: 11))
                            .foregroundStyle(FeyndTheme.blush)
                            .lineLimit(2)
                            .multilineTextAlignment(.trailing)
                    }
                }

                Button { Task { await save() } } label: {
                    HStack(spacing: 8) {
                        if busy { ProgressView().tint(FeyndTheme.inkOnAccent) }
                        Text(busy ? "Adding…" : "Add to topic")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(FeyndTheme.inkOnAccent)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(FeyndTheme.accent, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(!canSave)
                .opacity(canSave || busy ? 1 : 0.5)
                // Plain Return inserts a newline in the editor; ⌘↩ saves.
                .keyboardShortcut(.return, modifiers: .command)
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 18)
        }
        .background(FeyndTheme.bgRaised.ignoresSafeArea())
        .presentationDetents([.large])
        .presentationDragIndicator(.hidden)
        .onAppear {
            // Focus after the sheet has settled, so the keyboard rises with
            // the form instead of fighting its presentation.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { textFocused = true }
            #if targetEnvironment(simulator)
            // `-TestPasteText "<text>"` (+ `-TestPasteTitle "<title>"`)
            // prefills the form — headless checks, no clipboard taps;
            // `-TestPasteSave 1` then saves it through the real API a second
            // later, like TestPebbleSave.
            if let seeded = UserDefaults.standard.string(forKey: "TestPasteText") {
                UserDefaults.standard.removeObject(forKey: "TestPasteText")
                text = seeded
                if let t = UserDefaults.standard.string(forKey: "TestPasteTitle") {
                    UserDefaults.standard.removeObject(forKey: "TestPasteTitle")
                    title = t
                }
                if UserDefaults.standard.bool(forKey: "TestPasteSave") {
                    UserDefaults.standard.removeObject(forKey: "TestPasteSave")
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { Task { await save() } }
                }
            }
            #endif
        }
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
                Text("Paste text")
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(FeyndTheme.text)
                Text(topicLabel)
                    .font(.system(size: 12))
                    .foregroundStyle(FeyndTheme.text3)
                    .lineLimit(1)
            }
            HStack {
                Spacer()
                Button { closeModal(dismiss) } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text2)
                        .frame(width: 36, height: 36)
                        .background(FeyndTheme.surface2, in: Circle())
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.cancelAction)
            }
            .padding(.trailing, 14)
        }
        .padding(.top, 12)
        .padding(.bottom, 14)
    }

    /// "1,234 characters", or the limit when the paste is over it.
    private var countLabel: String {
        let n = trimmed.count
        if n == 0 { return "Source material for this topic — Dodo reads it like an article." }
        let count = n.formatted(.number)
        if tooLong { return "\(count) characters — the limit is \(maxChars.formatted(.number))." }
        return "\(count) characters"
    }

    // MARK: - Save

    private func save() async {
        guard canSave else { return }
        busy = true
        saveError = nil
        defer { busy = false }
        do {
            let t = title.trimmingCharacters(in: .whitespacesAndNewlines)
            _ = try await F2API.shared.pasteTopicText(
                id: topicId,
                text: trimmed,
                title: t.isEmpty ? nil : t,
            )
            closeModal(dismiss)
            await onSaved()
        } catch {
            saveError = "Couldn't add: \(error.localizedDescription)"
        }
    }
}
