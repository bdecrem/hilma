import SwiftUI

struct TopicDetailView: View {
    let topicId: String

    @Environment(\.dismiss) private var dismiss
    @State private var thread: F2Thread? = nil
    @State private var messages: [F2Message] = []
    @State private var draft = ""
    @State private var busy = false
    @State private var loading = true
    @State private var renamePresented = false
    @State private var renameDraft = ""
    @State private var deletePresented = false

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
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { startRename() } label: { Label("Rename", systemImage: "pencil") }
                    Button(role: .destructive) { deletePresented = true } label: { Label("Delete", systemImage: "trash") }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .alert("Rename topic", isPresented: $renamePresented) {
            TextField("Title", text: $renameDraft)
            Button("Cancel", role: .cancel) {}
            Button("Save") { commitRename() }
        }
        .alert("Delete topic?", isPresented: $deletePresented) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) { commitDelete() }
        } message: {
            Text("\"\(thread?.topic ?? "this topic")\" will be removed permanently.")
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

    private func startRename() {
        renameDraft = thread?.topic ?? ""
        renamePresented = true
    }

    private func commitRename() {
        let newName = renameDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !newName.isEmpty else { return }
        if var t = thread { t.topic = newName; thread = t }
        Task {
            do {
                try await F2API.shared.renameTopic(id: topicId, to: newName)
            } catch {
                await load()
            }
        }
    }

    private func commitDelete() {
        Task {
            do {
                try await F2API.shared.deleteTopic(id: topicId)
                dismiss()
            } catch {
                // leave on screen; could surface a toast
            }
        }
    }
}
