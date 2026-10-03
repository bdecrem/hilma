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

    /// Where the traveler's feet go: on top of the current stone, the way
    /// the jelly map page stands its dodo (the stone's number stays readable
    /// under it; the START ribbon hangs below the stone).
    func travelerPoint(current: Int) -> CGPoint {
        let p = point(max(0, min(current, count - 1)))
        return CGPoint(x: p.x, y: p.y - 30)
    }
}

/// The finale above the last level: Sugar Castle on a cloud bank. The
/// castle is ~240pt tall with its ribbon; it starts below the floating
/// chrome (≈130pt) when the map is scrolled to the very top, the cloud bank
/// sits under it, and the last stone's gate arch clears the clouds.
enum PeckFinale {
    /// The castle's ground line, in world points from the top.
    static let castleBase: CGFloat = 392
    /// Where the top region's own scenery begins (under the cloud bank).
    static let bandTop: CGFloat = 450
    /// World y of the last level's stone.
    static let topPad: CGFloat = 590
}

/// Level-node roles that give the trail its rhythm: gates every ten, rest
/// stops every five, a chest beside a few levels in each region.
enum PeckMilestone {
    static func isGate(_ level: Int) -> Bool { level % 10 == 0 }
    static func isRest(_ level: Int) -> Bool { level % 5 == 0 && !isGate(level) }
    static func hasChest(_ level: Int) -> Bool { [3, 7, 12, 16, 22, 26].contains(level) }
    static func gateBanner(_ level: Int) -> String {
        JellyRegion.of(index: level - 1).gateBanner.text
    }
}

/// The road layer: sits between the scenery and the level nodes. Draws the
/// sand islands under the lagoon's stones, the road in its three looks
/// (the candy ribbon in the meadow and the peaks, floating stepping stones
/// across the lagoon, white dots ahead of the frontier), the candy-cane
/// gates and the wooden signs. Chests are views (`JellyChestView`), placed
/// by FlashTabView.
struct PeckTrailLayer: View {
    let geo: PeckGeometry
    let levels: [JumboLevelInfo]
    let currentIdx: Int?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        if reduceMotion {
            PeckTrailCanvas(geo: geo, levels: levels, currentIdx: currentIdx, dark: scheme == .dark, t: 0)
        } else {
            TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
                PeckTrailCanvas(geo: geo, levels: levels, currentIdx: currentIdx, dark: scheme == .dark,
                                t: CGFloat(timeline.date.timeIntervalSinceReferenceDate))
            }
        }
    }
}

