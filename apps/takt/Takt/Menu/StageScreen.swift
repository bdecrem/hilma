import SwiftUI

/// Stage: the set list. Every song open: a cover, the style, key, tempo and length, the
/// part and the level you take it at, your best, Play. The band on the menu keeps playing
/// until a song starts.
struct StageScreen: View {
    let app: AppModel
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var board: Song?
    /// `-AllTracks 1` opens the card at launch (the screenshots).
    @State private var allTracks = UserDefaults.standard.bool(forKey: "AllTracks")
    /// The tracks pinned until the player changes them (the four blues tracks and the two Delta
    /// ones, Bart 2026-11-01); the rest go under "All tracks". The player's own set is
    /// `AppModel.pinnedSongs` (2026-11-07: the pin on a card, or its context menu).
    /// Since the vibes (2026-11-10) the default set carries electronic tracks too, so either
    /// vibe opens on a stage with something on it.
    static let bluesPins = Array(Song.catalog.prefix(6))
    static let electronicPins = ["song-halbschatten", "song-gezeiten", "song-gegenlicht", "song-hypnotist-2", "song-warm-nine", "song-abyss"]
    static let defaultPins = bluesPins + electronicPins
    /// Tracks that joined the default set after players had sets of their own, and when: a
    /// stored set older than the date gets the track too (it had no say about it), one changed
    /// since is as the player set it. The electronic defaults joined with the vibes; a new
    /// track that should open pinned goes here with the day it shipped.
    /// Gezeiten shipped at 11:29 PT on 2026-11-10 (eef25ff), after sets changed that day. The
    /// date has to be the real ship time, never later: a set changed before it gets the track
    /// back on every read, so an unpin made before a future date never sticks.
    static let gezeitenShipped = ISO8601DateFormatter().date(from: "2026-11-10T19:29:29Z")!
    /// Gegenlicht, the same day, once it was built (a time before the build that shipped it).
    static let gegenlichtShipped = ISO8601DateFormatter().date(from: "2026-11-10T21:16:03Z")!
    static let joinedLater: [(song: String, at: Date)] = electronicPins.map {
        ($0, $0 == "song-gezeiten" ? gezeitenShipped : $0 == "song-gegenlicht" ? gegenlichtShipped : Vibe.pinsEpoch)
    }
    /// The other vibe's pinned tracks, open under their header. Stored: once opened they stay
    /// open, on either vibe and across launches, until the player closes them (Bart, 2026-11-10).
    @AppStorage("stageOtherOpen") private var otherOpen = false
    /// The line under the stage after a pin or an unpin, with Undo, for a few seconds.
    @State private var toast: PinToast?

