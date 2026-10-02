import SwiftUI
import UIKit

// The jelly world — drawing kit for the Peck map, ported from the canvas
// functions in misc/dodo-redesign/dodo-jelly-map.html (glossBall, ribbon,
// sign, tree, lolli, gumdrop, mountain, island, hillLayer, cloudBank,
// drawCastle, arch, chest, star) plus the SwiftUI pieces the map composes
// over its canvases: the jelly level node, the tappable chest, a seated
// critter. World coordinates; colours go through `JellyInk`, which serves
// the page's values by day and the same candy at dusk in dark mode.

// MARK: - Colours

enum Jelly {
    /// The page's GD_COLS — gumdrops, sprinkles, confetti.
    static let gdCols: [UInt32] = [0xFF7AB0, 0xFFD43A, 0x7FD3FF, 0xA3E45C, 0xB994FF, 0xFF9A5C]
    /// The map's ink (`--ink`).
    static let ink: UInt32 = 0x3A2433

    static func rgb(_ hex: UInt32) -> (Double, Double, Double) {
        (Double((hex >> 16) & 0xFF), Double((hex >> 8) & 0xFF), Double(hex & 0xFF))
    }
    static func hex(_ r: Double, _ g: Double, _ b: Double) -> UInt32 {
        let cr = UInt32(max(0, min(255, r.rounded())))
        let cg = UInt32(max(0, min(255, g.rounded())))
        let cb = UInt32(max(0, min(255, b.rounded())))
        return (cr << 16) | (cg << 8) | cb
    }
    /// The page's `shade`: multiply toward black.
    static func shade(_ h: UInt32, _ k: Double) -> UInt32 {
        let (r, g, b) = rgb(h)
        return hex(r * k, g * k, b * k)
    }
    /// The page's `tint`: mix toward white.
    static func tint(_ h: UInt32, _ k: Double) -> UInt32 {
        let (r, g, b) = rgb(h)
        return hex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k)
    }
    /// Dark mode's night: the day colour seen through a moonlit filter
    /// (reds and greens halved, blues kept, a little lift), so the lagoon
    /// goes deep blue, the meadow blue-green, the peaks violet and the
    /// clouds periwinkle — the same place at night, never grey. The level
    /// stones, the critters and the traveler are NOT filtered: they glow.
    static func dusk(_ h: UInt32) -> UInt32 {
        let (r, g, b) = rgb(h)
        return hex(r * 0.40 + 10, g * 0.56 + 10, b * 0.68 + 24)
    }
}

/// Resolves the page's colours for one frame: day values in light mode,
/// dusk in dark. Whites and shadows (the `rgba` literals) pass through.
struct JellyInk {
    let dark: Bool
    func hex(_ h: UInt32) -> UInt32 { dark ? Jelly.dusk(h) : h }
    func c(_ h: UInt32, _ o: Double = 1) -> Color { Color(hex: hex(h)).opacity(o) }
    func triad(_ t: JellyTriad) -> JellyTriad { dark ? JellyTriad(light: Jelly.dusk(t.light), base: Jelly.dusk(t.base), dark: Jelly.dusk(t.dark)) : t }
    /// For SwiftUI views outside a canvas: an adaptive colour.
    static func adaptive(_ h: UInt32) -> Color { FeyndTheme.adaptiveColor(dark: Jelly.dusk(h), light: h) }
}

/// A gloss-ball colour set: light (the lit corner), base, dark (the rim).
struct JellyTriad: Equatable {
    let light: UInt32
    let base: UInt32
    let dark: UInt32

    static let meadow = JellyTriad(light: 0xFFE9BF, base: 0xFFB347, dark: 0xE07F1C)
    static let lagoon = JellyTriad(light: 0xDCF6FF, base: 0x5EC6EC, dark: 0x2689BD)
    static let peaks  = JellyTriad(light: 0xF3E8FF, base: 0xB994FF, dark: 0x7A4FD6)
    static let locked = JellyTriad(light: 0xF3EEF9, base: 0xC7BED8, dark: 0x958AAB)
    static let sand   = JellyTriad(light: 0xFFF3D6, base: 0xFFE2B0, dark: 0xE9BD7F)
    static let stone  = JellyTriad(light: 0xFFF3DC, base: 0xFFD9A8, dark: 0xE8AD6E)
    static let floe   = JellyTriad(light: 0xFFFFFF, base: 0xE7F7FF, dark: 0xBFE4F5)
    static let rock   = JellyTriad(light: 0xEFE8F7, base: 0xC7BCD8, dark: 0x9A8FB0)
    static let cloud  = JellyTriad(light: 0xFFFFFF, base: 0xFFF6FB, dark: 0xECDCEF)
    static let gold   = JellyTriad(light: 0xFFF8D0, base: 0xFFD43A, dark: 0xD9A000)
    static let chestPink = JellyTriad(light: 0xFFD1E1, base: 0xFF8FB6, dark: 0xD9507F)
    static let chestGrey = JellyTriad(light: 0xECE6F5, base: 0xC7BED8, dark: 0x958AAB)

    /// A candy colour as a ball: lit tint, the colour, a shaded rim.
    static func candy(_ col: UInt32, tint: Double = 0.6, shade: Double = 0.72) -> JellyTriad {
        JellyTriad(light: Jelly.tint(col, tint), base: col, dark: Jelly.shade(col, shade))
    }
}

/// The three regions, bands of ten levels, bottom to top.
enum JellyRegion: Int {
    case meadow = 0, lagoon, peaks

    static func of(band: Int) -> JellyRegion { JellyRegion(rawValue: max(0, min(2, band))) ?? .meadow }
    static func of(index: Int) -> JellyRegion { of(band: index / 10) }

