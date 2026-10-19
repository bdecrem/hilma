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
enum PeckRestGame {
    case peckOrPerish, deepDive

    var name: String { self == .deepDive ? "Deep Dive" : "Peck or Perish" }
    var signTitle: String { self == .deepDive ? "DEEP DIVE" : "PECK OR PERISH" }
}

enum PeckMilestone {
    static func isGate(_ level: Int) -> Bool { level % 10 == 0 }
    static func isRest(_ level: Int) -> Bool { level % 5 == 0 && !isGate(level) }
    /// Two chests a chapter: beside 3 and 7 in the meadow, then 2 and 6 into every chapter after
    /// it (12, 16, 22, 26, 32, …), where the Living Island art leaves them firm ground.
    static func hasChest(_ level: Int) -> Bool {
        let j = level % 10
        return level <= 10 ? (j == 3 || j == 7) : (j == 2 || j == 6)
    }
    /// The game at a rest stop: Peck or Perish at 5, 25, 45, …; Deep Dive at
    /// 15, 35, 55, … (a big payoff or game every five levels, 2026-10-02).
    static func restGame(_ level: Int) -> PeckRestGame { level % 20 == 15 ? .deepDive : .peckOrPerish }
    static func gateBanner(_ level: Int) -> String {
        JellyRegion.of(index: level - 1).gateBanner.text
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
