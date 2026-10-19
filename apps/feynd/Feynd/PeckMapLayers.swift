import SwiftUI
import UIKit

// The Peck map's native layers over the baked Living Island tiles (PeckWorld.swift): the trail,
// the live animation, the finale sky, critters, chests, signs and the landmarks you can poke.
//
// Stacking, bottom to top:
//   PWTileLayer        ground + landmarks (images)
//   PeckFinaleLayer    Sugar Castle's sky, the castle and its cloud bank above the last stone
//   PeckBackLayer      water life → the road, bridges, gates, signs, stepping stones → landmark motion
//   critters, chests, stones, the traveler (views, FlashTabView)
//   PeckFrontLayer     smoke, butterflies, fireflies… and the night glows
//   PWForeground       the leafy frame at 1.12 parallax
// Animated layers are cut into 355-pt chunks and only the chunks on screen exist, so the canvases
// stay small; everything freezes at t = 0 under Reduce Motion, in Low Power Mode, or off screen.

// MARK: - The map's state for one frame

struct PeckMapFrame {
    let geo: PeckGeometry
    let place: PWPlace
    let levels: [JumboLevelInfo]
    let currentIdx: Int?
    let devMode: Bool
    let dark: Bool
    /// yb of the highest point the map shows (under the finale).
    let maxYb: CGFloat

    var frontier: Int { currentIdx ?? geo.count }
    func world() -> PeckWorld { PeckWorld.shared }
}

/// Whether a live item reaches into the window: by its point list when it has one (rivers, cables,
/// star sets), else by its anchor and reach.
func peckVisible(_ i: PWItem, _ place: PWPlace, _ w: PWWindow) -> Bool {
    let pts = i.list("pts")
    if !pts.isEmpty {
        let ys = pts.map { place.y($0.y) }
        guard let lo = ys.min(), let hi = ys.max() else { return false }
        return hi > w.top - 80 && lo < w.bottom + 80
    }
    return w.contains(place.y(i.yb), pad: PWLive.reach(i))
}

/// Which chunk rows are on screen, from the scroll offset (content top at 0).
func peckRows(top: CGFloat, bottom: CGFloat, contentH: CGFloat) -> [Int] {
    let T: CGFloat = 355
    let lo = max(0, Int(floor(top / T))), hi = min(Int(ceil(contentH / T)) - 1, Int(floor(bottom / T)))
    return lo <= hi ? Array(lo...hi) : []
}

/// Taps on landmarks: the windmill spins up, the fire sparks, the lighthouse flashes, the whale
/// spouts, boats rock. One-shot, decaying over `duration`.
@Observable
final class PeckPokes {
    static let shared = PeckPokes()
    private(set) var at: [String: Date] = [:]
    func poke(_ key: String) { at[key] = Date() }
    func value(_ key: String, now: Date, duration: Double = 2.4) -> CGFloat {
        guard let d = at[key] else { return 0 }
        let e = now.timeIntervalSince(d)
        return e < duration ? CGFloat(1 - e / duration) : 0
    }
    static func pokeable(_ kind: String) -> Bool {
        ["windmill", "campfire", "beam", "spout", "boat", "ferry", "buoy"].contains(kind) || PWLiveExtra.pokeable(kind)
    }
    static func key(_ i: PWItem) -> String { "\(i.kind):\(Int(i.dx)):\(Int(i.yb))" }
}

/// Whether ambient motion runs at all.
struct PeckMotion {
    static var allowed: Bool { !ProcessInfo.processInfo.isLowPowerModeEnabled }
}

// MARK: - Back layer: water life, the road, landmark motion

struct PeckBackLayer: View {
    let frame: PeckMapFrame
    let rows: [Int]
    let animate: Bool
    var pokes = PeckPokes.shared

