import SwiftUI

/// The pair (Direction 2b): wherever Polly offers to talk, typing is the
/// quieter line right under it. One full-width accent voice button and a text
/// link beneath — never two equal buttons, never a segmented control. Voice is
/// the app; text is its peer.
struct TalkPair: View {
    /// The voice button's label ("Start a chat", "Talk about it", "Continue this chat").
    let voiceLabel: String
    /// The underlined part of the line beneath ("type instead", "continue by typing").
    var typeLabel: String = L("type instead", "scrivi invece", "écris plutôt", "대신 입력하기")
    /// The tighter version used inside cards and footers.
    var compact = false
    var busy = false
    let onVoice: () -> Void
    let onType: () -> Void

    var body: some View {
        VStack(spacing: compact ? 7 : 9) {
            Button(action: onVoice) {
                HStack(spacing: 8) {
                    if busy {
                        ProgressView().tint(PollyTheme.inkOnAccent).scaleEffect(0.8)
                    } else {
                        Image(systemName: "mic.fill").font(.system(size: compact ? 14 : 15, weight: .bold))
                    }
                    Text(voiceLabel).font(.system(size: compact ? 15 : 16, weight: .semibold))
                }
                .foregroundStyle(PollyTheme.inkOnAccent)
                .frame(maxWidth: .infinity)
                .padding(.vertical, compact ? 12 : 14)
                .background(PollyTheme.accent, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(busy)

            Button(action: onType) {
                HStack(spacing: 5) {
                    Image(systemName: "keyboard").font(.system(size: 12, weight: .medium))
                    (Text(L("or ", "o ", "ou ", "또는 ")) + Text(typeLabel).underline())
                        .font(.system(size: 13.5, weight: .medium))
                }
                .foregroundStyle(PollyTheme.text2)
                // A text link, but a thumb-sized one.
                .frame(maxWidth: .infinity, minHeight: 30)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(busy)
            .accessibilityLabel(Text("Type instead of talking"))
        }
    }
}
