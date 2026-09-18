import SwiftUI

/// Shared geometry for the Peck map — one source of truth for where level
/// nodes, the road, the traveler, and the scenery's landmarks sit.
/// y(i) = height - bottomPad - i * pitch; x(i) = centerX + zig(i) * amp.
struct PeckGeometry {
    let count: Int
    let pitch: CGFloat
    let topPad: CGFloat
    let bottomPad: CGFloat
    let centerX: CGFloat
    let amp: CGFloat

    var height: CGFloat { topPad + CGFloat(max(0, count - 1)) * pitch + bottomPad }

    /// -1, 0, +1, 0, … period-4 zigzag keeps the path snaking without ever
    /// leaving a phone-width column.
    func zig(_ i: Int) -> CGFloat {
        switch i % 4 {
        case 0: return 0
        case 1: return -1
        case 2: return 0
        default: return 1
        }
    }

    func x(_ i: Int) -> CGFloat { centerX + zig(i) * amp }
    func y(_ i: Int) -> CGFloat { height - bottomPad - CGFloat(i) * pitch }
    func point(_ i: Int) -> CGPoint { CGPoint(x: x(i), y: y(i)) }

    /// The trail between consecutive nodes: two quad curves through the
    /// midpoint (the shape the dotted path has always used).
    func trail(from: Int, to: Int) -> Path {
        var path = Path()
        guard from <= to, from >= 0, to < count else { return path }
        var p0 = point(from)
        path.move(to: p0)
        if to > from {
            for i in (from + 1)...to {
                let p = point(i)
                let mid = CGPoint(x: (p0.x + p.x) / 2, y: (p0.y + p.y) / 2)
                path.addQuadCurve(to: mid, control: CGPoint(x: p0.x, y: mid.y + pitch * 0.18))
                path.addQuadCurve(to: p, control: CGPoint(x: p.x, y: mid.y - pitch * 0.18))
                p0 = p
            }
        }
        return path
    }

    /// A point along the segment from node i to node i+1, u in 0...1.
    func pointOnSegment(_ i: Int, _ u: CGFloat) -> CGPoint {
        let a = point(i), b = point(min(i + 1, count - 1))
        let mid = CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2)
        func quad(_ p0: CGPoint, _ c: CGPoint, _ p1: CGPoint, _ t: CGFloat) -> CGPoint {
            let s = 1 - t
            return CGPoint(x: s * s * p0.x + 2 * s * t * c.x + t * t * p1.x,
                           y: s * s * p0.y + 2 * s * t * c.y + t * t * p1.y)
        }
        if u < 0.5 {
            return quad(a, CGPoint(x: a.x, y: mid.y + pitch * 0.18), mid, u * 2)
        }
        return quad(mid, CGPoint(x: b.x, y: mid.y - pitch * 0.18), b, (u - 0.5) * 2)
    }

    /// Which segment carries the rope bridge (the Fern Hollow gorge), if
    /// the map is tall enough to have one.
    var bridgeSegment: Int? { count > 16 ? 14 : nil }

    /// Where the traveler stands: on the road just below the current stone.
    func travelerPoint(current: Int) -> CGPoint {
        if current <= 0 {
            let p = point(0)
            return CGPoint(x: max(34, p.x - 72), y: p.y + 40)
        }
        let p = pointOnSegment(current - 1, 0.42)
        return CGPoint(x: p.x, y: p.y - 6)
    }
}

/// Level-node roles that give the trail its rhythm: gates every ten, rest
/// stops every five, a chest beside a few levels in each region.
enum PeckMilestone {
    static func isGate(_ level: Int) -> Bool { level % 10 == 0 }
    static func isRest(_ level: Int) -> Bool { level % 5 == 0 && !isGate(level) }
    static func hasChest(_ level: Int) -> Bool { [3, 7, 12, 16, 22, 26].contains(level) }
    static func gateBanner(_ level: Int) -> String {
        switch level {
        case 10: return "TO FERN HOLLOW"
        case 20: return "TO STARFALL SUMMIT"
        default: return "TO THE SEA"
        }
    }
}

/// The road layer: sits between the scenery and the level nodes. Draws the
/// gorge and rope bridge, the road in its three states (worn, stepping
/// stones, fogged), footprints, gate arches, rest-stop signposts, chests,
/// and the fog bank over locked territory.
struct PeckTrailLayer: View {
    let geo: PeckGeometry
    let levels: [JumboLevelInfo]
    let currentIdx: Int?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if reduceMotion {
            PeckTrailCanvas(geo: geo, levels: levels, currentIdx: currentIdx, t: 0)
        } else {
            TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
                PeckTrailCanvas(geo: geo, levels: levels, currentIdx: currentIdx,
                                t: CGFloat(timeline.date.timeIntervalSinceReferenceDate))
            }
        }
    }
}