    var body: some View {
        let W = frame.world()
        let items = W.expand(W.live, maxYb: frame.maxYb).filter { PWLive.layer($0.kind) != .front }
        let back = items.filter { PWLive.layer($0.kind) == .back }
        let mid = items.filter { PWLive.layer($0.kind) == .mid }
        let gates = W.expand(W.gates, maxYb: frame.maxYb + 400)
        let bridges = W.expand(W.bridges, maxYb: frame.maxYb)
        let signs = W.expand(W.signs, maxYb: frame.maxYb + 200)
        PeckChunks(rows: rows, contentH: frame.place.contentH, width: frame.place.centerX * 2, animate: animate) { ctx, top, bottom, t, now in
            let win = PWWindow(top: top, bottom: bottom)
            // At night everything drawn here takes the tiles' moonlit filter, except what glows.
            var night = ctx
            if frame.dark { night.addFilter(.colorMatrix(PWC.duskMatrix)) }
            for i in back where visible(i, win) { PWLive.draw(night, i, frame.place, t, poke: 0) }
            PeckRoad.draw(night, frame, win, t: t)
            for b in bridges where win.contains(frame.place.y(b.yb), pad: 60) {
                let p = frame.place.pt(b)
                if !PWLiveExtra.bridge(night, b.s("style") ?? "plank", p.x, p.y, b.n("angle")) { PWTrail.bridge(night, p.x, p.y, b.n("angle")) }
            }
            PeckRoad.gates(night, frame, gates, win)
            PeckRoad.signs(night, frame, signs, win)
            for i in mid where visible(i, win) {
                PWLive.draw(PWLive.emissive(i.kind) ? ctx : night, i, frame.place, t, poke: pokes.value(PeckPokes.key(i), now: now))
            }
        }
    }
    private func visible(_ i: PWItem, _ w: PWWindow) -> Bool { peckVisible(i, frame.place, w) }
}

// MARK: - Front layer: things in the air, and the night glows

struct PeckFrontLayer: View {
    let frame: PeckMapFrame
    let rows: [Int]
    let animate: Bool
    var pokes = PeckPokes.shared

    var body: some View {
        let W = frame.world()
        let items = W.expand(W.live, maxYb: frame.maxYb).filter { PWLive.layer($0.kind) == .front }
        let glows = frame.dark ? W.expand(W.glows, maxYb: frame.maxYb) : []
        PeckChunks(rows: rows, contentH: frame.place.contentH, width: frame.place.centerX * 2, animate: animate) { ctx, top, bottom, t, now in
            let win = PWWindow(top: top, bottom: bottom)
            var night = ctx
            if frame.dark { night.addFilter(.colorMatrix(PWC.duskMatrix)) }
            for i in items where peckVisible(i, frame.place, win) {
                PWLive.draw(PWLive.emissive(i.kind) ? ctx : night, i, frame.place, t, poke: pokes.value(PeckPokes.key(i), now: now))
            }
            if !glows.isEmpty {
                var g = ctx; g.blendMode = .plusLighter
                for gl in glows where win.contains(frame.place.y(gl.yb), pad: gl.n("r", 20)) {
                    let p = frame.place.pt(gl), r = gl.n("r", 20) * (1 + 0.04 * sin(t * 1.7 + gl.dx))
                    let c = PWC.hex(gl.s("c"))
                    g.fill(pwCircle(p.x, p.y, r), with: .radialGradient(Gradient(colors: [PWC.c(c, 0.7), PWC.c(c, 0)]),
                                                                       center: p, startRadius: 0, endRadius: r))
                }
            }
        }
    }
}

/// Canvases for the given chunk rows, animated (30 fps) or still.
struct PeckChunks: View {
    let rows: [Int]
    let contentH: CGFloat
    let width: CGFloat
    let animate: Bool
    let draw: (GraphicsContext, CGFloat, CGFloat, CGFloat, Date) -> Void

    var body: some View {
        if animate {
            TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { tl in
                stack(t: CGFloat(tl.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 3600 * 6)), now: tl.date)
            }
        } else {
            stack(t: 0, now: .distantPast)
        }
    }

    private func stack(t: CGFloat, now: Date) -> some View {
        ZStack(alignment: .topLeading) {
            ForEach(rows, id: \.self) { r in
                let top = CGFloat(r) * 355
                Canvas { ctx, size in
                    var c = ctx
                    c.translateBy(x: 0, y: -top)
                    draw(c, top, top + size.height, t, now)
                }
                .frame(width: width, height: min(355, contentH - top))
                .position(x: width / 2, y: top + min(355, contentH - top) / 2)
            }
        }
        .frame(width: width, height: contentH, alignment: .topLeading)
        .allowsHitTesting(false)
    }
}

// MARK: - The road, gates and signs

