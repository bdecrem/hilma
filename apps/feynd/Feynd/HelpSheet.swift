import SwiftUI

/// Help sheet — the typed chat commands that have no button in the UI.
/// Opened from Profile → Help → Chat commands.
struct HelpSheet: View {
    @Environment(\.dismiss) private var dismiss

    private struct Command: Identifiable {
        let id = UUID()
        let usage: String
        let detail: String
    }

    private let commands: [Command] = [
        Command(
            usage: "new short|medium|long <topic>",
            detail: "Start a new topic seeded with 3 explainer videos of that length."
        ),
        Command(
            usage: "new none <topic>",
            detail: "Start a new chat-only topic — no videos, just conversation."
        ),
        Command(
            usage: "setup: <topic>",
            detail: "Same as \"new long\" — 3 full-length videos on the topic."
        ),
        Command(
            usage: "quote \"<text>\" (author)",
            detail: "Save a quote to the current topic. Outside a topic, F2 asks which topic to file it under."
        ),
        Command(
            usage: "reflection quiz",
            detail: "One open question, one reply, one star — marks the topic done. Works even when quizzes are locked."
        ),
        Command(
            usage: "summary <instructions>",
            detail: "Rebuild this topic's audio summary + transcript your way — e.g. \"summary make it longer\" or \"summary add more dates\". Plain \"summary\" regenerates it. Read the versions in Topic Context."
        ),
        Command(
            usage: "more videos",
            detail: "Ask in a video topic — \"give me 3 other ones\" works too. Adds 3 fresh videos to the topic."
        ),
        Command(
            usage: "<paste a URL>",
            detail: "Paste a link into Chat to start a topic from that article or video."
        ),
    ]

    var body: some View {
        VStack(spacing: 0) {
            handle
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Type these in any chat — there's no button for them.")
                        .font(.system(size: 14))
                        .tracking(-0.2)
                        .foregroundStyle(FeyndTheme.text2)
                        .padding(.horizontal, 4)
                    SettingsCard {
                        ForEach(Array(commands.enumerated()), id: \.element.id) { idx, cmd in
                            commandRow(cmd)
                            if idx < commands.count - 1 { SettingsDivider() }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .padding(.bottom, 44)
            }
            .scrollIndicators(.hidden)
        }
        .background(FeyndTheme.bgRaised.ignoresSafeArea())
    }

    private func commandRow(_ cmd: Command) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(cmd.usage)
                .font(.system(size: 14, weight: .semibold, design: .monospaced))
                .foregroundStyle(FeyndTheme.coral)
            Text(cmd.detail)
                .font(.system(size: 14))
                .tracking(-0.2)
                .foregroundStyle(FeyndTheme.text2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    private var handle: some View {
        Capsule()
            .fill(FeyndTheme.surface3)
            .frame(width: 38, height: 4)
            .padding(.top, 8)
            .frame(maxWidth: .infinity)
    }

    private var header: some View {
        ZStack {
            Text("Chat commands")
                .font(.system(size: 16, weight: .semibold))
                .tracking(-0.2)
                .foregroundStyle(FeyndTheme.text)
            HStack {
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text2)
                        .frame(width: 36, height: 36)
                        .background(FeyndTheme.surface2, in: Circle())
                        .overlay(Circle().stroke(FeyndTheme.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 14)
        .padding(.bottom, 4)
    }
}
