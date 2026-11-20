import OlaKit
import QuickLook
import UniformTypeIdentifiers
import SwiftUI
import WebKit

/// How the conversation sits in the window. `plain` (OLA-207, chosen): the page fills the window
/// edge to edge, as in Notes and Mail, with the files beside it past a hairline. The two earlier
/// looks, "paper laid on the room", are kept: `sheet` (two inset sheets) and `desk` (one inset sheet
/// with the files as its margin). Bart on `desk`: "something kinda of big or square": a box in a box.
enum Treatment: String { case plain, sheet, desk }
private struct TreatmentKey: EnvironmentKey { static let defaultValue = Treatment.plain }

/// The paper's edge on the room: a small radius and one soft shadow.
enum Sheet {
  static let radius: CGFloat = 5
  static let gap: CGFloat = Space.s
}

extension View {
  /// The files panel's paper: its own sheet, or the right margin of the one sheet.
  @ViewBuilder func filesPaper(_ t: Treatment) -> some View {
    switch t {
    case .plain:
      overlay(alignment: .leading) { Rectangle().fill(Ola.rule).frame(width: 1) }
    case .sheet:
      clipShape(RoundedRectangle(cornerRadius: Sheet.radius))
        .overlay(RoundedRectangle(cornerRadius: Sheet.radius).strokeBorder(Ola.roomRule, lineWidth: 1)).shadow(color: .black.opacity(0.06), radius: 2, y: 1)
        .padding(.trailing, Sheet.gap).padding(.bottom, Sheet.gap).background(Ola.room)
    case .desk:
      overlay(alignment: .leading) { Rectangle().fill(Ola.rule).frame(width: 1) }
        .clipShape(UnevenRoundedRectangle(bottomTrailingRadius: Sheet.radius, topTrailingRadius: Sheet.radius))
        .overlay(UnevenRoundedRectangle(bottomTrailingRadius: Sheet.radius, topTrailingRadius: Sheet.radius).strokeBorder(Ola.roomRule, lineWidth: 1))
        .shadow(color: .black.opacity(0.06), radius: 2, y: 1)
        .padding(.trailing, Sheet.gap).padding(.bottom, Sheet.gap).background(Ola.room)
    }
  }

  /// The conversation's paper.
  @ViewBuilder func conversationPaper(_ t: Treatment, filesShown: Bool) -> some View {
    switch t {
    case .plain:
      self
    case .sheet:
      clipShape(RoundedRectangle(cornerRadius: Sheet.radius))
        .overlay(RoundedRectangle(cornerRadius: Sheet.radius).strokeBorder(Ola.roomRule, lineWidth: 1)).shadow(color: .black.opacity(0.06), radius: 2, y: 1)
        .padding(.horizontal, Sheet.gap).padding(.bottom, Sheet.gap)
    case .desk:
      clipShape(UnevenRoundedRectangle(topLeadingRadius: Sheet.radius, bottomLeadingRadius: Sheet.radius, bottomTrailingRadius: filesShown ? 0 : Sheet.radius, topTrailingRadius: filesShown ? 0 : Sheet.radius))
        .overlay(UnevenRoundedRectangle(topLeadingRadius: Sheet.radius, bottomLeadingRadius: Sheet.radius, bottomTrailingRadius: filesShown ? 0 : Sheet.radius, topTrailingRadius: filesShown ? 0 : Sheet.radius).strokeBorder(Ola.roomRule, lineWidth: 1))
        .shadow(color: .black.opacity(0.06), radius: 2, y: 1)
        .padding(.leading, Sheet.gap).padding(.trailing, filesShown ? 0 : Sheet.gap).padding(.bottom, Sheet.gap)
    }
  }
}
extension ToolbarContent {
  /// A toolbar button as a plain symbol: no glass capsule of its own behind it (macOS 26 and later).
  @ToolbarContentBuilder func plainToolbarItem() -> some ToolbarContent {
    if #available(macOS 26, *) { sharedBackgroundVisibility(.hidden) } else { self }
  }
}