    /// "Ten" for 10: the count of songs, in words up to twenty.
    static func spelled(_ n: Int) -> String {
        let words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
                     "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty"]
        return n < words.count ? words[n] : String(n)
    }

    var body: some View {
        let compact = sizeClass == .compact
        // The pinned tracks and the player's own versions of them (a version unpinned on its own
        // card goes under All tracks); the rest under All tracks.
        // By genre (2026-11-10): the pinned tracks of the vibe that's on are the set; the other
        // vibe's pinned tracks sit under a disclosure header below them.
        let vibe = app.vibe
        let pinned = app.songs.filter { app.isPinned($0) }
        let featured = pinned.filter { $0.genre == vibe }
        let others = pinned.filter { $0.genre != vibe }
        // All tracks: the vibe's own first, each group in set-list order.
        let unpinned = app.songs.filter { !app.isPinned($0) }
        let rest = unpinned.filter { $0.genre == vibe } + unpinned.filter { $0.genre != vibe }
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 16) {
                Text("Stage")
                    .font(.display(compact ? 40 : 52))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.text)
                StaffLines()
                    .frame(maxWidth: .infinity)
                VibeToggle(app: app)
                AskButton(size: compact ? 34 : 36)
                TransportButton(symbol: "gearshape", lit: false, size: compact ? 34 : 36, label: "Settings") {
                    app.route = .settings
                }
            }
            .padding(.top, compact ? 8 : 24)

            ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("\(Self.spelled(app.bundledSongs.count)) songs, all yours from the start. Take the chords or the melody, pick a level, and play with the band. Adaptive climbs as you play clean.\(app.mods.songs.isEmpty ? " Agent mode makes a track your own." : "")")
                        .bodyText(compact ? 14 : 16)
                        .foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, compact ? 16 : 24)
                    // The set: the four blues tracks in full, each with the player's own versions
                    // under it. The rest sit under a small "All tracks" card at the bottom, open
                    // on a tap (Bart, 2026-11-01).
                    ForEach(featured, id: \.name) { song in
                        SongCard(app: app, song: song, compact: compact, onPin: pinAction(song)) { board = song }
                            .id(song.name)
                    }
                    if featured.isEmpty {
                        Text(pinned.isEmpty ? "Nothing pinned. Pin a track under All tracks to keep it up here."
                             : "No \(vibe.title.lowercased()) tracks pinned. Pin one under All tracks to keep it up here.")
                            .bodyText(compact ? 13 : 14)
                            .foregroundStyle(Palette.muted)
                            .padding(.vertical, 6)
                    }
                    if !others.isEmpty {
                        GenreHeader(vibe: vibe.other, count: others.filter { $0.mod == nil }.count, names: others.map(\.meta.title), open: $otherOpen, compact: compact)
                            .id("other")
                        if otherOpen {
                            ForEach(others, id: \.name) { song in
                                SongCard(app: app, song: song, compact: compact, onPin: pinAction(song)) { board = song }
                                    .id(song.name)
                            }
                        }
                    }
                    if !rest.isEmpty {
                        AllTracksCard(count: rest.count, names: rest.map(\.meta.title), open: $allTracks, compact: compact)
                            .id("all")
                        if allTracks || featured.isEmpty {
                            ForEach(rest, id: \.name) { song in
                                SongCard(app: app, song: song, compact: compact, onPin: pinAction(song)) { board = song }
                                    .id(song.name)
                            }
                        }
                    }
                }
                .padding(.bottom, 16)
            }
            .scrollBounceBehavior(.basedOnSize)
            .onAppear {
                // `-ScrollTo all` lands on the All tracks card, `-ScrollTo <song name>` on that
                // card (the screenshots).
                if let to = UserDefaults.standard.string(forKey: "ScrollTo") { proxy.scrollTo(to, anchor: .top) }
            }
            }

            Spacer(minLength: 12)
            if let toast {
                PinToastView(toast: toast, compact: compact) { undo(toast) }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .padding(.bottom, 10)
            }
            if let player = app.player {
                NowPlayingStrip(player: player)
            }
            TabBar(app: app)
                .padding(.top, 10)
                .padding(.bottom, compact ? 4 : 20)
        }
        .padding(.horizontal, compact ? 16 : 40)
        .frame(maxWidth: compact ? .infinity : 820, alignment: .leading)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.ground.ignoresSafeArea())
        .sheet(item: $board) { song in
            BoardSheet(app: app, song: song)
        }
        #if DEBUG
        // `-PinTap <song>` taps that card's pin a second in (screenshots of the toast).
        .task {
            guard let name = UserDefaults.standard.string(forKey: "PinTap"), let song = app.songs.first(where: { $0.name == name }) else { return }
            try? await Task.sleep(for: .seconds(1))
            pinAction(song)?(!app.isPinned(song))
        }
        #endif
        .task(id: toast?.id) {
            guard toast != nil else { return }
            try? await Task.sleep(for: .seconds(4))
            withAnimation(.easeOut(duration: 0.2)) { toast = nil }
        }
    }

    /// A card's pin: a bundled song in the set, a mod on its own (it follows its song until then).
    private func pinAction(_ song: Song) -> ((Bool) -> Void)? {
        { on in
            withAnimation(.easeInOut(duration: 0.25)) {
                app.setPinned(song, on)
                toast = PinToast(song: song.name, title: song.meta.title, pinned: on)
            }
        }
    }

    private func undo(_ t: PinToast) {
        guard let song = app.songs.first(where: { $0.name == t.song }) else { return }
        withAnimation(.easeInOut(duration: 0.25)) {
            app.setPinned(song, !t.pinned)
            toast = nil
        }
    }
}

/// What a pin or an unpin just did, for the line under the stage.
struct PinToast: Equatable {
    let id = UUID()
    let song: String
    let title: String
    let pinned: Bool
}

/// "Slow Burn moved to All tracks · Undo": one quiet line, gone after a few seconds.
struct PinToastView: View {
    let toast: PinToast
    let compact: Bool
    let undo: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: toast.pinned ? "pin.fill" : "pin.slash")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(toast.pinned ? Palette.signal : Palette.muted)
            Text(toast.pinned ? "\(toast.title) is pinned" : "\(toast.title) moved to All tracks")
                .bodyText(compact ? 13 : 14)
                .foregroundStyle(Palette.text)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 8)
            Button("Undo", action: undo)
                .dataLabel(11, weight: .semibold)
                .foregroundStyle(Palette.signal)
                .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .frame(height: 40)
        .background(RoundedRectangle(cornerRadius: 8).fill(Palette.panel))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.line, lineWidth: 1))
    }
}

/// The pin in a card's corner: filled when the track is pinned to the stage, an outline when it
/// sits under All tracks. Quiet until hovered (Mac) or pressed.
struct PinButton: View {
    let pinned: Bool
    let title: String
    let action: () -> Void
    @State private var hover = false

