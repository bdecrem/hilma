import SwiftUI
import UIKit
import CoreImage

// Living Island — the Peck map's world, painted in code and baked to tiles.
//
// The art lives in misc/dodo-redesign/living-island/world/ (Canvas 2D, one file per chapter of ten
// levels, the same trail maths as PeckGeometry). scripts/peck-world/render.mjs renders it into this
// bundle: `pw-g-NN.jpg` ground tiles (terrain + landmarks, 355 pt rows from the art's bottom edge
// at 3×), `pw-fg-NNN.png` foreground sprites (the leafy frame at the screen edges, 1.12 parallax),
// and `pw-manifest.json`, which places everything native: live animation, critters, chests, signs,
// gates, bridges, night glows, and each chapter's colours. Re-render after any art change.
//
// Coordinates: the art is a 520-pt strip centred on the trail; the manifest stores x as `dx` from
// the centre and y as `yb`, points up from the art's bottom edge, which is the bottom of the map's
// content (the stones' bottom pad plus the spacer under them). Bands 6 and 7 (levels 61–80) repeat
// for every level above them.

// MARK: - Manifest

/// One manifest entry: a kind plus loose parameters, read through typed accessors.
struct PWItem {
    let kind: String
    let dx: CGFloat
    let yb: CGFloat
    let raw: [String: Any]

    init(_ d: [String: Any]) {
        raw = d
        kind = d["kind"] as? String ?? ""
        dx = PWItem.num(d["dx"]) ?? 0
        yb = PWItem.num(d["yb"]) ?? (PWItem.pts(d["pts"]).first?.y ?? 0)
    }
    static func num(_ v: Any?) -> CGFloat? {
        if let n = v as? NSNumber { return CGFloat(truncating: n) }
        return nil
    }
    static func pts(_ v: Any?) -> [CGPoint] {
        (v as? [[Any]] ?? []).compactMap { a in
            guard a.count == 2, let x = num(a[0]), let y = num(a[1]) else { return nil }
            return CGPoint(x: x, y: y)
        }
    }
    func n(_ k: String, _ d: CGFloat = 0) -> CGFloat { PWItem.num(raw[k]) ?? d }
    func s(_ k: String) -> String? { raw[k] as? String }
    func p(_ k: String) -> CGPoint? { PWItem.pts([raw[k] as Any]).first }
    func list(_ k: String) -> [CGPoint] { PWItem.pts(raw[k]) }
    var level: Int { Int(n("level")) }

    /// A copy moved up by `dy` (loop bands), keeping parameters.
    func shifted(_ dy: CGFloat, levels: Int) -> PWItem {
        var d = raw
        if let y = PWItem.num(d["yb"]) { d["yb"] = NSNumber(value: Double(y + dy)) }
        if let lv = PWItem.num(d["level"]) { d["level"] = NSNumber(value: Double(lv) + Double(levels)) }
        for (k, v) in d {
            if let a = v as? [[Any]], a.first?.count == 2 {
                d[k] = a.map { [$0[0], NSNumber(value: Double(PWItem.num($0[1]) ?? 0) + Double(dy))] }
            } else if let a = v as? [Any], a.count == 2, PWItem.num(a[0]) != nil, k != "kind" {
                d[k] = [a[0], NSNumber(value: Double(PWItem.num(a[1]) ?? 0) + Double(dy))]
            }
        }
        return PWItem(d)
    }
}

struct PWRegion {
    let id: String
    let name: String
    let title: String
    let road: String
    let night: Bool
    let node: JellyTriad
    let gateText: String
    let gateBoard: UInt32
    let gateInk: String
    let signBoard: UInt32?
    let signPlate: UInt32?
    let signInk: UInt32?
    let finaleSky: [UInt32]
    let edge: UInt32
    let roadStyle: [String: String]
}

struct PWSprite {
    let file: String
    let side: CGFloat
    let x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat
    let lb: CGFloat
    let band: Int
}

/// The world as the renderer left it. Loaded once.
final class PeckWorld {
    static let shared = PeckWorld()

