import SwiftUI

/// The clarifying conversation for one topic — same f2 backend the web and
/// Feynd use, so the tutor has the full source in context.
struct ChatView: View {
    @Environment(\.dismiss) private var dismiss
    let topicId: String
    let topicTitle: String?

    @State private var messages: [Message] = []
    @State private var draft = ""
    @State private var busy = false
    @State private var loading = true
    @FocusState private var composerFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            header

            if loading {
                Spacer()
                ProgressView().tint(Theme.ink2)
                Spacer()
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(spacing: 10) {
                            if messages.isEmpty {
                                Text("Ask anything — what didn't land, what seems off, what you want to go deeper on.")
                                    .font(.system(size: 13.5))
                                    .foregroundStyle(Theme.ink3)
                                    .multilineTextAlignment(.center)
                                    .padding(.top, 40)
                                    .padding(.horizontal, 30)
                            }
                            ForEach(messages) { m in
                                bubble(m)
                            }
                            if busy {
                                HStack {
                                    ProgressView().controlSize(.small).tint(Theme.ink3)
                                    Spacer()
                                }
                                .padding(.leading, 18)
                            }
                            Color.clear.frame(height: 8).id("bottom")
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 12)
                    }
                    .scrollIndicators(.hidden)
                    .scrollDismissesKeyboard(.interactively)
                    .onChange(of: messages.count) { _, _ in
                        withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
                    }
                    .onChange(of: loading) { _, _ in
                        proxy.scrollTo("bottom", anchor: .bottom)
                    }
                }
            }

            composer
        }
        .background(Theme.bg.ignoresSafeArea())
        .task { await load() }
    }

    private var header: some View {
        HStack(spacing: 10) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .frame(width: 36, height: 36)
                    .background(Theme.raised, in: Circle())
            }
            .buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 1) {
                Text("Discuss")
                    .font(.system(size: 16, weight: .semibold, design: .serif))
                    .foregroundStyle(Theme.ink)
                if let topicTitle {
                    Text(topicTitle)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.ink3)
                        .lineLimit(1)
                }
            }
            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.top, 10)
        .padding(.bottom, 8)
    }

    @ViewBuilder
    private func bubble(_ m: Message) -> some View {
        let isUser = m.role == "user"
        HStack {
            if isUser { Spacer(minLength: 48) }
            Text(m.text)
                .font(.system(size: 15))
                .lineSpacing(2)
                .foregroundStyle(isUser ? Color.white : Theme.ink)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    isUser ? Theme.mossDeep : Theme.surface,
                    in: RoundedRectangle(cornerRadius: 16)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(isUser ? Color.clear : Theme.borderSoft, lineWidth: 1)
                )
            if !isUser { Spacer(minLength: 48) }
        }
    }

    private var composer: some View {
        HStack(spacing: 8) {
            TextField("Ask about this topic…", text: $draft, axis: .vertical)
                .lineLimit(1...4)
                .font(.system(size: 15))
                .foregroundStyle(Theme.ink)
                .focused($composerFocused)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 18))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.border, lineWidth: 1))

            Button {
                send()
            } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .frame(width: 38, height: 38)
                    .background(Theme.mossDeep, in: Circle())
            }
            .buttonStyle(.plain)
            .opacity(busy || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.4 : 1)
            .disabled(busy || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private func load() async {
        do {
            let t = try await API.shared.thread(id: topicId)
            messages = t.messages
        } catch {
            // Leave empty — composer still works.
        }
        loading = false
    }

    private func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !busy else { return }
        draft = ""
        busy = true
        messages.append(Message(role: "user", text: text, createdAt: Date()))
        Task {
            do {
                let res = try await API.shared.sendMessage(text: text, threadId: topicId)
                messages.append(Message(role: "assistant", text: res.reply, createdAt: Date()))
            } catch {
                messages.append(Message(role: "assistant", text: "(Couldn't reach the tutor — try again.)", createdAt: Date()))
            }
            busy = false
        }
    }
}
