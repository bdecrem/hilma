import AVFoundation
import SwiftUI

// Text-chat thread. Opened from the course detail view when the user taps
// "Ask Feynd" on a video. Auto-resumes the most recent chat for that video
// (if any) or creates a new one. Typed questions → Opus → text reply; tap
// the speaker on any assistant message to hear it (TTS streamed from the
// backend, cached in Supabase Storage).

struct ChatThreadView: View {
    let courseId: String
    let video: CourseVideo
    let onClose: () -> Void

    @State private var chat: FeyndChat? = nil
    @State private var messages: [FeyndMessage] = []
    @State private var pendingMessages: [LocalMessage] = []   // optimistic user msgs
    @State private var input: String = ""
    @State private var loading = true
    @State private var sending = false
    @State private var errorText: String? = nil

    // Playback
    @State private var player: AVPlayer? = nil
    @State private var nowPlayingId: String? = nil
    @State private var fetchingTTSId: String? = nil

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
    }

    // MARK: Header

    private var header: some View {
        HStack(spacing: 12) {
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.8))
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(.ultraThinMaterial))
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 2) {
                Text("Chatting about")
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundStyle(.white.opacity(0.5))
                    .tracking(0.6)
                Text(video.title)
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
                    .lineLimit(1)
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
                            isPlaying: dm.id == nowPlayingId,
                            isFetchingAudio: dm.id == fetchingTTSId,
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
                    Text("Ask about this video…")
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
            let existing = try await FeyndAPI.listChats(courseId: courseId, videoId: video.id)
            if let latest = existing.first {
                let (c, msgs) = try await FeyndAPI.getChat(latest.id)
                self.chat = c
                self.messages = msgs
            } else {
                let created = try await FeyndAPI.createChat(
                    courseId: courseId,
                    videoId: video.id,
                    title: "Chat about \(video.title.prefix(60))"
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

        // If this message is playing, pause and reset.
        if nowPlayingId == msg.id, let player {
            player.pause()
            self.player = nil
            self.nowPlayingId = nil
            return
        }

        // Stop any other playback.
        if let old = player { old.pause() }
        player = nil
        nowPlayingId = nil

        // Make sure the audio session is in .playback before we play so the
        // silent switch doesn't mute us and a prior .playAndRecord session
        // (from Realtime voice mode) doesn't route audio to the earpiece.
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio, options: [])
            try session.setActive(true, options: [.notifyOthersOnDeactivation])
        } catch {
            NSLog("FEYND_TTS_AUDIO_SESSION_ERR \(error)")
        }

        fetchingTTSId = msg.id
        do {
            let url = try await FeyndAPI.fetchTTS(messageId: msg.id, text: msg.text)
            fetchingTTSId = nil

            let p = AVPlayer(url: url)
            self.player = p
            self.nowPlayingId = msg.id
            p.play()

            NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: p.currentItem,
                queue: .main
            ) { _ in
                Task { @MainActor in
                    if self.nowPlayingId == msg.id {
                        self.nowPlayingId = nil
                        self.player = nil
                    }
                }
            }
        } catch {
            fetchingTTSId = nil
            errorText = "Playback failed: \(error.localizedDescription)"
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
