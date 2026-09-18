import SwiftUI

/// Full-text reader for one audio-summary transcript. Opened from the
/// Summaries section of the Topic Context sheet. Read-only.
struct TranscriptReaderView: View {
    @Environment(\.dismiss) private var dismiss

    let topicLabel: String
    let version: PollyAPI.SummaryVersion
    let isCurrent: Bool

    var body: some View {
        VStack(spacing: 0) {
            handle
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let instr = version.instructions, !instr.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("REVISION REQUEST")
                                .font(.system(size: 10, weight: .bold))
                                .tracking(0.5)
                                .foregroundStyle(PollyTheme.accent)
                            Text("“\(instr)”")
                                .font(.system(size: 14))
                                .italic()
                                .foregroundStyle(PollyTheme.text2)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                        .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(PollyTheme.border, lineWidth: 1))
                    }

                    Text(version.script)
                        .font(.system(size: 16))
                        .lineSpacing(6)
                        .foregroundStyle(PollyTheme.text)
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 44)
            }
            .scrollIndicators(.hidden)
        }
        .background(PollyTheme.bgRaised.ignoresSafeArea())
    }

    private var handle: some View {
        Capsule()
            .fill(PollyTheme.surface3)
            .frame(width: 38, height: 4)
            .padding(.top, 8)
            .frame(maxWidth: .infinity)
    }

    private var header: some View {
        ZStack {
            VStack(spacing: 2) {
                Text(version.instructions == nil ? "Base summary" : "Revised summary")
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(PollyTheme.text)
                Text(topicLabel)
                    .font(.system(size: 12))
                    .foregroundStyle(PollyTheme.text3)
                    .lineLimit(1)
            }
            HStack {
                Spacer()
                Button { closeModal(dismiss) } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(PollyTheme.text2)
                        .frame(width: 36, height: 36)
                        .background(PollyTheme.surface2, in: Circle())
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.cancelAction)
            }
            .padding(.trailing, 14)
        }
        .padding(.top, 12)
        .padding(.bottom, 14)
    }
}