    var signName: String {
        switch self {
        case .meadow: return "GUMDROP MEADOW"
        case .lagoon: return "JELLY LAGOON"
        case .peaks: return "SPRINKLE PEAKS"
        }
    }
    var title: String {
        switch self {
        case .meadow: return "Gumdrop Meadow"
        case .lagoon: return "Jelly Lagoon"
        case .peaks: return "Sprinkle Peaks"
        }
    }
    var node: JellyTriad {
        switch self {
        case .meadow: return .meadow
        case .lagoon: return .lagoon
        case .peaks: return .peaks
        }
    }
    /// The gate banner at the end of this region, and its ribbon colour.
    var gateBanner: (text: String, col: UInt32) {
        switch self {
        case .meadow: return ("TO JELLY LAGOON", 0x5EC6EC)
        case .lagoon: return ("TO SPRINKLE PEAKS", 0xB06CFF)
        case .peaks: return ("TO SUGAR CASTLE", 0xFF6FA8)
        }
    }
}

// MARK: - Path helpers

func jellyEllipse(_ x: CGFloat, _ y: CGFloat, _ rx: CGFloat, _ ry: CGFloat, rot: CGFloat = 0) -> Path {
    var t = CGAffineTransform(translationX: x, y: y)
    if rot != 0 { t = t.rotated(by: rot) }
    return Path(ellipseIn: CGRect(x: -rx, y: -ry, width: rx * 2, height: ry * 2)).applying(t)
}

/// An arc sampled point by point (y down: angles π…2π are the upper half).
func jellyArcPath(center: CGPoint, r: CGFloat, from a0: CGFloat, to a1: CGFloat, steps: Int = 16) -> Path {
    var p = Path()
    for k in 0...steps {
        let a = a0 + (a1 - a0) * CGFloat(k) / CGFloat(steps)
        let pt = CGPoint(x: center.x + cos(a) * r, y: center.y + sin(a) * r)
        if k == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
    }
    return p
}

func jellyRGBA(_ r: Double, _ g: Double, _ b: Double, _ a: Double) -> Color {
    Color(red: r / 255, green: g / 255, blue: b / 255).opacity(a)
}

private func jellyFont(_ size: CGFloat) -> Font { .custom("Fredoka", size: size).weight(.bold) }

// MARK: - Props

/// The page's `glossBall`: a lit jelly sphere with two highlights.
func jellyGlossBall(_ g: inout GraphicsContext, _ ink: JellyInk, x: CGFloat, y: CGFloat, r: CGFloat, _ cols: JellyTriad) {
    let t = ink.triad(cols)
    g.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)),
           with: .radialGradient(Gradient(stops: [
               .init(color: Color(hex: t.light), location: 0),
               .init(color: Color(hex: t.base), location: 0.55),
               .init(color: Color(hex: t.dark), location: 1),
           ]), center: CGPoint(x: x - r * 0.35, y: y - r * 0.45), startRadius: r * 0.05, endRadius: r * 1.2))
    // Moonlight is softer than the sun: dim the gloss at night.
    g.fill(jellyEllipse(x - r * 0.34, y - r * 0.42, r * 0.32, r * 0.17, rot: -0.6), with: .color(.white.opacity(ink.dark ? 0.28 : 0.75)))
    g.fill(jellyEllipse(x - r * 0.46, y - r * 0.42, r * 0.08, r * 0.05, rot: -0.6), with: .color(.white.opacity(ink.dark ? 0.5 : 0.95)))
}

/// The page's `ribbon`: a glossy capsule banner. `y` is its top edge.
func jellyRibbon(_ g: inout GraphicsContext, _ ink: JellyInk, x: CGFloat, y: CGFloat, text: String, col: UInt32, size: CGFloat = 13) {
    let label = g.resolve(Text(text).font(jellyFont(size)).foregroundColor(.white))
    let w = label.measure(in: CGSize(width: 600, height: 60)).width + 28
    let hgt: CGFloat = 24
    g.fill(Path(roundedRect: CGRect(x: x - w / 2, y: y + 3, width: w, height: hgt), cornerRadius: hgt / 2),
           with: .color(ink.c(Jelly.shade(col, 0.7))))
    g.fill(Path(roundedRect: CGRect(x: x - w / 2, y: y, width: w, height: hgt), cornerRadius: hgt / 2),
           with: .linearGradient(Gradient(colors: [ink.c(Jelly.tint(col, 0.3)), ink.c(col)]),
                                 startPoint: CGPoint(x: x, y: y), endPoint: CGPoint(x: x, y: y + hgt)))
    g.fill(Path(roundedRect: CGRect(x: x - w / 2 + 8, y: y + 3, width: w - 16, height: 5), cornerRadius: 2.5),
           with: .color(.white.opacity(0.55)))
    g.draw(label, at: CGPoint(x: x, y: y + hgt / 2))
}

/// The page's `sign`: a peach post with a cream plate. `(x, y)` is where the
/// post meets the ground; the plate hangs 26–48 above it (taller with a
/// sub line). Width follows the title, never under 92.
func jellySign(_ g: inout GraphicsContext, _ ink: JellyInk, x: CGFloat, y: CGFloat, text: String, sub: String? = nil) {
    g.fill(jellyEllipse(x, y + 2, 10, 3), with: .color(jellyRGBA(60, 40, 30, 0.15)))
    g.fill(Path(roundedRect: CGRect(x: x - 3, y: y - 30, width: 6, height: 32), cornerRadius: 1.5),
           with: .color(ink.c(0xD79A72)))
    let title = g.resolve(Text(text).font(jellyFont(11.5)).foregroundColor(ink.c(0x8A4F3A)))
    let tw = title.measure(in: CGSize(width: 600, height: 60)).width
    let subText = sub.map { g.resolve(Text($0).font(.custom("Fredoka", size: 9.5).weight(.semibold)).foregroundColor(ink.c(0xA3634A))) }
    let sw = subText?.measure(in: CGSize(width: 600, height: 60)).width ?? 0
    let w = max(92, max(tw, sw) + 22)
    let hgt: CGFloat = sub == nil ? 22 : 33
    let top = y - 26 - hgt
    g.fill(Path(roundedRect: CGRect(x: x - w / 2, y: top + 2, width: w, height: hgt + 2), cornerRadius: 8),
           with: .color(ink.c(0xC98A63)))
    g.fill(Path(roundedRect: CGRect(x: x - w / 2, y: top, width: w, height: hgt), cornerRadius: 8),
           with: .color(ink.c(0xFFF3E2)))
    if let subText {
        g.draw(title, at: CGPoint(x: x, y: top + 11))
        g.draw(subText, at: CGPoint(x: x, y: top + 24))
    } else {
        g.draw(title, at: CGPoint(x: x, y: top + hgt / 2))
    }
}

