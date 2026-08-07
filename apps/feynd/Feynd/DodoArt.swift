import SwiftUI

/// The Dodo character, drawn natively. Ported from the Claude Design project
/// (apps/feynd/branding/dodo-logo.dc.html, turn 5's `#trav` traveler) so the
/// art stays vector-crisp at any size with zero assets. Colors are the fixed
/// brand values from BRANDING.md — the character never re-tints per mode.
enum DodoInk {
    static let slate  = Color(hex: 0x7C9EB2)
    static let wing   = Color(hex: 0x6A8FA3)
    static let cream  = Color(hex: 0xF9EFDA)
    static let eye    = Color(hex: 0x33383E)
    static let beak   = Color(hex: 0xF0A830)
    static let beakNostril = Color(hex: 0xC9821F)
    static let blush  = Color(hex: 0xF2A19A)
    static let sproutStem = Color(hex: 0x6FAE5C)
    static let sproutLeft = Color(hex: 0x7BB662)
    static let sproutRight = Color(hex: 0x5F9E4C)
    static let feet   = Color(hex: 0xF0A830)
}

// MARK: - Shared drawing

/// Draw the dodo head (sprout, head, hooded face, eyes, beak, blush) into a
/// context. Art space: head center at (0,0), radius 26; sprout reaches up to
/// y ≈ −39. Pass a transform mapping art space → view space.
private func drawDodoHead(_ ctx: GraphicsContext, _ t: CGAffineTransform) {
    func fill(_ p: Path, _ c: Color, opacity: Double = 1) {
        ctx.fill(p.applying(t), with: .color(c.opacity(opacity)))
    }

    // Sprout — stem + two leaves.
    var stem = Path()
    stem.move(to: CGPoint(x: -0.9, y: -26))
    stem.addCurve(to: CGPoint(x: 2.2, y: -32),
                  control1: CGPoint(x: -1.1, y: -28.6), control2: CGPoint(x: -0.4, y: -30.3))
    stem.addCurve(to: CGPoint(x: 1.3, y: -26),
                  control1: CGPoint(x: 2.8, y: -30.7), control2: CGPoint(x: 2.2, y: -28.6))
    stem.closeSubpath()
    fill(stem, DodoInk.sproutStem)

    var leafL = Path()
    leafL.move(to: CGPoint(x: 0.9, y: -30.9))
    leafL.addCurve(to: CGPoint(x: -16.1, y: -34.4),
                   control1: CGPoint(x: -3.9, y: -36.5), control2: CGPoint(x: -11.3, y: -37.4))
    leafL.addCurve(to: CGPoint(x: 0.9, y: -30.9),
                   control1: CGPoint(x: -13.9, y: -28.7), control2: CGPoint(x: -5.7, y: -27.4))
    leafL.closeSubpath()
    fill(leafL, DodoInk.sproutLeft)

    var leafR = Path()
    leafR.move(to: CGPoint(x: 1.7, y: -32.2))
    leafR.addCurve(to: CGPoint(x: 16.1, y: -37.8),
                   control1: CGPoint(x: 3.9, y: -37.8), control2: CGPoint(x: 10.9, y: -39.6))
    leafR.addCurve(to: CGPoint(x: 1.7, y: -32.2),
                   control1: CGPoint(x: 15.2, y: -32.2), control2: CGPoint(x: 8.3, y: -29.2))
    leafR.closeSubpath()
    fill(leafR, DodoInk.sproutRight)

    // Head + hooded cream face.
    fill(Path(ellipseIn: CGRect(x: -26, y: -26, width: 52, height: 52)), DodoInk.slate)

    var face = Path()
    face.move(to: CGPoint(x: -20, y: 4))
    face.addCurve(to: CGPoint(x: -6.5, y: -12),
                  control1: CGPoint(x: -20, y: -7), control2: CGPoint(x: -15, y: -13))
    face.addQuadCurve(to: CGPoint(x: 6.5, y: -12), control: CGPoint(x: 0, y: -7.5))
    face.addCurve(to: CGPoint(x: 20, y: 4),
                  control1: CGPoint(x: 15, y: -13), control2: CGPoint(x: 20, y: -7))
    face.addCurve(to: CGPoint(x: 0, y: 24),
                  control1: CGPoint(x: 20, y: 16), control2: CGPoint(x: 11, y: 24))
    face.addCurve(to: CGPoint(x: -20, y: 4),
                  control1: CGPoint(x: -11, y: 24), control2: CGPoint(x: -20, y: 16))
    face.closeSubpath()
    fill(face, DodoInk.cream)

    // Eyes with highlights.
    for sx in [-1.0, 1.0] {
        fill(Path(ellipseIn: CGRect(x: sx * 9.4 - 5.5, y: -7.5, width: 11, height: 11)), DodoInk.eye)
        fill(Path(ellipseIn: CGRect(x: sx * 9.4 - (sx * 1.8) - 2.1, y: -6.1, width: 4.2, height: 4.2)), .white)
    }

    // Beak + nostrils.
    fill(Path(ellipseIn: CGRect(x: -6.8, y: 1.3, width: 13.6, height: 10)), DodoInk.beak)
    fill(Path(ellipseIn: CGRect(x: -3.55, y: 4.05, width: 1.9, height: 1.9)), DodoInk.beakNostril)
    fill(Path(ellipseIn: CGRect(x: 1.65, y: 4.05, width: 1.9, height: 1.9)), DodoInk.beakNostril)

    // Blush.
    fill(Path(ellipseIn: CGRect(x: -19.8, y: 5.8, width: 8.4, height: 5.2)), DodoInk.blush, opacity: 0.6)
    fill(Path(ellipseIn: CGRect(x: 11.4, y: 5.8, width: 8.4, height: 5.2)), DodoInk.blush, opacity: 0.6)
}

