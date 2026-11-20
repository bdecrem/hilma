import OlaKit
import SwiftUI

/// The window as the app lays it out (sidebar, conversation, files, the title line), drawn
/// without NavigationSplitView: its glass sidebar and toolbar do not draw into an off-screen
/// bitmap. The views inside, and the paper modifiers, are the app's own; the title line and the
/// window buttons are drawn to the system's sizes (13 semibold title, 11 subtitle, 52-point bar,
/// toolbar symbols as plain glyphs). The sidebar's tone stands in for the system's sidebar material.
struct SnapshotFrame: View {
  var store: OlaStore
  var treatment: Treatment
  var sidebarWidth: CGFloat = 232
  var filesWidth: CGFloat = 248
  /// The other runtime's sessions, for the list's second section (OLA-143).
  var peer: OlaStore? = nil
  @State private var draft = ""

  var body: some View {
    HStack(spacing: 0) {
      VStack(spacing: 0) {
        HStack(spacing: 8) {
          Circle().fill(Color(red: 1, green: 0.37, blue: 0.34)).frame(width: 12, height: 12)
          Circle().fill(Color(red: 1, green: 0.74, blue: 0.18)).frame(width: 12, height: 12)
          Circle().fill(Color(red: 0.16, green: 0.79, blue: 0.25)).frame(width: 12, height: 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 20).frame(height: 52)
        Sidebar(store: store, peerPreview: peer).scrollContentBackground(.hidden)
      }
      .frame(width: sidebarWidth)
      .background(Ola.room)
      .overlay(alignment: .trailing) { if treatment == .plain { Rectangle().fill(Ola.roomRule).frame(width: 1) } }
      VStack(spacing: 0) {
        titleLine
        ConnectionBar(store: store)
        HStack(spacing: 0) {
          ConversationPane(store: store, draft: $draft).conversationPaper(treatment, filesShown: true)
          FilesPanel(store: store).filesPaper(treatment).frame(width: filesWidth)
        }
      }
      .background(treatment == .plain ? Ola.paper : Ola.room)
    }
  }

  var titleLine: some View {
    HStack(spacing: 10) {
      VStack(alignment: .leading, spacing: 1) {
        Text(store.selected?.title ?? "New session").font(.system(size: 13, weight: .semibold)).foregroundStyle(Ola.onRoom)
        Text(MacRoot.subtitle(store)).font(.system(size: 11)).foregroundStyle(Ola.dim)
      }
      Spacer()
      Image(systemName: "sidebar.right").font(.system(size: 15)).foregroundStyle(Ola.mist).frame(width: 28, height: 28)
    }
    .padding(.leading, Space.l).padding(.trailing, 12).frame(height: 52)
    .background(treatment == .plain ? Ola.paper : Ola.room)
    .overlay(alignment: .bottom) { if treatment == .plain { Rectangle().fill(Ola.rule).frame(height: 1) } }
  }
}
