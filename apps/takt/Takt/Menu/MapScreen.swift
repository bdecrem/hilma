import SwiftUI

/// The Map tab: one road down the screen through the current world's venues, a numbered stop
/// per level, a photo card beside each. Level n is level n of the player's plan
/// (`LearningPlan`): the orange stop up next opens its goals (`LevelGoalsScreen`), and the level
/// clears when every goal is done (`GoalProgress`). A cleared stop's number opens its goals, all
/// done, to play again or practice; its photo card opens the venue's story.
/// The world is content, one per vibe (`Vibe`: the blues road, the Berlin clubs): `MapWorld`,
/// from `map-<world>.json`. The vibe switch in the header swaps it; the level you're on stays.
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
        let goals = app.goals
        let cleared = min(goals.cleared, stops.count)
        let here = cleared < stops.count ? stops[cleared] : nil

        ZStack {
            VStack(spacing: 0) {
                MapHeader(app: app, world: world, here: here ?? stops.last!, cleared: cleared, xp: app.progress.xp, compact: compact) {
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
                        Road(app: app, world: world, stops: stops, cleared: cleared,
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

            if let level = app.openVenue, let stop = stops.first(where: { $0.level == level }) {
                if app.openStory && level <= cleared {
                    VenueScreen(app: app, world: world, stop: stop, cleared: cleared, compact: compact)
                } else if level <= cleared + 1, let planLevel = app.plan.levels.first(where: { $0.n == level }) {
                    LevelGoalsScreen(app: app, stop: stop, level: planLevel, goals: goals, compact: compact)
                }
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
    let app: AppModel
    let world: MapWorld
    let here: MapWorld.Stop
    let cleared: Int
    let xp: Int
    let compact: Bool
    let settings: () -> Void

    var body: some View {
        // The phone's header is two rows since the vibe switch (2026-11-10): 358 pt held the
        // title, the world, the count, the XP and two buttons, and not a 56 pt switch as well.
        // Row 1 is the screen's own (title, switch, Ask, gear, as on the other two tabs), row 2
        // is where you are (the world and the episode, the count, the XP).
        if compact {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .center, spacing: 12) {
                    title
                    Spacer(minLength: 8)
                    buttons
                }
                HStack(alignment: .center, spacing: 12) {
                    place
                    count
                    XPLabel(xp: xp)
                }
            }
        } else {
            HStack(alignment: .center, spacing: 12) {
                title
                place
                count
                XPLabel(xp: xp)
                buttons
            }
        }
    }

    private var title: some View {
        Text("Map")
            .font(.display(compact ? 38 : 48))
            .textCase(.uppercase)
            .foregroundStyle(Palette.text)
            .fixedSize()
    }

    private var place: some View {
        let episode = world.episodes[here.episode]
        return VStack(alignment: .leading, spacing: 2) {
            Text(world.title)
                .dataLabel(11, weight: .semibold)
                .foregroundStyle(Palette.text)
            Text("Episode \(here.episode + 1) · \(episode.title)")
                .dataLabel(10)
                .foregroundStyle(Palette.muted)
        }
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var count: some View {
        Text("\(cleared) / \(world.total)")
            .dataLabel(12, weight: .semibold)
            .foregroundStyle(Palette.text)
            .fixedSize()
            .padding(.horizontal, 10)
            .padding(.vertical, compact ? 6 : 8)
            .background(RoundedRectangle(cornerRadius: 6).fill(Palette.panel))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Palette.line, lineWidth: 1))
            .accessibilityLabel("\(cleared) of \(world.total) levels cleared")
    }

    @ViewBuilder private var buttons: some View {
        VibeToggle(app: app)
        AskButton(size: compact ? 34 : 36)
        TransportButton(symbol: "gearshape", lit: false, size: compact ? 34 : 36, label: "Settings", action: settings)
    }
}

/// The road, the episode signs, the cards, the stops and the pill, placed absolutely.
private struct Road: View {
    let app: AppModel
    let world: MapWorld
    let stops: [MapWorld.Stop]
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
            if world.world == Vibe.electronic.rawValue {
                // Berlin: not a highway with its ties but a line on the U-Bahn map, two thin
                // rails 8 pt apart (a 10 pt stroke with a 6 pt gap cut out of it), and the
                // stretch behind you one solid cable in `text`.
                RoadShape(points: pts, upTo: nil, width: width, height: height)
                    .stroke(Palette.line, style: StrokeStyle(lineWidth: 10, lineCap: .round, lineJoin: .round))
                RoadShape(points: pts, upTo: nil, width: width, height: height)
                    .stroke(Palette.panel, style: StrokeStyle(lineWidth: 6, lineCap: .round, lineJoin: .round))
                RoadShape(points: pts, upTo: min(cleared, stops.count - 1), width: width, height: height)
                    .stroke(Palette.text, style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
            } else {
                RoadShape(points: pts, upTo: nil, width: width, height: height)
                    .stroke(Palette.line, style: StrokeStyle(lineWidth: 14, lineCap: .round, dash: [2, 9]))
                RoadShape(points: pts, upTo: min(cleared, stops.count - 1), width: width, height: height)
                    .stroke(Palette.text, style: StrokeStyle(lineWidth: 3, lineCap: .round, dash: [1, 7]))
            }

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
                    // A venue's story is the reward: it opens once its level is cleared. The one
                    // up next opens its goals.
                    .onTapGesture {
                        guard state == .done || state == .here else { return }
                        app.openStory = state == .done
                        app.openVenue = s.level
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(cardLabel(s, state))
                    .accessibilityAddTraits(state == .done || state == .here ? .isButton : [])
            }

            ForEach(stops) { s in
                let state = MapWorld.state(s.level - 1, cleared: cleared)
                let size: CGFloat = state == .here ? 66 : 52
                let x = RoadLayout.x(s, width: width), y = RoadLayout.y(s)
                // The number is the level's goals, cleared or not.
                Button { app.openStory = false; app.openVenue = s.level } label: { StopMark(number: s.level, state: state) }
                    .buttonStyle(.plain)
                    // Not `.disabled`: that fades the orange stop. Locked stops just ignore taps.
                    .allowsHitTesting(state == .done || state == .here)
                    .accessibilityAddTraits(state == .done || state == .here ? .isButton : [])
                    .accessibilityRemoveTraits(state == .done || state == .here ? [] : .isButton)
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
                Button { app.openVenue = s.level } label: { HerePill(title: s.venue.isPlaceholder ? "Level \(s.level)" : s.venue.name) }
                    .buttonStyle(.plain)
                    .frame(width: w)
                    .offset(x: x - w / 2, y: RoadLayout.y(s) - 92)
                    .accessibilityHidden(true)  // the stop says it
            }
        }
        .frame(width: width, height: height, alignment: .topLeading)
    }

    private func stopLabel(_ s: MapWorld.Stop, _ state: MapWorld.StopState) -> String {
        let where_: String
        switch state {
        case .done: where_ = "cleared"
        case .here: where_ = "up next: opens its goals"
        case .next, .ahead: where_ = "locked"
        }
        let name = s.venue.isPlaceholder ? "not written yet" : state == .done || state == .here ? s.venue.name : "hidden venue"
        return "Level \(s.level), \(name), \(where_)"
    }

    private func cardLabel(_ s: MapWorld.Stop, _ state: MapWorld.StopState) -> String {
        if s.venue.isPlaceholder { return "Level \(s.level), venue not written yet" }
        if state == .done { return "\(s.venue.name), \(s.venue.era), \(s.venue.town)" }
        return "\(state == .here ? s.venue.name : "Hidden venue"), \(s.venue.era), \(s.venue.town), \(state == .here ? "up next" : "locked")"
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

/// The venue up next, by name. Opens the level's goals.
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
        if stop.venue.isPlaceholder {
            // A level whose venue isn't written yet: an empty box on the road.
            let photoHeight = (104 * width / 186).rounded()
            VStack(spacing: 6) {
                Text("Level \(stop.level)").font(.display(width > 200 ? 23 : 19)).textCase(.uppercase).foregroundStyle(Palette.muted)
                Text("Venue to come").dataLabel(9).foregroundStyle(Palette.muted)
            }
            .frame(width: width, height: photoHeight + 50)
            .background(Palette.ground)
            .clipShape(RoundedRectangle(cornerRadius: 3))
            .overlay(RoundedRectangle(cornerRadius: 3).strokeBorder(state == .here ? Palette.signal : Palette.line,
                                                                     style: StrokeStyle(lineWidth: state == .here ? 3 : 1.5, dash: [6, 5])))
            .contentShape(Rectangle())
        } else {
            card
        }
    }

    private var card: some View {
        // Every venue not cleared yet (the one up next too) is an old, washed-out print.
        let locked = state != .done
        let photoHeight = (104 * width / 186).rounded()
        return VStack(alignment: .leading, spacing: 0) {
            // "Tonight" in the corner away from the stop: the pill covers the stop's side.
            ZStack(alignment: stop.level % 2 == 1 ? .topTrailing : .topLeading) {
                VenuePhoto(world: world, venue: stop.venue, big: false)
                    .grayscale(locked ? 1 : 0)
                    .frame(width: width, height: photoHeight)
                    .clipped()
                // Not cleared: a grainy grey mask over the print, only a faint shape shows through.
                if locked { GrainMask(seed: stop.level) }
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
                // The name is the reveal: "???" until the level is cleared (the pill names the one up next).
                Text(locked && state != .here ? "???" : stop.venue.name)
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

/// The mask over a venue not cleared yet: the panel grey at 93%, with grain (a fixed scatter of
/// light and dark specks per card), so the photo underneath is only a faint shape.
private struct GrainMask: View {
    let seed: Int

    var body: some View {
        Canvas { ctx, size in
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Palette.panel.opacity(0.93)))
            var r = UInt64(truncatingIfNeeded: seed &* 2654435761 &+ 1)
            func next() -> CGFloat {
                r = r &* 6364136223846793005 &+ 1442695040888963407
                return CGFloat(r >> 33) / CGFloat(1 << 31)
            }
            let count = Int(size.width * size.height / 9)
            for _ in 0..<count {
                let x = next() * size.width, y = next() * size.height, light = next() > 0.5
                ctx.fill(Path(CGRect(x: x, y: y, width: 1.2, height: 1.2)),
                         with: .color((light ? Palette.muted : Palette.ground).opacity(0.18 + 0.2 * next())))
            }
        }
        .allowsHitTesting(false)
    }
}
