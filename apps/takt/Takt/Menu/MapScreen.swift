import SwiftUI

/// The Map tab: one road down the screen through the current world's venues, a numbered stop
/// per level, a photo card beside each. A level clears when a lesson is finished and a Stage
/// song is played to the end (`MapProgress`). Tap a card, a stop or the pill to open the venue.
/// The world (blues now, techno later) is content: `MapWorld`, from `map-<world>.json`.
/// Layout numbers are the handoff's (`reference/Main.dc.html`, iPhone at 390 wide): x positions
/// scale to the width, y positions don't.
struct MapScreen: View {
    let app: AppModel
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let compact = sizeClass == .compact
        let world = app.mapWorld
        let stops = world.stops
        let progress = app.mapProgress
        let cleared = min(progress.cleared, stops.count)
        let here = cleared < stops.count ? stops[cleared] : nil

        ZStack {
            VStack(spacing: 0) {
                MapHeader(world: world, here: here ?? stops.last!, cleared: cleared, compact: compact) {
                    app.route = .settings
                }
                .padding(.horizontal, compact ? 16 : 40)
                .padding(.top, compact ? 8 : 24)
                .padding(.bottom, 12)
                .frame(maxWidth: compact ? .infinity : 820)
                Hairline()

                GeometryReader { g in
                    let content = RoadLayout.height(stops)
                    // The stop you're on sits ~470 pt from the top of the screen (~350 into the
                    // road), from the first frame: an anchor u lines up u of the content with u
                    // of the viewport, so u = (y − 350) / (content − viewport).
                    let y = RoadLayout.y(here ?? stops.last!)
                    let u = min(1, max(0, (y - RoadLayout.hereOffset) / max(1, content - g.size.height)))
                    ScrollView {
                        Road(app: app, world: world, stops: stops, progress: progress, cleared: cleared,
                             width: min(g.size.width, compact ? .infinity : 820), compact: compact, tilt: !reduceMotion)
                            .frame(maxWidth: .infinity)
                    }
                    .defaultScrollAnchor(UnitPoint(x: 0.5, y: u))
                    .scrollBounceBehavior(.basedOnSize)
                }

                TabBar(app: app)
                    .padding(.horizontal, compact ? 16 : 40)
                    .padding(.top, 10)
                    .padding(.bottom, compact ? 4 : 20)
                    .frame(maxWidth: compact ? .infinity : 820)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Palette.ground.ignoresSafeArea())

            if let level = app.openVenue, level <= cleared, let stop = stops.first(where: { $0.level == level }) {
                VenueScreen(app: app, world: world, stop: stop, cleared: cleared, compact: compact)
            }
        }
    }
}

/// The road's geometry, in points from its top. Shared by the drawing and the scroll anchors.
enum RoadLayout {
    static let top: CGFloat = 220
    static let step: CGFloat = 172
    static let episodeGap: CGFloat = 200
    /// The stop you're on, this far below the top of the scrolled area.
    static let hereOffset: CGFloat = 350

    static func y(_ stop: MapWorld.Stop) -> CGFloat {
        top + CGFloat(stop.level - 1) * step + CGFloat(stop.episode) * episodeGap
    }

    static func x(_ stop: MapWorld.Stop, width: CGFloat) -> CGFloat {
        let s = width / 390
        return (stop.level % 2 == 1 ? 92 : 298) * s
    }

    static func height(_ stops: [MapWorld.Stop]) -> CGFloat { y(stops.last!) + 380 }
}

private struct MapHeader: View {
    let world: MapWorld
    let here: MapWorld.Stop
    let cleared: Int
    let compact: Bool
    let settings: () -> Void

    var body: some View {
        let episode = world.episodes[here.episode]
        HStack(alignment: .center, spacing: 12) {
            Text("Map")
                .font(.display(compact ? 38 : 48))
                .textCase(.uppercase)
                .foregroundStyle(Palette.text)
            VStack(alignment: .leading, spacing: 2) {
                Text(world.title)
                    .dataLabel(11, weight: .semibold)
                    .foregroundStyle(Palette.text)
                Text("Episode \(here.episode + 1) · \(episode.title)")
                    .dataLabel(10)
                    .foregroundStyle(Palette.muted)
            }
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
            Text("\(cleared) / \(world.total)")
                .dataLabel(12, weight: .semibold)
                .foregroundStyle(Palette.text)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 6).fill(Palette.panel))
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Palette.line, lineWidth: 1))
                .accessibilityLabel("\(cleared) of \(world.total) levels cleared")
            TransportButton(symbol: "gearshape", lit: false, size: compact ? 34 : 36, label: "Settings", action: settings)
        }
    }
}

