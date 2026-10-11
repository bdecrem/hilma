import SwiftUI

/// The learner's face: one of Dodo's jelly critters (`Assets.xcassets/Jelly`,
/// the same sprites Dodo renders from misc/dodo-redesign — eyes open, and a
/// `-squish` frame with > < eyes for the tap). The server keeps the pick
/// (`dolly_users.avatar`, src/lib/dolly/avatar.ts) and hands everyone a
/// stable default from their id, so nobody is faceless. Gummy is Dolly's own
/// face and stays out of the picker.
enum JellyCritter: String, CaseIterable, Identifiable {
    case dodo
    case dodoPink = "dodo-pink"
    case dodoPeach = "dodo-peach"
    case dodoMint = "dodo-mint"
    case dodoLemon = "dodo-lemon"
    case dodoGrape = "dodo-grape"
    case dodoCherry = "dodo-cherry"
    case dodoLime = "dodo-lime"
    case bunny, peach, cat, dragon, gummy, penguin, octo, panda, blob, hamster, bat, bee, cloud, mushroom, sprite

    var id: String { rawValue }
    var imageName: String { "Jelly/\(rawValue)" }
    var squishImageName: String { "Jelly/\(rawValue)-squish" }

    /// What the server offers (everyone but Gummy), dodos first.
    static let pickable: [JellyCritter] = allCases.filter { $0 != .gummy }

    var name: String {
        switch self {
        case .dodo: return "Sky dodo"
        case .dodoPink: return "Pink dodo"
        case .dodoPeach: return "Peach dodo"
        case .dodoMint: return "Mint dodo"
        case .dodoLemon: return "Lemon dodo"
        case .dodoGrape: return "Grape dodo"
        case .dodoCherry: return "Cherry dodo"
        case .dodoLime: return "Lime dodo"
        case .bunny: return "Bunny"
        case .peach: return "Peach"
        case .cat: return "Cat"
        case .dragon: return "Dragon"
        case .gummy: return "Gummy"
        case .penguin: return "Penguin"
        case .octo: return "Octo"
        case .panda: return "Red panda"
        case .blob: return "Blob"
        case .hamster: return "Hamster"
        case .bat: return "Bat"
        case .bee: return "Bee"
        case .cloud: return "Cloud"
        case .mushroom: return "Mushroom"
        case .sprite: return "Sprite"
        }
    }

    /// The body's light tint (behind the disc) and base color (its ring).
    var tint: UInt32 {
        switch self {
        case .dodo: return 0xDCF6FF
        case .dodoPink, .bunny: return 0xFFE0EF
        case .dodoPeach, .peach: return 0xFFE6CF
        case .dodoMint, .cat: return 0xE2FFF4
        case .dodoLemon, .bee: return 0xFFF8C8
        case .dodoGrape, .bat: return 0xEFE2FF
        case .dodoCherry, .octo: return 0xFFD9D7
        case .dodoLime: return 0xEFFFD0
        case .dragon: return 0xC8F7D6
        case .gummy: return 0xFFD6E6
        case .penguin: return 0xE4E4EE
        case .panda: return 0xFFE2CB
        case .blob: return 0xFFE7DC
        case .hamster: return 0xFFF0D2
        case .cloud: return 0xEAF4FF
        case .mushroom: return 0xFFF2E6
        case .sprite: return 0xE4FFF7
        }
    }

    var base: UInt32 {
        switch self {
        case .dodo: return 0x5EC6EC
        case .dodoPink, .bunny: return 0xFF9FC8
        case .dodoPeach, .peach: return 0xFFAA82
        case .dodoMint, .cat: return 0x91E9CC
        case .dodoLemon, .bee: return 0xFFD43A
        case .dodoGrape, .bat: return 0xA77BF2
        case .dodoCherry, .octo: return 0xFF6B70
        case .dodoLime: return 0xA3E45C
        case .dragon: return 0x5FBF86
        case .gummy: return 0xFF3C86
        case .penguin: return 0x6C6C7C
        case .panda: return 0xDA642C
        case .blob: return 0xFFAC8E
        case .hamster: return 0xFFBE62
        case .cloud: return 0xA6C8F2
        case .mushroom: return 0xE2B88A
        case .sprite: return 0x62CFB5
        }
    }