extension EnvironmentValues {
  var treatment: Treatment {
    get { self[TreatmentKey.self] }
    set { self[TreatmentKey.self] = newValue }
  }
}

struct MacRoot: View {
  @Bindable var store: OlaStore
  /// Both runtimes (the app); nil for a still picture of one store.
  var whereOla: WhereOlaWorks? = nil
  /// Screenshots: the other runtime's sessions, for the list's second section.
  var peerPreview: OlaStore? = nil
  @SceneStorage("selected") private var savedSelection: String?
  @SceneStorage("filesShown") private var filesShown = true
  @State private var draft = ""
  @State private var viewed: URL?
  @Bindable private var chooser = NewSessionChooser.shared
  @Environment(\.openWindow) private var openWindow
  @Environment(\.treatment) private var treatment

  var body: some View {
    NavigationSplitView {
      Sidebar(store: store, whereOla: whereOla, peerPreview: peerPreview)
        .navigationSplitViewColumnWidth(min: 200, ideal: 232, max: 320)
    } detail: {
      VStack(spacing: 0) {
        ConnectionBar(store: store)
        ConversationPane(store: store, draft: $draft)
          .conversationPaper(treatment, filesShown: filesShown)
      }
      .background(treatment == .plain ? Ola.paper : Ola.room)
      .inspector(isPresented: $filesShown) {
        // The plain window: the system's own inspector edge, no drawn margin.
        Group {
          if treatment == .plain { FilesPanel(store: store) } else { FilesPanel(store: store).filesPaper(treatment) }
        }
        .inspectorColumnWidth(min: 200, ideal: 248, max: 400)
      }
    }
    .navigationTitle(store.selected?.title ?? "New session")
    .navigationSubtitle(subtitle)
    .toolbar {
      // The system's toolbar with plain symbols (OLA-207: no chunky backgrounds behind them).
      if store.gatewayModels.count > 1 {
        ToolbarItem {
          Picker("Model", selection: Binding(get: { store.model }, set: { m in if let m { Task { await store.choose(m) } } })) {
            ForEach(store.gatewayModels) { Text($0.name).tag(Optional($0)) }
          }
          .help("The model for this session")
        }
        .plainToolbarItem()
      }
      ToolbarItem {
        Button { filesShown.toggle() } label: { Label("Files", systemImage: "sidebar.right") }
          .help(filesShown ? "Hide the project\u{2019}s files" : "Show the project\u{2019}s files")
      }
      .plainToolbarItem()
    }
    .focusedSceneValue(\.olaDraft, $draft)
    .quickLookPreview($viewed)
    .sheet(isPresented: Binding(get: { chooser.shown && whereOla != nil }, set: { chooser.shown = $0 })) {
      if let whereOla { NewSessionSheet(whereOla: whereOla) { chooser.shown = false } }
    }
    // The cloud refused this Mac's key (signed out on the website, or removed under Your devices):
    // the sign-in screen asks again (OLA-150; the cloud has no password of its own).
    .onChange(of: store.connection) { _, c in if c == .refused, store.config?.account == true { whereOla?.account?.signedOutByServer() } }
    .onAppear {
      if store.selectedID == nil, let s = savedSelection { store.selectedID = s }
      store.onFiles = { filesShown.toggle() }
      store.onView = { item in MacViewer.open(item, store: store, openWindow: openWindow) { viewed = $0 } }
    }
    .onChange(of: store.selectedID) { _, id in savedSelection = id }
  }

  var subtitle: String { Self.subtitle(store) }

  static func subtitle(_ store: OlaStore) -> String {
    switch store.connection {
    case .open:
      let place = store.runtime == .local ? "Local, on this Mac" : "Cloud, on the Ola machine"
      return store.running.isEmpty ? place : "\(place) \u{00B7} \(store.running.count) working"
    case .connecting: return "Connecting"
    case .lost: return "Not answering"
    case .refused: return "Password refused"
    case .notSetUp: return "Not connected"
    }
  }
}