struct PeckTrailCanvas: View {
    let geo: PeckGeometry
    let levels: [JumboLevelInfo]
    let currentIdx: Int?
    let t: CGFloat

    /// Frontier: the current level, or one past the last level when all
    /// are cleared.
    private var frontier: Int { currentIdx ?? geo.count }

    var body: some View {
        Canvas { ctx, size in
            drawTrail(ctx, size: size)
        }
        .frame(height: geo.height)
    }

    private func drawTrail(_ context: GraphicsContext, size: CGSize) {
        var ctx = context
        let w = size.width
        let cur = frontier

        if let b = geo.bridgeSegment { drawGorge(&ctx, segment: b) }
        drawRoad(&ctx, width: w)
        if let b = geo.bridgeSegment { drawBridge(&ctx, segment: b) }
        drawFog(&ctx, width: w)
        drawMilestones(&ctx, current: cur)
    }

    // MARK: road

    private func drawRoad(_ ctx: inout GraphicsContext, width w: CGFloat) {
        let cur = frontier
        // Fogged: faint pebble dots from the frontier onward.
        if cur < geo.count - 1 {
            ctx.stroke(geo.trail(from: cur, to: geo.count - 1),
                       with: .color(Color(hex: 0xFFFDF4).opacity(0.32)),
                       style: StrokeStyle(lineWidth: 7, lineCap: .round, dash: [0.1, 17]))
        }
        // Worn: an edged road, one segment at a time so each band keeps
        // its own dirt color.
        if cur >= 2 {
            for i in 0..<(cur - 1) {
                let skin = regionSkin((i + 1) / 10)
                let seg = geo.trail(from: i, to: i + 1)
                ctx.stroke(seg, with: .color(Color(hex: skin.roadEdge)),
                           style: StrokeStyle(lineWidth: 17, lineCap: .round, lineJoin: .round))
                ctx.stroke(seg, with: .color(Color(hex: skin.road)),
                           style: StrokeStyle(lineWidth: 11, lineCap: .round, lineJoin: .round))
            }
        }
        // Stepping stones up to the current stone.
        if cur >= 1 && cur < geo.count {
            let skin = regionSkin(cur / 10)
            for j in 1...5 {
                let p = geo.pointOnSegment(cur - 1, CGFloat(j) / 6)
                ctx.fill(Path(ellipseIn: CGRect(x: p.x - 9, y: p.y - 4, width: 18, height: 12)),
                         with: .color(Color(hex: skin.roadEdge).opacity(0.5)))
                ctx.fill(Path(ellipseIn: CGRect(x: p.x - 9, y: p.y - 6, width: 18, height: 12)),
                         with: .color(Color(hex: skin.road)))
            }
        }
        // Footprints on the last two worn stretches.
        if cur >= 2 {
            for i in max(0, cur - 3)..<(cur - 1) {
                for j in 1..<7 {
                    let u = CGFloat(j) / 7
                    let p = geo.pointOnSegment(i, u)
                    let q = geo.pointOnSegment(i, min(1, u + 0.02))
                    var g = ctx
                    g.translateBy(x: p.x + (j % 2 == 1 ? -4 : 4), y: p.y)
                    g.rotate(by: .radians(atan2(q.y - p.y, q.x - p.x)))
                    g.fill(Path(ellipseIn: CGRect(x: -2.2, y: -3.6, width: 4.4, height: 7.2)),
                           with: .color(Color(hex: 0x5A3C1E).opacity(0.35)))
                }
            }
        }
    }

    // MARK: gorge + bridge

    private func drawGorge(_ ctx: inout GraphicsContext, segment i: Int) {
        let p = geo.pointOnSegment(i, 0.5)
        ctx.fill(Path(ellipseIn: CGRect(x: p.x - 92, y: p.y - 20, width: 184, height: 52)),
                 with: .color(Color(hex: 0x2B3F2E)))
        ctx.fill(Path(ellipseIn: CGRect(x: p.x - 70, y: p.y - 8, width: 140, height: 32)),
                 with: .color(Color(hex: 0x1E2E22)))
    }

