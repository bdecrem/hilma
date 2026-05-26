import SwiftUI

/// Visual atoms ported from the design's `feynd-atoms.jsx`.
/// Every padding / radius / size / color matches the JSX source.

// MARK: - Stars

/// Three-cell row to match the backend cap (1st quiz, 2nd quiz, hard quiz).
/// Filled stars use coral-gold; empties use the faintest text token so they
/// recede but stay visible against the warm-dark bg.
struct StarRow: View {
    let value: Int
    var max: Int = 3
    var size: CGFloat = 11
    var gap: CGFloat = 2

    var body: some View {
        HStack(spacing: gap) {
            ForEach(0..<max, id: \.self) { i in
                Image(systemName: i < value ? "star.fill" : "star")
                    .font(.system(size: size, weight: .semibold))
                    .foregroundStyle(i < value ? FeyndTheme.gold : FeyndTheme.text4)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("\(value) of \(max) stars")
    }
}

// MARK: - Profile badge

/// Avatar + thin level ring + "L<n>" chip docked below.
/// Sized to match the JSX exactly: avatar 38, ring +4 = 42, chip overlaps by 7
/// below the ring (so total visual height ≈ 51).
struct ProfileBadge: View {
    @Environment(Session.self) private var session
    var size: CGFloat = 38

    private var initial: String {
        if case let .signedIn(user) = session.state, let first = user.username.first {
            return String(first).uppercased()
        }
        return "?"
    }

    private var avatarUrl: URL? {
        if case let .signedIn(user) = session.state, let s = user.avatarUrl {
            return URL(string: s)
        }
        return nil
    }

    var body: some View {
        let p = session.progress
        let ring = size + 4
        ZStack {
            // Single background ring track. The arc lives on the SAME ring, not
            // a second concentric circle — fixes the "two circles" bug.
            Circle()
                .stroke(FeyndTheme.surface2, lineWidth: 1.5)
                .frame(width: ring, height: ring)

            Circle()
                .trim(from: 0, to: p.progressFraction)
                .stroke(FeyndTheme.coral, style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .frame(width: ring, height: ring)

            // Avatar disc — uploaded photo if present, otherwise warm gradient + initial.
            avatarDisc(size: size)
        }
        // L chip docks BELOW the badge, centered. The frame height includes
        // room for the overhang so nothing clips.
        .overlay(alignment: .bottom) {
            Text("L\(p.level)")
                .font(.system(size: 9.5, weight: .bold))
                .tracking(0.4)
                .foregroundStyle(FeyndTheme.text)
                .padding(.horizontal, 5)
                .padding(.vertical, 1.5)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(FeyndTheme.surface2)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(FeyndTheme.border, lineWidth: 1)
                )
                .offset(y: 7)
        }
        .frame(width: ring, height: ring + 14)
        .accessibilityLabel("Level \(p.level), \(p.starredTopicCount) starred topics")
    }

    /// Round avatar — uploaded photo when one is set on the session user,
    /// otherwise the warm coral gradient + initial.
    @ViewBuilder
    private func avatarDisc(size: CGFloat) -> some View {
        if let url = avatarUrl {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let img):
                    img.resizable().scaledToFill()
                default:
                    gradientFallback(size: size)
                }
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
            .overlay(Circle().stroke(Color.white.opacity(0.18), lineWidth: 1).blendMode(.plusLighter))
            .shadow(color: .black.opacity(0.4), radius: 1, y: 1)
        } else {
            gradientFallback(size: size)
        }
    }

    private func gradientFallback(size: CGFloat) -> some View {
        Circle()
            .fill(FeyndTheme.avatarGradient)
            .frame(width: size, height: size)
            .overlay(
                Circle()
                    .stroke(Color.white.opacity(0.18), lineWidth: 1)
                    .blendMode(.plusLighter)
            )
            .shadow(color: .black.opacity(0.4), radius: 1, y: 1)
            .overlay(
                Text(initial)
                    .font(.system(size: size * 0.42, weight: .semibold))
                    .foregroundStyle(.white)
            )
    }
}

// MARK: - F2 mini mark (two-node Feynman diagram, app-icon echo)

struct F2MiniMark: View {
    var size: CGFloat = 26