/// The road, the episode signs, the cards, the stops and the pill, placed absolutely.
private struct Road: View {
    let app: AppModel
    let world: MapWorld
    let stops: [MapWorld.Stop]
    let progress: MapProgress
    let cleared: Int
    let width: CGFloat
    let compact: Bool
    let tilt: Bool

    var body: some View {
        let height = RoadLayout.height(stops)
        let pts = stops.map { CGPoint(x: RoadLayout.x($0, width: width), y: RoadLayout.y($0)) }
        let cardWidth: CGFloat = compact ? 186 : 240

        ZStack(alignment: .topLeading) {
            RoadShape(points: pts, upTo: nil, width: width, height: height)
                .stroke(Palette.line, style: StrokeStyle(lineWidth: 40, lineCap: .round, lineJoin: .round))
            RoadShape(points: pts, upTo: nil, width: width, height: height)
                .stroke(Palette.panel, style: StrokeStyle(lineWidth: 34, lineCap: .round, lineJoin: .round))
            RoadShape(points: pts, upTo: nil, width: width, height: height)
                .stroke(Palette.line, style: StrokeStyle(lineWidth: 14, lineCap: .round, dash: [2, 9]))
            RoadShape(points: pts, upTo: min(cleared, stops.count - 1), width: width, height: height)
                .stroke(Palette.text, style: StrokeStyle(lineWidth: 3, lineCap: .round, dash: [1, 7]))

            ForEach(stops.filter(\.opensEpisode)) { s in
                EpisodeSign(episode: world.episodes[s.episode])
                    .frame(width: width)
                    .offset(y: RoadLayout.y(s) - 196)
            }

            ForEach(stops) { s in
                let i = s.level - 1
                let state = MapWorld.state(i, cleared: cleared)
                let left = s.level % 2 == 1
                VenueCard(world: world, stop: s, state: state, width: cardWidth)
                    .rotationEffect(.degrees(tilt ? (left ? 1.2 : -1.2) : 0))
                    .offset(x: left ? width - 14 - cardWidth : 14, y: RoadLayout.y(s) - 74)
                    // A venue's story is the reward: it opens once its level is cleared.
                    .onTapGesture { if state == .done { app.openVenue = s.level } }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(s.venue.name), \(s.venue.era), \(s.venue.town)\(state == .done ? "" : ", locked")")
                    .accessibilityAddTraits(state == .done ? .isButton : [])
            }

            ForEach(stops) { s in
                let state = MapWorld.state(s.level - 1, cleared: cleared)
                let size: CGFloat = state == .here ? 66 : 52
                let x = RoadLayout.x(s, width: width), y = RoadLayout.y(s)
                Button { app.openVenue = s.level } label: { StopMark(number: s.level, state: state) }
                    .buttonStyle(.plain)
                    // Not `.disabled`: that fades the orange stop. It just ignores taps until cleared.
                    .allowsHitTesting(state == .done)
                    .accessibilityAddTraits(state == .done ? .isButton : [])
                    .accessibilityRemoveTraits(state == .done ? [] : .isButton)
                    .frame(width: size, height: size)
                    .offset(x: x - size / 2, y: y - size / 2)
                    .accessibilityLabel(stopLabel(s, state))
                if state == .done {
                    Rings(lit: 1)
                        .offset(x: x - 20, y: y + 30)
                        .accessibilityHidden(true)
                }
            }

            if cleared < stops.count {
                let s = stops[cleared]
                // 264 wide holds "King Biscuit Time"; 8 pt from either edge.
                let w = min(264, width - 16)
                let x = min(max(RoadLayout.x(s, width: width), w / 2 + 8), width - w / 2 - 8)
                HerePill(title: s.venue.name)
                    .frame(width: w)
                    .offset(x: x - w / 2, y: RoadLayout.y(s) - 92)
                    .accessibilityHidden(true)  // the stop says it
            }

            if let t = world.nextTeaser {
                VStack(spacing: 6) {
                    Text(t.kicker).dataLabel(11).foregroundStyle(Palette.muted)
                    Text(t.title).font(.display(40)).textCase(.uppercase).foregroundStyle(Palette.muted)
                }
                .multilineTextAlignment(.center)
                .frame(width: width)
                .offset(y: height - 220)
            }
        }
        .frame(width: width, height: height, alignment: .topLeading)
    }

