import AVFoundation
import SwiftUI

// Text-chat thread. Used in two modes:
//   · Modal-sheet mode: opened from a course video's Chat button; scoped
//     to that video (`video` non-nil, `onClose` closes the sheet).
//   · Root mode: lives directly in the Chat tab, no video context, no
//     close button — it's the persistent "open" chat for the topic.
// Both modes share the same composer (text + dictation mic + send) and
// the same per-message Listen playback via TTSPlayer.

struct ChatThreadView: View {
    let courseId: String
    let video: CourseVideo?                  // nil in root mode
    let onClose: (() -> Void)?               // nil in root mode — no × button

    @State private var chat: FeyndChat? = nil
    @State private var messages: [FeyndMessage] = []
    @State private var pendingMessages: [LocalMessage] = []
    @State private var input: String = ""
    @State private var loading = true
    @State private var sending = false
    @State private var errorText: String? = nil

    // TTS (Listen button) — short-lived Realtime session for voice output.
    @State private var tts = TTSPlayer()

    // Interactive voice mode (mic button) — opens a full-screen Realtime
    // session sheet.
    @State private var showingVoiceSheet = false

    @FocusState private var inputFocused: Bool

    private let accent = Color(red: 0.98, green: 0.55, blue: 0.20)

    var body: some View {
        ZStack(alignment: .top) {
            LinearGradient(
                colors: [Color(red: 0.02, green: 0.02, blue: 0.06), Color(red: 0.12, green: 0.04, blue: 0.24)],
                startPoint: .top, endPoint: .bottom
            ).ignoresSafeArea()

            VStack(spacing: 0) {
                header
                Divider().background(Color.white.opacity(0.1))

                if loading {
                    Spacer()
                    ProgressView().tint(.white.opacity(0.7))
                    Spacer()
                } else {
                    messagesList
                    composer
                }
            }
        }
        .preferredColorScheme(.dark)
        .task { await bootstrap() }
        .fullScreenCover(isPresented: $showingVoiceSheet) {
            VoiceSessionView(
                video: video,
                chatId: chat?.id,
                onClose: { showingVoiceSheet = false },
                onMessagePersisted: { msg in
                    // Voice turn landed server-side — append it to the local
                    // thread so it's visible the moment the sheet closes.
                    if !messages.contains(where: { $0.id == msg.id }) {
                        messages.append(msg)
                    }
                }
            )
        }
    }

    // MARK: Header

    private var header: some View {
        HStack(spacing: 12) {
            if let onClose {
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.8))
                        .frame(width: 34, height: 34)
                        .background(Circle().fill(.ultraThinMaterial))
                }
                .buttonStyle(.plain)
            }

            VStack(alignment: .leading, spacing: 2) {
                if let video {
                    Text("Chatting about")
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .foregroundStyle(.white.opacity(0.5))
                        .tracking(0.6)
                    Text(video.title)
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                } else {
                    Text("FEYND")
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .foregroundStyle(.white.opacity(0.5))
                        .tracking(0.8)
                    Text("AI Learning")
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundStyle(.white)
                }
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 10)
    }

    // MARK: Messages

    private var allDisplayMessages: [DisplayMessage] {
        let server = messages.map { DisplayMessage.server($0) }
        let pending = pendingMessages.map { DisplayMessage.pending($0) }
        return server + pending
    }

    private var messagesList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 12) {
                    if let err = errorText {
                        Text(err)
                            .font(.system(size: 12, design: .rounded))
                            .foregroundStyle(.red.opacity(0.9))
                            .padding(.horizontal, 18).padding(.vertical, 10)
                            .background(RoundedRectangle(cornerRadius: 12).fill(Color.red.opacity(0.12)))
                    }
                    ForEach(allDisplayMessages) { dm in
                        MessageBubble(
                            message: dm,
                            accent: accent,
                            isPlaying: dm.id == tts.currentMessageId && tts.state == .speaking,
                            isFetchingAudio: dm.id == tts.currentMessageId && tts.state == .preparing,
                            onPlay: { Task { await playOrPause(dm) } }
                        )
                        .id(dm.id)
                    }
                    if sending { TypingIndicator().padding(.leading, 14).id("__typing__") }
                    Spacer(minLength: 20)
                }
                .padding(.horizontal, 14)
                .padding(.top, 14)
            }
            .scrollIndicators(.hidden)
            .onChange(of: allDisplayMessages.count) { _, _ in
                withAnimation(.easeOut(duration: 0.2)) {
                    if let last = allDisplayMessages.last {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
            .onChange(of: sending) { _, newVal in
                if newVal {
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo("__typing__", anchor: .bottom)
                    }
                }
            }
        }
    }

    // MARK: Composer

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 10) {
            ZStack(alignment: .topLeading) {
                if input.isEmpty {
                    Text(video == nil ? "Ask anything about AI…" : "Ask about this video…")
                        .font(.system(size: 15, design: .rounded))
                        .foregroundStyle(.white.opacity(0.35))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .allowsHitTesting(false)
                }
                TextField("", text: $input, axis: .vertical)
                    .font(.system(size: 15, design: .rounded))
                    .foregroundStyle(.white)
                    .focused($inputFocused)
                    .lineLimit(1...5)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .submitLabel(.send)
            }
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Color.white.opacity(0.08))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )

            // Mic button — switches into interactive voice mode (Realtime
            // session sheet). Text chat stays behind it; close the sheet
            // to return.
            Button(action: { showingVoiceSheet = true }) {
                Image(systemName: "mic.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(Color.white.opacity(0.12)))
            }
            .buttonStyle(.plain)

            Button(action: { Task { await send() } }) {
                Image(systemName: sending ? "ellipsis" : "arrow.up")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Color(red: 0.14, green: 0.06, blue: 0.10))
                    .frame(width: 40, height: 40)
                    .background(
                        Circle().fill(canSend ? accent : Color.white.opacity(0.15))
                    )
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 12)
        .background(
            Rectangle()
                .fill(.ultraThinMaterial)
                .overlay(Color.black.opacity(0.2))
        )
    }

    private var canSend: Bool {
        !sending && !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && chat != nil
    }

    // MARK: Logic

    private func bootstrap() async {
        do {
            let existing = try await FeyndAPI.listChats(courseId: courseId, videoId: video?.id)
            // In root mode we want a single persistent chat — filter to ones
            // that are explicitly open (video_id nil) so we don't grab a
            // recent video-scoped chat.
            let match = video == nil
                ? existing.first(where: { $0.video_id == nil })
                : existing.first
            if let latest = match {
                let (c, msgs) = try await FeyndAPI.getChat(latest.id)
                self.chat = c
                self.messages = msgs
            } else {
                let title: String
                if let video {
                    title = "Chat about \(video.title.prefix(60))"
                } else {
                    title = "AI Learning"
                }
                let created = try await FeyndAPI.createChat(
                    courseId: courseId,
                    videoId: video?.id,
                    title: title
                )
                self.chat = created
                self.messages = []
            }
            self.loading = false
        } catch {
            self.errorText = "Couldn't load chat: \(error.localizedDescription)"
            self.loading = false
        }
    }

    private func send() async {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let chat else { return }
        input = ""
        let pending = LocalMessage(text: trimmed, role: "user")
        pendingMessages.append(pending)
        sending = true
        errorText = nil
        do {
            let (userMsg, asstMsg) = try await FeyndAPI.sendMessage(chatId: chat.id, text: trimmed)
            pendingMessages.removeAll { $0.id == pending.id }
            messages.append(contentsOf: [userMsg, asstMsg])
        } catch {
            pendingMessages.removeAll { $0.id == pending.id }
            errorText = error.localizedDescription
        }
        sending = false
    }

    // MARK: Playback

    private func playOrPause(_ dm: DisplayMessage) async {
        guard case .server(let msg) = dm, msg.role == "assistant" else { return }

        // Toggle: if this message is currently speaking (or preparing), stop.
        if tts.currentMessageId == msg.id, tts.state != .idle {
            await tts.stop()
            return
        }

        await tts.speak(msg.text, messageId: msg.id)

        // Surface any error into the thread's error banner.
        if case .failed(let m) = tts.state {
            errorText = "Playback failed: \(m)"
        }
    }
}