    var body: some View {
        RoundedRectangle(cornerRadius: 8)
            .fill(FeyndTheme.bg)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(FeyndTheme.border, lineWidth: 1)
            )
            .frame(width: size, height: size)
            .overlay(
                Canvas { ctx, s in
                    let inset: CGFloat = s.width * 0.2
                    let y = s.height / 2
                    let p1 = CGPoint(x: inset, y: y)
                    let p2 = CGPoint(x: s.width - inset, y: y)
                    var line = Path()
                    line.move(to: p1); line.addLine(to: p2)
                    ctx.stroke(line, with: .color(FeyndTheme.coral), lineWidth: 1.2)
                    let r: CGFloat = 2.2 * (size / 20)
                    ctx.fill(Path(ellipseIn: CGRect(x: p1.x - r, y: p1.y - r, width: r*2, height: r*2)), with: .color(FeyndTheme.coral))
                    ctx.fill(Path(ellipseIn: CGRect(x: p2.x - r, y: p2.y - r, width: r*2, height: r*2)), with: .color(FeyndTheme.coral))
                }
            )
    }
}

// MARK: - Mini topic glyph (used on the left of every topic row)

/// 36pt rounded-square chip whose inner glyph reflects the topic's source
/// kind: chat / web / audio / video / paste / fallback. Pass a `nil` kind
/// for legacy threads — falls back to the line+nodes mark.
///
/// Native SwiftUI renderings of the six SVG glyphs spec'd in
/// `src/app/f2/topic-icons-preview/page.tsx`. All use the coral token so
/// they shift slightly between light + dark like the rest of the chrome.
struct MiniTopicGlyph: View {
    var kind: String? = nil
    var size: CGFloat = 36

    var body: some View {
        RoundedRectangle(cornerRadius: 10)
            .fill(FeyndTheme.surface)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(FeyndTheme.border, lineWidth: 1)
            )
            .frame(width: size, height: size)
            .overlay(
                glyph
                    .frame(width: size * 0.55, height: size * 0.55)
            )
    }

    @ViewBuilder
    private var glyph: some View {
        // viewBox is 20×20 in all source SVGs; each sub-glyph scales itself.
        switch kind {
        case "chat":  ChatGlyph()
        case "web":   WebGlyph()
        case "audio": AudioGlyph()
        case "video": VideoGlyph()
        case "paste": PasteGlyph()
        default:      FallbackGlyph()
        }
    }
}

/// All sub-glyphs draw in their own coordinate space using GeometryReader
/// so they scale cleanly to whatever frame MiniTopicGlyph hands them.

/// `Canvas` lets us paint at the exact 20×20 viewBox coordinates the SVGs
/// use, then scale to fit. Cheaper than building Path+Shape for every glyph
/// and visually identical.

private struct WebGlyph: View {
    var body: some View {
        Canvas { ctx, size in
            let s = size.width / 20.0
            let coral = GraphicsContext.Shading.color(FeyndTheme.coral)
            let stroke = 1.2 * s

            // Outer circle.
            ctx.stroke(
                Path(ellipseIn: CGRect(x: 4 * s, y: 4 * s, width: 12 * s, height: 12 * s)),
                with: coral, lineWidth: stroke
            )
            // Horizontal equator.
            var equator = Path()
            equator.move(to: CGPoint(x: 4 * s, y: 10 * s))
            equator.addLine(to: CGPoint(x: 16 * s, y: 10 * s))
            ctx.stroke(equator, with: coral, lineWidth: stroke)
            // Inner ellipse (meridian).
            ctx.stroke(
                Path(ellipseIn: CGRect(x: 7 * s, y: 4 * s, width: 6 * s, height: 12 * s)),
                with: coral, lineWidth: stroke
            )
            // Filled nodes at the equator ends.
            let r = 2.2 * s
            ctx.fill(Path(ellipseIn: CGRect(x: 4 * s - r, y: 10 * s - r, width: r*2, height: r*2)), with: coral)
            ctx.fill(Path(ellipseIn: CGRect(x: 16 * s - r, y: 10 * s - r, width: r*2, height: r*2)), with: coral)
        }
    }
}

private struct AudioGlyph: View {
    // Music note — line stem + flag + filled circle notehead.
    var body: some View {
        Canvas { ctx, size in
            let s = size.width / 20.0
            let coral = GraphicsContext.Shading.color(FeyndTheme.coral)
            let stroke = 1.2 * s

            var stem = Path()
            stem.move(to: CGPoint(x: 13 * s, y: 4.5 * s))
            stem.addLine(to: CGPoint(x: 13 * s, y: 13.5 * s))
            ctx.stroke(stem, with: coral, style: StrokeStyle(lineWidth: stroke, lineCap: .round))

            var flag = Path()
            flag.move(to: CGPoint(x: 13 * s, y: 4.5 * s))
            flag.addLine(to: CGPoint(x: 16.5 * s, y: 7 * s))
            ctx.stroke(flag, with: coral, style: StrokeStyle(lineWidth: stroke, lineCap: .round))

            let r = 2.8 * s
            ctx.fill(Path(ellipseIn: CGRect(x: 10.6 * s - r, y: 13.5 * s - r, width: r*2, height: r*2)), with: coral)
        }
    }
}

