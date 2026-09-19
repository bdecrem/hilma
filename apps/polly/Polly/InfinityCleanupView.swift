import SwiftUI

// The clean-up walk: Polly (voice) talks through the curated fixes ONE at a
// time while the app shows each as a before/after card with pagination. The
// app drives the pace — "Got it" advances the card and cues Polly to the next
// one — so the model never dumps all five at once. After the last, Polly
// offers to run the whole conversation again. Voice + Text, playful.

struct InfinityCleanupView: View {
    let chat: InfinityChat
    var onDone: () -> Void

    @Environment(\.dismiss) private var dismiss
    @AppStorage(VoiceSettingsView.holdToTalkKey) private var holdToTalk = false
    @State private var client: LiveVoiceClient
    @State private var index = 0
    @State private var phase: Phase = .walking
    @State private var finishing = false

    private enum Phase { case walking, allDone, practicing }

    private var fixes: [InfinityFix] { chat.analysis?.fixes ?? [] }

    init(chat: InfinityChat, onDone: @escaping () -> Void) {
        self.chat = chat
        self.onDone = onDone
        _client = State(initialValue: LiveVoiceClient(mode: "cleanup", chatId: chat.id))
    }

    var body: some View {
        ZStack {
            PollyTheme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                topBar
                Spacer(minLength: 0)
                if phase == .practicing {
                    practicing
                } else if let fix = fixes[safe: index] {
                    card(fix)
                }
                Spacer(minLength: 0)
                controls
            }
            .pollyContentColumn()
        }
        .task { await client.start() }
        .onDisappear { client.stop() }
    }

    // MARK: top bar — progress + close

    private var topBar: some View {
        HStack(spacing: 12) {
            Button { end(complete: false) } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(PollyTheme.text2)
                    .frame(width: 34, height: 34)
                    .background(PollyTheme.surface2, in: Circle())
            }
            .buttonStyle(.plain)
            Spacer()
            Text(phase == .practicing ? "One more time" : "Clean-up · \(min(index + 1, fixes.count)) of \(fixes.count)")
                .font(.system(size: 13, weight: .semibold)).foregroundStyle(PollyTheme.text3)
            Spacer()
            statusDot
        }
        .padding(.horizontal, 18).padding(.top, 12).padding(.bottom, 4)
    }

    private var statusDot: some View {
        // A quiet indicator that Polly's engine is live.
        Circle()
            .fill(client.phase == .speaking ? PollyTheme.accent : PollyTheme.sprout)
            .frame(width: 10, height: 10)
            .opacity(client.phase == .connected || client.phase == .speaking ? 1 : 0.3)
            .frame(width: 34, height: 34)
    }

    // MARK: the fix card

    private func card(_ fix: InfinityFix) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            label("YOU SAID")
            Text("“\(fix.said)”")
                .font(.system(size: 18)).foregroundStyle(PollyTheme.text2)
                .strikethrough(color: PollyTheme.text4)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)

            Image(systemName: "arrow.down")
                .font(.system(size: 15, weight: .bold)).foregroundStyle(PollyTheme.accent)
                .padding(.vertical, 14)

            label("TRY")
            Text(fix.fixed)
                .font(.custom("Fredoka", size: 26).weight(.semibold))
                .foregroundStyle(PollyTheme.text)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 4)

            if !fix.note.isEmpty {
                Text(fix.note)
                    .font(.system(size: 14.5)).foregroundStyle(PollyTheme.text2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 12)
            }

            HStack(spacing: 8) {
                Image(systemName: "waveform").font(.system(size: 13, weight: .semibold))
                Text("say it: “\(fix.sayIt)”").font(.system(size: 14, weight: .semibold))
            }
            .foregroundStyle(PollyTheme.accent)
            .padding(.horizontal, 12).padding(.vertical, 9)
            .background(PollyTheme.accentSoft, in: Capsule())
            .padding(.top, 16)

            dots.padding(.top, 20)
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(PollyTheme.surface))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(PollyTheme.accentDim, lineWidth: 1))
        .padding(.horizontal, 20)
    }

    private func label(_ t: String) -> some View {
        Text(t).font(.system(size: 11, weight: .bold)).tracking(1.6).foregroundStyle(PollyTheme.text3)
    }

    private var dots: some View {
        HStack(spacing: 7) {
            ForEach(fixes.indices, id: \.self) { i in
                Capsule()
                    .fill(i == index ? PollyTheme.accent : (i < index ? PollyTheme.accentDim : PollyTheme.surface3))
                    .frame(width: i == index ? 22 : 8, height: 8)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var practicing: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle().fill(PollyTheme.accentSoft).frame(width: 84, height: 84)
                DodoMiniMark(size: 70)
            }
            Text("Let's run it again")
                .font(.custom("Fredoka", size: 24).weight(.semibold)).foregroundStyle(PollyTheme.text)
            Text("Have the conversation once more with Polly, using what you just tidied up.")
                .font(.system(size: 14)).foregroundStyle(PollyTheme.text2)
                .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 30)
        }
    }

    // MARK: controls

    private var controls: some View {
        VStack(spacing: 12) {
            if holdToTalk { pttButton }
            switch phase {
            case .walking:
                bigButton(index >= fixes.count - 1 ? "Got it" : "Got it — next", "arrow.right") { advance() }
            case .allDone:
                bigButton("Run it again", "arrowshape.turn.up.left.fill") { runAgain() }
                Button { end(complete: true) } label: {
                    Text("I'm done").font(.system(size: 15, weight: .medium)).foregroundStyle(PollyTheme.text2)
                }
                .buttonStyle(.plain)
            case .practicing:
                bigButton(finishing ? "Wrapping up…" : "Done", "checkmark") { end(complete: true) }
                    .disabled(finishing)
            }
        }
        .padding(.horizontal, 24).padding(.top, 10).padding(.bottom, 30)
    }

    private var pttButton: some View {
        Text("Hold to talk")
            .font(.system(size: 14, weight: .semibold)).foregroundStyle(PollyTheme.inkOnAccent)
            .frame(maxWidth: .infinity).padding(.vertical, 12)
            .background(client.talking ? PollyTheme.accent : PollyTheme.slate, in: Capsule())
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { _ in client.beginTalking() }
                .onEnded { _ in client.endTalking() })
    }

    private func bigButton(_ text: String, _ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(text).font(.system(size: 16, weight: .semibold))
                Image(systemName: symbol).font(.system(size: 14, weight: .bold))
            }
            .foregroundStyle(PollyTheme.inkOnAccent)
            .frame(maxWidth: .infinity).padding(.vertical, 15)
            .background(PollyTheme.accent, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    // MARK: flow

    private func advance() {
        if index >= fixes.count - 1 {
            phase = .allDone
            client.sendCue(
                instruction: "That was the last one — they're all done. Tell \(chat.displayTitle.isEmpty ? "them" : "them") they did great, and ask if they'd like to run the whole conversation again, cleanly.",
                speak: "That's all of them — really nice work! Want to run the whole thing through once more?")
        } else {
            index += 1
            let n = index + 1
            client.sendCue(
                instruction: "The learner is ready for the next one. Now move to number \(n) and address ONLY it.",
                speak: "Nice — let's take the next one.")
        }
    }

    private func runAgain() {
        phase = .practicing
        client.sendCue(
            instruction: "Yes — run the whole conversation again now, cleanly and briefly, in the target language, weaving in what you just fixed. Keep it light.",
            speak: "Great — let's have that chat again, cleaner this time.")
    }

    private func end(complete: Bool) {
        guard !finishing else { return }
        finishing = true
        Task {
            let sessionId = await client.end()
            if complete {
                _ = try? await PollyAPI.shared.completeInfinityCleanup(id: chat.id, cleanupSessionId: sessionId)
            }
            onDone()
        }
    }
}

private extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}
