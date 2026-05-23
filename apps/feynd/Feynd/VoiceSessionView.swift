import SwiftUI

struct VoiceSessionView: View {
    let mode: String
    let threadId: String?

    @Environment(\.dismiss) private var dismiss
    @State private var client: RealtimeVoiceClient

    init(mode: String, threadId: String? = nil) {
        self.mode = mode
        self.threadId = threadId
        _client = State(initialValue: RealtimeVoiceClient(mode: mode, threadId: threadId))
    }

    var body: some View {
        ZStack {
            Color(.systemGroupedBackground).ignoresSafeArea()

            VStack(spacing: 24) {
                HStack {
                    Button {
                        client.stop()
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(.primary)
                            .frame(width: 36, height: 36)
                            .background(.white)
                            .clipShape(Circle())
                            .overlay(Circle().stroke(Color(white: 0.86)))
                    }
                    Spacer()
                }

                Spacer()

                VStack(spacing: 8) {
                    Text(title)
                        .font(.system(size: 30, weight: .semibold))
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .frame(minHeight: 42)
                }

                ZStack {
                    Circle()
                        .fill(orbColor.opacity(0.16))
                        .frame(width: 230, height: 230)
                    Circle()
                        .fill(orbColor)
                        .frame(width: 172, height: 172)
                    Image(systemName: icon)
                        .font(.system(size: 66, weight: .semibold))
                        .foregroundStyle(.white)
                }

                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)

                Spacer()

                Button {
                    client.stop()
                    dismiss()
                } label: {
                    Label("End voice session", systemImage: "phone.down.fill")
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.black)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
            }
            .padding(24)
        }
        .task {
            await client.start()
        }
        .onDisappear {
            client.stop()
        }
    }

    private var title: String {
        mode == "topic" ? "Talk about this topic" : "Talk to F2"
    }

    private var subtitle: String {
        switch client.phase {
        case .idle, .requestingPermission, .creatingSession, .connecting:
            return client.status
        case .connected:
            return "Start speaking. F2 will respond when you pause."
        case .speaking:
            return "F2 is speaking."
        case .failed(let message):
            return message
        case .ended:
            return "Session ended."
        }
    }

    private var detail: String {
        if client.model.isEmpty {
            return "Voice uses OpenAI Realtime through the F2 backend."
        }
        return "\(client.model) · \(client.voice)"
    }

    private var icon: String {
        switch client.phase {
        case .speaking: return "waveform"
        case .failed: return "exclamationmark.triangle.fill"
        case .ended: return "checkmark"
        default: return "mic.fill"
        }
    }

    private var orbColor: Color {
        switch client.phase {
        case .connected: return .blue
        case .speaking: return .orange
        case .failed: return .red
        case .ended: return .green
        default: return Color(white: 0.45)
        }
    }
}
