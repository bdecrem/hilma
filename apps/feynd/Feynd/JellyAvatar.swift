import SwiftUI
import UIKit

/// The jelly critters from misc/dodo-redesign, rendered into the asset
/// catalog by `scripts/dodo-jelly/sprites.mjs` as `Jelly/<kind>` (eyes
/// open) and `Jelly/<kind>-squish` (> < eyes, honk mouth — the tap frame).
/// The eight dodo colours are critters too: the avatar picker offers all of
/// them, and the Peck map seats a few along the trail.
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
    var isDodo: Bool { rawValue.hasPrefix("dodo") }

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

    /// The body's light and base colours (the page's `c[0]`, `c[1]`): the
    /// tint goes behind the avatar disc, the base colours its ring.
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

    /// The picker's order: the dodos first, then the critters.
    static let dodos: [JellyCritter] = allCases.filter(\.isDodo)
    static let critters: [JellyCritter] = allCases.filter { !$0.isDodo }
}

/// A critter as a profile picture. The server knows only an image URL
/// (`f2_users.avatar_url`, uploaded through the same route a photo uses),
/// so the pick is remembered on this device next to the URL it produced;
/// while the server still serves that URL the app draws the critter from
/// its own sprite (instant, no network), otherwise the URL as usual.
enum JellyAvatar {
    static let kindKey = "jellyAvatarKind"
    static let urlKey = "jellyAvatarURL"

    /// The critter behind the user's current avatar, if it is one we made.
    static func current(avatarUrl: String?) -> JellyCritter? {
        guard let url = avatarUrl,
              UserDefaults.standard.string(forKey: urlKey) == url,
              let kind = UserDefaults.standard.string(forKey: kindKey)
        else { return nil }
        return JellyCritter(rawValue: kind)
    }

    /// Render the critter on its tinted disc and make it the profile picture.
    @MainActor
    static func apply(_ critter: JellyCritter, session: Session) async throws {
        let data = render(critter)
        let url = try await F2API.shared.uploadAvatar(imageData: data, mime: "image/png")
        UserDefaults.standard.set(critter.rawValue, forKey: kindKey)
        UserDefaults.standard.set(url, forKey: urlKey)
        session.setAvatarUrl(url)
    }

    static func forget() {
        UserDefaults.standard.removeObject(forKey: kindKey)
        UserDefaults.standard.removeObject(forKey: urlKey)
    }

    /// A 256 px PNG: the critter's light tint as a disc, the sprite over it.
    static func render(_ critter: JellyCritter, px: CGFloat = 256) -> Data {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: px, height: px), format: format)
        return renderer.pngData { ctx in
            let cg = ctx.cgContext
            let disc = CGRect(x: 0, y: 0, width: px, height: px)
            cg.addEllipse(in: disc)
            cg.clip()
            let tint = UIColor(hex: critter.tint)
            let deep = UIColor(hex: critter.base).withAlphaComponent(0.35)
            let colors = [tint.cgColor, tint.cgColor, deep.cgColor] as CFArray
            if let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 0.55, 1]) {
                cg.drawRadialGradient(grad, startCenter: CGPoint(x: px * 0.4, y: px * 0.35), startRadius: 0,
                                      endCenter: CGPoint(x: px * 0.5, y: px * 0.5), endRadius: px * 0.72, options: [])
            } else {
                tint.setFill()
                cg.fill(disc)
            }
            if let sprite = UIImage(named: critter.imageName) {
                // The sprite box has ~8% margin; fill the disc generously
                // and let the bottom of a tall body sit on the rim.
                let side = px * 0.92
                sprite.draw(in: CGRect(x: (px - side) / 2, y: (px - side) / 2 + px * 0.02, width: side, height: side))
            }
        }
    }
}

/// A critter on its tinted disc, for badges and the picker.
struct JellyAvatarDisc: View {
    let critter: JellyCritter
    var size: CGFloat = 38
    var squished: Bool = false

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
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }
}

// MARK: - The picker

import PhotosUI

/// "Your avatar": the critter grid, a photo as the other way, and remove.
/// Presented from the profile hero; the parent owns the photo plumbing
/// (PhotosPicker item on iOS, a file importer result on Mac Catalyst).
struct JellyAvatarPicker: View {
    let current: JellyCritter?
    let hasPicture: Bool
    @Binding var pickerItem: PhotosPickerItem?
    var onFile: (Result<[URL], Error>) -> Void
    var onPick: (JellyCritter) -> Void
    var onRemove: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var showFileImporter = false
    @State private var squished: JellyCritter? = nil

