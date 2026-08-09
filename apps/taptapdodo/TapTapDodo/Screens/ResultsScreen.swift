import SwiftUI
import UIKit

/// Grade letter huge, score / max combo / accuracy, one line of flavor,
/// the seed with copy-on-tap, AGAIN.
struct ResultsScreen: View {
    let config: RunConfig
    @EnvironmentObject private var app: AppState
    @State private var copied = false

    var body: some View {
        let skin = Skin.forTrack(app.library.byId(config.trackId)?.skinRef ?? config.trackId)
        let result = app.lastResult

        ZStack {
            skin.background.ui.ignoresSafeArea()

            VStack(spacing: 16) {
                Spacer()

                Text(skin.styled(config.isDaily ? "DAILY SET COMPLETE" : "SET COMPLETE"))
                    .font(.custom(Fonts.mono, size: 11))
                    .tracking(4)
                    .foregroundStyle(skin.dim.ui)

                if let result {
                    Text(skin.styled(result.grade))
                        .font(.custom(skin.displayFont, size: 92))
                        .foregroundStyle((skin.lowercase ? skin.foreground : skin.laneColors[2]).ui)

                    if result.isNewBest {
                        Text(skin.styled("NEW BEST"))
                            .font(.custom(Fonts.mono, size: 11))
                            .tracking(4)
                            .foregroundStyle(skin.laneColors[0].ui)
                    }

                    HStack(spacing: 28) {
                        stat(String(result.score), "score", skin: skin)
                        stat("\(result.maxCombo)×", "max combo", skin: skin)
                        stat("\(result.accuracy)%", "accuracy", skin: skin)
                    }
                    .padding(.top, 6)

                    // the split, in each set's own judgment vocabulary
                    Text(skin.styled("\(skin.judgeLabels.perfect) \(result.perfects) · \(skin.judgeLabels.good) \(result.goods) · \(skin.judgeLabels.miss) \(result.misses)"))
                        .font(.custom(Fonts.mono, size: 11))
                        .tracking(1)
                        .foregroundStyle(skin.dim.ui)

                    if result.unlockedGabber {
                        Text(Skin.gabber.styled("ttd·04 unlocked — the wall of kick awaits"))
                            .font(.custom(Fonts.mono, size: 12))
                            .tracking(2)
                            .foregroundStyle(Skin.gabber.laneColors[0].ui)
                            .padding(.top, 6)
                    }

                    Text(skin.flavorLine(for: result.grade))
                        .font(.custom(Fonts.mono, size: 13))
                        .foregroundStyle(skin.dim.ui)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 320)
                        .padding(.top, 8)

                    Button {
                        UIPasteboard.general.string = config.deepLink
                        copied = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { copied = false }
                    } label: {
                        Text(copied ? skin.styled("link copied") : "seed \(String(config.seed, radix: 16))")
                            .font(.custom(Fonts.mono, size: 11))
                            .tracking(1)
                            .foregroundStyle(skin.dim.ui)
                            .padding(8)
                    }
                }

                Button {
                    app.uiTap()
                    app.startRun(trackId: config.trackId)
                } label: {
                    Text(skin.styled("AGAIN"))
                        .font(.custom(skin.displayFont, size: 16))
                        .tracking(skin.lowercase ? 4 : 1)
                        .foregroundStyle(skin.background.ui)
                        .padding(.vertical, 18)
                        .padding(.horizontal, 44)
                        .background(Capsule().fill(skin.foreground.ui))
                }
                .padding(.top, 12)

                HStack(spacing: 26) {
                    Button {
                        app.uiTap()
                        app.startRun(trackId: config.trackId, seed: config.seed)
                    } label: {
                        Text(skin.styled("replay seed"))
                            .font(.custom(Fonts.mono, size: 13))
                            .tracking(3)
                            .foregroundStyle(skin.dim.ui)
                            .padding(10)
                    }
                    Button {
                        app.uiTap()
                        app.route = .setSelect
                    } label: {
                        Text(skin.styled("sets"))
                            .font(.custom(Fonts.mono, size: 13))
                            .tracking(3)
                            .foregroundStyle(skin.dim.ui)
                            .padding(10)
                    }
                }

                Spacer()
            }
            .padding(24)
        }
    }

    private func stat(_ value: String, _ label: String, skin: Skin) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.custom(skin.displayFont, size: 20))
                .foregroundStyle(skin.foreground.ui)
            Text(skin.styled(label))
                .font(.custom(Fonts.mono, size: 10))
                .tracking(3)
                .foregroundStyle(skin.dim.ui)
        }
    }
}