    var body: some View {
        Button(action: action) {
            Image(systemName: pinned ? "pin.fill" : "pin")
                .font(.system(size: 13, weight: .semibold))
                .rotationEffect(.degrees(45))
                .foregroundStyle(hover ? Palette.text : pinned ? Palette.muted : Palette.muted.opacity(0.7))
                .frame(width: 30, height: 30)
                .background(RoundedRectangle(cornerRadius: 6).fill(hover ? Palette.ground : .clear))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
        .help(pinned ? "Unpin: move it to All tracks" : "Pin it to the Stage")
        .accessibilityLabel(pinned ? "Unpin \(title)" : "Pin \(title)")
    }
}

extension Song: Identifiable {
    var id: String { name }
}

/// One song on the set list.
struct SongCard: View {
    let app: AppModel
    let song: Song
    let compact: Bool
    /// Pin or unpin this track.
    var onPin: ((Bool) -> Void)? = nil
    let showBoard: () -> Void

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        let pinned = app.isPinned(song)
        let part = app.stagePart(song)
        let difficulty = app.stageDifficulty(song)
        // Solo (0.1 (114)): the teacher's whole track from the player's take, a level of this
        // song once it exists; its best is the track's own.
        let solo = app.solo(of: song)
        let levels = app.stageLevels(song).map { ($0.rawValue, $0.title) }
        let mastered = Set(app.masteredLevels(song).map(\.rawValue))
        let best = difficulty == .solo && solo != nil ? app.progress.best(song: solo!.name, part: Song.PartKey.melody.rawValue) : app.progress.best(song: song.name, part: part.rawValue)
        VStack(alignment: .leading, spacing: compact ? 12 : 14) {
            HStack(alignment: .top, spacing: compact ? 14 : 20) {
                SongArt(kind: song.meta.art)
                    .frame(width: compact ? 72 : 96, height: compact ? 72 : 96)
                VStack(alignment: .leading, spacing: 4) {
                    Text(song.meta.title)
                        .font(.display(compact ? 30 : 38))
                        .textCase(.uppercase)
                        .foregroundStyle(Palette.text)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    HStack(spacing: 8) {
                        // A mod wears its version; the title says what it came from.
                        if let mod = song.mod { VersionBadge(version: mod.version) }
                        Text("\(song.meta.style) · \(song.meta.key) · \(song.meta.tempo) bpm · \(song.length)")
                            .dataLabel(11)
                            .foregroundStyle(Palette.muted)
                            .lineLimit(1)
                    }
                    Text(song.meta.line)
                        .bodyText(compact ? 13 : 14)
                        .foregroundStyle(Palette.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                if let onPin {
                    PinButton(pinned: pinned, title: song.meta.title) { onPin(!pinned) }
                        .offset(x: compact ? 6 : 8, y: compact ? -6 : -8)
                }
            }
            HStack(spacing: compact ? 10 : 16) {
                Chips(title: "Part", options: song.partKeys.map { ($0.rawValue, $0.title) }, picked: part.rawValue) {
                    app.pick(song: song, part: Song.PartKey(rawValue: $0)!)
                }
                if !compact {
                    Chips(title: "Level", options: levels, picked: difficulty.rawValue, scrolls: true, accent: GameEngine.Difficulty.solo.rawValue, mastered: mastered) {
                        app.pick(song: song, difficulty: GameEngine.Difficulty(rawValue: $0)!)
                    }
                }
            }
            if compact {
                Chips(title: "Level", options: levels, picked: difficulty.rawValue, scrolls: true, accent: GameEngine.Difficulty.solo.rawValue, mastered: mastered) {
                    app.pick(song: song, difficulty: GameEngine.Difficulty(rawValue: $0)!)
                }
            }
            // The picked level mastered: the line says so first, in brass.
            (Text(mastered.contains(difficulty.rawValue) ? "Mastered · " : "").foregroundColor(Palette.mastery)
             + Text(difficulty == .solo && solo != nil ? "The teacher's whole track from your take, every note as written. \(solo!.meta.line)" : song.charting.line(difficulty, song: song.name, part: part)).foregroundColor(Palette.muted))
                .dataLabel(10)
                .fixedSize(horizontal: false, vertical: true)
            // Play · Board · Practice · Agent and the best, one row; on the phone the two small
            // ones take a row of their own (four buttons and the best don't fit 360 pt).
            HStack(spacing: 10) {
                PrimaryButton(title: "Play") { app.play(song: song) }
                QuietButton(title: "Board", action: showBoard)
                if !compact { smallButtons }
                Spacer(minLength: 8)
                bestView(best)
            }
            if compact {
                HStack(spacing: 10) { smallButtons }
            }
        }
        .padding(compact ? 16 : 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
        .contentShape(.contextMenuPreview, shape)
        .contextMenu {
            if let onPin {
                Button { onPin(!pinned) } label: {
                    Label(pinned ? "Unpin · move to All tracks" : "Pin to the Stage", systemImage: pinned ? "pin.slash" : "pin")
                }
            }
        }
    }

    /// Practice, a size down: the song held at bar 1, the scrubber and the speed. Call, the
    /// same: the notes called out one at a time (Call.swift). Agent mode, lit: your own version
    /// of the track.
    private var smallButtons: some View {
        Group {
            Button { app.practice(song: song) } label: {
                Text("Practice")
                    .dataLabel(11, weight: .semibold)
                    .foregroundStyle(Palette.muted)
                    .padding(.horizontal, 12)
                    .frame(height: 32)
                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Palette.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            Button { app.call(song: song) } label: {
                Text("Call")
                    .dataLabel(11, weight: .semibold)
                    .foregroundStyle(Palette.muted)
                    .padding(.horizontal, 12)
                    .frame(height: 32)
                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Palette.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Call: \(song.meta.title) one note at a time, each called out, finger then key")
            Button { app.openAgent(song: song) } label: {
                Text("Agent")
                    .dataLabel(11, weight: .semibold)
                    .foregroundStyle(Palette.signal)
                    .padding(.horizontal, 12)
                    .frame(height: 32)
                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Palette.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(song.mod == nil ? "Agent mode: your own version of \(song.meta.title)" : "Agent mode: continue \(song.meta.title)")
        }
    }

    @ViewBuilder
    private func bestView(_ best: ProgressStore.ScoreRecord?) -> some View {
                if let best {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text("Best")
                            .dataLabel(10)
                            .foregroundStyle(Palette.muted)
                        Text(best.grade)
                            .font(.display(compact ? 22 : 26))
                            .foregroundStyle(Palette.signal)
                        Text("\(best.score)")
                            .font(.display(compact ? 22 : 26))
                            .monospacedDigit()
                            .foregroundStyle(Palette.text)
                    }
                } else {
                    Text("Not played yet")
                        .dataLabel(10)
                        .foregroundStyle(Palette.muted)
                }
    }
}

/// The disclosure header over the other vibe's pinned tracks: a chevron, "Blues · Six pinned",
/// their names in one faint line and a hairline to the edge. A header, not a card: the cards
/// under it are the same cards. A tap opens or closes them, and they stay that way.
struct GenreHeader: View {
    let vibe: Vibe
    let count: Int
    let names: [String]
    @Binding var open: Bool
    let compact: Bool

    var body: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) { open.toggle() }
        } label: {
            HStack(alignment: .center, spacing: 10) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Palette.muted)
                    .rotationEffect(.degrees(open ? 90 : 0))
                    .frame(width: 12)
                VibeGlyph(vibe: vibe, size: 11)
                    .foregroundStyle(Palette.muted)
                    .frame(width: 14)
                Text("\(vibe.title) · \(StageScreen.spelled(count)) pinned")
                    .dataLabel(13, weight: .semibold)
                    .foregroundStyle(open ? Palette.text : Palette.muted)
                    .fixedSize()
                if open {
                    Hairline()
                } else {
                    Text(names.joined(separator: " · "))
                        .dataLabel(10)
                        .foregroundStyle(Palette.muted.opacity(0.75))
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .frame(height: 36)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.top, 6)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(vibe.title) tracks, \(count) pinned")
        .accessibilityValue(open ? "expanded" : "collapsed")
        .accessibilityAddTraits(.isButton)
    }
}

/// The small card at the bottom of the set list that holds every other track: the count,
/// their names in one line, a chevron. A tap opens them below it as full cards.
struct AllTracksCard: View {
    let count: Int
    let names: [String]
    @Binding var open: Bool
    let compact: Bool

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        Button {
            withAnimation(.easeInOut(duration: 0.2)) { open.toggle() }
        } label: {
            HStack(alignment: .center, spacing: compact ? 12 : 16) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("All tracks")
                        .font(.display(compact ? 20 : 24))
                        .textCase(.uppercase)
                        .foregroundStyle(Palette.text)
                    Text("\(StageScreen.spelled(count)) more · \(names.joined(separator: " · "))")
                        .dataLabel(10)
                        .foregroundStyle(Palette.muted)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.down")
                    .font(.system(size: compact ? 13 : 15, weight: .semibold))
                    .foregroundStyle(Palette.muted)
                    .rotationEffect(.degrees(open ? 180 : 0))
            }
            .padding(.horizontal, compact ? 16 : 20)
            .padding(.vertical, compact ? 12 : 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(shape.fill(Palette.panel))
            .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
            .contentShape(shape)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("All tracks, \(count) more")
        .accessibilityAddTraits(open ? [.isSelected] : [])
    }
}

/// A row of small choices; the picked one is filled `signal`.
/// A row of choices. `scrolls`: the row slides sideways when it is wider than its place (the
/// levels, six since Easy+ in 0.1 (109), on the phone), and takes the width it is given; off,
/// it is as wide as its chips (the parts, beside the levels on the Mac).
struct Chips: View {
    let title: String
    let options: [(key: String, title: String)]
    let picked: String
    var scrolls = false
    /// A key drawn apart (outlined in `cue`): the Solo level, another line rather than a rung.
    var accent: String? = nil
    /// Keys mastered (an A or better at full speed): drawn in brass with a small seal,
    /// `Palette.mastery` (Bart, 2026-11-09).
    var mastered: Set<String> = []
    let pick: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .dataLabel(9)
                .foregroundStyle(Palette.muted)
            if scrolls {
                // The picked chip in view from the start (Adaptive is the last of six).
                ScrollViewReader { proxy in
                    ScrollView(.horizontal, showsIndicators: false) { row }
                        .scrollBounceBehavior(.basedOnSize)
                        .onAppear { proxy.scrollTo(picked) }
                }
            } else {
                row
            }
        }
    }