    private let columns = [GridItem(.adaptive(minimum: 72, maximum: 96), spacing: 10)]

    var body: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(FeyndTheme.surface3)
                .frame(width: 38, height: 5)
                .padding(.top, 10)
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Your avatar")
                        .font(.custom("Fredoka", size: 24).weight(.semibold))
                        .foregroundStyle(FeyndTheme.text)
                    Text("Pick a jelly, or use a photo.")
                        .font(.system(size: 14))
                        .foregroundStyle(FeyndTheme.text2)
                }
                Spacer()
                Button { closeModal(dismiss) } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text2)
                        .frame(width: 36, height: 36)
                        .background(FeyndTheme.surface2, in: Circle())
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.cancelAction)
            }
            .padding(.horizontal, 22)
            .padding(.top, 16)
            .padding(.bottom, 8)

            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    sectionLabel("DODOS")
                    grid(JellyCritter.dodos)
                    sectionLabel("CRITTERS")
                        .padding(.top, 8)
                    grid(JellyCritter.critters)
                }
                .padding(.horizontal, 22)
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)

            VStack(spacing: 10) {
                #if targetEnvironment(macCatalyst)
                Button { showFileImporter = true } label: { photoLabel }
                    .buttonStyle(.plain)
                    .fileImporter(isPresented: $showFileImporter, allowedContentTypes: [.jpeg, .png],
                                  allowsMultipleSelection: false) { result in
                        onFile(result)
                        closeModal(dismiss)
                    }
                #else
                PhotosPicker(selection: $pickerItem, matching: .images, photoLibrary: .shared()) { photoLabel }
                    .buttonStyle(.plain)
                    .onChange(of: pickerItem) { _, item in
                        if item != nil { closeModal(dismiss) }
                    }
                #endif
                if hasPicture {
                    Button {
                        onRemove()
                        closeModal(dismiss)
                    } label: {
                        Text("Remove picture")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(FeyndTheme.text2)
                            .frame(maxWidth: .infinity)
                            .frame(height: 44)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 8)
            .padding(.bottom, 18)
            .background(FeyndTheme.bgRaised)
        }
        .background(FeyndTheme.bg.ignoresSafeArea())
    }

    private var photoLabel: some View {
        HStack(spacing: 8) {
            Image(systemName: "photo.on.rectangle")
                .font(.system(size: 15, weight: .semibold))
            Text("Use a photo")
                .font(.system(size: 16, weight: .semibold))
        }
        .foregroundStyle(FeyndTheme.text)
        .frame(maxWidth: .infinity)
        .frame(height: 50)
        .background(FeyndTheme.surface, in: Capsule())
        .overlay(Capsule().stroke(FeyndTheme.border, lineWidth: 1))
    }

    private func sectionLabel(_ s: String) -> some View {
        Text(s)
            .font(.system(size: 11, weight: .heavy))
            .tracking(1.4)
            .foregroundStyle(FeyndTheme.text3)
    }

    private func grid(_ items: [JellyCritter]) -> some View {
        LazyVGrid(columns: columns, spacing: 12) {
            ForEach(items) { critter in
                let picked = critter == current
                Button {
                    // A jelly squish, then it becomes the avatar.
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    withAnimation(.spring(response: 0.22, dampingFraction: 0.45)) { squished = critter }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.36) {
                        onPick(critter)
                        closeModal(dismiss)
                    }
                } label: {
                    VStack(spacing: 5) {
                        JellyAvatarDisc(critter: critter, size: 64, squished: squished == critter)
                            .overlay(
                                Circle().stroke(picked ? Color(hex: critter.base) : .clear, lineWidth: 3)
                            )
                            .overlay(alignment: .bottomTrailing) {
                                if picked {
                                    Image(systemName: "checkmark.circle.fill")
                                        .font(.system(size: 18, weight: .bold))
                                        .foregroundStyle(.white, Color(hex: critter.base))
                                        .offset(x: 3, y: 3)
                                }
                            }
                            .scaleEffect(x: squished == critter ? 1.14 : 1, y: squished == critter ? 0.86 : 1, anchor: .bottom)
                        Text(critter.name)
                            .font(.system(size: 11.5, weight: .medium))
                            .foregroundStyle(FeyndTheme.text2)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(critter.name)\(picked ? ", current avatar" : "")")
            }
        }
    }
}
