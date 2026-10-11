import SwiftUI

/// "Your cards": every word, phrase and fix the learner has kept — the pool
/// the day's cards and the flash sets draw from — newest first, with how
/// each one is doing. Swipe one away to drop it for good.
struct MyCardsView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @State private var items: [ItemView]?
    @State private var error: String?
    private let skin = Skin.current

    var body: some View {
        ZStack {
            skin.background.ignoresSafeArea()
            VStack(spacing: 0) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Your cards").font(skin.display(28)).foregroundStyle(skin.ink)
                        if let items {
                            Text(items.isEmpty ? "Nothing kept yet." : "\(items.count) kept · swipe one left to drop it").font(skin.ui(13)).foregroundStyle(skin.ink2)
                        }
                    }
                    Spacer()
                    CloseButton { dismiss() }
                }
                .padding(.horizontal, 22)
                .padding(.top, 18)
                .padding(.bottom, 8)

                if let error {
                    Text(error).font(skin.uiBold(13)).foregroundStyle(skin.bad).padding()
                }
                if let items {
                    List {
                        ForEach(items) { item in
                            row(item)
                                .listRowBackground(Color.clear)
                                .listRowSeparator(.hidden)
                                .listRowInsets(EdgeInsets(top: 5, leading: 22, bottom: 5, trailing: 22))
                        }
                        .onDelete { offsets in Task { await drop(offsets) } }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                } else {
                    ProgressView().padding(.top, 60)
                    Spacer()
                }
            }
        }
        .presentationDragIndicator(.visible)
        .task {
            do { items = try await DollyAPI.shared.items() } catch { self.error = error.localizedDescription }
        }
    }

    private func row(_ item: ItemView) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text(item.target).font(skin.display(18)).foregroundStyle(skin.word)
                    if let p = item.pinyin, !p.isEmpty { Text(p).font(skin.uiBold(13)).foregroundStyle(skin.ink2) }
                }
                Text(item.native).font(skin.uiBold(15)).foregroundStyle(skin.ink)
                Text(item.footer).font(skin.ui(12)).foregroundStyle(skin.ink3)
            }
            Spacer()
            Tag(text: item.kindLabel, color: tagColor(item.kind))
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Color.white.opacity(0.85)))
    }

    private func tagColor(_ kind: String) -> Color {
        switch kind {
        case "fix": return skin.fix
        case "word": return skin.word
        default: return skin.phrase
        }
    }

    private func drop(_ offsets: IndexSet) async {
        guard var list = items else { return }
        let gone = offsets.map { list[$0] }
        list.remove(atOffsets: offsets)
        items = list
        for item in gone {
            do { try await DollyAPI.shared.deleteItem(id: item.id) } catch { self.error = error.localizedDescription }
        }
    }
}