    private var row: some View {
        HStack(spacing: 4) {
            ForEach(options, id: \.key) { o in
                let on = o.key == picked
                let won = mastered.contains(o.key)
                let apart = o.key == accent
                // Mastered: brass, filled when picked, a brass tint and outline when not; the seal
                // says it without the colour too.
                let tint = won ? Palette.mastery : apart ? Palette.cue : Palette.signal
                Button { pick(o.key) } label: {
                    HStack(spacing: 4) {
                        if won {
                            Image(systemName: "checkmark.seal.fill")
                                .font(.system(size: 9, weight: .semibold))
                        }
                        Text(o.title)
                            .dataLabel(10, weight: .semibold)
                    }
                    .foregroundStyle(on ? Palette.blackKey : won ? Palette.mastery : apart ? Palette.cue : Palette.text)
                    .padding(.horizontal, 10)
                    .frame(height: 28)
                    .background(RoundedRectangle(cornerRadius: 5).fill(on ? tint : won ? Palette.mastery.opacity(0.12) : Palette.ground))
                    .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(on ? tint : won ? Palette.mastery.opacity(0.75) : apart ? Palette.cue.opacity(0.7) : Palette.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(won ? "\(o.title), mastered" : o.title)
                .accessibilityAddTraits(on ? [.isSelected] : [])
                .help(won ? "\(o.title): mastered, an A or better at full speed" : "")
                .id(o.key)
            }
        }
    }
}

/// A song's board, the whole thing.
struct BoardSheet: View {
    let app: AppModel
    let song: Song
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        let compact = sizeClass == .compact
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(song.meta.title)
                        .font(.display(32))
                        .textCase(.uppercase)
                        .foregroundStyle(Palette.text)
                    Text("Board · best runs, any part")
                        .dataLabel(11)
                        .foregroundStyle(Palette.muted)
                }
                Spacer()
                QuietButton(title: "Done") { dismiss() }
            }
            ScrollView {
                // The song's runs and, under them in the same list, the runs of its Solo level.
                let scores = (app.progress.scores(song: song.name) + (app.solo(of: song).map { app.progress.scores(song: $0.name) } ?? []))
                    .sorted { ($0.score, $0.date) > ($1.score, $1.date) }
                Leaderboard(scores: Array(scores.prefix(20)), compact: compact)
            }
        }
        .padding(24)
        .frame(minWidth: compact ? 0 : 560, minHeight: compact ? 0 : 420)
        .background(Palette.ground.ignoresSafeArea())
    }
}

