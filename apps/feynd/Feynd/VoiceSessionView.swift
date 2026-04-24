import AVFoundation
import SwiftUI

// Interactive voice mode — launched as a sheet when the user taps the mic
// button in ChatThreadView. Wraps a RealtimeClient session: opens on
// appear, the big orb is push-to-talk (tap to speak, tap to send), Feynd
// answers in cedar's voice via the same gpt-realtime pipeline used for
// Listen playback. Dismiss the sheet to end the session.

struct VoiceSessionView: View {
    let video: CourseVideo?          // nil for the root Chat tab
    let chatId: String?              // nil disables transcript persistence
    let onClose: () -> Void
    // Fired for each persisted voice-turn so the underlying chat thread
    // can append it live without waiting for the sheet to close.
    var onMessagePersisted: ((FeyndMessage) -> Void)? = nil

    @State private var client: RealtimeClient? = nil
    @State private var permissionDenied = false

    private let accent = Color(red: 0.98, green: 0.55, blue: 0.20)

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.02, green: 0.02, blue: 0.06), Color(red: 0.12, green: 0.04, blue: 0.24)],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 18) {
                // Top bar: close + label
                HStack {
                    Button(action: stopAndClose) {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.85))
                            .frame(width: 36, height: 36)
                            .background(Circle().fill(.ultraThinMaterial))
                    }
                    .buttonStyle(.plain)

                    Spacer()

                    VStack(alignment: .trailing, spacing: 2) {
                        Text("VOICE MODE")
                            .font(.system(size: 10, weight: .bold, design: .rounded))
                            .foregroundStyle(accent)
                            .tracking(0.8)
                        if let video {
                            Text(video.title)
                                .font(.system(size: 12, weight: .semibold, design: .rounded))
                                .foregroundStyle(.white.opacity(0.75))
                                .lineLimit(1)
                        } else {
                            Text("AI Learning")
                                .font(.system(size: 12, weight: .semibold, design: .rounded))
                                .foregroundStyle(.white.opacity(0.75))
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 6)

                Text(subtitle)
                    .font(.system(size: 14, weight: .medium, design: .rounded))
                    .foregroundStyle(.white.opacity(0.7))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 36)
                    .frame(maxHeight: 54)

                Spacer(minLength: 0)

                VoiceOrb(
                    phase: phase,
                    onTap: tapOrb
                )

                Spacer(minLength: 0)

                Text(subhint)
                    .font(.system(size: 12, design: .rounded))
                    .foregroundStyle(.white.opacity(0.45))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
                    .padding(.bottom, 28)
            }
        }
        .preferredColorScheme(.dark)
        .interactiveDismissDisabled(false)
        .task { await boot() }
    }

    // MARK: - Boot / teardown

    private func boot() async {
        let granted = await AVAudioApplication.requestRecordPermission()
        guard granted else {
            permissionDenied = true
            return
        }
        let c = RealtimeClient()
        client = c
        // Persist Realtime transcripts back into the chat thread. The
        // callback fires on the main actor; we hop to a Task to do the
        // network write so we don't block the receive loop.
        if let chatId {
            c.onTranscript = { role, text in
                Task {
                    do {
                        let msg = try await FeyndAPI.appendMessage(
                            chatId: chatId, role: role, text: text, source: "voice"
                        )
                        await MainActor.run { onMessagePersisted?(msg) }
                    } catch {
                        NSLog("FEYND_VOICE_PERSIST_ERR \(error)")
                    }
                }
            }
        }
        if let video {
            c.setVideoContext(.init(
                title: video.title,
                author: video.author,
                host: video.host,
                publishedOn: video.publishedOn,
                transcript: video.transcript.text
            ))
        }
        await c.start()
    }

    private func stopAndClose() {
        client?.stop()
        client = nil
        onClose()
    }

    // MARK: - Phase-driven UI

    private var phase: RealtimeClient.Phase {
        client?.phase ?? .idle
    }

    private var subtitle: String {
        if permissionDenied {
            return "Mic access denied. Enable it in Settings → Feynd."
        }
        guard let client else { return "Connecting…" }
        switch client.phase {
        case .idle, .fetchingKey, .connecting: return "Connecting…"
        case .ready:       return "Tap the orb and ask anything"
        case .recording:   return "Listening… tap again to send"
        case .processing:  return "Thinking…"
        case .speaking:    return "Speaking"
        case .failed(let m): return "Error: \(m)"
        }
    }

    private var subhint: String {
        switch phase {
        case .ready:      return "Push-to-talk: tap the orb to start, tap again to send."
        case .recording:  return "Speak freely — tap again when you're done."
        case .speaking:   return "Tap the × to end voice mode."
        default:          return ""
        }
    }

    private func tapOrb() {
        guard let client else { return }
        switch client.phase {
        case .ready:       client.startRecording()
        case .recording:   client.stopRecordingAndSend()
        default:           break
        }
    }
}

// MARK: - Orb

private struct VoiceOrb: View {
    let phase: RealtimeClient.Phase
    let onTap: () -> Void
    @State private var pulse = false

    var body: some View {
        Button(action: onTap) {
            ZStack {
                Circle()
                    .fill(color.opacity(0.16))
                    .frame(width: 300, height: 300)
                    .scaleEffect(pulse ? 1.10 : 1.0)

                Circle()
                    .fill(color.opacity(0.34))
                    .frame(width: 230, height: 230)
                    .scaleEffect(pulse ? 1.06 : 1.0)

                Circle()
                    .fill(
                        RadialGradient(
                            colors: [color, color.opacity(0.55)],
                            center: .center, startRadius: 10, endRadius: 110
                        )
                    )
                    .frame(width: 200, height: 200)

                Image(systemName: icon)
                    .font(.system(size: 78, weight: .semibold))
                    .foregroundStyle(.white)
            }
        }
        .buttonStyle(.plain)
        .disabled(!isTappable)
        .opacity(isTappable ? 1 : 0.55)
        .onAppear {
            withAnimation(.easeInOut(duration: 1.15).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
    }

    private var color: Color {
        switch phase {
        case .idle, .fetchingKey, .connecting:
            return Color(red: 0.50, green: 0.50, blue: 0.58)
        case .ready:
            return Color(red: 0.40, green: 0.70, blue: 0.98)
        case .recording:
            return Color(red: 0.96, green: 0.30, blue: 0.52)
        case .processing:
            return Color(red: 0.75, green: 0.60, blue: 0.95)
        case .speaking:
            return Color(red: 0.98, green: 0.55, blue: 0.20)
        case .failed:
            return Color(red: 0.80, green: 0.20, blue: 0.20)
        }
    }

    private var icon: String {
        switch phase {
        case .recording:  return "stop.fill"
        case .processing: return "ellipsis"
        case .speaking:   return "waveform"
        case .failed:     return "exclamationmark.triangle.fill"
        default:          return "mic.fill"
        }
    }

    private var isTappable: Bool {
        switch phase {
        case .ready, .recording: return true
        default: return false
        }
    }
}