enum PeckRoad {
    static func draw(_ g: GraphicsContext, _ f: PeckMapFrame, _ win: PWWindow, t: CGFloat) {
        let geo = f.geo, W = f.world()
        guard geo.count > 1 else { return }
        // the tail below level 1, always walked
        let s0 = geo.point(0)
        if win.contains(s0.y, pad: 300) {
            var tail = Path()
            tail.move(to: CGPoint(x: s0.x + 30, y: f.place.contentH + 40))
            tail.addQuadCurve(to: s0, control: CGPoint(x: s0.x + 2, y: s0.y + 120))
            PWTrail.ribbon(g, tail, PWTrail.RibbonStyle(W.region(band: 0)?.roadStyle ?? [:]))
        }
        // the last stretch: white dots from the top stone up to the castle door
        let last = geo.point(geo.count - 1)
        let door = CGPoint(x: geo.centerX, y: PeckFinale.castleBase + 8)
        if win.contains(last.y, pad: 400) {
            let steps = max(2, Int(hypot(door.x - last.x, door.y - last.y) / 18))
            for j in 1..<steps {
                let u = CGFloat(j) / CGFloat(steps)
                let p = CGPoint(x: last.x + (door.x - last.x) * u * u, y: last.y + (door.y - last.y) * u)
                if hypot(p.x - last.x, p.y - last.y) < 96 { continue }
                g.fill(pwCircle(p.x, p.y, 3.6), with: .color(.white.opacity(0.9)))
            }
        }
        for i in 0..<(geo.count - 1) {
            let a = geo.point(i), b = geo.point(i + 1)
            guard max(a.y, b.y) > win.top - 60, min(a.y, b.y) < win.bottom + 60 else { continue }
            let worn = i + 1 <= f.frontier
            if !worn {
                for j in 1..<9 {
                    let p = geo.pointOnSegment(i, CGFloat(j) / 9)
                    if hypot(p.x - a.x, p.y - a.y) < 46 || hypot(p.x - b.x, p.y - b.y) < 46 { continue }
                    g.fill(pwCircle(p.x, p.y, 3.6), with: .color(.white.opacity(0.85)))
                }
                continue
            }
            let region = W.region(index: i + 1)
            let road = region?.road ?? "ribbon"
            if road.hasPrefix("stones") {
                var R = PWRng(UInt32(500 + i))
                let seq = PWLiveExtra.stoneSet(road) ?? PWTrail.stoneSeq
                var k = (i * 5) % seq.count
                for j in 1..<9 {
                    let u = CGFloat(j) / 9
                    let p = geo.pointOnSegment(i, u), q = geo.pointOnSegment(i, min(1, u + 0.04))
                    if hypot(p.x - a.x, p.y - a.y) < 44 || hypot(p.x - b.x, p.y - b.y) < 44 { continue }
                    let ang = atan2(q.y - p.y, q.x - p.x)
                    let bob: CGFloat = t == 0 ? 0 : sin(t * 2 + CGFloat(i * 7 + j)) * 1.2
                    let jit = (R.next() - 0.5) * 5
                    PWTrail.stepPiece(g, seq[k % seq.count], p.x + jit * 0.3, p.y + bob, ang, &R)
                    k += 1
                }
            } else {
                PWTrail.ribbon(g, geo.trail(from: i, to: i + 1), PWTrail.RibbonStyle(region?.roadStyle ?? [:]))
            }
        }
    }

    static func gates(_ g: GraphicsContext, _ f: PeckMapFrame, _ gates: [PWItem], _ win: PWWindow) {
        let W = f.world()
        for gt in gates {
            let p = f.place.pt(gt)
            guard win.contains(p.y, pad: 120) else { continue }
            let to = Int(gt.n("to"))
            // the gate between chapter to-1 and to stands once that chapter's last stone is on the map
            guard f.geo.count >= to * W.CH else { continue }
            guard let from = W.region(band: to - 1) else { continue }
            // The art stands the gate at the chapter boundary, half a pitch under the next stone; the
            // app's stones are bigger than the art page's, so it steps 26 pt back down the road and
            // stands shorter, clear of both stones.
            let ang = gt.n("angle")
            let base = CGPoint(x: p.x - cos(ang) * 26, y: p.y - sin(ang) * 26)
            PWTrail.gate(g, base.x, base.y, text: from.gateText, board: from.gateBoard, ink: PWC.hex(from.gateInk), lift: -8)
        }
    }