// MARK: the room: sessions

/// The sidebar, at the system's own density: 13-point rows 28 points tall, 11-point labels.
struct Sidebar: View {
  @Bindable var store: OlaStore
  var whereOla: WhereOlaWorks? = nil
  var peerPreview: OlaStore? = nil
  @State private var renaming: SessionInfo?
  @State private var newTitle = ""
  @State private var deleting: SessionInfo?
  /// A click or a double click on "Cloud" or "Local" hides or shows that runtime's sessions
  /// (OLA-167; Bart, 2026-11-18). Kept across launches.
  @AppStorage("ola.sessions.hidden.cloud") private var cloudHidden = false
  @AppStorage("ola.sessions.hidden.local") private var localHidden = false
  func hidden(_ r: Runtime) -> Bool { r == .cloud ? cloudHidden : localHidden }
  func toggle(_ r: Runtime) { if r == .cloud { cloudHidden.toggle() } else { localHidden.toggle() } }

  /// The runtimes to list (OLA-143: the list shows which runtime each session is on), cloud
  /// first, each with the store holding its sessions now; a runtime not set up is left out.
  var sections: [RuntimeSection] {
    var out: [RuntimeSection] = []
    if let w = whereOla {
      for r in Runtime.allCases {
        let s = w.store(r)
        if r == w.shown || s.config != nil { out.append(RuntimeSection(runtime: r, store: s)) }
      }
    } else {
      if let r = store.runtime { out.append(RuntimeSection(runtime: r, store: store)) }
      if let p = peerPreview, let r = p.runtime { out.append(RuntimeSection(runtime: r, store: p)) }
      out.sort { $0.runtime == .cloud && $1.runtime == .local }
    }
    return out
  }

  func open(_ r: Runtime, _ s: SessionInfo, in st: OlaStore) {
    if st === store { store.selectedID = s.id } else { whereOla?.show(r, select: s.id) }
  }

  /// The list's selection: "<runtime>/<session id>", so a session of either runtime can be chosen.
  var selection: Binding<String?> {
    Binding(get: {
      guard let id = store.selectedID, let r = store.runtime else { return nil }
      return "\(r.rawValue)/\(id)"
    }, set: { key in
      guard let key, let slash = key.firstIndex(of: "/"), let r = Runtime(rawValue: String(key[..<slash])) else { return }
      let id = String(key[key.index(after: slash)...])
      guard let sec = sections.first(where: { $0.runtime == r }), let s = sec.store.sessions.first(where: { $0.id == id }) else { return }
      open(r, s, in: sec.store)
    })
  }