    let ok: Bool
    let DW: CGFloat, P: CGFloat, AMP: CGFloat, BOT: CGFloat, SPACER: CGFloat
    let CH: Int, NB: Int, loopFrom: Int
    let tileT: CGFloat, tileOrigin: CGFloat, tileCount: Int, tileScale: CGFloat, loopTile: Int
    let FGK: CGFloat
    let live: [PWItem]
    let glows: [PWItem]
    let critters: [PWItem]
    let chests: [Int: PWItem]
    let signs: [PWItem]
    let gates: [PWItem]
    let bridges: [PWItem]
    let regions: [PWRegion]
    let fg: [PWSprite]

    /// The height of the two looping bands (levels 61–80).
    var loopSpan: CGFloat { P * CGFloat(CH * 2) }
    /// yb where the loop starts (the bottom of band 6).
    var loopBase: CGFloat { BOT + (CGFloat(loopFrom * CH) - 0.5) * P }

    private init() {
        var d: [String: Any] = [:]
        if let url = Bundle.main.url(forResource: "pw-manifest", withExtension: "json", subdirectory: "PeckWorld"),
           let data = try? Data(contentsOf: url),
           let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { d = j }
        ok = !d.isEmpty
        func n(_ k: String, _ def: CGFloat) -> CGFloat { PWItem.num(d[k]) ?? def }
        DW = n("DW", 520); P = n("P", 142); AMP = n("AMP", 78); BOT = n("BOT", 238); SPACER = n("SPACER", 108)
        CH = Int(n("CH", 10)); NB = Int(n("NB", 8)); loopFrom = Int(n("loopFrom", 6)); FGK = n("FGK", 1.12)
        let tiles = d["tiles"] as? [String: Any] ?? [:]
        tileT = PWItem.num(tiles["T"]) ?? 355
        tileOrigin = PWItem.num(tiles["origin"]) ?? -188
        tileCount = Int(PWItem.num(tiles["count"]) ?? 0)
        tileScale = PWItem.num(tiles["scale"]) ?? 3
        loopTile = Int((PWItem.num(tiles["loopFromTile"]) ?? 25).rounded())
        let items: (String) -> [PWItem] = { k in (d[k] as? [[String: Any]] ?? []).map(PWItem.init) }
        live = items("live"); glows = items("glows"); critters = items("critters")
        signs = items("signs"); gates = items("gates"); bridges = items("bridges")
        var ch: [Int: PWItem] = [:]
        for (k, v) in d["chests"] as? [String: [String: Any]] ?? [:] { if let lv = Int(k) { ch[lv] = PWItem(v) } }
        chests = ch
        func hex(_ v: Any?) -> UInt32? {
            guard var s = v as? String else { return nil }
            if s.hasPrefix("#") { s.removeFirst() }
            return UInt32(s, radix: 16)
        }
        regions = (d["regions"] as? [[String: Any]] ?? []).map { r in
            let node = (r["node"] as? [String] ?? []).compactMap(hex)
            let gate = r["gate"] as? [String] ?? []
            let sign = r["sign"] as? [String: String]
            return PWRegion(
                id: r["id"] as? String ?? "", name: r["name"] as? String ?? "", title: r["title"] as? String ?? "",
                road: r["road"] as? String ?? "ribbon", night: r["night"] as? Bool ?? false,
                node: node.count == 3 ? JellyTriad(light: node[0], base: node[1], dark: node[2]) : .meadow,
                gateText: gate.first ?? "ONWARD", gateBoard: hex(gate.count > 1 ? gate[1] : nil) ?? 0x2D86B8,
                gateInk: gate.count > 2 ? gate[2] : "#1E5E85",
                signBoard: hex(sign?["board"]), signPlate: hex(sign?["plate"]), signInk: hex(sign?["ink"]),
                finaleSky: (r["finaleSky"] as? [String] ?? []).compactMap(hex),
                edge: hex(r["edge"]) ?? 0x9ED98C,
                roadStyle: r["roadStyle"] as? [String: String] ?? [:])
        }
        fg = (d["fg"] as? [[String: Any]] ?? []).map { s in
            PWSprite(file: s["file"] as? String ?? "", side: PWItem.num(s["side"]) ?? -1,
                     x: PWItem.num(s["x"]) ?? 0, y: PWItem.num(s["y"]) ?? 0, w: PWItem.num(s["w"]) ?? 0, h: PWItem.num(s["h"]) ?? 0,
                     lb: PWItem.num(s["Lb"]) ?? 0, band: Int(PWItem.num(s["band"]) ?? 0))
        }
    }