    static func signs(_ g: GraphicsContext, _ f: PeckMapFrame, _ signs: [PWItem], _ win: PWWindow) {
        let W = f.world()
        for s in signs {
            let lvl = s.level
            guard lvl >= 1, lvl <= f.geo.count, lvl - 1 < f.levels.count else { continue }
            let p = PeckSigns.clear(f.place.pt(s), geo: f.geo, near: lvl - 1, sub: s.s("role") != "region")
            guard win.contains(p.y, pad: 80) else { continue }
            let level = f.levels[lvl - 1]
            let region = W.region(index: lvl - 1)
            let board = region?.signBoard ?? 0xB07A50, plate = region?.signPlate ?? 0xFBE9CC, ink = region?.signInk ?? 0x6B3E2A
            switch s.s("role") {
            case "region":
                PWTrail.woodSign(g, p.x, p.y, region?.title ?? "", board: board, plate: plate, ink: ink)
            case "rest":
                guard PeckMilestone.isRest(lvl) else { continue }
                let r0 = ((lvl - 1) / W.CH) * W.CH
                let cleared = max(0, min(W.CH, f.frontier - r0))
                let sub = level.status == "passed" ? "▶ play again" : f.devMode ? "▶ dev mode" : "\(cleared) of 10 cleared here"
                PWTrail.woodSign(g, p.x, p.y, PeckMilestone.restGame(lvl).name, sub: sub, board: board, plate: plate, ink: ink)
            case "film":
                guard level.status == "passed" || f.devMode else { continue }
                PWTrail.woodSign(g, p.x, p.y, "Pentimento", sub: level.status == "passed" ? "▶ the level 10 film" : "▶ dev mode", board: board, plate: plate, ink: ink)
            default: break
            }
        }
    }
}

/// Keeps a sign's plate off the stones. The art places signs for its smaller stones; the app's are
/// ~80 pt across with a star arc and a START ribbon, so a plate that would touch one slides sideways,
/// away from it.
enum PeckSigns {
    static func clear(_ foot: CGPoint, geo: PeckGeometry, near i: Int, sub: Bool) -> CGPoint {
        var p = foot
        let halfW: CGFloat = 56, top = foot.y - (sub ? 62 : 50), bottom = foot.y
        for _ in 0..<3 {
            var moved = false
            for k in max(0, i - 2)...min(geo.count - 1, i + 2) {
                let c = geo.point(k), r: CGFloat = 54
                // nearest point of the plate+post box to the stone's centre
                let nx = max(p.x - halfW, min(c.x, p.x + halfW)), ny = max(top, min(c.y, bottom))
                if hypot(nx - c.x, ny - c.y) < r {
                    let dir: CGFloat = p.x >= c.x ? 1 : -1
                    // slide until the plate's near edge is r away horizontally
                    p.x = c.x + dir * (halfW + r)
                    moved = true
                }
            }
            if !moved { break }
        }
        return p
    }
}

// MARK: - The finale: Sugar Castle above the last stone

struct PeckFinaleLayer: View {
    let width: CGFloat
    let topRegion: PWRegion?
    let dark: Bool