// MARK: - Display models

private struct LocalMessage: Identifiable, Hashable {
    let id = UUID().uuidString
    let text: String
    let role: String
}

private enum DisplayMessage: Identifiable, Hashable {
    case server(FeyndMessage)
    case pending(LocalMessage)

    var id: String {
        switch self {
        case .server(let m): return m.id
        case .pending(let m): return m.id
        }
    }
    var role: String {
        switch self {
        case .server(let m): return m.role
        case .pending(let m): return m.role
        }
    }
    var text: String {
        switch self {
        case .server(let m): return m.text
        case .pending(let m): return m.text
        }
    }
    var source: String? {
        if case .server(let m) = self { return m.source }
        return nil
    }
}

// MARK: - Bubble

private struct MessageBubble: View {
    let message: DisplayMessage
    let accent: Color
    let isPlaying: Bool
    let isFetchingAudio: Bool
    let onPlay: () -> Void

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if message.role == "user" {
                Spacer(minLength: 48)
                bubble
            } else {
                bubble
                Spacer(minLength: 48)
            }
        }
    }

    private var bubble: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(message.text)
                .font(.system(size: 14.5, design: .rounded))
                .foregroundStyle(message.role == "user" ? Color(red: 0.14, green: 0.06, blue: 0.10) : .white)
                .fixedSize(horizontal: false, vertical: true)

            if message.role == "assistant" {
                HStack(spacing: 6) {
                    Button(action: onPlay) {
                        HStack(spacing: 5) {
                            Image(systemName: isFetchingAudio ? "ellipsis" : (isPlaying ? "stop.fill" : "play.fill"))
                                .font(.system(size: 10, weight: .bold))
                            Text(isPlaying ? "Stop" : "Listen")
                                .font(.system(size: 10, weight: .semibold, design: .rounded))
                        }
                        .foregroundStyle(accent)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Capsule().fill(accent.opacity(0.15)))
                    }
                    .buttonStyle(.plain)
                    .disabled(isFetchingAudio)

                    if let src = message.source, src == "discord" {
                        Text("FROM DISCORD")
                            .font(.system(size: 8, weight: .bold, design: .rounded))
                            .foregroundStyle(.white.opacity(0.35))
                            .tracking(0.6)
                            .padding(.horizontal, 7).padding(.vertical, 3)
                            .background(Capsule().fill(Color.white.opacity(0.06)))
                    }
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(message.role == "user" ? accent : Color.white.opacity(0.08))
        )
    }
}

// MARK: - Typing indicator

private struct TypingIndicator: View {
    @State private var phase = 0

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(Color.white.opacity(phase == i ? 0.7 : 0.25))
                    .frame(width: 6, height: 6)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color.white.opacity(0.06)))
        .onAppear {
            withAnimation(.easeInOut(duration: 0.4).repeatForever()) {
                phase = 2
            }
        }
    }
}