  /// The system's own sidebar (OLA-207): a source list with collapsible sections, the system's row
  /// height, type, selection and keyboard handling, as in Notes and Mail.
  var body: some View {
    List(selection: whereOla == nil ? .constant(nil) : selection) {
      Button { if whereOla != nil { NewSessionChooser.shared.shown = true } else { store.newSession() } } label: {
        Label("New Session", systemImage: "square.and.pencil").foregroundStyle(Ola.onRoom).contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .help("Start a new session, in the cloud or on this Mac (\u{2318}N)")
      ForEach(sections) { sec in
        let r = sec.runtime, st = sec.store
        Section(isExpanded: Binding(get: { !hidden(r) }, set: { if $0 == hidden(r) { toggle(r) } })) {
          ForEach(st.sessions) { s in
            SessionRow(session: s, running: st.running.contains(s.id), unseen: st.unseen.contains(s.id), needsYou: st.needsYou(s.id))
              .tag("\(r.rawValue)/\(s.id)")
              // Screenshots (no app around the list): the system's selection does not draw off
              // screen, so the selected row gets the sidebar's selection tone instead.
              .listRowBackground(whereOla == nil && st === store && store.selectedID == s.id ? RoundedRectangle(cornerRadius: 6).fill(Ola.roomRaised).padding(.horizontal, 10) : nil)
              .contextMenu {
                if st === store {
                  Button("Rename\u{2026}") { newTitle = s.title; renaming = s }
                  // A cloud session stays in its project, as on the website (OLA-150).
                  if r != .cloud { Button("Delete\u{2026}", role: .destructive) { deleting = s } }
                } else {
                  Button("Open") { open(r, s, in: st) }
                }
              }
          }
          if st.sessions.isEmpty {
            Text(st.connection == .open ? "No sessions yet." : st.connection == .connecting ? "Connecting\u{2026}" : r == .local ? "Starting\u{2026}" : "Not answering.")
              .foregroundStyle(.secondary).selectionDisabled()
          }
        } header: {
          Text("\(r.name) \u{00B7} \(r.place(phone: false))")
            .help(hidden(r) ? "Show the \(r.name.lowercased()) sessions" : "Hide the \(r.name.lowercased()) sessions")
        }
      }
    }
    .listStyle(.sidebar)
    .darkFrame()
    .safeAreaInset(edge: .bottom, spacing: 0) { MachineFooter(store: store) }
    .onDeleteCommand { if let s = store.selected, store.runtime != .cloud { deleting = s } }
    .alert("Rename session", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
      TextField("Name", text: $newTitle)
      Button("Rename") { if let s = renaming { Task { await store.rename(s.id, to: newTitle) } } }
      Button("Cancel", role: .cancel) {}
    }
    .confirmationDialog("Delete \u{201C}\(deleting?.title ?? "")\u{201D}?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
      Button("Delete Session", role: .destructive) { if let s = deleting { Task { await store.delete(s.id) } } }
    } message: {
      Text("The conversation is deleted on the machine, for the phone too. Files Ola made stay in the folder.")
    }
  }

}

struct RuntimeSection: Identifiable {
  let runtime: Runtime
  let store: OlaStore
  var id: Runtime { runtime }
}

/// A session in the sidebar: the system's row, its title, the time, and a dot only when there is
/// something to see (working, needs a yes, finished unseen).
struct SessionRow: View {
  var session: SessionInfo
  var running: Bool
  var unseen: Bool
  var needsYou: Bool

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 6) {
      VStack(alignment: .leading, spacing: 1) {
        Text(session.title).foregroundStyle(Ola.onRoom).lineLimit(1).truncationMode(.tail)
        if needsYou { Text("Needs your yes").font(.system(size: Metrics.meta, weight: .medium)).foregroundStyle(Ola.vermilionText) }
      }
      Spacer(minLength: Space.xs)
      Hopping(running: running) { hopping in
        ZStack {
          if needsYou { Circle().fill(Ola.vermilion).frame(width: 7, height: 7) }
          else if hopping { ListHop() }
          else if unseen { Circle().fill(Ola.vermilion).frame(width: 6, height: 6) }
        }
      }
      .frame(width: needsYou || running || unseen ? 10 : 0, height: 8)
      .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 3.5 }
      Text(running ? "now" : shortTime(session.updated)).font(.system(size: Metrics.meta)).foregroundStyle(.secondary).monospacedDigit()
    }
    .help(session.title)
  }
}

struct MachineFooter: View {
  var store: OlaStore
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Rectangle().fill(Ola.roomRule).frame(height: 1)
      HStack(spacing: Space.s + 2) {
        DeskMark(lit: store.connection == .open, working: !store.running.isEmpty)
        VStack(alignment: .leading, spacing: 1) {
          Text(title).font(OlaFont.sans(Metrics.ui, .medium)).foregroundStyle(Ola.onRoom).lineLimit(1)
          Text(place).font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.dim).lineLimit(1).truncationMode(.middle)
        }
      }
      .padding(.horizontal, Space.l).padding(.vertical, Space.m)
    }
  }
  /// Where the agent is: the machine's short name, or "This Mac" and the folder; never an address.
  var place: String {
    guard let host = store.config?.url.host() else { return "" }
    if host == "127.0.0.1" || host == "localhost" {
      return LocalSettings.folder.map { "This Mac \u{00B7} \($0.lastPathComponent)" } ?? "This Mac"
    }
    return host.components(separatedBy: ".").first ?? host
  }

  var title: String {
    switch store.connection {
    case .open: store.running.isEmpty ? "The machine is idle" : store.running.count == 1 ? "Working on 1 session" : "Working on \(store.running.count) sessions"
    case .connecting: "Connecting"
    case .lost: "Not answering"
    case .refused: "Password refused"
    case .notSetUp: "Not connected"
    }
  }
}