/// The page's `gumdrop`: a domed drop with a highlight. `(x, y)` is its base.
func jellyGumdrop(_ g: inout GraphicsContext, _ ink: JellyInk, x: CGFloat, y: CGFloat, r: CGFloat, col: UInt32) {
    g.fill(jellyEllipse(x, y + 1, r * 1.1, r * 0.35), with: .color(jellyRGBA(40, 90, 40, 0.15)))
    var p = Path()
    p.move(to: CGPoint(x: x - r, y: y))
    p.addQuadCurve(to: CGPoint(x: x, y: y - r * 1.5), control: CGPoint(x: x - r, y: y - r * 1.5))
    p.addQuadCurve(to: CGPoint(x: x + r, y: y), control: CGPoint(x: x + r, y: y - r * 1.5))
    p.closeSubpath()
    g.fill(p, with: .radialGradient(Gradient(stops: [
        .init(color: ink.c(Jelly.tint(col, 0.55)), location: 0),
        .init(color: ink.c(col), location: 0.6),
        .init(color: ink.c(Jelly.shade(col, 0.75)), location: 1),
    ]), center: CGPoint(x: x - r * 0.3, y: y - r * 0.9), startRadius: r * 0.1, endRadius: r * 1.3))
    g.fill(jellyEllipse(x - r * 0.35, y - r * 0.95, r * 0.2, r * 0.3, rot: -0.3), with: .color(.white.opacity(0.8)))
}

/// The page's `tree`: a peach trunk under a candy gloss-ball canopy.
func jellyTree(_ g: inout GraphicsContext, _ ink: JellyInk, x: CGFloat, y: CGFloat, s: CGFloat, col: UInt32) {
    g.fill(jellyEllipse(x, y + 2, 18 * s, 5 * s), with: .color(jellyRGBA(40, 90, 40, 0.18)))
    g.fill(Path(roundedRect: CGRect(x: x - 4.5 * s, y: y - 34 * s, width: 9 * s, height: 36 * s), cornerRadius: 4 * s),
           with: .linearGradient(Gradient(colors: [ink.c(0xE7AD8C), ink.c(0xBF7D5D)]),
                                 startPoint: CGPoint(x: x - 4 * s, y: y), endPoint: CGPoint(x: x + 4 * s, y: y)))
    jellyGlossBall(&g, ink, x: x, y: y - 50 * s, r: 25 * s, .candy(col))
}

/// The page's `lolli`: a white stick and a spiral candy.
func jellyLolli(_ g: inout GraphicsContext, _ ink: JellyInk, x: CGFloat, y: CGFloat, s: CGFloat, col: UInt32) {
    g.fill(jellyEllipse(x, y + 2, 12 * s, 4 * s), with: .color(jellyRGBA(80, 40, 90, 0.15)))
    let stick = Path(roundedRect: CGRect(x: x - 3 * s, y: y - 40 * s, width: 6 * s, height: 42 * s), cornerRadius: 3 * s)
    g.fill(stick, with: .color(.white))
    g.stroke(stick, with: .color(jellyRGBA(120, 90, 130, 0.25)), lineWidth: 1)
    let r = 20 * s, cy = y - 56 * s
    jellyGlossBall(&g, ink, x: x, y: cy, r: r, .candy(col, tint: 0.55, shade: 0.75))
    var spiral = Path()
    let turns = 2 * CGFloat.pi * 2.6
    var a: CGFloat = 0
    var first = true
    while a < turns {
        let rr = a / turns * r
        let pt = CGPoint(x: x + cos(a) * rr, y: cy + sin(a) * rr)
        if first { spiral.move(to: pt); first = false } else { spiral.addLine(to: pt) }
        a += 0.2
    }
    var clipped = g
    clipped.clip(to: Path(ellipseIn: CGRect(x: x - r, y: cy - r, width: r * 2, height: r * 2)))
    clipped.stroke(spiral, with: .color(.white.opacity(0.55)), style: StrokeStyle(lineWidth: 3.2 * s, lineCap: .round))
    g.fill(jellyEllipse(x - r * 0.35, cy - r * 0.45, r * 0.28, r * 0.14, rot: -0.6), with: .color(.white.opacity(0.8)))
}

/// The page's `mountain`: a candy peak with a dripping frosting cap and
/// sprinkles. `base` is the ground line; `w`/`h` the footprint and height.
func jellyMountain(_ g: inout GraphicsContext, _ ink: JellyInk, cx: CGFloat, base: CGFloat, w: CGFloat, h: CGFloat, col: UInt32, cap: UInt32) {
    let L = CGPoint(x: cx - w / 2, y: base), T = CGPoint(x: cx, y: base - h), R = CGPoint(x: cx + w / 2, y: base)
    let grad = Gradient(stops: [
        .init(color: ink.c(Jelly.tint(col, 0.25)), location: 0),
        .init(color: ink.c(col), location: 0.55),
        .init(color: ink.c(Jelly.shade(col, 0.88)), location: 1),
    ])
    let shading = GraphicsContext.Shading.linearGradient(grad, startPoint: CGPoint(x: cx - w / 2, y: base), endPoint: CGPoint(x: cx + w / 2, y: base))
    var tri = Path()
    tri.move(to: L); tri.addLine(to: T); tri.addLine(to: R); tri.closeSubpath()
    g.fill(tri, with: shading)
    g.stroke(tri, with: shading, style: StrokeStyle(lineWidth: 18, lineJoin: .round))
    let f: CGFloat = 0.36
    let l = CGPoint(x: T.x + (L.x - T.x) * f, y: T.y + (L.y - T.y) * f)
    let r = CGPoint(x: T.x + (R.x - T.x) * f, y: T.y + (R.y - T.y) * f)
    var frost = Path()
    frost.move(to: T); frost.addLine(to: l)
    let n = 4
    for k in 0..<n {
        let x0 = l.x + (r.x - l.x) * CGFloat(k) / CGFloat(n)
        let x1 = l.x + (r.x - l.x) * CGFloat(k + 1) / CGFloat(n)
        frost.addQuadCurve(to: CGPoint(x: x1, y: l.y), control: CGPoint(x: (x0 + x1) / 2, y: l.y + (k % 2 == 1 ? 16 : 24)))
    }
    frost.closeSubpath()
    let capColor = ink.c(cap)
    g.fill(frost, with: .color(capColor))
    g.stroke(frost, with: .color(capColor), style: StrokeStyle(lineWidth: 14, lineJoin: .round))
    g.fill(jellyEllipse(l.x + (r.x - l.x) * 0.3, l.y + 20, 3.5, 6), with: .color(capColor))
    g.fill(jellyEllipse(l.x + (r.x - l.x) * 0.72, l.y + 16, 3, 5), with: .color(capColor))
    let sc: [UInt32] = [0xFF7AB0, 0xFFD43A, 0x7FD3FF, 0xA3E45C]
    for k in 0..<6 {
        let tt = CGFloat(k + 1) / 7
        var s = g
        s.translateBy(x: l.x + (r.x - l.x) * tt, y: T.y + (l.y - T.y) * 0.55 + CGFloat((k * 37) % 9))
        s.rotate(by: .radians(CGFloat(k) * 1.3))
        s.fill(Path(CGRect(x: -3, y: -1, width: 6, height: 2.2)), with: .color(ink.c(sc[k % 4])))
    }
    g.fill(jellyEllipse(T.x - w * 0.08, T.y + h * 0.12, 4, 10, rot: 0.5), with: .color(.white.opacity(0.6)))
}