    private func drawBridge(_ ctx: inout GraphicsContext, segment i: Int) {
        let n = 14
        for s in 0...n {
            let u = 0.2 + 0.6 * CGFloat(s) / CGFloat(n)
            let p = geo.pointOnSegment(i, u)
            let q = geo.pointOnSegment(i, min(1, u + 0.02))
            var g = ctx
            g.translateBy(x: p.x, y: p.y)
            g.rotate(by: .radians(atan2(q.y - p.y, q.x - p.x)))
            g.fill(Path(roundedRect: CGRect(x: -4, y: -11, width: 8, height: 22), cornerRadius: 2),
                   with: .color(Color(hex: s % 2 == 1 ? 0xB78B5A : 0xA57A4C)))
        }
        for side: CGFloat in [-12, 12] {
            var rope = Path()
            for s in 0...n {
                let p = geo.pointOnSegment(i, 0.2 + 0.6 * CGFloat(s) / CGFloat(n))
                let pt = CGPoint(x: p.x + side, y: p.y - 14)
                if s == 0 { rope.move(to: pt) } else { rope.addLine(to: pt) }
            }
            ctx.stroke(rope, with: .color(Color(hex: 0x5C4632)), lineWidth: 2)
        }
    }

    // MARK: fog

    private func drawFog(_ ctx: inout GraphicsContext, width w: CGFloat) {
        let cur = frontier
        guard cur + 1 < geo.count else { return }
        let fogTop = geo.y(cur + 1) - 40
        let breathe: CGFloat = t == 0 ? 0 : sin(t * 0.9) * 8
        let fogBottom = fogTop + 60 + breathe
        // The sea-and-sky finale (top 350pt of the world) stays clear — the
        // fog is a bank over the hills, not a whiteout of the horizon.
        let top: CGFloat = 310
        guard fogBottom > top else { return }
        let cream = Color(hex: 0xFFFBF0)
        ctx.fill(Path(CGRect(x: 0, y: top, width: w, height: max(0, fogBottom - top))),
                 with: .linearGradient(
                    Gradient(stops: [
                        .init(color: cream.opacity(0), location: 0),
                        .init(color: cream.opacity(0.55), location: 0.35),
                        .init(color: cream.opacity(0.78), location: 1),
                    ]),
                    startPoint: CGPoint(x: 0, y: fogBottom),
                    endPoint: CGPoint(x: 0, y: fogTop - 300)))
        for i in 0..<6 {
            let fi = CGFloat(i)
            let drift: CGFloat = t == 0 ? 0 : 14 * sin(t * 0.3 + fi)
            let x = w * frac(fi * 0.618 + 0.1) + drift
            let y = fogTop - 30 - fi * 120 + breathe
            guard y > top else { continue }
            ctx.fill(Path(ellipseIn: CGRect(x: x - 90, y: y - 22, width: 180, height: 44)),
                     with: .color(cream.opacity(0.35)))
        }
    }

    // MARK: milestones

    private func drawMilestones(_ ctx: inout GraphicsContext, current cur: Int) {
        for (i, level) in levels.enumerated() where i < geo.count {
            let p = geo.point(i)
            let lvl = level.level
            let side: CGFloat = geo.zig(i) > 0 ? -1 : 1
            if PeckMilestone.isGate(lvl) {
                drawArch(&ctx, at: p, level: lvl, band: min(2, i / 10 + 1))
            }
            if PeckMilestone.isRest(lvl) {
                let r0 = (i / 10) * 10
                let cleared = max(0, min(10, cur - r0))
                drawSignpost(&ctx, at: CGPoint(x: p.x + side * 78, y: p.y + 20),
                             title: "REST STOP", sub: "\(cleared) of 10 cleared here")
            }
            if PeckMilestone.hasChest(lvl) {
                drawChest(&ctx, at: CGPoint(x: p.x + side * 60, y: p.y + 16),
                          open: level.status == "passed")
            }
        }
    }

    private func drawArch(_ ctx: inout GraphicsContext, at p: CGPoint, level: Int, band: Int) {
        let wood = Color(hex: 0x8A6B4A)
        var arc = Path()
        arc.addArc(center: CGPoint(x: p.x, y: p.y - 6), radius: 62,
                   startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false)
        ctx.stroke(arc, with: .color(wood), lineWidth: 12)
        var posts = Path()
        posts.move(to: CGPoint(x: p.x - 62, y: p.y - 6)); posts.addLine(to: CGPoint(x: p.x - 62, y: p.y + 34))
        posts.move(to: CGPoint(x: p.x + 62, y: p.y - 6)); posts.addLine(to: CGPoint(x: p.x + 62, y: p.y + 34))
        ctx.stroke(posts, with: .color(wood), lineWidth: 12)
        let night = regionSkin(band).pines
        ctx.fill(Path(roundedRect: CGRect(x: p.x - 58, y: p.y - 92, width: 116, height: 24), cornerRadius: 7),
                 with: .color(Color(hex: night ? 0x1B2A38 : 0xC9821F)))
        ctx.draw(Text(PeckMilestone.gateBanner(level))
                    .font(.custom("Fredoka", size: 11).weight(.semibold))
                    .foregroundStyle(Color(hex: 0xFFF6E0)),
                 at: CGPoint(x: p.x, y: p.y - 80))
    }