/// The machine from the landing page, small: a box with its lights. Lamp yellow while it works.
struct DeskMark: View {
  var lit: Bool
  var working: Bool
  var body: some View {
    ZStack(alignment: .bottomLeading) {
      RoundedRectangle(cornerRadius: 2.5).fill(Ola.field).frame(width: 28, height: 20)
        .overlay(RoundedRectangle(cornerRadius: 2.5).strokeBorder(Ola.ruleStrong, lineWidth: 0.5))
      HStack(spacing: 2.5) {
        Circle().fill(lit ? Ola.leaf : Ola.ink3).frame(width: 3.5, height: 3.5)
        Circle().fill(working ? Ola.lamp : Ola.rule).frame(width: 3.5, height: 3.5)
      }
      .padding(4)
      HStack(spacing: 1.5) { ForEach(0..<4, id: \.self) { _ in Rectangle().fill(Ola.ink3).frame(width: 1, height: 6) } }
        .offset(x: 17, y: -11)
    }
    .frame(width: 28, height: 20)
  }
}

// MARK: files of the project

struct FilesPanel: View {
  var store: OlaStore
  @State private var preview: URL?
  @State private var loading: String?
  @State private var problem: String?
  @Environment(\.openWindow) private var openWindow

  var folder: String { store.projectFolder.replacingOccurrences(of: "/Users/admin", with: "~") }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .center, spacing: Space.s) {
        VStack(alignment: .leading, spacing: 1) {
          Text("Files").font(OlaFont.sans(Metrics.ui, .semibold)).foregroundStyle(Ola.ink)
          Text(folder).font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink3).lineLimit(1).truncationMode(.middle).help(folder)
        }
        Spacer()
        Button { Task { await reload() } } label: {
          Image(systemName: "arrow.clockwise").font(.system(size: Metrics.ui - 1, weight: .medium)).frame(width: 24, height: 22).contentShape(Rectangle())
            .hoverFill(Ola.paperHover)
        }
        .buttonStyle(.plain).foregroundStyle(Ola.ink2).help("Reload the files")
      }
      .padding(.leading, Space.l).padding(.trailing, Space.s).padding(.vertical, Space.s + 2)
      Rectangle().fill(Ola.rule).frame(height: 1)
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          FolderRows(store: store, path: "", depth: 0, open: open, page: { openWindow(id: "page", value: $0) }, loading: loading)
          if store.files[""]?.isEmpty == true {
            Text("Nothing here yet. What Ola makes appears here.").font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink3).padding(Space.s)
          }
        }
        .padding(.horizontal, Space.s).padding(.vertical, 6)
      }
      if let problem {
        Label(problem, systemImage: "exclamationmark.circle").font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.vermilionText).padding(Space.m)
      }
    }
    .background(Ola.margin)
    .quickLookPreview($preview)
    .task { if store.files[""] == nil { await reload() } }
    .onChange(of: store.running.count) { _, _ in Task { await reload() } }
  }

  func reload() async {
    await store.loadFiles("")
    for key in store.files.keys where !key.isEmpty { await store.loadFiles(key) }
  }

  /// Quick Look needs a local file: the bytes are fetched into the cache folder first.
  func open(_ f: FileEntry) {
    loading = f.path
    problem = nil
    Task {
      defer { loading = nil }
      do {
        let data = try await store.read(f.path)
        let url = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("ola-files").appendingPathComponent(f.path)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url)
        preview = url
      } catch {
        problem = "\(f.name) could not be opened."
      }
    }
  }
}