/// The page's `island`: a sand (or ice, or rock) pad floating on the water.
func jellyIsland(_ g: inout GraphicsContext, _ ink: JellyInk, x: CGFloat, y: CGFloat, rx: CGFloat, ry: CGFloat, _ cols: JellyTriad = .sand) {
    let t = ink.triad(cols)
    g.fill(jellyEllipse(x, y + ry * 0.6, rx * 1.12, ry * 0.8), with: .color(jellyRGBA(30, 110, 140, 0.22)))
    g.stroke(jellyEllipse(x, y + ry * 0.3, rx * 1.2, ry * 1.05), with: .color(.white.opacity(0.7)), lineWidth: 2)
    var e = g
    e.translateBy(x: x, y: y)
    e.scaleBy(x: 1, y: ry / rx)
    e.fill(Path(ellipseIn: CGRect(x: -rx, y: -rx, width: rx * 2, height: rx * 2)),
           with: .radialGradient(Gradient(stops: [
               .init(color: Color(hex: t.light), location: 0),
               .init(color: Color(hex: t.base), location: 0.6),
               .init(color: Color(hex: t.dark), location: 1),
           ]), center: CGPoint(x: -rx * 0.3, y: -rx * 0.6), startRadius: 2, endRadius: rx))
    g.fill(jellyEllipse(x - rx * 0.35, y - ry * 0.45, rx * 0.3, ry * 0.18), with: .color(.white.opacity(0.6)))
}

/// The page's `hillLayer`: a rolling crest filled down to `bottom`, with a
/// pale rim along the top.
func jellyHillLayer(_ g: inout GraphicsContext, _ ink: JellyInk, baseY: CGFloat, amp: CGFloat, freq: CGFloat, phase: CGFloat,
                    col: UInt32, rim: Double, width: CGFloat, bottom: CGFloat) {
    var hill = Path()
    var rimLine = Path()
    hill.move(to: CGPoint(x: -20, y: bottom))
    var x: CGFloat = -20
    var first = true
    while x <= width + 20 {
        let y = baseY - amp * (0.5 + 0.5 * sin(x * freq + phase))
        hill.addLine(to: CGPoint(x: x, y: y))
        if first { rimLine.move(to: CGPoint(x: x, y: y + 3)); first = false } else { rimLine.addLine(to: CGPoint(x: x, y: y + 3)) }
        x += 12
    }
    hill.addLine(to: CGPoint(x: width + 20, y: bottom))
    hill.closeSubpath()
    g.fill(hill, with: .color(ink.c(col)))
    g.stroke(rimLine, with: .color(.white.opacity(rim)), lineWidth: 4)
}

/// The page's `cloudBank`: a row of white gloss balls across the width.
func jellyCloudBank(_ g: inout GraphicsContext, _ ink: JellyInk, y: CGFloat, width: CGFloat) {
    var k = 0
    var x: CGFloat = -60
    while x < width + 60 {
        let r = 30 + CGFloat((k * 53) % 17)
        jellyGlossBall(&g, ink, x: x, y: y + CGFloat((k * 31) % 12), r: r, .cloud)
        x += 48
        k += 1
    }
}

