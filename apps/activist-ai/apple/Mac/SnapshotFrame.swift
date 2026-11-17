import OlaKit
import SwiftUI

/// The window as the app lays it out (sidebar, conversation, files, the title line), drawn
/// without NavigationSplitView: its glass sidebar and toolbar do not draw into an off-screen
/// bitmap. The views inside are the app's own.
struct SnapshotFrame: View {
  var store: OlaStore
  var treatment: Treatment
  @State private var draft = ""

  var body: some View {
    HStack(spacing: 0) {
      VStack(spacing: 0) {
        HStack(spacing: 8) { ForEach(0..<3, id: \.self) { _ in Circle().fill(Ola.dim.opacity(0.45)).frame(width: 12, height: 12) } }
          .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 20).frame(height: 52)
        Sidebar(store: store)
      }
      .frame(width: 260)
      .background(Ola.room)
      VStack(spacing: 0) {
        titleLine
        ConnectionBar(store: store)
        if treatment == .sheet {
          HStack(spacing: 12) {
            ConversationPane(store: store, draft: $draft, sidePadding: 48).clipShape(RoundedRectangle(cornerRadius: 3)).shadow(color: .black.opacity(0.25), radius: 10, y: 3)
            FilesPanel(store: store).frame(width: 290).clipShape(RoundedRectangle(cornerRadius: 3)).shadow(color: .black.opacity(0.25), radius: 10, y: 3)
          }
          .padding([.horizontal, .bottom], 12)
        } else {
          HStack(spacing: 0) {
            ConversationPane(store: store, draft: $draft)
            Rectangle().fill(Ola.rule).frame(width: 1)
            FilesPanel(store: store).frame(width: 290)
          }
        }
      }
      .background(treatment == .sheet ? Ola.room : Ola.paper)
    }
  }

  var titleLine: some View {
    let onRoom = treatment == .sheet
    return HStack(spacing: 10) {
      VStack(alignment: .leading, spacing: 1) {
        Text(store.selected?.title ?? "New session").font(.system(size: 13.5, weight: .semibold)).foregroundStyle(onRoom ? Ola.onRoom : Ola.ink)
        Text(store.running.isEmpty ? "On the machine" : "On the machine \u{00B7} \(store.running.count) working").font(.system(size: 11)).foregroundStyle(onRoom ? Ola.dim : Ola.ink3)
      }
      Spacer()
      Image(systemName: "sidebar.right").font(.system(size: 14)).foregroundStyle(onRoom ? Ola.mist : Ola.ink2)
        .frame(width: 34, height: 28).background(RoundedRectangle(cornerRadius: 7).fill(onRoom ? Ola.roomRaised : Ola.details))
    }
    .padding(.horizontal, 18).frame(height: 52)
    .background(onRoom ? Ola.room : Ola.paper)
    .overlay(alignment: .bottom) { if !onRoom { Rectangle().fill(Ola.rule).frame(height: 1) } }
  }
}