/// A song's cover: a drawing in the app's own line, one colour on the panel.
struct SongArt: View {
    let kind: String

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        Canvas { ctx, size in
            let w = size.width, h = size.height
            let ink = Palette.text, hot = Palette.signal, dim = Palette.muted
            switch kind {
            case "river":
                // A slow river: five lazy lines, the middle one lit.
                for i in 0..<5 {
                    var p = Path()
                    let y0 = h * (0.2 + 0.15 * CGFloat(i))
                    p.move(to: CGPoint(x: 0, y: y0))
                    p.addCurve(to: CGPoint(x: w, y: y0 + (i % 2 == 0 ? 6 : -6)),
                               control1: CGPoint(x: w * 0.35, y: y0 - 14), control2: CGPoint(x: w * 0.65, y: y0 + 14))
                    ctx.stroke(p, with: .color(i == 2 ? hot : i % 2 == 0 ? ink : dim), lineWidth: i == 2 ? 3 : 1.5)
                }
            case "boogie":
                // The boogie: a staircase that climbs and jumps back, the thumb's step lit.
                let n = 6
                let sw = w / CGFloat(n + 1)
                for i in 0..<n {
                    let x = sw * 0.5 + sw * CGFloat(i)
                    let y = h * 0.82 - CGFloat(i % 4) * h * 0.16
                    let r = CGRect(x: x, y: y - 10, width: sw * 0.8, height: 10)
                    ctx.fill(Path(roundedRect: r, cornerRadius: 2), with: .color(i % 4 == 1 ? hot : ink))
                }
            case "boots":
                // The Texas shuffle: three rows of long-short stomps (the shuffle's two eighths),
                // the backbeat lit. Three a row: each is 0.18 w + 4 + 8 wide, so 3 × 0.26 w = 0.78 w
                // from x = 0.11 w ends at 0.89 w, inside the tile.
                for row in 0..<3 {
                    let y = h * (0.26 + 0.24 * CGFloat(row))
                    var x = w * 0.11
                    for i in 0..<3 {
                        let long = w * 0.13, short = w * 0.05
                        let r1 = CGRect(x: x, y: y - 4, width: long, height: 8)
                        ctx.fill(Path(roundedRect: r1, cornerRadius: 2), with: .color(i == 1 && row == 1 ? hot : ink))
                        let r2 = CGRect(x: x + long + 4, y: y - 3, width: short, height: 6)
                        ctx.fill(Path(roundedRect: r2, cornerRadius: 2), with: .color(dim))
                        x += long + short + 4 + w * 0.08
                    }
                }
            case "lantern":
                // The minor blues: a ring of dim dots around one warm one, low in the frame.
                let cx = w * 0.5, cy = h * 0.56, rad = min(w, h) * 0.3
                for i in 0..<12 {
                    let a = Double(i) / 12 * 2 * .pi - .pi / 2
                    let x = cx + rad * cos(a), y = cy + rad * sin(a)
                    let rr: CGFloat = i % 3 == 0 ? 3 : 2
                    ctx.fill(Path(ellipseIn: CGRect(x: x - rr, y: y - rr, width: 2 * rr, height: 2 * rr)),
                             with: .color(i % 3 == 0 ? ink : dim))
                }
                ctx.fill(Path(ellipseIn: CGRect(x: cx - 7, y: cy - 7, width: 14, height: 14)), with: .color(hot))
            case "crossroads":
                // The Delta: two roads crossing, the meeting lit. The roads run corner to corner
                // inside a 0.14 w inset, so they clear the tile's rounded corners.
                for (a, b) in [(CGPoint(x: w * 0.14, y: h * 0.86), CGPoint(x: w * 0.86, y: h * 0.14)),
                               (CGPoint(x: w * 0.14, y: h * 0.14), CGPoint(x: w * 0.86, y: h * 0.86))] {
                    var p = Path()
                    p.move(to: a)
                    p.addLine(to: b)
                    ctx.stroke(p, with: .color(ink), lineWidth: 2)
                }
                for (dx, dy) in [(-1.0, -1.0), (1.0, -1.0), (-1.0, 1.0), (1.0, 1.0)] {
                    let x = w * 0.5 + dx * w * 0.22, y = h * 0.5 + dy * h * 0.22
                    ctx.fill(Path(ellipseIn: CGRect(x: x - 2, y: y - 2, width: 4, height: 4)), with: .color(dim))
                }
                ctx.fill(Path(ellipseIn: CGRect(x: w * 0.5 - 7, y: h * 0.5 - 7, width: 14, height: 14)), with: .color(hot))
            case "triplets":
                // The Delta boogie: the slide's triplets, three rows of three dots climbing, the
                // landing a bar at the right, lit. Dots 0.09 w apart from 0.12 w, the bar at 0.72 w.
                for row in 0..<3 {
                    let y = h * (0.3 + 0.2 * CGFloat(row))
                    for i in 0..<3 {
                        let x = w * 0.14 + CGFloat(i) * w * 0.1 + CGFloat(row) * w * 0.07
                        ctx.fill(Path(ellipseIn: CGRect(x: x - 3, y: y - 3, width: 6, height: 6)), with: .color(row == 2 ? ink : dim))
                    }
                }
                ctx.fill(Path(roundedRect: CGRect(x: w * 0.72, y: h * 0.24, width: w * 0.12, height: h * 0.52), cornerRadius: 2), with: .color(hot))
            case "amp":
                // The electric Chicago boogie: an amp. The cabinet inset 0.16 w / 0.18 h, a row of
                // five knobs at 0.28 h from 0.26 w to 0.74 w (0.12 w apart), the last one on ten,
                // lit; the speaker centred at 0.6 h, radius 0.17 of the short side, so it spans
                // 0.43–0.77 h, inside the cabinet's 0.84 h floor.
                ctx.stroke(Path(roundedRect: CGRect(x: w * 0.16, y: h * 0.18, width: w * 0.68, height: h * 0.66), cornerRadius: 4),
                           with: .color(ink), lineWidth: 2)
                for i in 0..<5 {
                    let x = w * (0.26 + 0.12 * CGFloat(i)), y = h * 0.28, rr: CGFloat = i == 4 ? 4 : 2.5
                    ctx.fill(Path(ellipseIn: CGRect(x: x - rr, y: y - rr, width: 2 * rr, height: 2 * rr)), with: .color(i == 4 ? hot : dim))
                }
                let sr = min(w, h) * 0.17, sc = CGPoint(x: w * 0.5, y: h * 0.6)
                ctx.stroke(Path(ellipseIn: CGRect(x: sc.x - sr, y: sc.y - sr, width: 2 * sr, height: 2 * sr)), with: .color(ink), lineWidth: 2)
                ctx.stroke(Path(ellipseIn: CGRect(x: sc.x - sr * 0.55, y: sc.y - sr * 0.55, width: sr * 1.1, height: sr * 1.1)), with: .color(dim), lineWidth: 1)
                ctx.fill(Path(ellipseIn: CGRect(x: sc.x - 3, y: sc.y - 3, width: 6, height: 6)), with: .color(ink))
            case "duo":
                // The guitar and the piano trading (McLemore). Left, three piano keys: each 0.09 w
                // wide with 0.03 w between, so 3 × 0.09 + 2 × 0.03 = 0.33 w from 0.12 w to 0.45 w,
                // 0.22 h to 0.78 h, the middle one struck. Right, six strings from 0.55 w to 0.88 w,
                // 0.1 h apart from 0.25 h to 0.75 h, the sting a dot on the second. Margins 0.12 w
                // both sides, 0.1 w between the two.
                for i in 0..<3 {
                    let r = CGRect(x: w * (0.12 + 0.12 * CGFloat(i)), y: h * 0.22, width: w * 0.09, height: h * 0.56)
                    if i == 1 {
                        ctx.fill(Path(roundedRect: r, cornerRadius: 2), with: .color(ink))
                    } else {
                        ctx.stroke(Path(roundedRect: r.insetBy(dx: 0.75, dy: 0.75), cornerRadius: 2), with: .color(ink), lineWidth: 1.5)
                    }
                }
                for i in 0..<6 {
                    var p = Path()
                    let y = h * (0.25 + 0.1 * CGFloat(i))
                    p.move(to: CGPoint(x: w * 0.55, y: y))
                    p.addLine(to: CGPoint(x: w * 0.88, y: y))
                    ctx.stroke(p, with: .color(i == 1 ? ink : dim), lineWidth: i == 1 ? 1.5 : 1)
                }
                ctx.fill(Path(ellipseIn: CGRect(x: w * 0.715 - 4.5, y: h * 0.35 - 4.5, width: 9, height: 9)), with: .color(hot))
            case "penumbra":
                // Halbschatten, the half shadow: two discs of radius 0.26 of the short side, their
                // centres 0.16 w apart on the middle line (0.42 w and 0.58 w), so the pair spans
                // 0.16 w to 0.84 w on an 80 pt tile and 0.24 h to 0.76 h. The left one an outline,
                // the right one the shadow, the lens where they overlap lit.
                let rr = min(w, h) * 0.26
                let a = Path(ellipseIn: CGRect(x: w * 0.42 - rr, y: h * 0.5 - rr, width: 2 * rr, height: 2 * rr))
                let b = Path(ellipseIn: CGRect(x: w * 0.58 - rr, y: h * 0.5 - rr, width: 2 * rr, height: 2 * rr))
                ctx.fill(b, with: .color(dim.opacity(0.55)))
                var lens = ctx
                lens.clip(to: a)
                lens.fill(b, with: .color(hot))
                ctx.stroke(a, with: .color(ink), lineWidth: 2)
            case "tide":
                // Gezeiten, the tides: the moon on the water. The horizon is a line at 0.6 h from
                // 0.14 w to 0.86 w. The moon is a half disc sitting on it, centred at 0.5 w, radius
                // 0.22 of the short side (on an 80 pt tile: 0.28 w to 0.72 w, its top at 0.38 h),
                // lit. Under the horizon its reflection: three strokes 0.09 h apart (0.69, 0.78,
                // 0.87 h), each narrower (0.36, 0.24, 0.12 w), centred, the nearest in ink and the
                // two below fading, so the pull reads down the tile. Margins 0.14 w a side, 0.13 h
                // under the last stroke.
                let rr = min(w, h) * 0.22
                var moon = Path()
                moon.addArc(center: CGPoint(x: w * 0.5, y: h * 0.6), radius: rr, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false)
                moon.closeSubpath()
                ctx.fill(moon, with: .color(hot))
                var horizon = Path()
                horizon.move(to: CGPoint(x: w * 0.14, y: h * 0.6))
                horizon.addLine(to: CGPoint(x: w * 0.86, y: h * 0.6))
                ctx.stroke(horizon, with: .color(ink), lineWidth: 2)
                for (i, width) in [0.36, 0.24, 0.12].enumerated() {
                    var p = Path()
                    let y = h * (0.69 + 0.09 * CGFloat(i))
                    p.move(to: CGPoint(x: w * (0.5 - width / 2), y: y))
                    p.addLine(to: CGPoint(x: w * (0.5 + width / 2), y: y))
                    ctx.stroke(p, with: .color(i == 0 ? ink : dim.opacity(i == 1 ? 1 : 0.6)), style: StrokeStyle(lineWidth: 2, lineCap: .round))
                }
            case "backlight":
                // Gegenlicht, against the light: a disc in silhouette with the light behind it.
                // Centred; the halo a lit ring of radius 0.27 of the short side, the silhouette a
                // disc of 0.21 in the panel's colour, outlined, in front of it (so 0.06 of light shows round its edge), and
                // eight rays from 0.32 to 0.40 (on an 80 pt tile they end 8 pt from the edges).
                let c = CGPoint(x: w * 0.5, y: h * 0.5), m = min(w, h)
                let halo = m * 0.27, disc = m * 0.21
                ctx.fill(Path(ellipseIn: CGRect(x: c.x - halo, y: c.y - halo, width: 2 * halo, height: 2 * halo)), with: .color(hot))
                ctx.fill(Path(ellipseIn: CGRect(x: c.x - disc, y: c.y - disc, width: 2 * disc, height: 2 * disc)), with: .color(Palette.panel))
                ctx.stroke(Path(ellipseIn: CGRect(x: c.x - disc, y: c.y - disc, width: 2 * disc, height: 2 * disc)), with: .color(ink), lineWidth: 1.5)
                for i in 0..<8 {
                    // Typed step by step: the mixed Double / CGFloat one-liners took this body
                    // past the type-checker's time limit on Xcode 26.2.
                    let a: Double = Double(i) * Double.pi / 4 + Double.pi / 8
                    let dx: CGFloat = CGFloat(cos(a)), dy: CGFloat = CGFloat(sin(a))
                    let r0: CGFloat = m * 0.32, r1: CGFloat = m * 0.40
                    var p = Path()
                    p.move(to: CGPoint(x: c.x + r0 * dx, y: c.y + r0 * dy))
                    p.addLine(to: CGPoint(x: c.x + r1 * dx, y: c.y + r1 * dy))
                    ctx.stroke(p, with: .color(i % 2 == 0 ? hot : dim), style: StrokeStyle(lineWidth: 2, lineCap: .round))
                }
            case "stoptime":
                // Chicago stop time: the riff's five bars climbing, then the gap, then the hit.
                // Five bars 0.09 w wide at 0.11 w apart from x = 0.1 w end at 0.64 w; the hit sits
                // at 0.78 w; the gap between reads as the stop.
                for i in 0..<5 {
                    let x = w * 0.1 + CGFloat(i) * w * 0.11
                    let hh = h * (0.22 + 0.1 * CGFloat(i))
                    ctx.fill(Path(roundedRect: CGRect(x: x, y: h * 0.78 - hh, width: w * 0.09, height: hh), cornerRadius: 2),
                             with: .color(i == 4 ? ink : dim))
                }
                ctx.fill(Path(roundedRect: CGRect(x: w * 0.78, y: h * 0.78 - h * 0.62, width: w * 0.12, height: h * 0.62), cornerRadius: 2),
                         with: .color(hot))
                var p = Path()
                p.move(to: CGPoint(x: w * 0.08, y: h * 0.78))
                p.addLine(to: CGPoint(x: w * 0.92, y: h * 0.78))
                ctx.stroke(p, with: .color(dim), lineWidth: 1)
            case "pulse":
                // Minimal: a grid of dots, one lit, one row of rims.
                let cols = 6, rows = 4
                for r in 0..<rows {
                    for c in 0..<cols {
                        let x = w * (0.14 + 0.72 * CGFloat(c) / CGFloat(cols - 1))
                        let y = h * (0.2 + 0.6 * CGFloat(r) / CGFloat(rows - 1))
                        let on = (r == 1 && c == 3)
                        let rr: CGFloat = on ? 5 : (r + c) % 3 == 0 ? 3 : 2
                        ctx.fill(Path(ellipseIn: CGRect(x: x - rr, y: y - rr, width: 2 * rr, height: 2 * rr)),
                                 with: .color(on ? hot : (r + c) % 3 == 0 ? ink : dim))
                    }
                }
            case "nine":
                // Deep house: nine soft stacked bars pushed off the grid, one warm.
                for i in 0..<9 {
                    let y = h * (0.14 + 0.09 * CGFloat(i))
                    let push: CGFloat = i % 4 == 1 || i % 4 == 3 ? 10 : 0
                    let r = CGRect(x: w * 0.16 + push, y: y, width: w * 0.5 + CGFloat(i % 3) * 8, height: 5)
                    ctx.fill(Path(roundedRect: r, cornerRadius: 2.5), with: .color(i == 4 ? hot : i % 2 == 0 ? ink : dim))
                }
            case "abyss":
                // Dub: one stab and its echoes, each fainter and lower.
                for i in 0..<5 {
                    let x = w * (0.16 + 0.17 * CGFloat(i))
                    let hh = h * (0.5 - 0.09 * CGFloat(i))
                    let r = CGRect(x: x, y: h * 0.72 - hh, width: w * 0.08, height: hh)
                    ctx.fill(Path(roundedRect: r, cornerRadius: 2), with: .color(i == 0 ? hot : ink.opacity(1 - 0.18 * Double(i))))
                }
                var p = Path()
                p.move(to: CGPoint(x: w * 0.1, y: h * 0.72))
                p.addLine(to: CGPoint(x: w * 0.9, y: h * 0.72))
                ctx.stroke(p, with: .color(dim), lineWidth: 1)
            default:
                ctx.fill(Path(ellipseIn: CGRect(x: w * 0.4, y: h * 0.4, width: w * 0.2, height: h * 0.2)), with: .color(hot))
            }
        }
        .background(shape.fill(Palette.ground))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
        .clipShape(shape)
        .accessibilityHidden(true)
    }
}