/// The page's `drawCastle`: Sugar Castle, `base` is its ground line.
func jellyCastle(_ g: inout GraphicsContext, _ ink: JellyInk, x: CGFloat, base: CGFloat) {
    let dx = x - 195, dy = base - 262
    func P(_ px: CGFloat, _ py: CGFloat) -> CGPoint { CGPoint(x: px + dx, y: py + dy) }
    g.fill(jellyEllipse(x, base + 4, 120, 12), with: .color(jellyRGBA(120, 60, 110, 0.14)))
    func wall(_ x0: CGFloat, _ y0: CGFloat, _ w: CGFloat, _ h: CGFloat, _ c: UInt32) {
        let shading = GraphicsContext.Shading.linearGradient(
            Gradient(stops: [
                .init(color: ink.c(Jelly.tint(c, 0.35)), location: 0),
                .init(color: ink.c(c), location: 0.5),
                .init(color: ink.c(Jelly.shade(c, 0.85)), location: 1),
            ]), startPoint: P(x0, y0), endPoint: P(x0 + w, y0))
        g.fill(Path(roundedRect: CGRect(origin: P(x0, y0), size: CGSize(width: w, height: h)), cornerRadius: 10), with: shading)
        var k: CGFloat = 0
        while k < w / 12 {
            g.fill(Path(ellipseIn: CGRect(origin: P(x0 + 6 + k * 12 - 5, y0 + 1 - 5), size: CGSize(width: 10, height: 10))), with: shading)
            k += 1
        }
    }
    wall(96, 150, 42, 112, 0xFFB8D6); wall(252, 150, 42, 112, 0xFFB8D6)
    wall(124, 178, 142, 84, 0xFFC9DF)
    wall(170, 102, 50, 160, 0xFFB0CF)
    jellyGlossBall(&g, ink, x: 117 + dx, y: 142 + dy, r: 24, JellyTriad(light: 0xE9FFF7, base: 0x7FE0C0, dark: 0x3FAE8E))
    jellyGlossBall(&g, ink, x: 273 + dx, y: 142 + dy, r: 24, JellyTriad(light: 0xFFF8D0, base: 0xFFD43A, dark: 0xD9A000))
    jellyGlossBall(&g, ink, x: 195 + dx, y: 92 + dy, r: 30, JellyTriad(light: 0xF2E8FF, base: 0xB994FF, dark: 0x7A4FD6))
    var pole = Path()
    pole.move(to: P(195, 62)); pole.addLine(to: P(195, 40))
    g.stroke(pole, with: .color(ink.c(0x8A5A7A)), lineWidth: 2)
    var flag = Path()
    flag.move(to: P(196, 40))
    flag.addQuadCurve(to: P(216, 40), control: P(208, 44))
    flag.addLine(to: P(214, 50))
    flag.addQuadCurve(to: P(196, 49), control: P(206, 52))
    flag.closeSubpath()
    g.fill(flag, with: .color(ink.c(0xFF6FA8)))
    for (wx, wy) in [(117.0, 182.0), (273.0, 182.0), (195.0, 140.0), (150.0, 206.0), (240.0, 206.0)] {
        g.fill(Path(roundedRect: CGRect(origin: P(wx - 6, wy - 9), size: CGSize(width: 12, height: 18)), cornerRadius: 5),
               with: .color(ink.c(0x8A4F8F)))
    }
    var door = Path()
    door.move(to: P(176, 262)); door.addLine(to: P(176, 214))
    door.addQuadCurve(to: P(214, 214), control: P(195, 190))
    door.addLine(to: P(214, 262)); door.closeSubpath()
    g.fill(door, with: .color(ink.c(0x6D3C74)))
    g.stroke(jellyArcPath(center: P(195, 230), r: 7, from: .pi, to: 2 * .pi, steps: 10),
             with: .color(ink.c(0xFFD43A)), style: StrokeStyle(lineWidth: 4, lineCap: .round))
    g.fill(Path(roundedRect: CGRect(origin: P(185, 229), size: CGSize(width: 20, height: 17)), cornerRadius: 4), with: .color(ink.c(0xFFC23A)))
    g.fill(jellyEllipse(195 + dx, 237 + dy, 2.4, 2.8), with: .color(ink.c(0x8A5A1A)))
    jellyRibbon(&g, ink, x: x, y: 22 + dy, text: "SUGAR CASTLE", col: 0xFF6FA8)
}

/// The page's `arch`: a white candy-cane gate around `(x, y)`, posts down
/// to y + 40, and the banner above (nudged by `shift` so it clears the
/// next stone).
func jellyArch(_ g: inout GraphicsContext, _ ink: JellyInk, x: CGFloat, y: CGFloat, r: CGFloat, banner: String, col: UInt32, shift: CGFloat = 0) {
    g.stroke(jellyArcPath(center: CGPoint(x: x, y: y + 4), r: r, from: .pi, to: 2 * .pi, steps: 24),
             with: .color(jellyRGBA(120, 40, 80, 0.18)), style: StrokeStyle(lineWidth: 18, lineCap: .butt))
    var frame = jellyArcPath(center: CGPoint(x: x, y: y), r: r, from: .pi, to: 2 * .pi, steps: 24)
    frame.move(to: CGPoint(x: x - r, y: y)); frame.addLine(to: CGPoint(x: x - r, y: y + 40))
    frame.move(to: CGPoint(x: x + r, y: y)); frame.addLine(to: CGPoint(x: x + r, y: y + 40))
    g.stroke(frame, with: .color(.white), style: StrokeStyle(lineWidth: 16, lineCap: .butt))
    g.stroke(frame, with: .color(ink.c(0xFF4D6D)), style: StrokeStyle(lineWidth: 16, lineCap: .butt, dash: [10, 10]))
    g.stroke(jellyArcPath(center: CGPoint(x: x, y: y), r: r - 4, from: 1.1 * .pi, to: 1.45 * .pi, steps: 10),
             with: .color(.white.opacity(0.55)), style: StrokeStyle(lineWidth: 4, lineCap: .round))
    jellyRibbon(&g, ink, x: x + shift, y: y - r - 44, text: banner, col: col)
}

/// The page's `star`: a ten-point star, lemon jelly when earned.
func jellyStarPath(x: CGFloat, y: CGFloat, r: CGFloat) -> Path {
    var p = Path()
    for k in 0..<10 {
        let a = -CGFloat.pi / 2 + CGFloat(k) * 2 * .pi / 10
        let rr = k % 2 == 1 ? r * 0.48 : r
        let pt = CGPoint(x: x + cos(a) * rr, y: y + sin(a) * rr)
        if k == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
    }
    p.closeSubpath()
    return p
}

func jellyStar(_ g: inout GraphicsContext, x: CGFloat, y: CGFloat, r: CGFloat, filled: Bool) {
    let p = jellyStarPath(x: x, y: y, r: r)
    if filled {
        g.fill(p, with: .radialGradient(Gradient(stops: [
            .init(color: Color(hex: 0xFFF6C2), location: 0),
            .init(color: Color(hex: 0xFFCF3A), location: 0.5),
            .init(color: Color(hex: 0xE59A00), location: 1),
        ]), center: CGPoint(x: x - r * 0.3, y: y - r * 0.4), startRadius: 0, endRadius: r))
        g.stroke(p, with: .color(jellyRGBA(200, 120, 0, 0.5)), lineWidth: 1)
    } else {
        g.fill(p, with: .color(.white.opacity(0.45)))
        g.stroke(p, with: .color(jellyRGBA(150, 110, 140, 0.3)), lineWidth: 1)
    }
}

enum JellyChestState { case locked, closed, open }