    private func stopLabel(_ s: MapWorld.Stop, _ state: MapWorld.StopState) -> String {
        let where_: String
        switch state {
        case .done: where_ = "cleared"
        case .here: where_ = "up next: finish any lesson and any Stage song"
        case .next, .ahead: where_ = "locked"
        }
        return "Level \(s.level), \(s.venue.name), \(where_)"
    }
}

/// From the top of the screen to the first stop, Catmull-Rom through the stops, then on down.
/// `upTo`: only as far as that stop index (the completed stretch).
private struct RoadShape: Shape {
    let points: [CGPoint]
    let upTo: Int?
    let width: CGFloat
    let height: CGFloat

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let pts = points
        p.move(to: CGPoint(x: width / 2, y: RoadLayout.top - 210))
        p.addLine(to: pts[0])
        let last = upTo ?? pts.count - 1
        if last > 0 {
            for q in 0..<last {
                let p0 = pts[max(q - 1, 0)], p1 = pts[q], p2 = pts[q + 1], p3 = pts[min(q + 2, pts.count - 1)]
                p.addCurve(to: p2,
                           control1: CGPoint(x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6),
                           control2: CGPoint(x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6))
            }
        }
        if upTo == nil { p.addLine(to: CGPoint(x: width / 2, y: height - 230)) }
        return p
    }
}

private struct EpisodeSign: View {
    let episode: MapWorld.Episode

    var body: some View {
        VStack(spacing: 4) {
            Text(episode.kicker).dataLabel(10, weight: .semibold).foregroundStyle(Palette.line)
            Text(episode.title).font(.display(32)).textCase(.uppercase).foregroundStyle(Palette.ground)
            Text(episode.years).dataLabel(10).foregroundStyle(Palette.line)
        }
        .lineLimit(1)
        .padding(.horizontal, 22)
        .padding(.top, 10)
        .padding(.bottom, 11)
        .background(Palette.text)
        // The double outline: ground, then text.
        .padding(3)
        .background(Palette.ground)
        .padding(2)
        .background(Palette.text)
        .accessibilityElement(children: .combine)
    }
}

/// A stop's number: done filled in text, here big in signal, next ringed in cue, ahead quiet.
private struct StopMark: View {
    let number: Int
    let state: MapWorld.StopState

    var body: some View {
        ZStack {
            switch state {
            case .done:
                Circle().fill(Palette.text)
                Circle().fill(Palette.ground).padding(2)
                Circle().fill(Palette.text).padding(6)
            case .here:
                Circle().fill(Palette.signal)
                Circle().fill(Palette.ground).padding(3)
                Circle().fill(Palette.signal).padding(8)
            case .next:
                Circle().fill(Palette.ground)
                Circle().strokeBorder(Palette.cue, lineWidth: 3)
            case .ahead:
                Circle().fill(Palette.ground)
                Circle().strokeBorder(Palette.line, lineWidth: 2)
            }
            Text("\(number)")
                .font(.display(state == .here ? 30 : 24))
                .foregroundStyle(state == .done || state == .here ? Palette.ground : state == .next ? Palette.text : Palette.muted)
        }
    }
}

/// Three small rings under a done stop, the Candy Crush stars. Only the first means anything
/// yet (cleared); what earns the other two is Bart's call.
private struct Rings: View {
    let lit: Int

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { r in
                ZStack {
                    if r < lit {
                        Circle().fill(Palette.ground)
                        Circle().fill(Palette.cue).padding(2)
                    } else {
                        Circle().fill(Palette.ground)
                        Circle().strokeBorder(Palette.line, lineWidth: 1.5)
                    }
                }
                .frame(width: 11, height: 11)
            }
        }
    }
}

/// The venue up next, by name. Not a button: the venue opens once it's cleared.
private struct HerePill: View {
    let title: String

    var body: some View {
        VStack(spacing: 0) {
            Text(title)
                .dataLabel(11, weight: .semibold)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .foregroundStyle(Palette.ground)
                .padding(.horizontal, 16)
                .frame(height: 40)
                .background(Capsule().fill(Palette.signal))
            Triangle().fill(Palette.signal).frame(width: 16, height: 9)
        }
    }
}