    var body: some View {
        Canvas { ctx, size in
            var g = ctx
            let ink = JellyInk(dark: dark)
            let sky = topRegion?.finaleSky ?? [0xFFC9A6, 0xFFD8C4, 0xF4DCF6]
            // The sky is opaque down to just under the cloud bank, then fades into the chapter's own art.
            let bottom = PeckFinale.bandTop + 20
            let fadeEnd = PeckFinale.bandTop + 130
            let low = sky.count > 2 ? sky[2] : sky[0]
            g.fill(Path(CGRect(x: 0, y: 0, width: size.width, height: bottom)),
                   with: .linearGradient(Gradient(stops: [
                       .init(color: ink.c(sky[0]), location: 0),
                       .init(color: ink.c(sky.count > 1 ? sky[1] : sky[0]), location: 0.55),
                       .init(color: ink.c(low), location: 1),
                   ]), startPoint: .zero, endPoint: CGPoint(x: 0, y: bottom)))
            g.fill(Path(CGRect(x: 0, y: bottom - 0.5, width: size.width, height: fadeEnd - bottom)),
                   with: .linearGradient(Gradient(colors: [ink.c(low), ink.c(low, 0)]),
                                         startPoint: CGPoint(x: 0, y: bottom), endPoint: CGPoint(x: 0, y: fadeEnd)))
            let night = topRegion?.night ?? false
            if night {
                // a few painted stars over a night castle
                var R = PWRng(77)
                for _ in 0..<40 {
                    let x = R.next() * size.width, y = R.next() * (bottom - 60), r = 0.6 + R.next() * 1.2
                    g.fill(pwCircle(x, y, r), with: .color(.white.opacity(Double(0.5 + R.next() * 0.4))))
                }
            }
            g.fill(Path(ellipseIn: CGRect(x: size.width * 0.77 - 140, y: 190 - 140, width: 280, height: 280)),
                   with: .radialGradient(Gradient(stops: [
                       .init(color: jellyRGBA(255, 240, 170, dark || night ? 0.5 : 0.95), location: 0),
                       .init(color: jellyRGBA(255, 220, 140, dark || night ? 0.3 : 0.6), location: 0.25),
                       .init(color: jellyRGBA(255, 200, 150, 0), location: 1),
                   ]), center: CGPoint(x: size.width * 0.77, y: 190), startRadius: 0, endRadius: 140))
            jellyCastle(&g, ink, x: size.width / 2, base: PeckFinale.castleBase)
            jellyCloudBank(&g, ink, y: PeckFinale.castleBase + 40, width: size.width)
        }
        .frame(width: width, height: PeckFinale.bandTop + 160)
        .allowsHitTesting(false)
    }
}

// MARK: - Poke targets

/// Invisible buttons over the landmarks you can poke (under the stones, so a stone always wins).
struct PeckPokeTargets: View {
    let frame: PeckMapFrame
    let window: PWWindow
    var pokes = PeckPokes.shared

    var body: some View {
        let W = frame.world()
        let items = W.expand(W.live, maxYb: frame.maxYb).filter { PeckPokes.pokeable($0.kind) && window.contains(frame.place.y($0.yb), pad: 40) }
        ZStack(alignment: .topLeading) {
            ForEach(items.indices, id: \.self) { k in
                let i = items[k]
                let p = frame.place.pt(i)
                let (w, h, dy) = target(i)
                Button {
                    FlashSFX.shared.play(sound(i.kind))
                    UIImpactFeedbackGenerator(style: .soft).impactOccurred()
                    pokes.poke(PeckPokes.key(i))
                } label: {
                    Color.clear.frame(width: w, height: h).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .position(x: p.x, y: p.y + dy)
                .accessibilityHidden(true)
            }
        }
        .frame(width: frame.place.centerX * 2, height: frame.place.contentH, alignment: .topLeading)
    }
    private func target(_ i: PWItem) -> (CGFloat, CGFloat, CGFloat) {
        switch i.kind {
        case "windmill": return (70, 120, 30)
        case "beam": return (40, 90, 30)
        case "spout": return (64, 36, 12)
        case "boat": return (56, 56, -18)
        case "ferry": return (52, 36, -8)
        case "campfire": return (40, 30, -6)
        default: return PWLiveExtra.target(i)
        }
    }
    private func sound(_ kind: String) -> FlashSFX.Effect {
        switch kind {
        case "windmill", "beam": return .boing
        case "campfire": return .pop
        default: return .squish
        }
    }
}

// MARK: - Critters from the manifest

struct PeckCritters: View {
    let frame: PeckMapFrame
    let window: PWWindow

    var body: some View {
        let W = frame.world()
        let seats = W.expand(W.critters, maxYb: frame.maxYb - 40).compactMap { i -> (PWItem, JellyCritter)? in
            guard let c = JellyCritter(rawValue: i.s("kind") ?? "") else { return nil }
            return window.contains(frame.place.y(i.yb), pad: 80) ? (i, c) : nil
        }
        ZStack(alignment: .topLeading) {
            ForEach(seats.indices, id: \.self) { k in
                let (i, c) = seats[k]
                let p = frame.place.pt(i)
                let size = i.n("size", 40)
                JellyCritterView(seat: JellyCritterSeat(critter: c, point: p, size: size, floating: i.raw["float"] as? Bool ?? false, prop: nil),
                                 loop: i.s("path") == "loop" ? CGSize(width: i.n("rx", 40), height: i.n("ry", 14)) : nil)
                    .position(x: p.x, y: p.y - size * 0.42)
            }
        }
        .frame(width: frame.place.centerX * 2, height: frame.place.contentH, alignment: .topLeading)
    }
}
