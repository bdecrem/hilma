import SwiftUI

/// The booth — the app's one dark room. A live voice conversation with the
/// tutor: a breathing lamp of light (amber when the tutor speaks, mint when
/// it's your turn), glanceable captions, and after End, the session notes.
struct TalkView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss

    /// Chapter to practice, or nil for freeform.
    let topic: TopicSummary?

    @State private var client = VoiceClient()
    @State private var startedAt = Date()

    private enum Stage {
        case live
        case wrappingUp
        case notes(EndSessionResponse)
        case saveFailed(String)
    }
    @State private var stage: Stage = .live
    // Held across retries: the client is torn down at End, so this is the
    // only copy of the conversation until the server accepts it.
    @State private var pendingTranscript: [[String: String]] = []
    @State private var pendingConversationId: String?
    @State private var pendingHadConversation = false

    var body: some View {
        ZStack {
            Theme.boothBg.ignoresSafeArea()
            switch stage {
            case .live:
                liveView
            case .wrappingUp:
                wrappingUpView
            case .notes(let response):
                notesView(response)
            case .saveFailed(let message):
                saveFailedView(message)
            }
        }
        .preferredColorScheme(.dark)
        .task {
            startedAt = Date()
            await client.start(topicId: topic?.id)
        }
        .onDisappear {
            if case .live = stage { client.stop() }
        }
    }

    // MARK: Live

    private var liveView: some View {
        VStack(spacing: 0) {
            HStack {
                Eyebrow(
                    text: topic.map { $0.titleTarget ?? $0.title } ?? "Freeform",
                    color: Theme.boothSecondary
                )
                Spacer()
                Text(startedAt, style: .timer)
                    .font(.system(size: 13).monospacedDigit())
                    .foregroundStyle(Theme.boothSecondary)
            }
            .padding(.horizontal, 20)
            .frame(height: 56)

            Spacer()

            TalkLamp(phase: client.phase)

            if case .failed(let message) = client.phase {
                Text(message)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.boothSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                    .padding(.top, 24)
            } else if client.phase == .connecting || client.phase == .creatingSession
                        || client.phase == .requestingPermission {
                Text(client.status)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.boothSecondary)
                    .padding(.top, 24)
            }

            Spacer()

            captions
                .padding(.horizontal, 24)
                .padding(.bottom, 32)

            controls
                .padding(.bottom, 40)
        }
    }

    private var captions: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !client.lastTutorLine.isEmpty {
                Text(client.lastTutorLine)
                    .font(.target(20, .medium))
                    .foregroundStyle(Theme.boothInk)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .lineLimit(3)
            }
            if !client.lastUserLine.isEmpty {
                Text(client.lastUserLine)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.boothSecondary)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .lineLimit(2)
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: client.lastTutorLine)
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: client.lastUserLine)
    }

    private var controls: some View {
        HStack(spacing: 40) {
            Button {
                client.setMuted(!client.muted)
            } label: {
                Image(systemName: client.muted ? "mic.slash.fill" : "mic")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(client.muted ? Theme.boothOchre : Theme.boothSecondary)
                    .frame(width: 44, height: 44)
                    .background(Circle().stroke(Theme.boothControl, lineWidth: 1.5))
            }
            .accessibilityLabel(client.muted ? "Unmute" : "Mute")

            Button {
                endSession()
            } label: {
                Text(isFailedOrEnded ? "Close" : "End")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.boothInk)
                    .frame(width: 120, height: 56)
                    .background(Theme.boothControl)
                    .clipShape(Capsule())
            }

            // Balance the mute button so End stays centered.
            Color.clear.frame(width: 44, height: 44)
        }
    }

    private var isFailedOrEnded: Bool {
        if case .failed = client.phase { return true }
        return client.phase == .ended
    }

    // MARK: Wrap-up

    private var wrappingUpView: some View {
        VStack(spacing: 24) {
            TalkLamp(phase: .connecting)
            Text("Writing your notes…")
                .font(.system(size: 15))
                .foregroundStyle(Theme.boothSecondary)
        }
    }

    private func endSession() {
        pendingHadConversation = client.userTurns > 0
        pendingTranscript = client.transcript
        pendingConversationId = client.conversationId
        client.stop()

        guard pendingConversationId != nil else {
            dismiss()
            return
        }
        saveSession()
    }

    /// Deliver the transcript to the server. This is the ONLY copy of the
    /// conversation, so a failure offers retry — never a silent discard.
    private func saveSession() {
        guard let conversationId = pendingConversationId else {
            dismiss()
            return
        }
        stage = .wrappingUp
        Task {
            do {
                let response = try await API.shared.endTalkSession(id: conversationId, transcript: pendingTranscript)
                session.take(response.xp)
                if response.newTopic != nil { await session.refreshTopics() }
                if pendingHadConversation {
                    stage = .notes(response)
                } else {
                    dismiss()
                }
            } catch {
                if pendingHadConversation {
                    stage = .saveFailed(error.localizedDescription)
                } else {
                    // Nothing was said — nothing worth trapping them over.
                    dismiss()
                }
            }
        }
    }

    private func saveFailedView(_ message: String) -> some View {
        VStack(spacing: 16) {
            Spacer()
            Eyebrow(text: "Couldn't save", color: Theme.boothSecondary)
            Text("Your conversation is still here — it just didn't reach the server.")
                .font(.system(size: 17))
                .foregroundStyle(Theme.boothInk)
                .multilineTextAlignment(.center)
            Text(message)
                .font(.system(size: 13))
                .foregroundStyle(Theme.boothSecondary)
                .multilineTextAlignment(.center)
            Spacer()
            Button {
                saveSession()
            } label: {
                Text("Try again")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.boothBg)
                    .frame(maxWidth: .infinity)
                    .frame(height: 56)
                    .background(Theme.boothInk)
                    .clipShape(Capsule())
            }
            Button {
                dismiss()
            } label: {
                Text("Discard session")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.boothSecondary)
            }
            .padding(.bottom, 24)
        }
        .padding(.horizontal, 24)
    }

    // MARK: Session notes

    private func notesView(_ response: EndSessionResponse) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    VStack(alignment: .leading, spacing: 12) {
                        Eyebrow(text: "Session notes", color: Theme.boothSecondary)
                            .padding(.top, 24)
                        if let summary = response.summary {
                            Text(summary)
                                .font(.system(size: 17))
                                .foregroundStyle(Theme.boothInk)
                                .lineSpacing(4)
                        }
                        if response.xp.earned > 0 {
                            Text("+\(response.xp.earned) XP\(response.xp.leveledUp ? " · Level \(response.xp.level)" : "")")
                                .font(.system(size: 17, weight: .semibold).monospacedDigit())
                                .foregroundStyle(Theme.mint)
                        }
                    }

                    if !response.corrections.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Eyebrow(text: "Worth remembering", color: Theme.boothSecondary)
                            ForEach(response.corrections, id: \.self) { correction in
                                correctionCard(correction)
                            }
                        }
                    }

                    if let newTopic = response.newTopic {
                        VStack(alignment: .leading, spacing: 12) {
                            Eyebrow(text: "New chapter", color: Theme.boothSecondary)
                            VStack(alignment: .leading, spacing: 6) {
                                HStack(spacing: 8) {
                                    if let emoji = newTopic.emoji { Text(emoji) }
                                    Text(newTopic.titleTarget ?? newTopic.title)
                                        .font(.target(22, .semibold))
                                        .foregroundStyle(Theme.boothInk)
                                }
                                Text(newTopic.title)
                                    .font(.system(size: 15))
                                    .foregroundStyle(Theme.boothSecondary)
                                Text("\(newTopic.cardCount) flash cards made from your conversation — it's in your Library.")
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.boothSecondary)
                                    .padding(.top, 4)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(16)
                            .background(Theme.boothSurface)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
            }

            Button {
                dismiss()
            } label: {
                Text("Done")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.boothInk)
                    .frame(maxWidth: .infinity)
                    .frame(height: 56)
                    .background(Theme.boothControl)
                    .clipShape(Capsule())
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
    }

    private func correctionCard(_ correction: Correction) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(correction.quote)
                    .font(.system(size: 15))
                    .strikethrough(true, color: Theme.boothSecondary)
                    .foregroundStyle(Theme.boothSecondary)
                Image(systemName: "arrow.right")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Theme.boothOchre)
                Text(correction.corrected)
                    .font(.target(17))
                    .foregroundStyle(Theme.boothInk)
            }
            Text(correction.note)
                .font(.system(size: 13))
                .foregroundStyle(Theme.boothSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Theme.boothSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 1)
                .fill(Theme.boothOchre)
                .frame(width: 2)
                .padding(.vertical, 12)
        }
    }
}