private struct Triangle: Shape {
    func path(in r: CGRect) -> Path {
        Path { p in
            p.move(to: CGPoint(x: r.minX, y: r.minY))
            p.addLine(to: CGPoint(x: r.maxX, y: r.minY))
            p.addLine(to: CGPoint(x: r.midX, y: r.maxY))
            p.closeSubpath()
        }
    }
}

/// The photo card beside a stop. Venues not reached yet are gray under a wash, so arriving
/// is an unlock; the one you're on has a signal border and "Tonight".
private struct VenueCard: View {
    let world: MapWorld
    let stop: MapWorld.Stop
    let state: MapWorld.StopState
    let width: CGFloat

    var body: some View {
        // Every venue not cleared yet (the one up next too) is an old, washed-out print.
        let locked = state != .done
        let photoHeight = (104 * width / 186).rounded()
        VStack(alignment: .leading, spacing: 0) {
            // "Tonight" in the corner away from the stop: the pill covers the stop's side.
            ZStack(alignment: stop.level % 2 == 1 ? .topTrailing : .topLeading) {
                VenuePhoto(world: world, venue: stop.venue, big: false)
                    .grayscale(locked ? 0.9 : 0)
                    .contrast(locked ? 0.7 : 1)
                    .frame(width: width, height: photoHeight)
                    .clipped()
                if locked { Palette.ground.opacity(0.45) }
                if state == .here {
                    Text("Tonight")
                        .dataLabel(9, weight: .semibold)
                        .foregroundStyle(Palette.ground)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 4)
                        .background(RoundedRectangle(cornerRadius: 2).fill(Palette.signal))
                        .padding(6)
                }
            }
            .frame(width: width, height: photoHeight)
            VStack(alignment: .leading, spacing: 2) {
                Text(stop.venue.name)
                    .font(.display(width > 200 ? 23 : 19))
                    .textCase(.uppercase)
                    .foregroundStyle(locked ? Palette.muted : Palette.text)
                Text("\(stop.venue.era) · \(stop.venue.town)")
                    .dataLabel(9)
                    .foregroundStyle(Palette.muted)
            }
            .lineLimit(1)
            .padding(.horizontal, 9)
            .padding(.top, 7)
            .padding(.bottom, 8)
        }
        .frame(width: width, alignment: .leading)
        .background(Palette.ground)
        .clipShape(RoundedRectangle(cornerRadius: 3))
        .overlay(
            RoundedRectangle(cornerRadius: 3)
                .strokeBorder(state == .here ? Palette.signal : locked ? Palette.line : Palette.text,
                              lineWidth: state == .here ? 3 : locked ? 1.5 : 2)
        )
        .contentShape(Rectangle())
    }
}

/// A venue's photo, or the placeholder: the era big on a striped panel, "No free photo yet".
struct VenuePhoto: View {
    let world: MapWorld
    let venue: MapWorld.Venue
    let big: Bool

    var body: some View {
        if let name = world.imageName(venue) {
            // In an overlay on a clear box, so the photo's own size never sizes the layout.
            Color.clear
                .overlay { Image(name).resizable().scaledToFill() }
                .clipped()
                .accessibilityElement()
                .accessibilityAddTraits(.isImage)
                .accessibilityLabel(venue.photo?.note.map { "Photo: \($0)" } ?? "Photo of \(venue.name)")
        } else {
            ZStack {
                Stripes(gap: big ? 10 : 8)
                VStack(spacing: big ? 6 : 4) {
                    Text(venue.era).font(.display(big ? 64 : 22)).foregroundStyle(Palette.muted)
                    Text("No free photo yet").dataLabel(big ? 11 : 9).foregroundStyle(Palette.muted)
                }
            }
            .accessibilityElement(children: .combine)
        }
    }
}

/// 135° stripes, panel and ground.
private struct Stripes: View {
    let gap: CGFloat

    var body: some View {
        Canvas { ctx, size in
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Palette.ground))
            var x: CGFloat = -size.height
            while x < size.width {
                var p = Path()
                p.move(to: CGPoint(x: x, y: size.height))
                p.addLine(to: CGPoint(x: x + size.height, y: 0))
                p.addLine(to: CGPoint(x: x + size.height + gap, y: 0))
                p.addLine(to: CGPoint(x: x + gap, y: size.height))
                p.closeSubpath()
                ctx.fill(p, with: .color(Palette.panel))
                x += gap * 2
            }
        }
    }
}
