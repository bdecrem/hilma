import SwiftUI

/// The Flash tab — Jumbo Flash Game. A vertical level path (think Duolingo)
/// over every flash card the user owns, across all topics. Pass a level
/// (7/10) to unlock the next; 9/10 = 2 node stars, perfect = 3.
struct FlashTabView: View {
    @Environment(Session.self) private var session

    @State private var state: JumboState? = nil
    @State private var loading = true
    @State private var errorMessage: String? = nil
    @State private var sheetLevel: JumboLevelInfo? = nil
    @State private var startingLevel: Int? = nil
    @State private var activeSet: FlashStart? = nil
    @State private var voiceSet: FlashStart? = nil
    @State private var showProfile = false
    @State private var pulse = false

    // Path geometry — one shared set of numbers for nodes AND connectors.
    // Node centers: y = topPad + i * pitch, x = centerX + amp * zigzag(i).
    private let nodeSize: CGFloat = 68
    private let pitch: CGFloat = 116
    private let topPad: CGFloat = 40
    private let bottomPad: CGFloat = 130
    private let amp: CGFloat = 78

    /// -1, 0, +1, 0, -1, … period-4 zigzag keeps the path snaking without
    /// ever leaving a phone-width column.
    private func zig(_ i: Int) -> CGFloat {
        switch i % 4 {
        case 0: return 0
        case 1: return -1
        case 2: return 0
        default: return 1
        }
    }

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                FeyndTopBar {
                    Text("Arcade")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(FeyndTheme.text2)
                } trailing: {
                    xpPill
                } onProfileTap: {
                    showProfile = true
                }