    /// The chapter of a level index (0-based); every band from 5 up is the cosmos.
    func region(band: Int) -> PWRegion? {
        guard !regions.isEmpty else { return nil }
        return regions[max(0, min(band, regions.count - 1))]
    }
    func region(index i: Int) -> PWRegion? { region(band: i / CH) }

    /// Entries up to `maxYb`, with the loop bands repeated as far as needed.
    func expand(_ items: [PWItem], maxYb: CGFloat) -> [PWItem] {
        var out = items.filter { $0.yb < loopBase || $0.yb < loopBase + loopSpan }
        guard maxYb > loopBase + loopSpan else { return out.filter { $0.yb <= maxYb } }
        let loop = items.filter { $0.yb >= loopBase && $0.yb < loopBase + loopSpan }
        var n = 1
        while loopBase + loopSpan * CGFloat(n) < maxYb {
            out += loop.map { $0.shifted(loopSpan * CGFloat(n), levels: CH * 2 * n) }
            n += 1
        }
        return out.filter { $0.yb <= maxYb }
    }

    /// The tile file shown at row t (rows past the rendered ones repeat the loop).
    func tileFile(_ t: Int) -> String {
        var k = t
        if k >= tileCount { k = loopTile + (k - loopTile) % max(1, tileCount - loopTile) }
        return String(format: "pw-g-%02d", k)
    }

    /// The band a level stone at index i belongs to, and whether its chapter ends at the top of the map.
    func isNight(atYb yb: CGFloat) -> Bool {
        let band = Int(((yb - BOT) / P + 0.5) / CGFloat(CH))
        return region(band: band)?.night ?? false
    }
}

// MARK: - Placement

/// Maps the art's (dx, yb) onto the map's content: x from the screen centre, y down from the top of
/// a content area `contentH` tall (the stones' world plus the spacer under them).
struct PWPlace {
    let centerX: CGFloat
    let contentH: CGFloat
    func x(_ dx: CGFloat) -> CGFloat { centerX + dx }
    func y(_ yb: CGFloat) -> CGFloat { contentH - yb }
    func pt(_ p: CGPoint) -> CGPoint { CGPoint(x: x(p.x), y: y(p.y)) }
    func pt(_ i: PWItem) -> CGPoint { CGPoint(x: x(i.dx), y: y(i.yb)) }
}

// MARK: - Image store

/// Decodes tiles and sprites off the main thread, keeps a small LRU of them, and makes the night
/// variant with the same moonlit filter as `Jelly.dusk` (reds and greens down, blues kept, a lift).
@Observable
final class PWImages {
    static let shared = PWImages()
    private(set) var images: [String: UIImage] = [:]
    @ObservationIgnored private var loading: Set<String> = []
    @ObservationIgnored private var order: [String] = []
    @ObservationIgnored private let queue = DispatchQueue(label: "peck.world.images", qos: .userInitiated, attributes: .concurrent)
    @ObservationIgnored private lazy var ci = CIContext(options: [.workingColorSpace: NSNull(), .outputColorSpace: NSNull()])
    @ObservationIgnored var limit = 18

    func key(_ name: String, dark: Bool) -> String { dark ? name + "@n" : name }

    func image(_ name: String, dark: Bool) -> UIImage? { images[key(name, dark: dark)] }

