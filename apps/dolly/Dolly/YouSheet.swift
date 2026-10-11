import SwiftUI

/// "You", from the header: the avatar (tap to change), your name, your rank
/// with the road to the next bird, the ladder in one row, your cards, and
/// every setting (there is no separate Settings since build 42). The CEFR
/// levels live elsewhere (the level line and its sheets).
struct YouSheet: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @State private var showPicker = false
    @State private var showCards = false
    @State private var editingName = false
    @State private var nameDraft = ""
    @State private var squished = false
    private let skin = Skin.current

    var body: some View {
        let xp = state.day?.xp ?? .zero
        let critter = JellyCritter.from(state.user?.avatar)
        ZStack {
            skin.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 16) {
                    HStack {
                        Spacer()
                        CloseButton { dismiss() }
                    }
                    .padding(.top, 14)

                    // The hero: avatar, name, rank.
                    VStack(spacing: 8) {
                        Button {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            withAnimation(.spring(response: 0.22, dampingFraction: 0.45)) { squished = true }
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) { squished = false }
                                showPicker = true
                            }
                        } label: {
                            JellyAvatarDisc(critter: critter, size: 104, squished: squished)
                                .overlay(alignment: .bottomTrailing) {
                                    Image(systemName: "pencil")
                                        .font(.system(size: 12, weight: .bold)).foregroundStyle(skin.onPrimary)
                                        .frame(width: 28, height: 28)
                                        .background(Circle().fill(skin.primary))
                                        .overlay(Circle().stroke(Color.white, lineWidth: 2.5))
                                        .offset(x: 2, y: 2)
                                }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Change your avatar")

                        Button {
                            nameDraft = state.user?.name ?? ""
                            editingName = true
                        } label: {
                            HStack(spacing: 6) {
                                Text(state.user?.name ?? "Add your name").font(skin.display(24)).foregroundStyle(state.user?.name == nil ? skin.ink3 : skin.ink)
                                Image(systemName: "pencil").font(.system(size: 11, weight: .bold)).foregroundStyle(skin.ink3)
                            }
                        }
                        .buttonStyle(.plain)

                        HStack(spacing: 6) {
                            Image(systemName: "bird.fill").font(.system(size: 13, weight: .bold)).foregroundStyle(skin.reward)
                            Text(xp.rank.name).font(skin.displayMedium(17)).foregroundStyle(skin.primary)
                            Text("· \(xp.total) XP").font(skin.displayMedium(17)).foregroundStyle(skin.ink2)
                        }
                        RankBar(progress: xp.progress, height: 9).padding(.horizontal, 44)
                        Text(xp.toNext).font(skin.uiBold(12)).foregroundStyle(skin.ink3)
                    }

                    // The ladder in one row: reached birds lit, yours ringed.
                    ladder(xp)

                    // Your cards.
                    Button { showCards = true } label: {
                        HStack(spacing: 12) {
                            ZStack {
                                Circle().fill(skin.word).frame(width: 34, height: 34)
                                Image(systemName: "square.stack.fill").font(.system(size: 14, weight: .bold)).foregroundStyle(.white)
                            }
                            VStack(alignment: .leading, spacing: 1) {
                                Text("Your cards").font(skin.displayMedium(17)).foregroundStyle(skin.ink)
                                Text("Every word you've kept. Drop the ones you don't want.").font(skin.ui(12)).foregroundStyle(skin.ink3)
                            }
                            Spacer()
                            Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(skin.ink3)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity)
                        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color.white))
                        .shadow(color: skin.shadow, radius: 10, y: 6)
                    }
                    .buttonStyle(PressStyle())

                    SettingsSections()
                        .padding(.top, 4)
                }
                .padding(.horizontal, 22)
                .padding(.bottom, 30)
            }
        }
        .presentationDragIndicator(.visible)
        .task {
            // `-Open mycards`: straight through to the cards list.
            if UserDefaults.standard.string(forKey: "Open") == "mycards" {
                UserDefaults.standard.removeObject(forKey: "Open")
                try? await Task.sleep(for: .milliseconds(600))
                showCards = true
            }
        }
        .sheet(isPresented: $showPicker) { AvatarPicker().environment(state) }
        .sheet(isPresented: $showCards) { MyCardsView().environment(state) }
        .alert("Your name", isPresented: $editingName) {
            TextField("Name", text: $nameDraft)
            Button("Save") { Task { state.user = try? await DollyAPI.shared.updateMe(name: nameDraft.trimmingCharacters(in: .whitespaces).isEmpty ? .some(nil) : .some(nameDraft)) } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Dolly says hello to you by it.")
        }
    }

    private func ladder(_ xp: XpView) -> some View {
        let ranks = xp.ranks.isEmpty ? XpView.zero.ranks : xp.ranks
        return HStack(spacing: 0) {
            ForEach(ranks) { r in
                let reached = xp.total >= r.at
                let current = r.n == xp.rank.n
                VStack(spacing: 4) {
                    ZStack {
                        Circle().fill(reached ? skin.reward : Color.white.opacity(0.7)).frame(width: current ? 34 : 26, height: current ? 34 : 26)
                            .overlay(Circle().stroke(current ? skin.primary : .clear, lineWidth: 3))
                        Image(systemName: "bird.fill").font(.system(size: current ? 15 : 11, weight: .bold)).foregroundStyle(reached ? skin.onReward : skin.ink3.opacity(0.6))
                    }
                    .frame(height: 34)
                    Text(current ? r.name : "").font(skin.uiBold(11)).foregroundStyle(skin.ink2).lineLimit(1).fixedSize()
                }
                .frame(maxWidth: .infinity)
                .accessibilityLabel("\(r.name), \(r.at) XP\(current ? ", you are here" : "")")
            }
        }
        .padding(.vertical, 4)
    }
}