/// The voice presence: a soft breathing glow, never a spiky waveform.
/// Amber while the tutor speaks; mint (and smaller) when it's your turn.
struct TalkLamp: View {
    let phase: VoiceClient.Phase

    @State private var breathing = false

    private var color: Color {
        switch phase {
        case .listening: return Theme.mint
        case .failed: return Theme.boothSecondary
        default: return Theme.lamplight
        }
    }

    private var baseScale: CGFloat {
        switch phase {
        case .listening: return 0.85
        case .speaking: return 1.0
        default: return 0.9
        }
    }

    private var baseOpacity: Double {
        switch phase {
        case .speaking: return 1.0
        case .listening: return 0.8
        case .failed, .ended: return 0.25
        default: return 0.35
        }
    }

    var body: some View {
        ZStack {
            Circle()
                .fill(
                    RadialGradient(
                        colors: [color.opacity(0.9), color.opacity(0)],
                        center: .center,
                        startRadius: 10,
                        endRadius: 90
                    )
                )
                .frame(width: 180, height: 180)
                .blur(radius: 12)
            Circle()
                .fill(color.opacity(0.9))
                .frame(width: 44, height: 44)
                .blur(radius: 8)
        }
        .scaleEffect(baseScale * (breathing ? 1.08 : 0.96))
        .opacity(baseOpacity)
        .animation(.easeInOut(duration: 0.6), value: phase)
        .onAppear {
            guard !UIAccessibility.isReduceMotionEnabled, !isUITest else { return }
            withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) {
                breathing = true
            }
        }
    }
}