/// The page's `chest`, drawn with its base at the origin: a pink jelly box
/// with a lemon band; `lid` 0…1 swings the top open; grey + padlock when
/// locked, a gold ball lock while closed, a warm glow once open.
func jellyChest(_ g: inout GraphicsContext, _ ink: JellyInk, state: JellyChestState, lid: CGFloat) {
    let body = ink.triad(state == .locked ? .chestGrey : .chestPink)
    g.fill(jellyEllipse(0, 2, 22, 5), with: .color(jellyRGBA(60, 30, 60, 0.18)))
    if lid > 0.05 {
        g.fill(Path(ellipseIn: CGRect(x: -32, y: -46, width: 64, height: 60)),
               with: .radialGradient(Gradient(colors: [jellyRGBA(255, 230, 120, 0.8 * Double(lid)), jellyRGBA(255, 230, 120, 0)]),
                                     center: CGPoint(x: 0, y: -16), startRadius: 0, endRadius: 30))
    }
    g.fill(Path(roundedRect: CGRect(x: -18, y: -20, width: 36, height: 20), cornerRadius: 6),
           with: .linearGradient(Gradient(colors: [Color(hex: body.base), Color(hex: body.dark)]),
                                 startPoint: CGPoint(x: 0, y: -20), endPoint: .zero))
    g.fill(Path(CGRect(x: -18, y: -13, width: 36, height: 4)), with: .color(ink.c(state == .locked ? 0xB3A9C4 : 0xFFD43A)))
    var top = g
    top.translateBy(x: 0, y: -20)
    top.rotate(by: .radians(-lid * 0.9))
    top.fill(Path(roundedRect: CGRect(x: -19, y: -12, width: 38, height: 13), cornerRadius: 5),
             with: .linearGradient(Gradient(colors: [Color(hex: body.light), Color(hex: body.base)]),
                                   startPoint: CGPoint(x: 0, y: -12), endPoint: .zero))
    top.fill(jellyEllipse(-9, -8, 6, 2), with: .color(.white.opacity(0.7)))
    switch state {
    case .locked:
        g.stroke(jellyArcPath(center: CGPoint(x: 0, y: -12), r: 4, from: .pi, to: 2 * .pi, steps: 8),
                 with: .color(Color(hex: 0x8A809F)), style: StrokeStyle(lineWidth: 2.4, lineCap: .round))
        g.fill(Path(CGRect(x: -5, y: -12, width: 10, height: 8)), with: .color(Color(hex: 0x8A809F)))
    case .closed:
        jellyGlossBall(&g, ink, x: 0, y: -11, r: 4, .gold)
    case .open:
        break
    }
}

// MARK: - Critter seats

/// Where a critter sits on the map: `point` is where its feet touch (or,
/// floating, its centre line), `prop` the floe/rock the trail canvas draws
/// under it. Seats hug the sides, away from the trail, signs and chests.
struct JellyCritterSeat: Identifiable {
    enum Prop { case floe, rock }
    let critter: JellyCritter
    let point: CGPoint
    let size: CGFloat
    let floating: Bool
    let prop: Prop?
    var id: String { critter.rawValue }
}

/// The page's actors, re-seated on our zigzag: bunny, mushroom, hamster,
/// cat and a floating bee in the meadow; penguin (floe), octo (rock) and a
/// floating sprite in the lagoon; dragon, a floating bat and a cloud in the
/// peaks. Only the bands the map has.
func jellyCritterSeats(geo: PeckGeometry, width w: CGFloat) -> [JellyCritterSeat] {
    let n = geo.count
    let left: CGFloat = 40
    let right: CGFloat = w - 40
    func between(_ i: Int, _ frac: CGFloat = 0.5) -> CGFloat { geo.y(i) - geo.pitch * frac }
    var seats: [JellyCritterSeat] = []
    func seat(_ c: JellyCritter, _ x: CGFloat, _ y: CGFloat, _ size: CGFloat, floating: Bool = false, prop: JellyCritterSeat.Prop? = nil, needs: Int) {
        guard n >= needs else { return }
        seats.append(JellyCritterSeat(critter: c, point: CGPoint(x: x, y: y), size: size, floating: floating, prop: prop))
    }
    // Gumdrop Meadow (indices 0–9).
    seat(.bunny, left, between(1, 0.55), 52, needs: 3)
    seat(.mushroom, right, between(3, 0.5), 50, needs: 5)
    seat(.hamster, left, between(5, 0.45), 48, needs: 7)
    seat(.cat, right, between(7, 0.5), 50, needs: 9)
    seat(.bee, right - 6, between(0, 0.9), 46, floating: true, needs: 2)
    // Jelly Lagoon (10–19).
    seat(.penguin, left, between(12, 0.45), 50, prop: .floe, needs: 14)
    seat(.octo, right, between(15, 0.5), 50, prop: .rock, needs: 17)
    seat(.sprite, left + 8, between(17, 0.7), 46, floating: true, needs: 19)
    // Sprinkle Peaks (20–29).
    seat(.dragon, right, between(22, 0.5), 54, needs: 24)
    seat(.bat, left + 6, between(25, 0.6), 52, floating: true, needs: 27)
    seat(.cloud, right - 4, between(27, 0.8), 56, floating: true, needs: 29)
    return seats
}

// MARK: - SwiftUI pieces

/// The jelly squish — a little flatten that springs back.
struct JellySquish: ViewModifier {
    let amount: CGFloat
    func body(content: Content) -> some View {
        content.scaleEffect(x: 1 + 0.14 * amount, y: 1 - 0.14 * amount, anchor: .bottom)
    }
}

/// A sideways shake (a locked thing saying no).
struct JellyShake: GeometryEffect {
    var animatableData: CGFloat
    func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(CGAffineTransform(translationX: sin(animatableData * .pi * 6) * 6, y: 0))
    }
}

/// The page's ribbon as a view (the START tag under the current stone).
struct JellyRibbonView: View {
    let text: String
    var col: UInt32 = Jelly.ink
    var size: CGFloat = 13