                VStack(spacing: 0) {
                    titleRow
                    if loading && state == nil {
                        ProgressView().tint(FeyndTheme.text2)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if let state, state.cardCount < 10 {
                        lockedHero(state)
                    } else if let state {
                        levelMap(state)
                    } else {
                        errorHero
                    }
                }
                .feyndContentColumn()
            }
        }
        .sheet(isPresented: $showProfile) { ProfileSheet().environment(session) }
        .sheet(item: $sheetLevel) { level in
            LevelStartSheet(
                level: level,
                starting: startingLevel == level.level,
                onPlay: { play(level) }
            )
            .presentationDetents([.height(320)])
        }
        .fullScreenCover(item: $activeSet) { start in
            FlashSetView(start: start, topicLabel: nil) { _ in
                Task { await load() }
            }
            .environment(session)
        }
        .fullScreenCover(item: $voiceSet) { start in
            FlashVoiceView(start: start, topicLabel: nil) { _ in
                Task { await load() }
            }
            .environment(session)
        }
        .task {
            await load()
            withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
        .alert("Flash", isPresented: Binding(
            get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } }
        )) {
            Button("OK") { errorMessage = nil }
        } message: { Text(errorMessage ?? "") }
    }

    // MARK: - Header bits

    private var xpPill: some View {
        HStack(spacing: 5) {
            Image(systemName: "bolt.fill")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(FeyndTheme.gold)
            Text("\(state?.xp ?? 0)")
                .font(.system(size: 13.5, weight: .bold))
                .foregroundStyle(FeyndTheme.text)
                .contentTransition(.numericText())
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 7)
        .background(FeyndTheme.surface, in: Capsule())
        .overlay(Capsule().stroke(FeyndTheme.border, lineWidth: 1))
        .accessibilityLabel("\(state?.xp ?? 0) experience points")
    }

    private var titleRow: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .bottom) {
                Text("Flash")
                    .font(.system(size: 34, weight: .bold))
                    .tracking(-0.8)
                    .foregroundStyle(FeyndTheme.text)
                Spacer()
            }
            if let state {
                Text("\(state.cardCount) CARDS · \(state.highestPassed) LEVEL\(state.highestPassed == 1 ? "" : "S") CLEARED")
                    .font(.system(size: 12, weight: .semibold))
                    .tracking(0.2)
                    .foregroundStyle(FeyndTheme.text3)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }

    // MARK: - Not enough cards yet

    private func lockedHero(_ state: JumboState) -> some View {
        VStack(spacing: 16) {
            Spacer()
            ZStack {
                Circle()
                    .fill(FeyndTheme.coralSoft)
                    .frame(width: 110, height: 110)
                Image(systemName: "bolt.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(FeyndTheme.coral)
            }
            Text("The path opens at 10 cards")
                .font(.system(size: 21, weight: .bold))
                .tracking(-0.4)
                .foregroundStyle(FeyndTheme.text)
            Text("Jumbo mixes flash cards from every topic you're learning into one climb. You have \(state.cardCount) of 10 — open a topic's ⋯ menu and tap Flash cards to build a deck.")
                .font(.system(size: 14))
                .lineSpacing(3)
                .foregroundStyle(FeyndTheme.text2)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            // Little progress meter toward unlocking — the math is 10 cells.
            HStack(spacing: 4) {
                ForEach(0..<10, id: \.self) { i in
                    Capsule()
                        .fill(i < state.cardCount ? FeyndTheme.coral : FeyndTheme.surface2)
                        .frame(width: 16, height: 6)
                }
            }
            .padding(.top, 4)
            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var errorHero: some View {
        VStack(spacing: 10) {
            Image(systemName: "bolt.slash")
                .font(.system(size: 30))
                .foregroundStyle(FeyndTheme.text3)
            Text("Couldn't load the Flash arcade.")
                .font(.system(size: 14))
                .foregroundStyle(FeyndTheme.text2)
            Button("Retry") { Task { await load() } }
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(FeyndTheme.coral)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - The map

    private func levelMap(_ state: JumboState) -> some View {
        GeometryReader { geo in
            let w = min(geo.size.width, 430)
            let centerX = geo.size.width / 2
            let count = state.levels.count
            let height = topPad + CGFloat(max(0, count - 1)) * pitch + bottomPad

            ScrollViewReader { proxy in
                ScrollView {
                    ZStack(alignment: .topLeading) {
                        // Dotted trail connecting consecutive node centers —
                        // drawn with the exact same center math as the nodes.
                        Canvas { ctx, _ in
                            var path = Path()
                            for i in 0..<count {
                                let p = CGPoint(
                                    x: centerX + zig(i) * (amp * w / 430),
                                    y: topPad + CGFloat(i) * pitch
                                )
                                if i == 0 { path.move(to: p) }
                                else {
                                    // Gentle S-curve between nodes.
                                    let prev = CGPoint(
                                        x: centerX + zig(i - 1) * (amp * w / 430),
                                        y: topPad + CGFloat(i - 1) * pitch
                                    )
                                    let mid = CGPoint(x: (prev.x + p.x) / 2, y: (prev.y + p.y) / 2)
                                    path.addQuadCurve(to: mid, control: CGPoint(x: prev.x, y: mid.y - pitch * 0.18))
                                    path.addQuadCurve(to: p, control: CGPoint(x: p.x, y: mid.y + pitch * 0.18))
                                }
                            }
                            ctx.stroke(
                                path,
                                with: .color(FeyndTheme.surface3),
                                style: StrokeStyle(lineWidth: 3.5, lineCap: .round, dash: [0.5, 11])
                            )
                        }
                        .frame(height: height)

                        ForEach(Array(state.levels.enumerated()), id: \.element.level) { i, level in
                            levelNode(level)
                                .position(
                                    x: centerX + zig(i) * (amp * w / 430),
                                    y: topPad + CGFloat(i) * pitch
                                )
                                .id(level.level)
                        }
                    }
                    .frame(height: height)
                    Color.clear.frame(height: 8)
                }
                .scrollIndicators(.hidden)
                .refreshable { await load() }
                .onAppear {
                    // Land the camera on the frontier node. Deferred a beat —
                    // scrolling before the ZStack has laid out overshoots.
                    let target = min(state.highestPassed + 1, count)
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                        withAnimation(.easeOut(duration: 0.4)) {
                            proxy.scrollTo(target, anchor: .center)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func levelNode(_ level: JumboLevelInfo) -> some View {
        let isCurrent = level.status == "unlocked"
        let isPassed = level.status == "passed"

        Button {
            guard level.status != "locked" else { return }
            sheetLevel = level
        } label: {
            VStack(spacing: 5) {
                ZStack {
                    if isCurrent {
                        // Pulsing halo says "you are here".
                        Circle()
                            .stroke(FeyndTheme.coral.opacity(pulse ? 0.15 : 0.45), lineWidth: 3)
                            .frame(width: nodeSize + (pulse ? 22 : 10), height: nodeSize + (pulse ? 22 : 10))
                    }
                    Circle()
                        .fill(isPassed ? FeyndTheme.coral : FeyndTheme.surface)
                        .frame(width: nodeSize, height: nodeSize)
                        .overlay(
                            Circle().stroke(
                                isPassed ? FeyndTheme.coral : (isCurrent ? FeyndTheme.coral : FeyndTheme.border),
                                lineWidth: isCurrent ? 2 : 1
                            )
                        )
                        .shadow(color: isPassed ? FeyndTheme.coral.opacity(0.35) : .black.opacity(0.25),
                                radius: isPassed ? 12 : 6, y: 3)

                    if level.status == "locked" {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(FeyndTheme.text4)
                    } else {
                        VStack(spacing: 1) {
                            Text("\(level.level)")
                                .font(.system(size: 22, weight: .bold))
                                .foregroundStyle(isPassed ? .white : FeyndTheme.text)
                            Image(systemName: level.modeIcon)
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundStyle(isPassed ? .white.opacity(0.85) : FeyndTheme.coral)
                        }
                    }
                }
                .frame(height: nodeSize + 24) // room for the halo, keeps rows even

                if isPassed {
                    HStack(spacing: 1.5) {
                        ForEach(0..<3, id: \.self) { s in
                            Image(systemName: "star.fill")
                                .font(.system(size: 8.5, weight: .bold))
                                .foregroundStyle(s < level.stars ? FeyndTheme.gold : FeyndTheme.text4)
                        }
                    }
                } else if isCurrent {
                    Text("START")
                        .font(.system(size: 10, weight: .heavy))
                        .tracking(1.2)
                        .foregroundStyle(FeyndTheme.coral)
                } else {
                    Color.clear.frame(height: 10)
                }
            }
        }
        .buttonStyle(.plain)
        .opacity(level.status == "locked" ? 0.55 : 1)
        .accessibilityLabel("Level \(level.level), \(level.modeLabel), \(level.status)")
    }

    // MARK: - Data / actions

    private func load() async {
        loading = state == nil
        defer { loading = false }
        do {
            state = try await F2API.shared.jumboState()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func play(_ level: JumboLevelInfo) {
        guard startingLevel == nil else { return }
        startingLevel = level.level
        Task {
            do {
                let start = try await F2API.shared.startJumboSet(level: level.level)
                sheetLevel = nil
                // Give the sheet a beat to dismiss before the cover slides up.
                try? await Task.sleep(for: .milliseconds(350))
                if start.mode == "voice" {
                    voiceSet = start
                } else {
                    activeSet = start
                }
            } catch {
                errorMessage = error.localizedDescription
                sheetLevel = nil
            }
            startingLevel = nil
        }
    }
}

// MARK: - Level start sheet

private struct LevelStartSheet: View {
    let level: JumboLevelInfo
    let starting: Bool
    let onPlay: () -> Void

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()
            VStack(spacing: 14) {
                Capsule()
                    .fill(FeyndTheme.surface3)
                    .frame(width: 38, height: 5)
                    .padding(.top, 10)

                Text("LEVEL \(level.level)")
                    .font(.system(size: 12, weight: .heavy))
                    .tracking(1.6)
                    .foregroundStyle(FeyndTheme.coral)
                    .padding(.top, 8)

                HStack(spacing: 8) {
                    Image(systemName: level.modeIcon)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(FeyndTheme.coral)
                    Text(level.modeLabel)
                        .font(.system(size: 20, weight: .bold))
                        .tracking(-0.3)
                        .foregroundStyle(FeyndTheme.text)
                }

                Text(level.status == "passed"
                     ? "Cleared with \(level.bestScore ?? 0)/10. Replay for a better score — 10/10 earns all three stars."
                     : "10 questions mixed from all your topics. Score 7 to clear it, 9 for two stars, perfect for three.")
                    .font(.system(size: 13.5))
                    .lineSpacing(3)
                    .foregroundStyle(FeyndTheme.text2)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 34)

                if level.status == "passed" {
                    HStack(spacing: 3) {
                        ForEach(0..<3, id: \.self) { s in
                            Image(systemName: "star.fill")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(s < level.stars ? FeyndTheme.gold : FeyndTheme.text4)
                        }
                    }
                }

                Button(action: onPlay) {
                    HStack(spacing: 8) {
                        if starting {
                            ProgressView().tint(Color(hex: 0x1A0E08)).scaleEffect(0.85)
                        } else {
                            Image(systemName: "play.fill")
                                .font(.system(size: 14, weight: .bold))
                        }
                        Text(level.status == "passed" ? "Play again" : "Let's go")
                            .font(.system(size: 16, weight: .bold))
                    }
                    .foregroundStyle(Color(hex: 0x1A0E08))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(FeyndTheme.coral, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(starting)
                .padding(.horizontal, 24)
                .padding(.top, 4)

                Spacer()
            }
        }
    }
}
