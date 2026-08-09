import SwiftUI

/// The club poster. TAP TAP / DODO, Unbounded 900, pink/amber/cream on ink.
struct TitleScreen: View {
    @EnvironmentObject private var app: AppState
    @State private var showSettings = false

    private let skin = Skin.origin

    var body: some View {
        ZStack {
            RadialGradient(colors: [skin.backgroundAlt.ui, skin.background.ui],
                           center: .top, startRadius: 0, endRadius: 700)
                .ignoresSafeArea()

            VStack(spacing: 14) {
                Spacer()

                Text(skin.titleEyebrow)
                    .font(.custom(Fonts.mono, size: 11))
                    .tracking(3)
                    .textCase(.uppercase)
                    .foregroundStyle(skin.dim.ui)

                VStack(spacing: 0) {
                    HStack(spacing: 12) {
                        Text("TAP").foregroundStyle(skin.laneColors[0].ui)
                        Text("TAP").foregroundStyle(skin.laneColors[1].ui)
                    }
                    Text("DODO").foregroundStyle(skin.foreground.ui)
                }
                .font(.custom(Fonts.unbounded, size: 52))
                .lineSpacing(0)

                Text(skin.titleSub)
                    .font(.custom(Fonts.mono, size: 13))
                    .foregroundStyle(skin.dim.ui)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 300)
                    .padding(.top, 4)

                Button {
                    app.route = .setSelect
                } label: {
                    Text("PLAY")
                        .font(.custom(Fonts.unbounded, size: 16))
                        .tracking(1)
                        .foregroundStyle(skin.background.ui)
                        .padding(.vertical, 18)
                        .padding(.horizontal, 48)
                        .background(Capsule().fill(skin.foreground.ui))
                }
                .padding(.top, 16)

                Text(skin.titleFooter)
                    .font(.custom(Fonts.mono, size: 11))
                    .foregroundStyle(skin.dim.ui)

                Spacer()

                Button {
                    showSettings = true
                } label: {
                    Text("settings")
                        .font(.custom(Fonts.mono, size: 12))
                        .tracking(2)
                        .foregroundStyle(skin.dim.ui)
                        .padding(12)
                }
                .padding(.bottom, 8)
            }
            .padding(24)
        }
        .sheet(isPresented: $showSettings) { SettingsScreen() }
    }
}