private struct VideoGlyph: View {
    // Play triangle inside a screen frame.
    var body: some View {
        Canvas { ctx, size in
            let s = size.width / 20.0
            let coral = GraphicsContext.Shading.color(FeyndTheme.coral)
            let stroke = 1.2 * s

            let frame = RoundedRectangle(cornerRadius: 2 * s).path(
                in: CGRect(x: 3 * s, y: 5 * s, width: 14 * s, height: 10 * s)
            )
            ctx.stroke(frame, with: coral, lineWidth: stroke)

            var play = Path()
            play.move(to: CGPoint(x: 8.5 * s, y: 7.8 * s))
            play.addLine(to: CGPoint(x: 8.5 * s, y: 12.2 * s))
            play.addLine(to: CGPoint(x: 12.6 * s, y: 10 * s))
            play.closeSubpath()
            ctx.fill(play, with: coral)
        }
    }
}

private struct PasteGlyph: View {
    // Three rows with leading dots — pasted text.
    var body: some View {
        Canvas { ctx, size in
            let s = size.width / 20.0
            let coral = GraphicsContext.Shading.color(FeyndTheme.coral)
            let stroke = 1.2 * s
            let lines: [(CGFloat, CGFloat)] = [
                (15, 6), (14, 10), (12, 14),
            ]
            for (xEnd, y) in lines {
                var line = Path()
                line.move(to: CGPoint(x: 7 * s, y: y * s))
                line.addLine(to: CGPoint(x: xEnd * s, y: y * s))
                ctx.stroke(line, with: coral, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
            }
            let r = 2.2 * s
            for y in [6.0, 10.0, 14.0] {
                ctx.fill(
                    Path(ellipseIn: CGRect(x: 4.5 * s - r, y: CGFloat(y) * s - r, width: r*2, height: r*2)),
                    with: coral
                )
            }
        }
    }
}

private struct FallbackGlyph: View {
    // Original line + 2 dots glyph, unchanged.
    var body: some View {
        Canvas { ctx, size in
            let s = size.width / 20.0
            let coral = GraphicsContext.Shading.color(FeyndTheme.coral)
            let stroke = 1.2 * s
            var line = Path()
            line.move(to: CGPoint(x: 4 * s, y: 14 * s))
            line.addLine(to: CGPoint(x: 16 * s, y: 6 * s))
            ctx.stroke(line, with: coral, lineWidth: stroke)
            let r = 2.2 * s
            ctx.fill(Path(ellipseIn: CGRect(x: 4 * s - r, y: 14 * s - r, width: r*2, height: r*2)), with: coral)
            ctx.fill(Path(ellipseIn: CGRect(x: 16 * s - r, y: 6 * s - r, width: r*2, height: r*2)), with: coral)
        }
    }
}

private struct ChatGlyph: View {
    // Speech bubble outline with two dots inside — same path data as the
    // SVG in src/app/f2/topic-icons-preview/page.tsx.
    var body: some View {
        Canvas { ctx, size in
            let s = size.width / 20.0
            let coral = GraphicsContext.Shading.color(FeyndTheme.coral)
            let stroke = 1.2 * s

            // Rounded speech bubble. Use addRoundedRect for the body, then
            // append the tail as a triangle joined to the bottom-left corner.
            var bubble = Path()
            bubble.addRoundedRect(
                in: CGRect(x: 3 * s, y: 4 * s, width: 14 * s, height: 9 * s),
                cornerSize: CGSize(width: 2 * s, height: 2 * s)
            )
            // Tail: small triangle pointing down-left from the bubble's bottom.
            var tail = Path()
            tail.move(to: CGPoint(x: 6 * s, y: 13 * s))
            tail.addLine(to: CGPoint(x: 6 * s, y: 16 * s))
            tail.addLine(to: CGPoint(x: 9 * s, y: 13 * s))
            tail.closeSubpath()

            ctx.stroke(bubble, with: coral,
                       style: StrokeStyle(lineWidth: stroke, lineJoin: .round))
            ctx.stroke(tail, with: coral,
                       style: StrokeStyle(lineWidth: stroke, lineJoin: .round))

            // Two filled dots inside the bubble.
            let r = 1.6 * s
            for x in [7.5, 12.5] {
                ctx.fill(
                    Path(ellipseIn: CGRect(x: CGFloat(x) * s - r, y: 8.6 * s - r, width: r*2, height: r*2)),
                    with: coral
                )
            }
        }
    }
}

// MARK: - Top bar (3-column custom header)

/// Custom replacement for the iOS nav bar. 8/18/12 padding from JSX.
/// Use `.toolbar(.hidden, for: .navigationBar)` on the host screen.
struct FeyndTopBar<Center: View, Trailing: View>: View {
    @ViewBuilder var center: () -> Center
    @ViewBuilder var trailing: () -> Trailing
    var onProfileTap: () -> Void = {}

