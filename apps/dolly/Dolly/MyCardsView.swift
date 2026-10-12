import SwiftUI

/// "Your cards": the stash. First every word, phrase and fix the learner has
/// kept (the pool the day's cards and the flash sets draw from), newest
/// first, swipe left to drop one for good. Then the chunks of every level
/// they are on or have climbed, grouped by level: swipe left to hide one
/// (it leaves the flash sets too); hidden ones sit dimmed at the end of
/// their level with a way back.
struct MyCardsView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @State private var items: [ItemView]?
    @State private var chunks: [LevelChunks] = []
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
                            Text("\(items.count) kept · \(chunks.reduce(0) { $0 + $1.items.filter { !$0.hidden }.count }) from your levels · swipe left to drop or hide")
                                .font(skin.ui(13)).foregroundStyle(skin.ink2)
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
                        Section {
                            if items.isEmpty {
                                Text("Nothing kept yet: your calls fill this.").font(skin.ui(14)).foregroundStyle(skin.ink3)
                                    .listRowBackground(Color.clear).listRowSeparator(.hidden)
                            }
                            ForEach(items) { item in
                                row(item).listRowBackground(Color.clear).listRowSeparator(.hidden)
                                    .listRowInsets(EdgeInsets(top: 5, leading: 22, bottom: 5, trailing: 22))
                            }
                            .onDelete { offsets in Task { await drop(offsets) } }
                        } header: {
                            sectionHeader("Yours")
                        }
                        ForEach(chunks) { level in
                            Section {
                                ForEach(level.items.filter { !$0.hidden }) { chunk in
                                    chunkRow(chunk, level).listRowBackground(Color.clear).listRowSeparator(.hidden)
                                        .listRowInsets(EdgeInsets(top: 5, leading: 22, bottom: 5, trailing: 22))
                                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                            Button { Task { await setHidden(chunk, true) } } label: { Label("Hide", systemImage: "eye.slash") }.tint(skin.ink3)
                                        }
                                }
                                ForEach(level.items.filter { $0.hidden }) { chunk in
                                    chunkRow(chunk, level).listRowBackground(Color.clear).listRowSeparator(.hidden)
                                        .listRowInsets(EdgeInsets(top: 5, leading: 22, bottom: 5, trailing: 22))
                                }
                            } header: {
                                sectionHeader("Level \(level.level) · \(level.name)")
                            }
                        }
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
            do {
                let res = try await DollyAPI.shared.items()
                items = res.items
                chunks = res.chunks
            } catch { self.error = error.localizedDescription }
        }
    }

    private func sectionHeader(_ s: String) -> some View {
        Text(s.uppercased()).font(skin.uiBold(11)).tracking(1).foregroundStyle(skin.ink3)
            .padding(.leading, 22).padding(.top, 10).padding(.bottom, 2)
            .frame(maxWidth: .infinity, alignment: .leading)
            .listRowInsets(EdgeInsets())
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

    private func chunkRow(_ chunk: ChunkView, _ level: LevelChunks) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text(chunk.target).font(skin.display(18)).foregroundStyle(chunk.hidden ? skin.ink3 : skin.word)
                    if let p = chunk.pinyin, !p.isEmpty { Text(p).font(skin.uiBold(13)).foregroundStyle(skin.ink2) }
                }
                Text(chunk.native).font(skin.uiBold(15)).foregroundStyle(chunk.hidden ? skin.ink3 : skin.ink)
                Text(chunk.title).font(skin.ui(12)).foregroundStyle(skin.ink3)
            }
            Spacer()
            if chunk.hidden {
                Button { Task { await setHidden(chunk, false) } } label: {
                    Text("Show").font(skin.uiBold(13)).foregroundStyle(skin.word)
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(Capsule().fill(Color.white))
                }
                .buttonStyle(PressStyle())
            } else {
                Tag(text: "Grammar", color: skin.word)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Color.white.opacity(chunk.hidden ? 0.45 : 0.85)))
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

    private func setHidden(_ chunk: ChunkView, _ hidden: Bool) async {
        // At once on screen, then the server's word.
        if let li = chunks.firstIndex(where: { $0.items.contains { $0.id == chunk.id } }), let ci = chunks[li].items.firstIndex(where: { $0.id == chunk.id }) {
            withAnimation { chunks[li].items[ci].hidden = hidden }
        }
        do { chunks = try await DollyAPI.shared.setChunk(id: chunk.id, hidden: hidden) } catch { self.error = error.localizedDescription }
    }
}