/// Draw the walking traveler (legs, feet, body, wings, then the head) into a
/// context. Art space: head center (0,0); figure spans x −30…30, y −39…58.
private func drawDodoTraveler(_ ctx: GraphicsContext, _ t: CGAffineTransform) {
    func fill(_ p: Path, _ c: Color) { ctx.fill(p.applying(t), with: .color(c)) }

    // Legs + feet.
    fill(Path(roundedRect: CGRect(x: -9, y: 44, width: 6, height: 12), cornerRadius: 3), DodoInk.feet)
    fill(Path(roundedRect: CGRect(x: 3, y: 44, width: 6, height: 12), cornerRadius: 3), DodoInk.feet)
    fill(Path(roundedRect: CGRect(x: -13, y: 53, width: 12, height: 5), cornerRadius: 2.5), DodoInk.feet)
    fill(Path(roundedRect: CGRect(x: 1, y: 53, width: 12, height: 5), cornerRadius: 2.5), DodoInk.feet)

    // Body + belly.
    fill(Path(ellipseIn: CGRect(x: -20, y: 16, width: 40, height: 32)), DodoInk.slate)
    fill(Path(ellipseIn: CGRect(x: -12, y: 25, width: 24, height: 20)), DodoInk.cream)

    // Wings — rounded rects rotated around their centers.
    for (x, y, angle) in [(-30.0, 24.0, -20.0), (16.0, 24.0, 20.0)] {
        let pivot = CGPoint(x: x + 7, y: y + 5.5)
        let rot = CGAffineTransform(translationX: pivot.x, y: pivot.y)
            .rotated(by: angle * .pi / 180)
            .translatedBy(x: -pivot.x, y: -pivot.y)
        let wing = Path(roundedRect: CGRect(x: x, y: y, width: 14, height: 11), cornerRadius: 5.5)
            .applying(rot)
        fill(wing, DodoInk.wing)
    }

    drawDodoHead(ctx, t)
}

// MARK: - Views

/// Mini dodo head — replaces the old line-and-nodes F2 mark next to agent
/// chat bubbles and anywhere the app signs a message as "the dodo".
struct DodoMiniMark: View {
    var size: CGFloat = 26

    var body: some View {
        Canvas { ctx, canvasSize in
            // Art bounds: x −26…26, y −39…26 (sprout adds headroom). Fit
            // width to the frame; nudge down so the head reads centered.
            let s = canvasSize.width / 56
            let t = CGAffineTransform(translationX: canvasSize.width / 2,
                                      y: canvasSize.height * 0.62)
                .scaledBy(x: s, y: s)
            drawDodoHead(ctx, t)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// The full traveler — walks the Peck map trail beside the current level.
struct DodoTraveler: View {
    /// Height of the rendered figure in points.
    var size: CGFloat = 90

    var body: some View {
        Canvas { ctx, canvasSize in
            // Figure spans 97 art units tall (−39…58).
            let s = canvasSize.height / 100
            let t = CGAffineTransform(translationX: canvasSize.width / 2,
                                      y: canvasSize.height * 0.42)
                .scaledBy(x: s, y: s)
            drawDodoTraveler(ctx, t)
        }
        .frame(width: size * 0.72, height: size)
        .accessibilityHidden(true)
    }
}

/// Big friendly dodo face for the voice screen — sits on a warm peach disc
/// (the app-icon background) with a soft marigold halo. Bobs gently; the
/// halo breathes while the dodo is speaking.
struct DodoVoiceOrb: View {
    let speaking: Bool

    @State private var bob = false
    @State private var breathe = false

    var body: some View {
        ZStack {
            // Marigold bloom.
            Circle()
                .fill(
                    RadialGradient(
                        colors: [DodoInk.beak.opacity(0.35), DodoInk.beak.opacity(0)],
                        center: .center, startRadius: 40, endRadius: 165
                    )
                )
                .frame(width: 330, height: 330)
                .blur(radius: 6)
                .scaleEffect(breathe ? 1.06 : 0.97)

            // Speaking ring — pulses out from the disc while the dodo talks.
            Circle()
                .stroke(DodoInk.beak.opacity(speaking ? 0.5 : 0.18), lineWidth: 2)
                .frame(width: speaking ? (breathe ? 236 : 212) : 208,
                       height: speaking ? (breathe ? 236 : 212) : 208)

            // Peach disc — the app icon's ground.
            Circle()
                .fill(Color(hex: 0xFCE5D0))
                .frame(width: 196, height: 196)
                .shadow(color: .black.opacity(0.25), radius: 16, y: 6)

            Canvas { ctx, size in
                let s = size.width / 78
                let t = CGAffineTransform(translationX: size.width / 2, y: size.height * 0.60)
                    .scaledBy(x: s, y: s)
                drawDodoHead(ctx, t)
            }
            .frame(width: 176, height: 176)
            .offset(y: bob ? 3 : -3)
        }
        .frame(width: 260, height: 260)
        .task {
            withAnimation(.easeInOut(duration: 2.6).repeatForever(autoreverses: true)) {
                bob = true
            }
            withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true)) {
                breathe = true
            }
        }
        .accessibilityLabel(speaking ? "Dodo is speaking" : "Dodo is listening")
    }
}
