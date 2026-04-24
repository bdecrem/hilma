import AVFoundation
import SwiftUI

struct ContentView: View {
    enum Tab: String, CaseIterable, Hashable {
        case chat, courses, quiz
        var title: String {
            switch self {
            case .chat:    return "Chat"
            case .courses: return "Courses"
            case .quiz:    return "Quiz"
            }
        }
    }

    @State private var tab: Tab = .chat

    // Course navigation state (lives at root so tabs can cross-talk).
    @State private var openCourse: Course? = nil
    // Per-video modal text chat.
    @State private var textChatVideo: CourseVideo? = nil
    // Quiz sheet state.
    @State private var quizVideo: CourseVideo? = nil

    var body: some View {
        ZStack(alignment: .top) {
            LinearGradient(
                colors: [Color(red: 0.02, green: 0.02, blue: 0.06), Color(red: 0.12, green: 0.04, blue: 0.24)],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            // Body layer — swipe between the persistent Chat thread and
            // the Courses list.
            TabView(selection: $tab) {
                ChatThreadView(
                    courseId: "frontier-ai-2026",
                    video: nil,
                    onClose: nil
                )
                .tag(Tab.chat)

                CoursesListView(onOpen: { openCourse = $0 })
                    .padding(.top, 58)   // clear the top-right pill
                    .tag(Tab.courses)

                ClaudeQuizListView()
                    .padding(.top, 58)   // clear the top-right pill
                    .tag(Tab.quiz)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .indexViewStyle(.page(backgroundDisplayMode: .never))

            // Top-right pill — sits on the same row as the Chat tab's
            // "FEYND / AI Learning" header label.
            HStack {
                Spacer()
                PillToggle(selection: $tab)
            }
            .padding(.top, 8)
            .padding(.trailing, 14)
        }
        .preferredColorScheme(.dark)
        .sheet(item: $openCourse) { course in
            CourseDetailView(
                course: course,
                onAskAbout: { video in
                    // Voice-Ask now opens the same text-chat thread as the
                    // regular Chat button (they were redundant paths).
                    openCourse = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        textChatVideo = video
                    }
                },
                onChatText: { video in
                    openCourse = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        textChatVideo = video
                    }
                },
                onQuiz: { video in
                    openCourse = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        quizVideo = video
                    }
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
        .sheet(item: $textChatVideo) { v in
            ChatThreadView(
                courseId: "frontier-ai-2026",
                video: v,
                onClose: { textChatVideo = nil }
            )
        }
        .sheet(item: $quizVideo) { v in
            QuizView(
                courseId: "frontier-ai-2026",
                video: v,
                onClose: { quizVideo = nil }
            )
        }
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
                    .frame(minWidth: 72)
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
        case .quiz:    return "questionmark.circle"
        }
    }
}

#Preview {
    ContentView()
}