    func request(_ name: String, ext: String, dark: Bool) {
        let k = key(name, dark: dark)
        if images[k] != nil || loading.contains(k) { return }
        loading.insert(k)
        queue.async { [weak self] in
            guard let self else { return }
            var img: UIImage? = nil
            if let path = Bundle.main.path(forResource: name, ofType: ext, inDirectory: "PeckWorld"), let raw = UIImage(contentsOfFile: path) {
                img = dark ? self.dusk(raw) : raw.preparingForDisplay() ?? raw
            }
            DispatchQueue.main.async {
                self.loading.remove(k)
                guard let img else { return }
                self.images[k] = img
                self.order.removeAll { $0 == k }
                self.order.append(k)
                while self.order.count > self.limit { let old = self.order.removeFirst(); self.images[old] = nil }
            }
        }
    }

    /// Keep these keys at the end of the LRU so a scroll back and forth doesn't evict them.
    func touch(_ names: [String], dark: Bool) {
        for n in names { let k = key(n, dark: dark); if images[k] != nil { order.removeAll { $0 == k }; order.append(k) } }
    }

    private func dusk(_ img: UIImage) -> UIImage? {
        guard let cg = img.cgImage else { return img }
        let f = CIFilter(name: "CIColorMatrix")!
        f.setValue(CIImage(cgImage: cg), forKey: kCIInputImageKey)
        f.setValue(CIVector(x: 0.40, y: 0, z: 0, w: 0), forKey: "inputRVector")
        f.setValue(CIVector(x: 0, y: 0.56, z: 0, w: 0), forKey: "inputGVector")
        f.setValue(CIVector(x: 0, y: 0, z: 0.68, w: 0), forKey: "inputBVector")
        f.setValue(CIVector(x: 0, y: 0, z: 0, w: 1), forKey: "inputAVector")
        f.setValue(CIVector(x: 10.0 / 255, y: 10.0 / 255, z: 24.0 / 255, w: 0), forKey: "inputBiasVector")
        // premultiplied alpha: the bias must not lift transparent pixels
        guard var out = f.outputImage else { return img }
        if img.cgImage?.alphaInfo != .noneSkipLast && img.cgImage?.alphaInfo != .none {
            out = out.applyingFilter("CISourceInCompositing", parameters: [kCIInputBackgroundImageKey: CIImage(cgImage: cg)])
        }
        guard let res = ci.createCGImage(out, from: out.extent) else { return img }
        return UIImage(cgImage: res, scale: img.scale, orientation: .up)
    }
}

// MARK: - The visible window

/// What part of the content is on screen (with a margin), in content coordinates.
struct PWWindow: Equatable {
    var top: CGFloat
    var bottom: CGFloat
    func contains(_ y: CGFloat, pad: CGFloat = 0) -> Bool { y > top - pad && y < bottom + pad }
}

// MARK: - Ground tiles

/// The baked terrain and landmarks, as tile images in rows from the content's bottom edge.
struct PWTileLayer: View {
    let place: PWPlace
    let window: PWWindow
    let dark: Bool
    var store = PWImages.shared

    var body: some View {
        let W = PeckWorld.shared
        let rows = visibleRows(W)
        ZStack(alignment: .topLeading) {
            ForEach(rows, id: \.self) { t in
                let file = W.tileFile(t)
                let ybTop = W.tileOrigin + W.tileT * CGFloat(t + 1)
                let y = place.y(ybTop)
                Group {
                    if let img = store.image(file, dark: dark) {
                        Image(uiImage: img)
                            .resizable()
                            .interpolation(.high)
                    } else {
                        Rectangle().fill(Color(hex: dark ? Jelly.dusk(edge(W, t)) : edge(W, t)))
                    }
                }
                .frame(width: W.DW, height: W.tileT + 0.5)
                .position(x: place.centerX, y: y + W.tileT / 2)
                .onAppear { store.request(file, ext: "jpg", dark: dark) }
                .onChange(of: dark) { _, d in store.request(file, ext: "jpg", dark: d) }
            }
        }
        .frame(width: place.centerX * 2, height: place.contentH, alignment: .topLeading)
        .allowsHitTesting(false)
        .onChange(of: rows) { _, r in
            for t in r { store.request(W.tileFile(t), ext: "jpg", dark: dark) }
            store.touch(r.map { W.tileFile($0) }, dark: dark)
        }
    }

