import SwiftUI

/// Add a source: paste a link (article, YouTube, podcast page) or raw text.
/// On success the sheet turns into the attention moment — the three "read for
/// this" questions — while idea cards are distilled in the same pass.
struct AddView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss

    enum Phase: Equatable {
        case input
        case working(String)   // stage label
        case primed(threadId: String, title: String, primer: [String], cardCount: Int)
        case failed(String)
    }

    @State private var text = ""
    @State private var title = ""
    @State private var phase: Phase = .input
    @FocusState private var focused: Bool

    private var isURL: Bool {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.hasPrefix("http://") || t.hasPrefix("https://")
    }

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            switch phase {
            case .input, .failed:
                inputView
            case .working(let stage):
                workingView(stage)
            case .primed(_, let title, let primer, let cardCount):
                primedView(title: title, primer: primer, cardCount: cardCount)
            }
        }
        .interactiveDismissDisabled({ if case .working = phase { return true }; return false }())
    }

    // MARK: Input

    private var inputView: some View {
        VStack(alignment: .leading, spacing: 0) {
            sheetHeader("Add something")

            Text("A link or pasted text. Loci pulls in the material, gives you three things to read for, and keeps the ideas worth remembering.")
                .font(.system(size: 13.5))
                .lineSpacing(2)
                .foregroundStyle(Theme.ink2)
                .padding(.top, 4)

            TextField("https://… or paste text", text: $text, axis: .vertical)
                .lineLimit(4...10)
                .font(.system(size: 15))
                .foregroundStyle(Theme.ink)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(isURL)
                .focused($focused)
                .padding(14)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.border, lineWidth: 1))
                .padding(.top, 18)

            if !isURL && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                TextField("Title (optional)", text: $title)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.ink)
                    .padding(14)
                    .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.border, lineWidth: 1))
                    .padding(.top, 10)
            }

            if case .failed(let msg) = phase {
                Text(msg)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.clay)
                    .padding(.top, 10)
            }

            PrimaryButton(label: "Add", disabled: text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) {
                add()
            }
            .padding(.top, 18)

            Spacer()
        }
        .padding(.horizontal, 22)
        .onAppear { focused = true }
    }

    // MARK: Working

    private func workingView(_ stage: String) -> some View {
        VStack(spacing: 14) {
            Spacer()
            ProgressView().tint(Theme.moss)
            Text(stage)
                .font(.system(size: 15, design: .serif))
                .italic()
                .foregroundStyle(Theme.ink2)
            Spacer()
        }
    }

    // MARK: Primed — the attention moment

    private func primedView(title: String, primer: [String], cardCount: Int) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            sheetHeader("Added")

            Text(title)
                .font(.system(size: 22, weight: .semibold, design: .serif))
                .foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 8)

            if !primer.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Eyebrow(text: "As you read, look for")
                    ForEach(Array(primer.enumerated()), id: \.offset) { i, q in
                        HStack(alignment: .top, spacing: 10) {
                            Text("\(i + 1)")
                                .font(.system(size: 12, weight: .semibold, design: .serif))
                                .foregroundStyle(Theme.moss)
                                .frame(width: 18, height: 18)
                                .background(Theme.mossSoft, in: Circle())
                            Text(q)
                                .font(.system(size: 15, design: .serif))
                                .lineSpacing(3)
                                .foregroundStyle(Theme.ink)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.borderSoft, lineWidth: 1))
                .padding(.top, 18)
            }

            if cardCount > 0 {
                Text("\(cardCount) \(cardCount == 1 ? "idea is" : "ideas are") waiting in your review deck.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.ink3)
                    .padding(.top, 12)
            }

            Spacer()

            PrimaryButton(label: "Done") { dismiss() }
                .padding(.bottom, 18)
        }
        .padding(.horizontal, 22)
    }

    private func sheetHeader(_ heading: String) -> some View {
        HStack {
            Text(heading)
                .font(.system(size: 24, weight: .semibold, design: .serif))
                .foregroundStyle(Theme.ink)
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.ink2)
                    .frame(width: 32, height: 32)
                    .background(Theme.raised, in: Circle())
            }
            .buttonStyle(.plain)
        }
        .padding(.top, 22)
    }

    // MARK: Action

    private func add() {
        let input = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else { return }
        let useURL = isURL
        phase = .working(useURL ? "Fetching the material…" : "Saving your text…")
        Task {
            do {
                let threadId: String
                if useURL {
                    let res = try await API.shared.sendMessage(text: input)
                    guard let id = res.threadId else {
                        throw APIError.http(0, "no thread created")
                    }
                    threadId = id
                } else {
                    let t = title.trimmingCharacters(in: .whitespacesAndNewlines)
                    threadId = try await API.shared.ingestPaste(title: t.isEmpty ? nil : t, text: input)
                }

                phase = .working("Finding what to read for…")
                let primer = (try? await API.shared.primer(threadId: threadId)) ?? []

                phase = .working("Distilling the ideas…")
                let distilled = try? await API.shared.distill(threadId: threadId)

                let detail = try? await API.shared.thread(id: threadId)
                let title = detail?.topic ?? "New topic"

                await session.refreshHome()
                withAnimation {
                    phase = .primed(
                        threadId: threadId,
                        title: title,
                        primer: primer,
                        cardCount: distilled?.cards.count ?? 0
                    )
                }
            } catch {
                phase = .failed("Couldn't add that — check the link and try again.")
            }
        }
    }
}
