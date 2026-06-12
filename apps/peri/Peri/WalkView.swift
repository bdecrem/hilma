import SwiftUI

/// Peri's only real screen. Three states:
///   ready   — wordmark, one big Start button
///   walking — the breathing orb, glanceable captions, tallies, End
///   done    — walk summary
/// Everything is sized for a pocket glance: huge targets, high contrast.
struct WalkView: View {
    @Environment(AppSession.self) private var session
    @State private var client = WalkClient()

    private var walking: Bool {
        switch client.phase {
        case .idle, .ended, .failed: return false
        default: return true
        }
    }

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            if walking {
                walkingView
            } else if case .ended = client.phase, client.reviewedCount > 0 {
                summaryView
            } else {
                readyView
            }
        }
        .animation(.easeInOut(duration: 0.35), value: walking)
    }

    // MARK: Ready

    private var readyView: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                Menu {
                    if let user = session.user { Text(user.username) }
                    Button(role: .destructive) {
                        Task { await session.signOut() }
                    } label: {
                        Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                } label: {
                    Image(systemName: "person.circle")
                        .font(.system(size: 22))
                        .foregroundStyle(Theme.ink3)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 22)
            .padding(.top, 10)

            Spacer()

            Text("Peri")
                .font(.system(size: 56, weight: .semibold, design: .serif))
                .foregroundStyle(Theme.ink)
            Text("Learn while you walk.")
                .font(.system(size: 16, design: .serif))
                .italic()
                .foregroundStyle(Theme.ink2)
                .padding(.top, 6)

            if case .failed(let message) = client.phase {
                Text(message)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.clay)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
                    .padding(.top, 18)
            }

            Spacer()

            VStack(spacing: 14) {
                Button {
                    Task { await client.start() }
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "figure.walk")
                            .font(.system(size: 19, weight: .semibold))
                        Text("Start walk")
                            .font(.system(size: 19, weight: .semibold))
                    }
                    .foregroundStyle(Color(white: 0.1))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 18)
                    .background(Theme.amber, in: RoundedRectangle(cornerRadius: 20))
                }
                .buttonStyle(.plain)

                Text("Earbuds in. Phone in pocket. Peri does the rest.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.ink3)
            }
            .padding(.horizontal, 26)
            .padding(.bottom, 40)
        }
    }

    // MARK: Walking

    private var walkingView: some View {
        VStack(spacing: 0) {
            // Status line.
            Text(statusLabel)
                .font(.system(size: 13, weight: .semibold))
                .tracking(1.2)
                .foregroundStyle(Theme.ink3)
                .padding(.top, 26)

            Spacer()

            WalkOrb(speaking: client.phase == .speaking, connecting: client.phase != .speaking && client.phase != .listening)

            Spacer()

            // Glanceable captions — last thing each side said.
            VStack(spacing: 10) {
                if !client.lastPeriLine.isEmpty {
                    Text(client.lastPeriLine)
                        .font(.system(size: 15, design: .serif))
                        .lineSpacing(3)
                        .foregroundStyle(Theme.ink)
                        .lineLimit(4)
                        .multilineTextAlignment(.center)
                        .transition(.opacity)
                        .id("peri-" + client.lastPeriLine)
                }
                if !client.lastUserLine.isEmpty {
                    Text(client.lastUserLine)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.ink3)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                        .transition(.opacity)
                        .id("user-" + client.lastUserLine)
                }
            }
            .animation(.easeInOut(duration: 0.25), value: client.lastPeriLine)
            .padding(.horizontal, 30)
            .frame(minHeight: 120, alignment: .top)

            // Tally strip.
            if client.reviewedCount > 0 {
                HStack(spacing: 16) {
                    tallyDot(client.tally[2], Theme.solid)
                    tallyDot(client.tally[1], Theme.ochre)
                    tallyDot(client.tally[0], Theme.clay)
                    Text("of \(max(client.agendaDue, client.reviewedCount)) due")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.ink3)
                }
                .padding(.bottom, 18)
            }

            Button {
                client.stop()
            } label: {
                Text("End walk")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(Theme.raised, in: RoundedRectangle(cornerRadius: 18))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 26)
            .padding(.bottom, 36)
        }
    }

    private var statusLabel: String {
        switch client.phase {
        case .speaking: return "PERI"
        case .listening: return "LISTENING"
        default: return client.status.uppercased()
        }
    }

    private func tallyDot(_ n: Int, _ color: Color) -> some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text("\(n)")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.ink2)
        }
    }

    // MARK: Summary

    private var summaryView: some View {
        VStack(spacing: 0) {
            Spacer()
            Text("Good walk.")
                .font(.system(size: 38, weight: .semibold, design: .serif))
                .foregroundStyle(Theme.ink)
            Text("\(client.reviewedCount) \(client.reviewedCount == 1 ? "idea" : "ideas") reviewed.")
                .font(.system(size: 16, design: .serif))
                .italic()
                .foregroundStyle(Theme.ink2)
                .padding(.top, 8)

            HStack(spacing: 22) {
                summaryStat(client.tally[2], "solid", Theme.solid)
                summaryStat(client.tally[1], "shaky", Theme.ochre)
                summaryStat(client.tally[0], "forgot", Theme.clay)
            }
            .padding(.top, 30)

            Spacer()

            Button {
                client = WalkClient()
            } label: {
                Text("Done")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Color(white: 0.1))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(Theme.amber, in: RoundedRectangle(cornerRadius: 18))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 26)
            .padding(.bottom, 40)
        }
    }

    private func summaryStat(_ n: Int, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 3) {
            Text("\(n)")
                .font(.system(size: 26, weight: .semibold, design: .serif))
                .foregroundStyle(color)
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(Theme.ink3)
        }
        .frame(minWidth: 56)
    }
}

/// The breathing amber orb. Slow calm breath while listening, brighter and
/// quicker while Peri speaks, dim while connecting.
struct WalkOrb: View {
    let speaking: Bool
    let connecting: Bool
    @State private var breathe = false

    var body: some View {
        ZStack {
            Circle()
                .fill(Theme.orbGradient)
                .frame(width: 190, height: 190)
                .scaleEffect(breathe ? (speaking ? 1.08 : 1.04) : (speaking ? 0.96 : 0.98))
                .opacity(connecting ? 0.35 : 1)
                .shadow(color: Theme.amber.opacity(speaking ? 0.45 : 0.2), radius: speaking ? 48 : 28)
            Circle()
                .stroke(Theme.amber.opacity(0.25), lineWidth: 1)
                .frame(width: 230, height: 230)
                .scaleEffect(breathe ? 1.05 : 0.97)
        }
        .animation(
            .easeInOut(duration: speaking ? 0.9 : 2.6).repeatForever(autoreverses: true),
            value: breathe
        )
        .onAppear { breathe = true }
    }
}
