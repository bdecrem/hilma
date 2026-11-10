import SwiftUI

/// The app's two vibes (Bart, 2026-11-10): **Blues** and **Electronic**, flipped with the small
/// switch beside the Settings gear on the three tabs (`VibeToggle`). A vibe is a look and a
/// world, never a different app: the lessons, the plan, the levels cleared and every record are
/// the same under both.
///
/// What follows the vibe:
/// - the tokens (`Palette`): Electronic is the brief's own cold ink and neon; Blues is the same
///   seven tokens a little warmer (sepia ink, cream paper, the signal turned toward amber);
/// - the small type (`Typography`): Electronic labels in SF Mono, Blues in a typewriter face,
///   and Blues reads its body text in a serif, like liner notes;
/// - the map's world (`MapWorld`): the blues road, or the Berlin clubs; level n is level n of
///   the same plan on both;
/// - the launch sound: flipping the vibe sets Settings → Launch sound to the vibe's set (blues,
///   or deep for electronic), so the next launch counts in with it; Off stays off (Bart,
///   2026-11-10);
/// - the Stage: the pinned tracks of the vibe's genre show, the other genre's pinned tracks sit
///   under a disclosure header (`Song.genre`).
enum Vibe: String, CaseIterable, Identifiable {
    case blues, electronic

    /// The stored choice (`-vibe blues|electronic` on the command line picks it too).
    static let key = "vibe"
    /// Level 1 is the blues, and so is the map every player has been on.
    static let fallback = Vibe.blues

    /// What the tokens and the type read on every resolve; `AppModel.vibe` keeps it.
    static var current: Vibe = stored

    static var stored: Vibe {
        Vibe(rawValue: UserDefaults.standard.string(forKey: key) ?? "") ?? fallback
    }

    /// A pinned set last changed before this day never had a say about electronic tracks
    /// (they all sat under All tracks by default): it gets the electronic defaults too
    /// (`StageScreen.joinedLater`).
    static let pinsEpoch = ISO8601DateFormatter().date(from: "2026-11-10T00:00:00Z")!

    var id: String { rawValue }
    var title: String { self == .blues ? "Blues" : "Electronic" }
    var symbol: String { self == .blues ? "music.note" : "waveform" }
    var other: Vibe { self == .blues ? .electronic : .blues }
    /// The launch sound set the vibe picks (`LaunchSound`).
    var launchSet: String { self == .blues ? "blues" : "deep" }
}

/// A vibe's mark: the flat sign for the blues (the blue note), a waveform for electronic.
struct VibeGlyph: View {
    let vibe: Vibe
    var size: CGFloat = 11

    var body: some View {
        if vibe == .blues {
            // The flat sits low in its line box: lifted a tenth of its size to centre it.
            Text("\u{266D}")
                .font(.system(size: size * 1.35, weight: .bold, design: .serif))
                .offset(y: -size * 0.1)
        } else {
            Image(systemName: "waveform")
                .font(.system(size: size * 0.92, weight: .bold))
        }
    }
}

/// The vibe switch: a small track with a lit knob that carries the vibe's glyph, the other
/// vibe's glyph faint at the far end; no names beside it, the glyphs say it (Bart, 2026-11-10).
/// The knob slides first, then the screen cross-fades to the other
/// vibe (the screens are rebuilt: the tokens are read when a view is made).
struct VibeToggle: View {
    let app: AppModel
    /// Where the knob sits: ahead of `app.vibe` for the length of the slide.
    @State private var shown: Vibe?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    static let width: CGFloat = 56
    static let height: CGFloat = 30

    var body: some View {
        let vibe = shown ?? app.vibe
        Button(action: flip) {
            Group {
                // The track is 56 × 30; the knob 24 with 3 pt around it, so it travels 26 pt.
                ZStack(alignment: vibe == .blues ? .leading : .trailing) {
                    Capsule().fill(Palette.panel)
                    Capsule().strokeBorder(Palette.line, lineWidth: 1)
                    HStack {
                        glyph(.blues).opacity(vibe == .blues ? 0 : 1)
                        Spacer(minLength: 0)
                        glyph(.electronic).opacity(vibe == .electronic ? 0 : 1)
                    }
                    .padding(.horizontal, 9)
                    Circle()
                        .fill(Palette.signal)
                        .frame(width: 24, height: 24)
                        .overlay(VibeGlyph(vibe: vibe, size: 12).foregroundStyle(Palette.blackKey))
                        .padding(3)
                }
                .frame(width: Self.width, height: Self.height)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help("Vibe: \(app.vibe.title). Switch to \(app.vibe.other.title)")
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Vibe")
        .accessibilityValue(app.vibe.title)
        .accessibilityHint("Switches to \(app.vibe.other.title): the look, the map and the Stage's tracks")
        .accessibilityAddTraits(.isButton)
    }

    private func glyph(_ v: Vibe) -> some View {
        VibeGlyph(vibe: v, size: 11).foregroundStyle(Palette.muted)
    }

    private func flip() {
        let to = app.vibe.other
        guard shown == nil else { return }
        if reduceMotion {
            app.vibe = to
            return
        }
        withAnimation(.snappy(duration: 0.22)) { shown = to }
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(0.2))
            withAnimation(.easeInOut(duration: 0.3)) { app.vibe = to }
        }
    }
}