    private func drawSignpost(_ ctx: inout GraphicsContext, at p: CGPoint, title: String, sub: String) {
        ctx.fill(Path(roundedRect: CGRect(x: p.x - 3, y: p.y - 54, width: 6, height: 56), cornerRadius: 2),
                 with: .color(Color(hex: 0x8A6B4A)))
        ctx.fill(Path(roundedRect: CGRect(x: p.x - 46, y: p.y - 58, width: 92, height: 30), cornerRadius: 6),
                 with: .color(Color(hex: 0xB78B5A)))
        ctx.fill(Path(roundedRect: CGRect(x: p.x - 46, y: p.y - 58, width: 92, height: 4), cornerRadius: 2),
                 with: .color(.white.opacity(0.25)))
        ctx.draw(Text(title).font(.custom("Fredoka", size: 11).weight(.semibold))
                    .foregroundStyle(Color(hex: 0x3E3324)),
                 at: CGPoint(x: p.x, y: p.y - 49))
        ctx.draw(Text(sub).font(.custom("Fredoka", size: 9.5).weight(.medium))
                    .foregroundStyle(Color(hex: 0x5C4632)),
                 at: CGPoint(x: p.x, y: p.y - 37))
    }

    private func drawChest(_ ctx: inout GraphicsContext, at p: CGPoint, open: Bool) {
        ctx.fill(Path(ellipseIn: CGRect(x: p.x - 16, y: p.y + 1, width: 32, height: 10)),
                 with: .color(.black.opacity(0.18)))
        ctx.fill(Path(roundedRect: CGRect(x: p.x - 14, y: p.y - 8, width: 28, height: 16), cornerRadius: 4),
                 with: .color(Color(hex: 0x8A6B4A)))
        if open {
            ctx.fill(Path(roundedRect: CGRect(x: p.x - 14, y: p.y - 20, width: 28, height: 10), cornerRadius: 4),
                     with: .color(Color(hex: 0x6B4A2E)))
            ctx.fill(Path(ellipseIn: CGRect(x: p.x - 5, y: p.y - 11, width: 10, height: 10)),
                     with: .color(Color(hex: 0xFFD98A)))
            ctx.fill(Path(ellipseIn: CGRect(x: p.x - 10, y: p.y - 7, width: 6, height: 6)),
                     with: .color(Color(hex: 0xF0A830)))
            ctx.fill(Path(ellipseIn: CGRect(x: p.x + 4, y: p.y - 7, width: 6, height: 6)),
                     with: .color(Color(hex: 0xF0A830)))
        } else {
            ctx.fill(Path(roundedRect: CGRect(x: p.x - 14, y: p.y - 14, width: 28, height: 10), cornerRadius: 4),
                     with: .color(Color(hex: 0xA57A4C)))
            ctx.fill(Path(roundedRect: CGRect(x: p.x - 3, y: p.y - 8, width: 6, height: 7), cornerRadius: 1.5),
                     with: .color(Color(hex: 0xF0A830)))
        }
    }

    private func frac(_ v: CGFloat) -> CGFloat { v - v.rounded(.down) }
}

/// Small star used on the chunky level stones (Canvas-free, so it can live
/// inside the node button).
struct PeckStar: View {
    let filled: Bool
    var size: CGFloat = 15
    var body: some View {
        Image(systemName: "star.fill")
            .font(.system(size: size, weight: .bold))
            .foregroundStyle(filled ? Color(hex: 0xF0A830) : Color(hex: 0x3E3324).opacity(0.28))
            .overlay {
                if filled {
                    Image(systemName: "star.fill")
                        .font(.system(size: size * 0.55, weight: .bold))
                        .foregroundStyle(Color(hex: 0xFFD98A))
                        .offset(y: -size * 0.04)
                }
            }
            .shadow(color: .black.opacity(filled ? 0.25 : 0), radius: 1.5, y: 1)
    }
}
