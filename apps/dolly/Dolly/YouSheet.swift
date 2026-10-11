import SwiftUI

/// "You", from the header: the avatar (tap to change), your name, your rank
/// and XP with the road to the next bird, the whole ladder, and how XP is
/// earned. The CEFR levels live elsewhere (the level line and its sheets);
/// this is the fun axis.
struct YouSheet: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @State private var showPicker = false
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
                VStack(spacing: 18) {
                    HStack {
                        Text("You").font(skin.display(28)).foregroundStyle(skin.ink)
                        Spacer()
                        CloseButton { dismiss() }
                    }
                    .padding(.top, 18)

                    // The hero: avatar, name, rank.
                    VStack(spacing: 10) {
                        Button {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            withAnimation(.spring(response: 0.22, dampingFraction: 0.45)) { squished = true }
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) { squished = false }
                                showPicker = true
                            }
                        } label: {
                            JellyAvatarDisc(critter: critter, size: 108, squished: squished)
                                .overlay(alignment: .bottomTrailing) {
                                    Image(systemName: "pencil")
                                        .font(.system(size: 13, weight: .bold)).foregroundStyle(skin.onPrimary)
                                        .frame(width: 30, height: 30)
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
                                Image(systemName: "pencil").font(.system(size: 12, weight: .bold)).foregroundStyle(skin.ink3)
                            }
                        }
                        .buttonStyle(.plain)

                        HStack(spacing: 8) {
                            Image(systemName: "bird.fill").font(.system(size: 14, weight: .bold)).foregroundStyle(skin.reward)
                            Text(xp.rank.name).font(skin.displayMedium(18)).foregroundStyle(skin.primary)
                            Text("·").foregroundStyle(skin.ink3)
                            Text("\(xp.total) XP").font(skin.displayMedium(18)).foregroundStyle(skin.ink2)
                        }
                        RankBar(progress: xp.progress, height: 10).padding(.horizontal, 30).padding(.top, 2)
                        Text(xp.toNext).font(skin.uiBold(13)).foregroundStyle(skin.ink3)
                    }
                    .padding(.vertical, 8)

                    // The ladder.
                    Card(padding: 18) {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("The ladder".uppercased()).font(skin.uiBold(11)).tracking(1).foregroundStyle(skin.ink3)
                            ForEach(xp.ranks.isEmpty ? XpView.zero.ranks : xp.ranks) { r in
                                let reached = xp.total >= r.at
                                let current = r.n == xp.rank.n
                                HStack(spacing: 12) {
                                    ZStack {
                                        Circle().fill(current ? skin.reward : reached ? skin.good : skin.line).frame(width: 30, height: 30)
                                        if current {
                                            Image(systemName: "bird.fill").font(.system(size: 13, weight: .bold)).foregroundStyle(skin.onReward)
                                        } else if reached {
                                            Image(systemName: "checkmark").font(.system(size: 12, weight: .heavy)).foregroundStyle(skin.onGood)
                                        } else {
                                            Text("\(r.n)").font(skin.uiBold(12)).foregroundStyle(skin.ink3)
                                        }
                                    }
                                    Text(r.name).font(current ? skin.display(17) : skin.uiBold(16)).foregroundStyle(reached ? skin.ink : skin.ink3)
                                    Spacer()
                                    Text(r.at == 0 ? "Start" : "\(r.at) XP").font(skin.ui(13)).foregroundStyle(skin.ink3)
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    // How XP works (mirrors src/lib/dolly/xp.ts).
                    Card(padding: 18) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("How you earn XP".uppercased()).font(skin.uiBold(11)).tracking(1).foregroundStyle(skin.ink3)
                            xpRow("The call", "10")
                            xpRow("Three things said back", "5")
                            xpRow("Each card right", "1")
                            xpRow("All ten cards right", "+5")
                            xpRow("The day complete", "10")
                            xpRow("Streak day 3, 7, 14, 30, 60, 100, 365", "+25")
                            xpRow("Talk more (first three a day)", "10")
                            xpRow("Star round", "15, +5 an objective")
                            xpRow("A level complete", "100")
                            xpRow("A refresher passed", "50")
                            xpRow("Flash cards (first five sets a day)", "1 a card, +5 clean")
                            Text("XP never goes down. Your rank is yours to keep.").font(skin.ui(13)).foregroundStyle(skin.ink3).padding(.top, 4)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(.horizontal, 22)
                .padding(.bottom, 30)
            }
        }
        .presentationDragIndicator(.visible)
        .sheet(isPresented: $showPicker) {
            AvatarPicker().environment(state)
        }
        .alert("Your name", isPresented: $editingName) {
            TextField("Name", text: $nameDraft)
            Button("Save") { Task { state.user = try? await DollyAPI.shared.updateMe(name: nameDraft.trimmingCharacters(in: .whitespaces).isEmpty ? .some(nil) : .some(nameDraft)) } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Dolly says hello to you by it.")
        }
    }

    private func xpRow(_ label: String, _ amount: String) -> some View {
        HStack {
            Text(label).font(skin.ui(14)).foregroundStyle(skin.ink2)
            Spacer()
            Text(amount).font(skin.uiBold(14)).foregroundStyle(skin.ink)
        }
    }
}