struct PeckTrailCanvas: View {
    let geo: PeckGeometry
    let levels: [JumboLevelInfo]
    let currentIdx: Int?
    var dark: Bool = false
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
        let ink = JellyInk(dark: dark)
        drawIslands(&ctx, ink, width: size.width)
        drawRoad(&ctx, ink)
        drawMilestones(&ctx, ink)
    }

    // MARK: islands

    /// A sand pad under every lagoon stone, and the floe / rock a lagoon
    /// critter sits on.
    private func drawIslands(_ ctx: inout GraphicsContext, _ ink: JellyInk, width: CGFloat) {
        for i in 0..<geo.count where JellyRegion.of(index: i) == .lagoon {
            let p = geo.point(i)
            jellyIsland(&ctx, ink, x: p.x, y: p.y + 22, rx: 64, ry: 24)
        }
        for seat in jellyCritterSeats(geo: geo, width: width) {
            guard let prop = seat.prop else { continue }
            switch prop {
            case .floe: jellyIsland(&ctx, ink, x: seat.point.x, y: seat.point.y + 4, rx: 34, ry: 12, .floe)
            case .rock: jellyIsland(&ctx, ink, x: seat.point.x, y: seat.point.y + 4, rx: 36, ry: 13, .rock)
            }
        }
    }

    // MARK: road

    private func drawRoad(_ ctx: inout GraphicsContext, _ ink: JellyInk) {
        let cur = frontier
        guard geo.count > 1 else { return }
        // The last stretch: white dots from the top stone up through the
        // clouds to the castle door.
        let last = geo.point(geo.count - 1)
        let door = CGPoint(x: geo.centerX, y: PeckFinale.castleBase + 8)
        let steps = max(2, Int(hypot(door.x - last.x, door.y - last.y) / 18))
        for j in 1..<steps {
            let u = CGFloat(j) / CGFloat(steps)
            // Ease the x so the dots leave the stone straight up, then bend to the door.
            let p = CGPoint(x: last.x + (door.x - last.x) * u * u, y: last.y + (door.y - last.y) * u)
            if hypot(p.x - last.x, p.y - last.y) < 96 { continue }   // under the stone and its gate banner
            ctx.fill(Path(ellipseIn: CGRect(x: p.x - 3.6, y: p.y - 3.6, width: 7.2, height: 7.2)),
                     with: .color(.white.opacity(0.9)))
        }
        for i in 0..<(geo.count - 1) {
            let a = geo.point(i), b = geo.point(i + 1)
            let worn = i + 1 <= cur
            if !worn {
                // Ahead: white dots every 18pt, none under a stone.
                var j = 1
                let n = 9
                while j < n {
                    let p = geo.pointOnSegment(i, CGFloat(j) / CGFloat(n))
                    j += 1
                    if hypot(p.x - a.x, p.y - a.y) < 46 || hypot(p.x - b.x, p.y - b.y) < 46 { continue }
                    ctx.fill(Path(ellipseIn: CGRect(x: p.x - 3.6, y: p.y - 3.6, width: 7.2, height: 7.2)),
                             with: .color(.white.opacity(0.85)))
                }
                continue
            }
            if JellyRegion.of(index: i + 1) == .lagoon {
                // Floating stepping stones, bobbing on the water.
                let n = 8
                for j in 1..<n {
                    let p = geo.pointOnSegment(i, CGFloat(j) / CGFloat(n))
                    if hypot(p.x - a.x, p.y - a.y) < 50 || hypot(p.x - b.x, p.y - b.y) < 50 { continue }
                    let bob: CGFloat = t == 0 ? 0 : sin(t * 2 + CGFloat(i * 7 + j)) * 1.2
                    ctx.fill(jellyEllipse(p.x, p.y + 4 + bob, 11, 5), with: .color(jellyRGBA(30, 110, 140, 0.2)))
                    jellyGlossBall(&ctx, ink, x: p.x, y: p.y + bob, r: 8, .stone)
                }
                continue
            }
            // The candy ribbon road.
            let seg = geo.trail(from: i, to: i + 1)
            ctx.stroke(seg, with: .color(jellyRGBA(150, 90, 60, 0.18)), style: StrokeStyle(lineWidth: 34, lineCap: .round, lineJoin: .round))
            ctx.stroke(seg, with: .color(ink.c(0xF1C99F)), style: StrokeStyle(lineWidth: 28, lineCap: .round, lineJoin: .round))
            ctx.stroke(seg, with: .color(ink.c(0xFFF2DF)), style: StrokeStyle(lineWidth: 22, lineCap: .round, lineJoin: .round))
            ctx.stroke(seg, with: .color(ink.c(0xFFA9CF)), style: StrokeStyle(lineWidth: 5, lineCap: .round, dash: [9, 13]))
        }
    }

    // MARK: milestones

    private func drawMilestones(_ ctx: inout GraphicsContext, _ ink: JellyInk) {
        let cur = frontier
        for (i, level) in levels.enumerated() where i < geo.count {
            let p = geo.point(i)
            let lvl = level.level
            let side: CGFloat = geo.zig(i) > 0 ? -1 : 1
            // A region's name on a sign: by the first stone for the meadow
            // (the start of the trail), and two stones past the gate for the
            // regions after it — the gate's banner already names the region
            // at its first stone, and a name sign right beside it read as a
            // duplicate (2026-10-02). Stone 3 of a region is a centre stone,
            // with no chest (chests sit at 3, 7, 12, 16, 22, 26) and the
            // rest-stop sign two stones further.
            if i == 0 || (i >= 10 && i % 10 == 2) {
                // Beside the stone, away from the next one up the trail.
                let next = i + 1 < geo.count ? geo.zig(i + 1) : 0
                let away: CGFloat = next < 0 ? 1 : -1
                jellySign(&ctx, ink, x: p.x + away * 106, y: p.y + 8, text: JellyRegion.of(index: i).signName)
            }
            if PeckMilestone.isGate(lvl) {
                let banner = JellyRegion.of(index: i).gateBanner
                // With the traveler standing on the gate stone, the ribbon
                // rises 40pt so the dodo's head is not under it.
                jellyArch(&ctx, ink, x: p.x, y: p.y, r: 70, banner: banner.text, col: banner.col, shift: geo.zig(i) * 34,
                          lift: i == cur ? 40 : 0)
            }
            if PeckMilestone.isRest(lvl) {
                let r0 = (i / 10) * 10
                let cleared = max(0, min(10, cur - r0))
                // A cleared rest stop's sign is the way back into its game
                // (FlashTabView puts the tap target over it).
                jellySign(&ctx, ink, x: p.x + side * 78, y: p.y + 20, text: "PECK OR PERISH",
                          sub: level.status == "passed" ? "▶ play again" : "\(cleared) of 10 cleared here")
            }
            // Level 10 pays off with a film; once cleared, its sign replays it
            // (FlashTabView puts the tap target over it).
            if lvl == 10 && level.status == "passed" {
                jellySign(&ctx, ink, x: p.x + side * 112, y: p.y + 30, text: "PENTIMENTO", sub: "▶ the level 10 film")
            }
        }
    }
}

/// Small star used on the level stones' arcs (Canvas-free, so it can live
/// inside a button). Lemon jelly when earned.
struct PeckStar: View {
    let filled: Bool
    var size: CGFloat = 15
    var body: some View {
        JellyStarView(filled: filled, r: size * 0.55)
    }
}
