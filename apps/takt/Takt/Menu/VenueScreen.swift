import SwiftUI

/// A cleared venue's story, over the map: full screen on iPhone, a 480 pt card on the Mac.
/// The photo on top with its credit, then the story, then the level with arrows to the other
/// cleared venues. The story is the reward: venues not cleared don't open.
struct VenueScreen: View {
    let app: AppModel
    let world: MapWorld
    let stop: MapWorld.Stop
    let cleared: Int
    let compact: Bool

    var body: some View {
        if compact {
            content(photoHeight: 330)
                .background(Palette.ground.ignoresSafeArea())
                .transition(.identity)
        } else {
            ZStack {
                Palette.ground.opacity(0.75).ignoresSafeArea()
                    .onTapGesture { app.openVenue = nil }
                    .accessibilityHidden(true)
                content(photoHeight: 300)
                    .frame(width: 480)
                    .frame(maxHeight: 820)
                    .background(Palette.ground)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.line, lineWidth: 1))
                    .padding(.vertical, 30)
            }
        }
    }

    private func content(photoHeight: CGFloat) -> some View {
        let v = stop.venue
        let episode = world.episodes[stop.episode]
        return VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ZStack {
                        VenuePhoto(world: world, venue: v, big: true)
                            .frame(maxWidth: .infinity)
                            .frame(height: photoHeight)
                            .clipped()
                        if let credit = v.photo?.credit {
                            Text(credit)
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundStyle(Color(dark: 0xF2F0EB, paper: 0xF2F0EB))
                                .multilineTextAlignment(.trailing)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 4)
                                .background(Color.black.opacity(0.72))
                                .frame(maxWidth: 300, alignment: .trailing)
                                .padding(8)
                                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                        }
                    }
                    .frame(height: photoHeight)

                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 8) {
                            Text("\(v.era) · \(v.town)").dataLabel(11, weight: .semibold).foregroundStyle(Palette.text)
                            Text(v.status)
                                .dataLabel(10)
                                .foregroundStyle(Palette.muted)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 3)
                                .overlay(RoundedRectangle(cornerRadius: 2).strokeBorder(Palette.line, lineWidth: 1))
                        }
                        Text(v.name)
                            .font(.display(46))
                            .textCase(.uppercase)
                            .foregroundStyle(Palette.text)
                            .lineLimit(2)
                            .minimumScaleFactor(0.6)
                        Text(v.tag).dataLabel(12, weight: .semibold).foregroundStyle(Palette.signal)
                        Text(v.story)
                            .bodyText(15.5)
                            .lineSpacing(4)
                            .foregroundStyle(Palette.text)
                            .fixedSize(horizontal: false, vertical: true)
                        if let note = v.photo?.note {
                            Text("Photo: \(note)").dataLabel(10).foregroundStyle(Palette.muted)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 18)
                    .padding(.bottom, 16)
                }
            }
            .scrollBounceBehavior(.basedOnSize)
            .ignoresSafeArea(edges: compact ? .top : [])
            .overlay(alignment: .top) {
                HStack {
                    Button { app.openVenue = nil } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "chevron.left").font(.system(size: 11, weight: .bold))
                            Text("Map").dataLabel(11, weight: .semibold)
                        }
                        .foregroundStyle(Palette.text)
                        .padding(.horizontal, 14)
                        .frame(height: 40)
                        .background(Capsule().fill(Palette.ground))
                        .overlay(Capsule().strokeBorder(Palette.text, lineWidth: 2))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Back to the map")
                    Spacer()
                    if compact { AskButton(size: 34) }
                    Text("\(episode.title) · \(stop.inEpisode) of \(episode.venues.count)")
                        .dataLabel(10, weight: .semibold)
                        .foregroundStyle(Palette.ground)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(RoundedRectangle(cornerRadius: 2).fill(Palette.text))
                }
                .padding(.horizontal, 16)
                .padding(.top, compact ? 4 : 16)
            }

            LevelBar(app: app, stop: stop, cleared: cleared)
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, compact ? 8 : 16)
        }
    }
}

/// The bottom of a cleared venue: its level, and the arrows to the cleared venues either side.
private struct LevelBar: View {
    let app: AppModel
    let stop: MapWorld.Stop
    let cleared: Int

    var body: some View {
        HStack(spacing: 8) {
            arrow("chevron.left", label: "Previous venue", to: stop.level - 1)
            VStack(alignment: .leading, spacing: 2) {
                Text("Level \(stop.level) · Cleared")
                    .dataLabel(10, weight: .semibold)
                    .foregroundStyle(Palette.line)
                Text(stop.venue.name)
                    .font(.display(20))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.ground)
            }
            .lineLimit(1)
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(height: 56)
            .background(RoundedRectangle(cornerRadius: 6).fill(Palette.text))
            .accessibilityElement(children: .combine)
            arrow("chevron.right", label: "Next venue", to: stop.level + 1)
        }
    }

    /// Only to venues already cleared.
    private func arrow(_ symbol: String, label: String, to level: Int) -> some View {
        let ok = level >= 1 && level <= cleared
        return Button { if ok { app.openVenue = level } } label: {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(ok ? Palette.text : Palette.line)
                .frame(width: 44, height: 44)
                .background(RoundedRectangle(cornerRadius: 6).fill(Palette.panel))
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Palette.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .disabled(!ok)
        .accessibilityLabel(label)
    }
}
