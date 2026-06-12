import SwiftUI

/// The daily ritual screen. Leads with the one thing that matters: how many
/// ideas are due right now. Everything else is supporting context.
struct TodayView: View {
    @Environment(AppSession.self) private var session
    var onSeeAll: () -> Void

    @State private var reviewPresented = false
    @State private var voicePresented = false
    @State private var voiceTopic: TopicSummary? = nil
    @State private var profilePresented = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                reviewCard
                    .padding(.top, 18)
                statRow
                    .padding(.top, 14)

                if !session.home.topics.isEmpty {
                    HStack {
                        Eyebrow(text: "Your topics")
                        Spacer()
                        Button("See all") { onSeeAll() }
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Theme.moss)
                            .buttonStyle(.plain)
                    }
                    .padding(.top, 30)
                    .padding(.bottom, 10)

                    VStack(spacing: 10) {
                        ForEach(Array(session.home.topics.prefix(5))) { t in
                            NavigationLink(value: t) {
                                TopicRow(topic: t, onVoice: { voiceTopic = t })
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                Color.clear.frame(height: 90)
            }
            .padding(.horizontal, 20)
        }
        .scrollIndicators(.hidden)
        .background(Theme.bg)
        .refreshable { await session.refreshHome() }
        .task { await session.refreshHome() }
        .fullScreenCover(isPresented: $reviewPresented, onDismiss: {
            Task { await session.refreshHome() }
        }) {
            ReviewView().environment(session)
        }
        .fullScreenCover(isPresented: $voicePresented, onDismiss: {
            Task { await session.refreshHome() }
        }) {
            VoiceView().environment(session)
        }
        .fullScreenCover(item: $voiceTopic, onDismiss: {
            Task { await session.refreshHome() }
        }) { t in
            VoiceView(topicId: t.id, topicTitle: t.displayLabel).environment(session)
        }
        .sheet(isPresented: $profilePresented) {
            ProfileView().environment(session)
        }
    }