    private func edge(_ W: PeckWorld, _ t: Int) -> UInt32 {
        let yb = W.tileOrigin + W.tileT * (CGFloat(t) + 0.5)
        return W.region(band: max(0, Int(((yb - W.BOT) / W.P + 0.5) / CGFloat(W.CH))))?.edge ?? 0x9ED98C
    }

    private func visibleRows(_ W: PeckWorld) -> [Int] {
        // window → yb range
        let ybLo = place.contentH - window.bottom, ybHi = place.contentH - window.top
        let lo = max(0, Int(floor((ybLo - W.tileOrigin) / W.tileT)))
        let maxRow = Int(floor((place.contentH - W.tileOrigin) / W.tileT))
        let hi = min(maxRow, Int(floor((ybHi - W.tileOrigin) / W.tileT)))
        return lo <= hi ? Array(lo...hi) : []
    }
}

// MARK: - Foreground frame

/// Leafy branches, bushes and cropped trunks at the screen edges, scrolling 1.12× the world so the
/// island seems to sit behind a frame of leaves. `scrollFromBottom` is how far the map is scrolled up.
struct PWForeground: View {
    let place: PWPlace
    let width: CGFloat
    let viewportH: CGFloat
    let scrollFromBottom: CGFloat
    let maxYb: CGFloat
    let dark: Bool
    var store = PWImages.shared

    var body: some View {
        let W = PeckWorld.shared
        // a sprite at layer position lb shows at lb − 1.12 u from the screen's bottom edge
        let u = scrollFromBottom
        let visible = sprites(W).filter { s in
            let screenB = s.lb - W.FGK * u
            return screenB > -s.h - 40 && screenB - s.h < viewportH + 400
        }
        ZStack(alignment: .topLeading) {
            ForEach(visible.indices, id: \.self) { k in
                let s = visible[k]
                let edgeX: CGFloat = s.side < 0 ? 0 : width
                Group {
                    if let img = store.image(s.file, dark: dark) {
                        Image(uiImage: img).resizable().interpolation(.high)
                    } else {
                        Color.clear
                    }
                }
                .frame(width: s.w, height: s.h)
                .position(x: edgeX + s.x + s.w / 2,
                          y: place.y(s.lb) + s.y + s.h / 2 + (W.FGK - 1) * u)
                .onAppear { store.request(s.file, ext: "png", dark: dark) }
                .onChange(of: dark) { _, d in store.request(s.file, ext: "png", dark: d) }
            }
        }
        .frame(width: width, height: place.contentH, alignment: .topLeading)
        .allowsHitTesting(false)
    }

    private func sprites(_ W: PeckWorld) -> [PWSprite] {
        // the loop bands' sprites repeat (their layer positions scale with the world)
        let base = W.fg.filter { $0.lb <= W.FGK * maxYb + 200 }
        guard maxYb > W.loopBase + W.loopSpan else { return base }
        let loop = W.fg.filter { $0.band >= W.loopFrom }
        var out = base
        var n = 1
        while W.loopBase + W.loopSpan * CGFloat(n) < maxYb {
            out += loop.map { PWSprite(file: $0.file, side: $0.side, x: $0.x, y: $0.y, w: $0.w, h: $0.h,
                                       lb: $0.lb + W.FGK * W.loopSpan * CGFloat(n), band: $0.band) }
            n += 1
        }
        return out.filter { $0.lb <= W.FGK * maxYb + 200 }
    }
}

/// A soft violet vignette over the map, the way the art page frames it.
struct PWVignette: View {
    var body: some View {
        GeometryReader { g in
            RadialGradient(stops: [
                .init(color: Color(red: 1, green: 0.98, blue: 0.9).opacity(0), location: 0.4),
                .init(color: Color(red: 60 / 255, green: 40 / 255, blue: 90 / 255).opacity(0.16), location: 1),
            ], center: UnitPoint(x: 0.47, y: 0.45), startRadius: 0, endRadius: max(g.size.width, g.size.height) * 0.75)
        }
        .allowsHitTesting(false)
        .ignoresSafeArea()
    }
}
