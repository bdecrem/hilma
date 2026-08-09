import SwiftUI

/// Horizontal pager: daily card first, then one card per set, each styled in
/// its own skin. Big set number, name, BPM, personal best, grade badge.
struct SetSelectScreen: View {
    @EnvironmentObject private var app: AppState
    @State private var showSettings = false

    var body: some View {
        let skin = Skin.origin
        ZStack {
            skin.background.ui.ignoresSafeArea()

            VStack(spacing: 0) {
                HStack {
                    Button {
                        app.route = .title
                    } label: {
                        Text("← title")
                            .font(.custom(Fonts.mono, size: 12))
                            .foregroundStyle(skin.dim.ui)
                            .padding(8)
                    }
                    Spacer()
                    Text("choose your set")
                        .font(.custom(Fonts.mono, size: 11))
                        .tracking(3)
                        .foregroundStyle(skin.dim.ui)
                    Spacer()
                    Button {
                        showSettings = true
                    } label: {
                        Text("⚙")
                            .font(.system(size: 16))
                            .foregroundStyle(skin.dim.ui)
                            .padding(8)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.top, 8)

                TabView(selection: $app.selectedSetIndex) {
                    DailyCard().tag(0)
                    ForEach(Array(TrackDef.all.enumerated()), id: \.element.id) { index, track in
                        SetCard(track: track).tag(index + 1)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .always))
                .indexViewStyle(.page(backgroundDisplayMode: .always))
            }
        }
        .sheet(isPresented: $showSettings) { SettingsScreen() }
    }
}

private struct SetCard: View {
    let track: TrackDef
    @EnvironmentObject private var app: AppState

    var body: some View {
        let skin = Skin.forTrack(track.id)
        let locked = track.id == TrackDef.gabber.id && !app.gabberUnlocked
        let best = app.store.bests[track.id]

        VStack(spacing: 12) {
            Spacer()

            Text(skin.styled(track.label))
                .font(.custom(Fonts.mono, size: 12))
                .tracking(4)
                .foregroundStyle(skin.dim.ui)

            Text(skin.styled(track.name))
                .font(.custom(skin.displayFont, size: 40))
                .foregroundStyle(skin.foreground.ui)

            Text(skin.styled(track.genreLine))
                .font(.custom(Fonts.mono, size: 12))
                .foregroundStyle(skin.dim.ui)
                .multilineTextAlignment(.center)

            HStack(spacing: 22) {
                stat(String(Int(track.bpm)), "bpm", skin: skin)
                if let best {
                    stat(String(best.score), "best", skin: skin)
                    stat(skin.styled(best.grade), "grade", skin: skin, color: skin.laneColors[2].ui)
                } else {
                    stat("—", "best", skin: skin)
                }
            }
            .padding(.top, 8)

            if locked {
                Text(skin.styled("S-rank any set to unlock"))
                    .font(.custom(Fonts.mono, size: 12))
                    .foregroundStyle(skin.dim.ui)
                    .padding(.top, 14)
            } else {
                Button {
                    app.startRun(trackId: track.id)
                } label: {
                    Text(skin.styled("PLAY THIS SET"))
                        .font(.custom(skin.displayFont, size: 14))
                        .tracking(skin.lowercase ? 4 : 1)
                        .foregroundStyle(skin.background.ui)
                        .padding(.vertical, 16)
                        .padding(.horizontal, 36)
                        .background(
                            skin.lowercase
                                ? AnyShapeStyle(skin.foreground.ui)
                                : AnyShapeStyle(skin.foreground.ui),
                            in: skin.lowercase
                                ? AnyShape(Rectangle())
                                : AnyShape(Capsule())
                        )
                }
                .padding(.top, 14)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 22)
                .fill(LinearGradient(colors: [skin.backgroundAlt.ui, skin.background.ui],
                                     startPoint: .top, endPoint: .bottom))
                .overlay(RoundedRectangle(cornerRadius: 22).stroke(skin.dim.ui.opacity(0.35), lineWidth: 1))
        )
        .opacity(locked ? 0.6 : 1)
        .padding(.horizontal, 22)
        .padding(.vertical, 26)
    }

    private func stat(_ value: String, _ label: String, skin: Skin, color: Color? = nil) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.custom(skin.displayFont, size: 18))
                .foregroundStyle(color ?? skin.foreground.ui)
            Text(label)
                .font(.custom(Fonts.mono, size: 9))
                .tracking(3)
                .foregroundStyle(skin.dim.ui)
        }
    }
}

private struct DailyCard: View {
    @EnvironmentObject private var app: AppState

    var body: some View {
        let trackId = ScoreStore.dailyTrackId()
        let track = TrackDef.byId(trackId)!
        let skin = Skin.forTrack(trackId)
        let played = app.store.todaysDaily()

        VStack(spacing: 12) {
            Spacer()

            Text(skin.styled("DAILY SET"))
                .font(.custom(Fonts.mono, size: 12))
                .tracking(4)
                .foregroundStyle(skin.laneColors[0].ui)

            Text(skin.styled(track.name))
                .font(.custom(skin.displayFont, size: 40))
                .foregroundStyle(skin.foreground.ui)

            Text(skin.styled("same chart for everyone today"))
                .font(.custom(Fonts.mono, size: 12))
                .foregroundStyle(skin.dim.ui)

            Text("seed \(String(ScoreStore.dailySeed(), radix: 16))")
                .font(.custom(Fonts.mono, size: 11))
                .foregroundStyle(skin.dim.ui)

            if let played {
                HStack(spacing: 22) {
                    statBlock(String(played.score), "scored", skin: skin)
                    statBlock(skin.styled(played.grade), "grade", skin: skin)
                }
                .padding(.top, 8)
                Text(skin.styled("scored. practice runs are free."))
                    .font(.custom(Fonts.mono, size: 11))
                    .foregroundStyle(skin.dim.ui)
            } else {
                Text(skin.styled("one scored attempt · practice free"))
                    .font(.custom(Fonts.mono, size: 11))
                    .foregroundStyle(skin.dim.ui)
                    .padding(.top, 8)
            }

            Button {
                app.startDaily()
            } label: {
                Text(skin.styled(played == nil ? "PLAY TODAY'S SET" : "PRACTICE"))
                    .font(.custom(skin.displayFont, size: 14))
                    .tracking(skin.lowercase ? 4 : 1)
                    .foregroundStyle(skin.background.ui)
                    .padding(.vertical, 16)
                    .padding(.horizontal, 36)
                    .background(Capsule().fill(skin.foreground.ui))
            }
            .padding(.top, 14)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 22)
                .fill(LinearGradient(colors: [skin.backgroundAlt.ui, skin.background.ui],
                                     startPoint: .top, endPoint: .bottom))
                .overlay(
                    RoundedRectangle(cornerRadius: 22)
                        .stroke(skin.laneColors[0].ui.opacity(0.5), lineWidth: 1)
                )
        )
        .padding(.horizontal, 22)
        .padding(.vertical, 26)
    }

    private func statBlock(_ value: String, _ label: String, skin: Skin) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.custom(skin.displayFont, size: 18))
                .foregroundStyle(skin.foreground.ui)
            Text(label)
                .font(.custom(Fonts.mono, size: 9))
                .tracking(3)
                .foregroundStyle(skin.dim.ui)
        }
    }
}
