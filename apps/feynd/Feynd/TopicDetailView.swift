import SwiftUI

struct TopicDetailView: View {
    let topicId: String

    @State private var thread: F2Thread? = nil
    @State private var messages: [F2Message] = []
    @State private var draft = ""
    @State private var busy = false
    @State private var loading = true
    @State private var voicePresented = false

    var body: some View {
        VStack(spacing: 0) {
            if loading && thread == nil {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                MessageList(messages: messages, busy: busy)
                topicComposer
            }
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(thread?.topic ?? "Topic")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $voicePresented) {
            VoiceSessionView(mode: "topic", threadId: topicId)
        }
        .task { await load() }
    }

    private var topicComposer: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                Button(action: quizMe) {
                    Label("Quiz me", systemImage: "questionmark.circle")
                        .font(.subheadline)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color(.secondarySystemGroupedBackground))
                        .clipShape(Capsule())
                        .overlay(Capsule().stroke(Color(.separator)))
                }
                .disabled(busy)
                .foregroundStyle(Color.primary)

                Button {
                    voicePresented = true
                } label: {
                    Label("Voice", systemImage: "mic.circle")
                        .font(.subheadline)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color(.secondarySystemGroupedBackground))
                        .clipShape(Capsule())
                        .overlay(Capsule().stroke(Color(.separator)))
                }
                .disabled(busy)
                .foregroundStyle(Color.primary)

                Spacer()
            }
            .padding(.horizontal, 12)

            Composer(draft: $draft, busy: busy, onSend: send)
        }
        .background(.regularMaterial)
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let t = try await F2API.shared.getThread(id: topicId)
            thread = t
            messages = t.messages
        } catch {
            messages = []
        }
    }

    private func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !busy else { return }
        draft = ""
        busy = true
        messages.append(F2Message(role: "user", text: text, createdAt: Date()))
        Task {
            do {
                let reply = try await F2API.shared.sendMessage(text: text, threadId: topicId)
                if !reply.isEmpty {
                    messages.append(F2Message(role: "assistant", text: reply, createdAt: Date()))
                }
            } catch {
                messages.append(F2Message(role: "assistant", text: "(error: \(error.localizedDescription))", createdAt: Date()))
            }
            busy = false
        }
    }

    private func quizMe() {
        guard !busy else { return }
        busy = true
        messages.append(F2Message(role: "user", text: "Quiz me on this topic.", createdAt: Date()))
        Task {
            do {
                let reply = try await F2API.shared.quizMe(id: topicId)
                if !reply.isEmpty {
                    messages.append(F2Message(role: "assistant", text: reply, createdAt: Date()))
                }
                if var t = thread {
                    t.quizCount += 1
                    t.lastQuizzedAt = Date()
                    thread = t
                }
            } catch {
                messages.append(F2Message(role: "assistant", text: "(error: \(error.localizedDescription))", createdAt: Date()))
            }
            busy = false
        }
    }
}
