import AVFoundation
import SwiftUI

struct ContentView: View {
    enum Tab: String, CaseIterable, Hashable {
        case chat, courses
        var title: String {
            switch self {
            case .chat:    return "Chat"
            case .courses: return "Courses"
            }
        }
    }

    @State private var tab: Tab = .chat
    @State private var client: RealtimeClient? = nil
    @State private var permissionDenied = false

    // Course navigation state (lives at root so tabs can cross-talk).
    @State private var openCourse: Course? = nil
    @State private var activeVideo: CourseVideo? = nil

    var body: some View {
        ZStack(alignment: .bottom) {
            LinearGradient(
                colors: [Color(red: 0.02, green: 0.02, blue: 0.06), Color(red: 0.12, green: 0.04, blue: 0.24)],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            // Body layer — wordmark on top, swipe-between-pages body below.
            VStack(spacing: 12) {
                Text("Feynd")
                    .font(.system(size: 40, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
                    .tracking(-1.3)
                    .padding(.top, 8)

                TabView(selection: $tab) {
                    ChatView(
                        client: client,
                        permissionDenied: permissionDenied,
                        activeVideo: activeVideo,
                        onClearVideo: { clearVideoContext() }
                    )
                    .tag(Tab.chat)

                    CoursesListView(onOpen: { openCourse = $0 })
                        .tag(Tab.courses)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .indexViewStyle(.page(backgroundDisplayMode: .never))
            }
            // Leave room at the bottom for the floating pill.
            .padding(.bottom, 92)

            // Floating bottom pill — hovers just above the home indicator.
            PillToggle(selection: $tab)
                .padding(.bottom, 12)
        }
        .preferredColorScheme(.dark)
        .task {
            await boot()
        }
        .sheet(item: $openCourse) { course in
            CourseDetailView(
                course: course,
                onAskAbout: { video in
                    startChatting(about: video)
                    openCourse = nil
                },
                onClose: { openCourse = nil }
            )
            .background(
                LinearGradient(
                    colors: [Color(red: 0.02, green: 0.02, blue: 0.06), Color(red: 0.12, green: 0.04, blue: 0.24)],
                    startPoint: .top, endPoint: .bottom
                )
                .ignoresSafeArea()
            )
            .preferredColorScheme(.dark)
        }
    }

    private func startChatting(about video: CourseVideo) {
        let ctx = AnthropicClient.VideoContext(
            title: video.title,
            author: video.author,
            host: video.host,
            publishedOn: video.publishedOn,
            transcript: video.transcript.text
        )
        client?.setVideoContext(ctx)
        activeVideo = video
        withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
            tab = .chat
        }
    }

    private func clearVideoContext() {
        client?.setVideoContext(nil)
        activeVideo = nil
    }

    private func boot() async {
        let granted = await AVAudioApplication.requestRecordPermission()
        guard granted else {
            permissionDenied = true
            return
        }
        let c = RealtimeClient()
        client = c
        await c.start()
    }
}

// MARK: - Pill toggle

private struct PillToggle: View {
    @Binding var selection: ContentView.Tab
    @Namespace private var ns

    var body: some View {
        HStack(spacing: 4) {
            ForEach(ContentView.Tab.allCases, id: \.self) { t in
                Button {
                    withAnimation(.spring(response: 0.38, dampingFraction: 0.82)) {
                        selection = t
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: icon(for: t))
                            .font(.system(size: 12, weight: .semibold))
                        Text(t.title)
                            .font(.system(size: 14, weight: .semibold, design: .rounded))
                    }
                    .foregroundStyle(
                        selection == t
                            ? Color(red: 0.14, green: 0.06, blue: 0.10)
                            : Color.white.opacity(0.7)
                    )
                    .frame(minWidth: 92)
                    .padding(.vertical, 11)
                    .background(
                        ZStack {
                            if selection == t {
                                Capsule()
                                    .fill(Color(red: 0.98, green: 0.72, blue: 0.42))
                                    .matchedGeometryEffect(id: "pill-indicator", in: ns)
                            }
                        }
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(5)
        .background(
            Capsule()
                .fill(.ultraThinMaterial)
        )
        .overlay(
            Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.4), radius: 18, x: 0, y: 6)
    }

    private func icon(for t: ContentView.Tab) -> String {
        switch t {
        case .chat:    return "waveform"
        case .courses: return "sparkles"
        }
    }
}

// MARK: - Chat view

private struct ChatView: View {
    let client: RealtimeClient?
    let permissionDenied: Bool
    let activeVideo: CourseVideo?
    let onClearVideo: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            if let v = activeVideo {
                StudyingBanner(video: v, onClose: onClearVideo)
                    .padding(.horizontal, 20)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }

            Text(subtitle)
                .font(.system(size: 15, weight: .medium, design: .rounded))
                .foregroundStyle(.white.opacity(0.7))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
                .frame(maxHeight: 60)
                .padding(.top, 4)

            Spacer(minLength: 0)

            BigButton(phase: phase, onTap: tap)

            Spacer(minLength: 0)
        }
        .padding(.bottom, 40)
        .animation(.spring(response: 0.4, dampingFraction: 0.82), value: activeVideo?.id)
    }

    private var phase: RealtimeClient.Phase {
        client?.phase ?? .idle
    }

    private var subtitle: String {
        if permissionDenied {
            return "Mic access denied. Enable it in Settings → Feynd."
        }
        guard let client else { return "Starting…" }
        if case .failed(let m) = client.phase {
            return "Error: \(m)"
        }
        return client.lastStatus.isEmpty ? " " : client.lastStatus
    }

    private func tap() {
        guard let client else { return }
        switch client.phase {
        case .ready:     client.startRecording()
        case .recording: client.stopRecordingAndSend()
        default:         break
        }
    }
}

// MARK: - Studying banner (shown in chat when a video context is active)

private struct StudyingBanner: View {
    let video: CourseVideo
    let onClose: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "play.rectangle.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color(red: 0.98, green: 0.72, blue: 0.42))
            VStack(alignment: .leading, spacing: 2) {
                Text("Studying")
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundStyle(.white.opacity(0.55))
                    .tracking(0.6)
                Text(video.title)
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
                    .lineLimit(1)
            }
            Spacer()
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(.white.opacity(0.65))
                    .frame(width: 22, height: 22)
                    .background(Circle().fill(Color.white.opacity(0.1)))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(.ultraThinMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
    }
}

// MARK: - Big mic button

private struct BigButton: View {
    let phase: RealtimeClient.Phase
    let onTap: () -> Void

    @State private var pulse = false

    var body: some View {
        Button(action: onTap) {
            ZStack {
                Circle()
                    .fill(color.opacity(0.18))
                    .frame(width: 300, height: 300)
                    .scaleEffect(pulse ? 1.10 : 1.0)

                Circle()
                    .fill(color.opacity(0.38))
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

#Preview {
    ContentView()
}