struct FolderRows: View {
  var store: OlaStore
  var path: String
  var depth: Int
  var open: (FileEntry) -> Void
  var page: (String) -> Void
  var loading: String?
  @State private var expanded: Set<String> = []

  var body: some View {
    ForEach(store.files[path] ?? []) { f in
      HStack(spacing: 6) {
        if f.isDirectory {
          Image(systemName: "chevron.right").font(.system(size: 8, weight: .bold)).foregroundStyle(Ola.ink3).rotationEffect(.degrees(expanded.contains(f.path) ? 90 : 0)).frame(width: 10)
        } else { Color.clear.frame(width: 10) }
        Image(systemName: f.isDirectory ? "folder" : icon(f.name)).font(.system(size: Metrics.ui - 2)).foregroundStyle(Ola.ink3).frame(width: 16)
        VStack(alignment: .leading, spacing: 0) {
          Text(f.name).font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink).lineLimit(1).truncationMode(.middle)
          // Who changed it last, from the project's record (OLA-224).
          if !f.isDirectory, let made = store.madeByFiles[f.path] {
            Text(MadeByWords.file(made)).font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink3).lineLimit(1).truncationMode(.tail)
          }
        }
        Spacer(minLength: Space.xs)
        if loading == f.path { ProgressView().controlSize(.mini) }
        if f.name.hasSuffix(".html") || f.name.hasSuffix(".htm") {
          Button("Open") { page(f.path) }.buttonStyle(LinkButton(weight: .semibold)).help("Open the page in its own window")
        }
      }
      .padding(.leading, CGFloat(depth) * 14 + 4).padding(.trailing, Space.s)
      .frame(minHeight: 24).padding(.vertical, store.madeByFiles[f.path] == nil || f.isDirectory ? 0 : 2)
      .contentShape(Rectangle())
      .hoverFill(Ola.paperHover, radius: 4)
      .onTapGesture {
        if f.isDirectory {
          if expanded.contains(f.path) { expanded.remove(f.path) } else {
            expanded.insert(f.path)
            Task { await store.loadFiles(f.path) }
          }
        } else { open(f) }
      }
      .help(f.isDirectory ? f.path : "Quick Look \(f.name)")
      if f.isDirectory, expanded.contains(f.path) {
        FolderRows(store: store, path: f.path, depth: depth + 1, open: open, page: page, loading: loading)
      }
    }
  }

  func icon(_ name: String) -> String {
    let ext = (name as NSString).pathExtension.lowercased()
    switch ext {
    case "csv", "xlsx", "tsv": return "tablecells"
    case "md", "txt": return "doc.plaintext"
    case "py", "js", "mjs", "sh", "swift", "ts", "r": return "chevron.left.forwardslash.chevron.right"
    case "html", "htm": return "globe"
    case "png", "jpg", "jpeg", "gif", "svg", "webp": return "photo"
    case "pdf": return "doc.richtext"
    default: return "doc"
    }
  }
}

// MARK: a page the agent built
// The page lives on the machine (in Mac-local mode, in the chosen folder): it is served to the web
// view through PageScheme (Shared/PageScheme.swift), which reads each file from the opencode server.

/// The sidebar in a dark style (OLA-221): the style's frame color instead of the system's material,
/// so Graphite's near-black and Ink's navy are what is seen. Light mode and Standard are untouched.
private struct DarkFrame: ViewModifier {
  @Environment(\.colorScheme) private var scheme
  func body(content: Content) -> some View {
    if scheme == .dark, ThemeBox.shared.style != .standard {
      content.scrollContentBackground(.hidden).background(Ola.room)
    } else {
      content
    }
  }
}

extension View {
  func darkFrame() -> some View { modifier(DarkFrame()) }
}