    /// The header profile badge, F2-style: avatar disc with a thin progress
    /// ring (fill = progress toward the next level, same fraction as the
    /// profile sheet's bar) and an "L<n>" chip docked below. Tap → profile.
    private var avatarBadge: some View {
        let p = session.progress
        let ring: CGFloat = 42 // avatar 38 + 4
        return ZStack {
            // Track and arc live on the SAME ring — one circle, not two.
            Circle()
                .stroke(Theme.raised, lineWidth: 1.5)
                .frame(width: ring, height: ring)
            Circle()
                .trim(from: 0, to: p.progressFraction)
                .stroke(Theme.moss, style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .frame(width: ring, height: ring)
            avatarCircle
        }
        // Level chip overhangs below the ring; frame leaves room so no clip.
        .overlay(alignment: .bottom) {
            Text("L\(p.level)")
                .font(.system(size: 9.5, weight: .bold))
                .tracking(0.4)
                .foregroundStyle(Theme.ink)
                .padding(.horizontal, 5)
                .padding(.vertical, 1.5)
                .background(RoundedRectangle(cornerRadius: 6).fill(Theme.raised))
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.border, lineWidth: 1))
                .offset(y: 7)
        }
        .frame(width: ring, height: ring + 14)
        .accessibilityLabel("Level \(p.level), \(p.toNextLevel) stars to next level")
    }

    /// The avatar disc: uploaded photo when one exists, otherwise the
    /// moss initial circle.
    @ViewBuilder
    private var avatarCircle: some View {
        if let urlStr = session.user?.avatarUrl, let url = URL(string: urlStr) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let img): img.resizable().scaledToFill()
                default: initialCircle
                }
            }
            .frame(width: 38, height: 38)
            .clipShape(Circle())
        } else {
            initialCircle
        }
    }

    private var initialCircle: some View {
        Circle()
            .fill(Theme.mossSoft)
            .frame(width: 38, height: 38)
            .overlay(
                Text(String(session.user?.username.prefix(1) ?? "?").uppercased())
                    .font(.system(size: 16, weight: .semibold, design: .serif))
                    .foregroundStyle(Theme.moss)
            )
    }

    // MARK: Header

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(Date.now.formatted(.dateTime.weekday(.wide).month(.wide).day()).uppercased())
                    .font(.system(size: 11.5, weight: .semibold))
                    .tracking(1.3)
                    .foregroundStyle(Theme.ink3)
                Text("Today")
                    .font(.system(size: 36, weight: .semibold, design: .serif))
                    .foregroundStyle(Theme.ink)
            }
            Spacer()
            Button {
                profilePresented = true
            } label: {
                avatarBadge
            }
            .buttonStyle(.plain)
        }
        .padding(.top, 12)
    }

    // MARK: Review hero

    @ViewBuilder
    private var reviewCard: some View {
        let due = session.home.dueCount
        VStack(alignment: .leading, spacing: 0) {
            if due > 0 {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("\(due)")
                        .font(.system(size: 44, weight: .semibold, design: .serif))
                        .foregroundStyle(Theme.ink)
                    Text(due == 1 ? "idea due" : "ideas due")
                        .font(.system(size: 17, design: .serif))
                        .italic()
                        .foregroundStyle(Theme.ink2)
                }
                Text("A few minutes now is what makes them stick.")
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.ink2)
                    .padding(.top, 4)
                PrimaryButton(label: "Start review") { reviewPresented = true }
                    .padding(.top, 16)
                voiceButton(label: "Or review by voice — walk and talk")
                    .padding(.top, 8)
            } else if session.home.cardCount == 0 {
                Text("Nothing here yet")
                    .font(.system(size: 22, weight: .semibold, design: .serif))
                    .foregroundStyle(Theme.ink)
                Text("Add an article, a video, or a podcast — Loci will pull out the ideas worth keeping.")
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.ink2)
                    .padding(.top, 6)
                voiceButton(label: "Take a voice walk — Peri can teach")
                    .padding(.top, 14)
            } else {
                HStack(spacing: 10) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(Theme.moss)
                    Text("All caught up")
                        .font(.system(size: 22, weight: .semibold, design: .serif))
                        .foregroundStyle(Theme.ink)
                }
                Text("Nothing due. Go read something good.")
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.ink2)
                    .padding(.top, 6)
                voiceButton(label: "Take a voice walk — Peri can teach")
                    .padding(.top, 14)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.border, lineWidth: 1))
    }

    /// The voice-mode bridge: a full-width secondary button in the hero card.
    private func voiceButton(label: String) -> some View {
        Button {
            voicePresented = true
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "waveform")
                    .font(.system(size: 14, weight: .semibold))
                Text(label)
                    .font(.system(size: 14.5, weight: .semibold))
            }
            .foregroundStyle(Theme.moss)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(Theme.mossSoft, in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }

    // MARK: Stats

    private var statRow: some View {
        HStack(spacing: 10) {
            statTile(value: "\(session.home.streakDays)", label: session.home.streakDays == 1 ? "day streak" : "day streak", icon: "flame.fill", tint: Theme.ochre)
            statTile(value: "\(session.home.reviewedToday)", label: "reviewed today", icon: "arrow.triangle.2.circlepath", tint: Theme.moss)
            statTile(value: "\(session.home.cardCount)", label: "ideas kept", icon: "lightbulb.fill", tint: Theme.ink3)
        }
    }

    private func statTile(value: String, label: String, icon: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 5) {
                Image(systemName: icon)
                    .font(.system(size: 11))
                    .foregroundStyle(tint)
                Text(value)
                    .font(.system(size: 19, weight: .semibold, design: .serif))
                    .foregroundStyle(Theme.ink)
            }
            Text(label)
                .font(.system(size: 11))
                .foregroundStyle(Theme.ink3)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.borderSoft, lineWidth: 1))
    }
}

/// Shared topic row: title, meta line, strength bar. `onVoice` (when set)
/// shows a mic button — the hop from any topic straight into voice mode.
struct TopicRow: View {
    let topic: TopicSummary
    var onVoice: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(topic.displayLabel)
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(Theme.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Spacer()
                if topic.dueCount > 0 {
                    Text("\(topic.dueCount) due")
                        .font(.system(size: 11.5, weight: .semibold))
                        .foregroundStyle(Theme.moss)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Theme.mossSoft, in: Capsule())
                }
                if let onVoice {
                    Button(action: onVoice) {
                        Image(systemName: "waveform")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.moss)
                            .frame(width: 30, height: 30)
                            .background(Theme.mossSoft, in: Circle())
                    }
                    .buttonStyle(.plain)
                }
            }
            HStack(spacing: 8) {
                Text(metaText)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.ink3)
                Spacer()
                StrengthBar(value: topic.strength)
                    .frame(width: 72)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.borderSoft, lineWidth: 1))
    }

    private var metaText: String {
        var parts: [String] = []
        if topic.cardCount > 0 {
            parts.append("\(topic.cardCount) \(topic.cardCount == 1 ? "idea" : "ideas")")
        } else {
            parts.append("no ideas yet")
        }
        if let host = topic.sourceHost { parts.append(host) }
        return parts.joined(separator: " · ")
    }
}
