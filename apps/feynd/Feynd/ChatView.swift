import SwiftUI

struct ChatView: View {
    @Environment(Session.self) private var session
    @State private var messages: [F2Message] = []
    @State private var draft = ""
    @State private var busy = false
    @State private var loadError: String? = nil
    @State private var showSettings = false
    @State private var voicePresented = false

    var body: some View {
        VStack(spacing: 0) {
            MessageList(messages: messages, busy: busy)
            Composer(draft: $draft, busy: busy, onSend: send)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Chat")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    voicePresented = true
                } label: {
                    Image(systemName: "mic.circle.fill")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showSettings = true
                } label: {
                    Image(systemName: "gearshape")
                }
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
        }
        .sheet(isPresented: $voicePresented) {
            VoiceSessionView(mode: "global")
        }
        .task { await loadLatest() }
    }

    private func loadLatest() async {
        do {
            let thread = try await F2API.shared.latestThread()
            messages = thread?.messages ?? []
        } catch {
            loadError = error.localizedDescription
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
                let reply = try await F2API.shared.sendMessage(text: text)
                if !reply.isEmpty {
                    messages.append(F2Message(role: "assistant", text: reply, createdAt: Date()))
                }
            } catch {
                messages.append(F2Message(role: "assistant", text: "(error: \(error.localizedDescription))", createdAt: Date()))
            }
            busy = false
        }
    }
}

struct MessageList: View {
    let messages: [F2Message]
    let busy: Bool

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 8) {
                    if messages.isEmpty && !busy {
                        Text("Paste a URL to learn from, or ask me anything to begin.")
                            .font(.subheadline)
                            .foregroundStyle(.tertiary)
                            .multilineTextAlignment(.center)
                            .padding(.top, 80)
                            .padding(.horizontal, 32)
                    }
                    ForEach(messages) { msg in
                        MessageBubble(message: msg).id(msg.id)
                    }
                    if busy {
                        HStack {
                            TypingIndicator()
                            Spacer()
                        }
                        .padding(.horizontal, 16)
                        .id("typing")
                    }
                }
                .padding(.vertical, 16)
            }
            .onChange(of: messages.count) { _, _ in
                if let last = messages.last {
                    withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
            .onChange(of: busy) { _, newValue in
                if newValue { withAnimation { proxy.scrollTo("typing", anchor: .bottom) } }
            }
        }
    }
}

struct MessageBubble: View {
    let message: F2Message

    var body: some View {
        HStack {
            if message.role == "user" { Spacer(minLength: 40) }

            Text(message.text)
                .font(.system(size: 15))
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .foregroundStyle(message.role == "user" ? Color.white : Color.primary)
                .background(message.role == "user" ? Color.blue : Color(.secondarySystemGroupedBackground))
                .clipShape(BubbleShape(isUser: message.role == "user"))
                .overlay(
                    BubbleShape(isUser: message.role == "user")
                        .stroke(message.role == "user" ? .clear : Color(.separator), lineWidth: 1)
                )
                .textSelection(.enabled)

            if message.role != "user" { Spacer(minLength: 40) }
        }
        .padding(.horizontal, 16)
    }
}

struct BubbleShape: Shape {
    let isUser: Bool

    func path(in rect: CGRect) -> Path {
        let radius: CGFloat = 18
        let tailRadius: CGFloat = 6
        return Path { p in
            p.addRoundedRect(
                in: rect,
                cornerSize: CGSize(width: radius, height: radius)
            )
            if isUser {
                let tailRect = CGRect(x: rect.maxX - radius, y: rect.maxY - radius, width: radius, height: radius)
                p.addRect(tailRect)
                p.addRoundedRect(in: tailRect, cornerSize: CGSize(width: tailRadius, height: tailRadius))
            } else {
                let tailRect = CGRect(x: 0, y: rect.maxY - radius, width: radius, height: radius)
                p.addRect(tailRect)
                p.addRoundedRect(in: tailRect, cornerSize: CGSize(width: tailRadius, height: tailRadius))
            }
        }
    }
}

struct TypingIndicator: View {
    @State private var phase: Int = 0
    let timer = Timer.publish(every: 0.3, on: .main, in: .common).autoconnect()

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { i in
                Circle()
                    .fill(Color.secondary)
                    .frame(width: 6, height: 6)
                    .opacity(phase == i ? 1.0 : 0.3)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(.separator)))
        .onReceive(timer) { _ in phase = (phase + 1) % 3 }
    }
}

struct Composer: View {
    @Binding var draft: String
    let busy: Bool
    let onSend: () -> Void

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            TextField("Send a URL or ask a question…", text: $draft, axis: .vertical)
                .lineLimit(1...5)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 20))
                .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color(.separator)))

            Button(action: onSend) {
                Image(systemName: "arrow.up.circle.fill")
                    .resizable()
                    .frame(width: 34, height: 34)
                    .foregroundStyle(canSend ? Color.primary : Color(.tertiaryLabel))
            }
            .disabled(!canSend)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(.regularMaterial)
    }

    private var canSend: Bool {
        !busy && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