    var body: some View {
        Text(text)
            .font(.custom("Fredoka", size: size).weight(.bold))
            .foregroundStyle(.white)
            .lineLimit(1)
            .truncationMode(.tail)
            .padding(.horizontal, 14)
            .frame(height: 24)
            .background {
                ZStack {
                    Capsule().fill(JellyInk.adaptive(Jelly.shade(col, 0.7))).offset(y: 3)
                    Capsule().fill(LinearGradient(colors: [JellyInk.adaptive(Jelly.tint(col, 0.3)), JellyInk.adaptive(col)],
                                                  startPoint: .top, endPoint: .bottom))
                    VStack {
                        Capsule().fill(.white.opacity(0.55)).frame(height: 5).padding(.horizontal, 8).padding(.top, 3)
                        Spacer()
                    }
                }
            }
    }
}

/// A star as a view, for the arcs over cleared stones.
struct JellyStarView: View {
    let filled: Bool
    var r: CGFloat = 8
    var body: some View {
        Canvas { ctx, size in
            var g = ctx
            jellyStar(&g, x: size.width / 2, y: size.height / 2, r: r, filled: filled)
        }
        .frame(width: r * 2 + 4, height: r * 2 + 4)
    }
}

/// One level stone as a jelly ball: lit from the upper left, a dark base
/// under it, the number in Fredoka. Current: lemon ring, pulsing halo and
/// a START ribbon beneath. Passed: a star arc. Locked: grey with a padlock,
/// and a shake instead of opening. Every tap squishes.
struct JellyNodeView: View {
    let level: JumboLevelInfo
    let isGate: Bool
    let nearLocked: Bool
    let region: JellyRegion
    let pulse: Bool
    let onOpen: () -> Void

    @Environment(\.colorScheme) private var scheme
    @State private var squish: CGFloat = 0
    @State private var shakes: CGFloat = 0

    private var isCurrent: Bool { level.status == "unlocked" }
    private var isPassed: Bool { level.status == "passed" }
    private var isLocked: Bool { level.status == "locked" }
    private var r: CGFloat {
        if isCurrent { return 42 }
        if isGate { return isPassed ? 40 : 36 }
        return isPassed ? 36 : 32
    }

    var body: some View {
        // Unlocked stones keep their day colours at night — they glow
        // against the moonlit world; locked ones sink into it.
        let tri = isLocked ? JellyInk(dark: scheme == .dark).triad(.locked) : region.node
        Button {
            if isLocked {
                FlashSFX.shared.play(.wrong)
                UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
                withAnimation(.linear(duration: 0.4)) { shakes += 1 }
                return
            }
            FlashSFX.shared.play(.tap)
            withAnimation(.spring(response: 0.16, dampingFraction: 0.5)) { squish = 1 }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.13) {
                withAnimation(.spring(response: 0.32, dampingFraction: 0.42)) { squish = 0 }
            }
            onOpen()
        } label: {
            ZStack {
                if isCurrent {
                    Circle()
                        .stroke(.white.opacity(pulse ? 0.18 : 0.55), lineWidth: 3)
                        .frame(width: (r + 12 + (pulse ? 10 : 0)) * 2, height: (r + 12 + (pulse ? 10 : 0)) * 2)
                        .offset(y: 3)
                    Circle()
                        .stroke(jellyRGBA(255, 210, 90, 0.9), lineWidth: 5)
                        .frame(width: (r + 7) * 2, height: (r + 7) * 2)
                        .offset(y: 3)
                }
                Ellipse()
                    .fill(jellyRGBA(60, 30, 60, 0.2))
                    .frame(width: r * 2.1, height: r * 0.68)
                    .offset(y: r * 0.62)
                Circle().fill(Color(hex: tri.dark)).frame(width: r * 2, height: r * 2).offset(y: 7)
                Circle()
                    .fill(RadialGradient(stops: [
                        .init(color: Color(hex: tri.light), location: 0),
                        .init(color: Color(hex: tri.base), location: 0.55),
                        .init(color: Color(hex: tri.dark), location: 1),
                    ], center: UnitPoint(x: 0.325, y: 0.275), startRadius: r * 0.05, endRadius: r * 1.25))
                    .frame(width: r * 2, height: r * 2)
                Circle()
                    .strokeBorder(LinearGradient(colors: [.white.opacity(0.6), .clear, jellyRGBA(80, 20, 60, 0.32)],
                                                 startPoint: .top, endPoint: .bottom), lineWidth: 6)
                    .blur(radius: 2.5)
                    .frame(width: r * 2, height: r * 2)
                    .clipShape(Circle())
                Ellipse()
                    .fill(RadialGradient(colors: [.white.opacity(0.9), .white.opacity(0)], center: .center, startRadius: 0, endRadius: r * 0.5))
                    .frame(width: r, height: r * 0.5)
                    .rotationEffect(.radians(-0.5))
                    .offset(x: -r * 0.3, y: -r * 0.45)
                Ellipse()
                    .fill(.white.opacity(0.95))
                    .frame(width: r * 0.18, height: r * 0.11)
                    .rotationEffect(.radians(-0.6))
                    .offset(x: -r * 0.5, y: -r * 0.42)

                if isLocked {
                    Image(systemName: "lock.fill")
                        .font(.system(size: r * 0.5, weight: .bold))
                        .foregroundStyle(jellyRGBA(90, 75, 110, 0.75))
                        .opacity(nearLocked ? 1 : 0.85)
                } else {
                    let fontSize = r * 0.9
                    Text("\(level.level)")
                        .font(.custom("Fredoka", size: fontSize).weight(.bold))
                        .foregroundStyle(.white.opacity(0.55))
                        .offset(y: 2.5)
                    Text("\(level.level)")
                        .font(.custom("Fredoka", size: fontSize).weight(.bold))
                        .foregroundStyle(Color(hex: Jelly.ink))
                        .offset(y: 1)
                }

                if isPassed {
                    ForEach(0..<3, id: \.self) { k in
                        let a = -Double.pi / 2 + Double(k - 1) * 0.55
                        JellyStarView(filled: k < level.stars, r: k == 1 ? 9 : 7.5)
                            .offset(x: CGFloat(cos(a)) * (r + 12), y: CGFloat(sin(a)) * (r + 12) + (k == 1 ? -2 : 0))
                    }
                    if isGate {
                        Image(systemName: "crown.fill")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(Color(hex: 0xFFD43A))
                            .shadow(color: Color(hex: 0x8A5A1A).opacity(0.35), radius: 1.5, y: 1)
                            .offset(y: -r - 30)
                    }
                }
                if isCurrent {
                    JellyRibbonView(text: "START")
                        .offset(y: r + 16 + 12)
                }
            }
            .modifier(JellySquish(amount: squish))
            .frame(width: r * 2 + 64, height: r * 2 + 110)
        }
        .buttonStyle(.plain)
        .modifier(JellyShake(animatableData: shakes))
        .opacity(isLocked ? (nearLocked ? 0.95 : 0.8) : 1)
        .accessibilityLabel("Level \(level.level), \(level.status)")
    }
}