    var body: some View {
        HStack(spacing: 0) {
            HStack {
                ProfileBadge()
                    .contentShape(Rectangle())
                    .onTapGesture { onProfileTap() }
                Spacer(minLength: 0)
            }
            .frame(minWidth: 42, alignment: .leading)

            center()
                .frame(maxWidth: .infinity)

            HStack {
                Spacer(minLength: 0)
                trailing()
            }
            .frame(minWidth: 42, alignment: .trailing)
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }
}

// MARK: - Circular icon button (Plus, Back, Kebab, Close)

struct IconCircleButton: View {
    let systemImage: String
    var size: CGFloat = 36
    var fg: Color = FeyndTheme.text
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(fg)
                .frame(width: size, height: size)
                .background(FeyndTheme.surface, in: Circle())
                .overlay(Circle().stroke(FeyndTheme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Action chip (Quiz me / Talk to F2 / Key points)

struct ActionChip: View {
    let label: String
    let systemImage: String
    var iconTint: Color = FeyndTheme.coral
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(iconTint)
                Text(label)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(FeyndTheme.text)
            }
            .padding(.leading, 11)
            .padding(.trailing, 14)
            .padding(.vertical, 8)
            .background(FeyndTheme.surface, in: Capsule())
            .overlay(Capsule().stroke(FeyndTheme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Day divider

struct DayDivider: View {
    let label: String

    var body: some View {
        Text(label.uppercased())
            .font(.system(size: 11.5, weight: .semibold))
            .tracking(0.4)
            .foregroundStyle(FeyndTheme.text3)
            .frame(maxWidth: .infinity)
            .padding(.top, 6)
            .padding(.bottom, 10)
    }
}

// MARK: - Chat bubbles (custom shape with one-corner-flat tail)

/// 20pt rounded everywhere except one corner that's 4pt — the tail anchor.
struct BubbleShape: Shape {
    let isUser: Bool
    func path(in rect: CGRect) -> Path {
        let big: CGFloat = 20
        let tiny: CGFloat = 4
        let tl = big
        let tr = big
        let br = isUser ? tiny : big
        let bl = isUser ? big : tiny
        return Path { p in
            p.move(to: CGPoint(x: rect.minX + tl, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.maxX - tr, y: rect.minY))
            p.addArc(center: CGPoint(x: rect.maxX - tr, y: rect.minY + tr), radius: tr, startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - br))
            p.addArc(center: CGPoint(x: rect.maxX - br, y: rect.maxY - br), radius: br, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
            p.addLine(to: CGPoint(x: rect.minX + bl, y: rect.maxY))
            p.addArc(center: CGPoint(x: rect.minX + bl, y: rect.maxY - bl), radius: bl, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
            p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + tl))
            p.addArc(center: CGPoint(x: rect.minX + tl, y: rect.minY + tl), radius: tl, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
            p.closeSubpath()
        }
    }
}

struct AIBubble<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            F2MiniMark(size: 26)
            content()
                .font(.system(size: 16))
                .foregroundStyle(FeyndTheme.text)
                .lineSpacing(2)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(BubbleShape(isUser: false).fill(FeyndTheme.surface))
                .overlay(BubbleShape(isUser: false).stroke(FeyndTheme.border, lineWidth: 1))
                .frame(maxWidth: 600, alignment: .leading)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
    }
}

struct UserBubble: View {
    let text: String

    var body: some View {
        HStack {
            Spacer(minLength: 0)
            Text(text)
                .font(.system(size: 16))
                .foregroundStyle(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(BubbleShape(isUser: true).fill(FeyndTheme.blue))
                .frame(maxWidth: 290, alignment: .trailing)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
    }
}

// MARK: - Source card (article preview under topic detail header)

struct SourceCard: View {
    let title: String
    let host: String
    var letter: String

    var body: some View {
        HStack(spacing: 11) {
            RoundedRectangle(cornerRadius: 7)
                .fill(Color(hex: 0x1F1814))
                .overlay(
                    RoundedRectangle(cornerRadius: 7).stroke(FeyndTheme.border, lineWidth: 1)
                )
                .frame(width: 30, height: 30)
                .overlay(
                    Text(letter)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(FeyndTheme.coral)
                )

            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(FeyndTheme.text)
                    .lineLimit(1)
                Text(host)
                    .font(.system(size: 11.5))
                    .foregroundStyle(FeyndTheme.text3)
            }
            Spacer(minLength: 8)
            Image(systemName: "arrow.up.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(FeyndTheme.text3)
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 11)
        .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(FeyndTheme.border, lineWidth: 1))
        .padding(.horizontal, 16)
    }
}

// MARK: - Composer (flat, no system material)

struct FeyndComposer: View {
    @Binding var draft: String
    let busy: Bool
    let onSend: () -> Void

    private var canSend: Bool {
        !busy && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        HStack(spacing: 8) {
            // Custom pill. No `.regularMaterial` — sits flat on FeyndTheme.bg.
            ZStack(alignment: .leading) {
                if draft.isEmpty {
                    Text("Send a URL or ask a question…")
                        .font(.system(size: 16))
                        .foregroundStyle(FeyndTheme.text3)
                        .padding(.leading, 16)
                }
                TextField("", text: $draft, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.system(size: 16))
                    .foregroundStyle(FeyndTheme.text)
                    .tint(FeyndTheme.coral)
                    .lineLimit(1...5)
                    .padding(.horizontal, 16)
            }
            .padding(.vertical, 11)
            .background(FeyndTheme.bgRaised, in: RoundedRectangle(cornerRadius: 22))
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(FeyndTheme.border, lineWidth: 1))

            Button(action: { if canSend { onSend() } }) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 15, weight: .heavy))
                    .foregroundStyle(canSend ? Color(hex: 0x1A0E08) : Color(hex: 0x6A4A3D))
                    .frame(width: 36, height: 36)
                    .background(canSend ? FeyndTheme.coral : FeyndTheme.surface2, in: Circle())
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }
}

// MARK: - Tab pill (floating Chat / Topics)

/// Maximum width the main column ever uses. Keeps Catalyst windows from
/// stretching topic rows / chat bubbles edge-to-edge on wide displays.
/// iOS phones never get wider than this anyway, so it's a no-op there.
let FEYND_CONTENT_MAX_WIDTH: CGFloat = 720

/// Centers + clamps content to `FEYND_CONTENT_MAX_WIDTH`. Use on inner
/// columns (Topics list, chat scroll, composer row) so wide Mac/iPad windows
/// don't stretch row labels across half a meter of pixels.
extension View {
    func feyndContentColumn() -> some View {
        self.frame(maxWidth: FEYND_CONTENT_MAX_WIDTH)
            .frame(maxWidth: .infinity, alignment: .center)
    }
}

enum FeyndTab: String, CaseIterable {
    case chat, topics
    var label: String { self == .chat ? "Chat" : "Topics" }
    var iconSystem: String { self == .chat ? "bubble.left.and.bubble.right.fill" : "list.bullet" }
}

struct TabPill: View {
    @Binding var active: FeyndTab
    var onTap: (FeyndTab) -> Void = { _ in }

    var body: some View {
        HStack(spacing: 4) {
            ForEach(FeyndTab.allCases, id: \.self) { tab in
                tabButton(tab)
            }
        }
        .padding(4)
        .background(
            // Translucent backdrop — warm-dark in dark mode, warm-paper in light.
            Capsule().fill(FeyndTheme.tabPillBg.opacity(0.78))
        )
        .background(
            Capsule().fill(.ultraThinMaterial)
        )
        .overlay(Capsule().stroke(FeyndTheme.border, lineWidth: 1))
        .frame(width: 240)
        .shadow(color: .black.opacity(0.45), radius: 30, y: 8)
    }

    @ViewBuilder
    private func tabButton(_ tab: FeyndTab) -> some View {
        let isActive = active == tab
        Button {
            active = tab
            onTap(tab)
        } label: {
            HStack(spacing: 7) {
                Image(systemName: tab.iconSystem)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(isActive ? FeyndTheme.coral : FeyndTheme.text3)
                Text(tab.label)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(isActive ? FeyndTheme.text : FeyndTheme.text2)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 46)
            .background(
                Capsule().fill(isActive ? FeyndTheme.surface2 : Color.clear)
            )
        }
        .buttonStyle(.plain)
    }
}