    /// The server's kind, or the sky dodo when a build meets one it does not know.
    static func from(_ kind: String?) -> JellyCritter {
        kind.flatMap(JellyCritter.init(rawValue:)) ?? .dodo
    }
}

/// A critter on its tinted disc — Dodo's `JellyAvatarDisc`, with the jelly
/// squish on a tap when `tappable`.
struct JellyAvatarDisc: View {
    let critter: JellyCritter
    var size: CGFloat = 44
    var squished: Bool = false
    var ring: Bool = true

    var body: some View {
        ZStack {
            Circle()
                .fill(RadialGradient(
                    colors: [Color(hex: critter.tint), Color(hex: critter.tint), Color(hex: critter.base).opacity(0.35)],
                    center: UnitPoint(x: 0.4, y: 0.35), startRadius: 0, endRadius: size * 0.72))
            Image(squished ? critter.squishImageName : critter.imageName)
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: size * 0.92, height: size * 0.92)
                .offset(y: size * 0.02)
                .scaleEffect(x: squished ? 1.12 : 1, y: squished ? 0.88 : 1, anchor: .bottom)
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(ring ? Color.white : .clear, lineWidth: size > 60 ? 4 : 2.5))
        .shadow(color: Color(hex: critter.base).opacity(0.35), radius: size * 0.16, y: size * 0.08)
    }
}

/// "Your avatar": the grid of critters; a tap squishes it, then it is the
/// pick (saved on the server, so it follows the account).
struct AvatarPicker: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @State private var squished: JellyCritter?
    @State private var saving = false
    @State private var error: String?
    private let skin = Skin.current
    private let columns = [GridItem(.adaptive(minimum: 72, maximum: 96), spacing: 10)]

    var body: some View {
        let current = JellyCritter.from(state.user?.avatar)
        ZStack {
            skin.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 16) {
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Your avatar").font(skin.display(28)).foregroundStyle(skin.ink)
                            Text("Pick a jelly.").font(skin.ui(14)).foregroundStyle(skin.ink2)
                        }
                        Spacer()
                        CloseButton { dismiss() }
                    }
                    .padding(.top, 18)
                    Card(padding: 16) {
                        LazyVGrid(columns: columns, spacing: 14) {
                            ForEach(JellyCritter.pickable) { critter in
                                let picked = critter == current
                                Button {
                                    guard !saving else { return }
                                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                    withAnimation(.spring(response: 0.22, dampingFraction: 0.45)) { squished = critter }
                                    Task { await pick(critter) }
                                } label: {
                                    VStack(spacing: 5) {
                                        JellyAvatarDisc(critter: critter, size: 64, squished: squished == critter, ring: false)
                                            .overlay(Circle().stroke(picked ? Color(hex: critter.base) : .clear, lineWidth: 3))
                                            .overlay(alignment: .bottomTrailing) {
                                                if picked {
                                                    Image(systemName: "checkmark.circle.fill")
                                                        .font(.system(size: 18, weight: .bold))
                                                        .foregroundStyle(.white, Color(hex: critter.base))
                                                        .offset(x: 3, y: 3)
                                                }
                                            }
                                        Text(critter.name).font(skin.uiBold(11)).foregroundStyle(skin.ink2).lineLimit(1).minimumScaleFactor(0.8)
                                    }
                                    .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("\(critter.name)\(picked ? ", current avatar" : "")")
                            }
                        }
                    }
                    if let error { Text(error).font(skin.uiBold(13)).foregroundStyle(skin.bad) }
                }
                .padding(.horizontal, 22)
                .padding(.bottom, 30)
            }
        }
        .presentationDragIndicator(.visible)
    }

    private func pick(_ critter: JellyCritter) async {
        saving = true
        defer { saving = false }
        do {
            try await Task.sleep(for: .milliseconds(360))
            state.user = try await DollyAPI.shared.updateMe(avatar: critter.rawValue)
            dismiss()
        } catch {
            squished = nil
            self.error = error.localizedDescription
        }
    }
}
