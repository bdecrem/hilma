import SwiftUI

/// Chord Detective: hold any keys, on a MIDI keyboard or the strip on screen, and the chord's
/// name comes up big, spelled in the chord, with its notes and degrees under it. The chords you
/// play line up underneath; when the last few make a famous progression, a card says which.
/// Opened from the Learn tab (`ChordDetectiveCard`); nothing is scored or recorded.
struct ChordSheet: View {
    let player: Player
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var trail = ChordDetective.Trail()
    /// The last thing read, kept up after the keys come up so it can be read.
    @State private var last: ChordDetective.Reading?

    private var compact: Bool { sizeClass == .compact }

    var body: some View {
        let reading = ChordDetective.read(player.pressed)
        let shown = reading ?? last
        let live = reading != nil
        VStack(alignment: .leading, spacing: 0) {
            header
                .padding(.horizontal, compact ? 16 : 24)
                .padding(.top, compact ? 18 : 22)
                .padding(.bottom, 14)
            Hairline()
            ScrollView {
                VStack(alignment: .leading, spacing: compact ? 18 : 22) {
                    nameplate(shown, live: live)
                    if let match = trail.match {
                        matchCard(match)
                    }
                    if !trail.chords.isEmpty {
                        trailRow
                    }
                }
                .padding(.horizontal, compact ? 16 : 24)
                .padding(.vertical, compact ? 18 : 24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            Hairline()
            // Two octaves on the phone, three on the Mac, from C3; every key plays as touched
            // (tap mode's "the notes due" means nothing here).
            KeyboardStrip(low: 48, high: compact ? 71 : 83, pressed: player.pressed, keyCaps: false, plainTouch: true)
                .frame(height: compact ? 120 : 150)
                .padding(.horizontal, compact ? 8 : 24)
                .padding(.vertical, 12)
                .environment(\.lessonControls, LessonControls(
                    press: { player.press($0) },
                    release: player.release
                ))
        }
        .background(Palette.ground)
        .onChange(of: player.pressed, initial: true) { _, held in
            if let r = ChordDetective.read(held) { last = r }
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                _ = trail.update(held: held)
            }
        }
    }

    // MARK: Pieces

    private var header: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Chord Detective")
                    .font(.display(compact ? 30 : 40))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.signal)
                Text("Hold any keys · Takt names what you play")
                    .dataLabel(11)
                    .foregroundStyle(Palette.muted)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            if !trail.chords.isEmpty {
                Button { withAnimation { trail.clear() } } label: {
                    Text("Clear")
                        .dataLabel(11, weight: .semibold)
                        .foregroundStyle(Palette.muted)
                        .padding(.horizontal, 12)
                        .frame(height: 32)
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Palette.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear the chords played")
            }
            QuietButton(title: "Done") { dismiss() }
        }
    }

    /// The name, big; what it is; the notes and degrees. Dimmed once the keys are up.
    @ViewBuilder
    private func nameplate(_ r: ChordDetective.Reading?, live: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let r {
                Text(r.display)
                    .font(.display(compact ? (r.kind == .interval ? 56 : 92) : (r.kind == .interval ? 72 : 128)))
                    .foregroundStyle(live ? (r.kind == .unknown ? Palette.muted : Palette.signal) : Palette.text.opacity(0.55))
                    .lineLimit(1)
                    .minimumScaleFactor(0.4)
                    .contentTransition(.numericText())
                Text(r.long)
                    .bodyText(compact ? 17 : 20, weight: .semibold)
                    .foregroundStyle(live ? Palette.text : Palette.muted)
                HStack(spacing: 18) {
                    Text(r.notes.joined(separator: " · "))
                        .dataLabel(13, weight: .semibold)
                        .foregroundStyle(Palette.text)
                    if !r.degrees.isEmpty {
                        Text(r.degrees.joined(separator: " "))
                            .dataLabel(13)
                            .foregroundStyle(Palette.cue)
                    }
                }
            } else {
                Text("—")
                    .font(.display(compact ? 92 : 128))
                    .foregroundStyle(Palette.line)
                Text("Hold a chord. Any chord. Then another.")
                    .bodyText(compact ? 17 : 20, weight: .semibold)
                    .foregroundStyle(Palette.muted)
                Text("Play a few in a row and see if you've found a famous one.")
                    .bodyText(14)
                    .foregroundStyle(Palette.muted)
            }
        }
        .frame(maxWidth: .infinity, minHeight: compact ? 180 : 230, alignment: .topLeading)
        .animation(.easeOut(duration: 0.12), value: r?.display)
        .accessibilityElement(children: .combine)
    }

    private func matchCard(_ m: ChordDetective.Match) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("You just played")
                .dataLabel(11, weight: .semibold)
                .foregroundStyle(Palette.signal)
            Text(m.name)
                .font(.display(compact ? 30 : 38))
                .foregroundStyle(Palette.text)
            Text(m.numerals)
                .dataLabel(13, weight: .semibold)
                .foregroundStyle(Palette.cue)
            Text(m.line)
                .bodyText(15)
                .foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 8).fill(Palette.panel))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.signal, lineWidth: 1.5))
        .transition(.scale(scale: 0.92).combined(with: .opacity))
        .id(m.name + m.numerals)
    }

    /// The chords played, oldest first, the newest lit.
    private var trailRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Played")
                .dataLabel(11, weight: .semibold)
                .foregroundStyle(Palette.muted)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(trail.chords.enumerated()), id: \.offset) { i, c in
                        let newest = i == trail.chords.count - 1
                        Text(c.display)
                            .dataLabel(13, weight: .semibold)
                            .foregroundStyle(newest ? Palette.ground : Palette.text)
                            .padding(.horizontal, 12)
                            .frame(height: 32)
                            .background(RoundedRectangle(cornerRadius: 6).fill(newest ? Palette.signal : Palette.panel))
                            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(newest ? Palette.signal : Palette.line, lineWidth: 1))
                    }
                }
            }
        }
    }
}

/// The Learn tab's way in: a small card under Today.
struct ChordDetectiveCard: View {
    let app: AppModel
    var compact = false

    var body: some View {
        Button { app.chordsOpen = true } label: {
            HStack(spacing: 14) {
                Text("C7")
                    .font(.display(compact ? 26 : 30))
                    .foregroundStyle(Palette.signal)
                    .frame(width: compact ? 52 : 60)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Chord Detective")
                        .dataLabel(13, weight: .semibold)
                        .foregroundStyle(Palette.text)
                    Text("Hold any keys. Takt names the chord, and spots famous progressions.")
                        .bodyText(14)
                        .foregroundStyle(Palette.muted)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Palette.muted)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 8).fill(Palette.panel))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.line, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Chord Detective: hold any keys and Takt names the chord")
    }
}