/// A chest beside a level. Grey and locked until that level is passed;
/// pink with a gold lock once it is; a tap swings the lid open with a
/// burst of sprinkles — remembered on this device, no currency behind it.
struct JellyChestView: View {
    let level: Int
    let passed: Bool

    @Environment(\.colorScheme) private var scheme
    @State private var opened = false
    @State private var openedAt: Date? = nil
    @State private var animating = false
    @State private var shakes: CGFloat = 0
    @State private var squish: CGFloat = 0

    static let openedKey = "peckChestsOpened"
    static func openedLevels() -> Set<Int> {
        Set(UserDefaults.standard.array(forKey: openedKey) as? [Int] ?? [])
    }

    private var state: JellyChestState { !passed ? .locked : (opened ? .open : .closed) }

    var body: some View {
        Button {
            tap()
        } label: {
            TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: !animating)) { tl in
                Canvas { ctx, size in
                    let g = ctx
                    let ink = JellyInk(dark: scheme == .dark)
                    let elapsed = openedAt.map { CGFloat(tl.date.timeIntervalSince($0)) } ?? 10
                    let lid: CGFloat = state == .open ? (openedAt == nil ? 1 : easeOutBack(min(1, elapsed / 0.5))) : 0
                    var c = g
                    c.translateBy(x: size.width / 2, y: size.height - 22)
                    jellyChest(&c, ink, state: state, lid: lid)
                    // Sprinkles burst from the lid for a second.
                    if openedAt != nil && elapsed < 1.3 {
                        let u = elapsed / 1.3
                        for i in 0..<16 {
                            let fi = CGFloat(i)
                            let a = -CGFloat.pi * (0.1 + 0.8 * frac(fi * 0.618 + 0.3))
                            let v = 1.5 + 3 * frac(fi * 0.754)
                            let x = size.width / 2 + cos(a) * v * 34 * easeOutCubic(u)
                            let y = size.height - 40 + sin(a) * v * 34 * easeOutCubic(u) + 110 * u * u
                            var s = g
                            s.translateBy(x: x, y: y)
                            s.rotate(by: .radians(fi * 0.9 + u * 6))
                            s.fill(Path(roundedRect: CGRect(x: -4, y: -1.5, width: 8, height: 3), cornerRadius: 1.5),
                                   with: .color(Color(hex: Jelly.gdCols[i % 6]).opacity(1 - Double(u))))
                        }
                    }
                }
            }
            .frame(width: 140, height: 120)
            .contentShape(Rectangle().path(in: CGRect(x: 46, y: 70, width: 48, height: 46)))
        }
        .buttonStyle(.plain)
        .modifier(JellySquish(amount: squish))
        .modifier(JellyShake(animatableData: shakes))
        .allowsHitTesting(true)
        .onAppear { opened = Self.openedLevels().contains(level) }
        .accessibilityLabel(state == .locked ? "Chest, locked until level \(level) is cleared" : (opened ? "Open chest" : "Chest, tap to open"))
    }

    private func tap() {
        switch state {
        case .locked:
            FlashSFX.shared.play(.wrong)
            UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
            withAnimation(.linear(duration: 0.4)) { shakes += 1 }
        case .open:
            FlashSFX.shared.play(.tap)
            withAnimation(.spring(response: 0.16, dampingFraction: 0.5)) { squish = 1 }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.13) {
                withAnimation(.spring(response: 0.32, dampingFraction: 0.42)) { squish = 0 }
            }
        case .closed:
            FlashSFX.shared.play(.fanfare)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            opened = true
            openedAt = Date()
            animating = true
            var set = Self.openedLevels()
            set.insert(level)
            UserDefaults.standard.set(Array(set).sorted(), forKey: Self.openedKey)
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { animating = false }
        }
    }

    private func frac(_ v: CGFloat) -> CGFloat { v - v.rounded(.down) }
    private func easeOutCubic(_ u: CGFloat) -> CGFloat { 1 - pow(1 - u, 3) }
}

/// A critter seated on the map. Tap: it squishes (the > < frame) and
/// bloops. Long press: make it your avatar.
struct JellyCritterView: View {
    let seat: JellyCritterSeat

    @Environment(Session.self) private var session
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var squished = false
    @State private var squish: CGFloat = 0

    var body: some View {
        if seat.floating && !reduceMotion {
            TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { tl in
                let t = CGFloat(tl.date.timeIntervalSinceReferenceDate)
                let bob = 5 * sin(t * 1.3 + seat.point.x * 0.05)
                content.offset(y: bob)
            }
        } else {
            content
        }
    }

    private var content: some View {
        Button {
            poke()
        } label: {
            Image(squished ? seat.critter.squishImageName : seat.critter.imageName)
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: seat.size, height: seat.size)
        }
        .buttonStyle(.plain)
        .modifier(JellySquish(amount: squish))
        .contextMenu {
            Button {
                Task { try? await JellyAvatar.apply(seat.critter, session: session) }
            } label: {
                Label("Make this my avatar", systemImage: "person.crop.circle")
            }
        }
        .accessibilityLabel("\(seat.critter.name). Tap to poke, hold to make it your avatar.")
    }

    private func poke() {
        FlashSFX.shared.play(.tap)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        squished = true
        withAnimation(.spring(response: 0.16, dampingFraction: 0.5)) { squish = 1 }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.14) {
            withAnimation(.spring(response: 0.34, dampingFraction: 0.4)) { squish = 0 }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.36) { squished = false }
    }
}
