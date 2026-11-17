import OlaKit
import QuickLook
import UniformTypeIdentifiers
import SwiftUI
import WebKit

/// Two looks were drawn for the conversation (see apple/README.md): `sheet` lays the paper on the
/// blue room like the web app; `flush` is a native split with the paper filling the pane.
enum Treatment: String { case sheet, flush }
private struct TreatmentKey: EnvironmentKey { static let defaultValue = Treatment.sheet }

extension View {
  /// In the sheet look, a panel is a sheet of paper on the room.
  @ViewBuilder func sheetted(_ t: Treatment) -> some View {
    if t == .sheet {
      clipShape(RoundedRectangle(cornerRadius: 3)).shadow(color: .black.opacity(0.25), radius: 10, y: 3)
        .padding(.trailing, 12).padding(.bottom, 12).padding(.top, 2).background(Ola.room)
    } else {
      self
    }
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
  @SceneStorage("selected") private var savedSelection: String?
  @SceneStorage("filesShown") private var filesShown = true
  @State private var draft = ""
  @State private var connectShown = false
  @Environment(\.treatment) private var treatment

  var body: some View {
    NavigationSplitView {
      Sidebar(store: store)
        .navigationSplitViewColumnWidth(min: 220, ideal: 260, max: 340)
    } detail: {
      VStack(spacing: 0) {
        ConnectionBar(store: store)
        detail
      }
      .background(treatment == .sheet ? Ola.room : Ola.paper)
      .inspector(isPresented: $filesShown) {
        FilesPanel(store: store).sheetted(treatment)
          .inspectorColumnWidth(min: 240, ideal: 290, max: 420)
      }
    }
    .navigationTitle(store.selected?.title ?? "New session")
    .navigationSubtitle(subtitle)
    .toolbar {
      if store.gatewayModels.count > 1 {
        ToolbarItem {
          Picker("Model", selection: Binding(get: { store.model }, set: { m in if let m { Task { await store.choose(m) } } })) {
            ForEach(store.gatewayModels) { Text($0.name).tag(Optional($0)) }
          }
          .help("The model for this session")
        }
      }
      ToolbarItem {
        Button { filesShown.toggle() } label: { Label("Files", systemImage: "sidebar.right") }
          .help("Show or hide the project's files")
      }
    }
    .toolbarBackground(treatment == .sheet ? Ola.room : Ola.paper, for: .windowToolbar)
    .toolbarBackground(.visible, for: .windowToolbar)
    .toolbarColorScheme(treatment == .sheet ? .dark : nil, for: .windowToolbar)
    .focusedSceneValue(\.olaDraft, $draft)
    .sheet(isPresented: Binding(get: { (store.connection == .notSetUp && !LocalSettings.onThisMac) || connectShown }, set: { connectShown = $0 })) {
      ConnectForm(store: store) { connectShown = false }.frame(width: 440).interactiveDismissDisabled(store.connection == .notSetUp)
    }
    .onChange(of: store.connection) { _, c in if c == .refused { connectShown = true } }
    .onAppear { if store.selectedID == nil, let s = savedSelection { store.selectedID = s } }
    .onChange(of: store.selectedID) { _, id in savedSelection = id }
  }

  @ViewBuilder var detail: some View {
    switch treatment {
    case .flush:
      ConversationPane(store: store, draft: $draft)
    case .sheet:
      ConversationPane(store: store, draft: $draft, sidePadding: 48)
        .clipShape(RoundedRectangle(cornerRadius: 3))
        .shadow(color: .black.opacity(0.25), radius: 10, y: 3)
        .padding(.horizontal, 12).padding(.bottom, 12).padding(.top, 2)
    }
  }

  var subtitle: String {
    switch store.connection {
    case .open:
      let place = store.config?.url.host() == "127.0.0.1" ? "On this Mac" : "On the machine"
      return store.running.isEmpty ? place : "\(place) \u{00B7} \(store.running.count) working"
    case .connecting: return "Connecting"
    case .lost: return "Not answering"
    case .refused: return "Password refused"
    case .notSetUp: return "Not connected"
    }
  }
}

// MARK: the room: sessions

struct Sidebar: View {
  @Bindable var store: OlaStore
  @State private var renaming: SessionInfo?
  @State private var newTitle = ""
  @State private var deleting: SessionInfo?
  @FocusState private var focused: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      ScrollView {
        VStack(alignment: .leading, spacing: 2) {
          Button { store.newSession() } label: {
            Label("New session", systemImage: "plus").font(OlaFont.sans(Metrics.ui + 0.5, .medium)).foregroundStyle(Ola.onRoom)
              .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 10).padding(.vertical, 7)
              .background(RoundedRectangle(cornerRadius: 5).fill(store.selectedID == nil ? Ola.roomRaised : .clear))
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .padding(.bottom, 10)
          Text("Sessions").font(OlaFont.sans(Metrics.meta, .semibold)).foregroundStyle(Ola.dim).padding(.horizontal, 10).padding(.bottom, 4)
          ForEach(store.sessions) { s in
            SessionRow(session: s, selected: store.selectedID == s.id, running: store.running.contains(s.id), unseen: store.unseen.contains(s.id), needsYou: store.needsYou(s.id))
              .onTapGesture { store.selectedID = s.id }
              .contextMenu {
                Button("Rename\u{2026}") { newTitle = s.title; renaming = s }
                Button("Delete\u{2026}", role: .destructive) { deleting = s }
              }
          }
          if store.sessions.isEmpty, store.connection == .open {
            Text("No sessions yet.").font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.dim).padding(10)
          }
        }
        .padding(.horizontal, 10).padding(.top, 6)
      }
      MachineFooter(store: store)
    }
    .background(Ola.room)
    .focusable()
    .focused($focused)
    .focusEffectDisabled()
    .onKeyPress(.upArrow) { move(-1) }
    .onKeyPress(.downArrow) { move(1) }
    .onKeyPress(.delete) { if let s = store.selected { deleting = s }; return .handled }
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

  func move(_ by: Int) -> KeyPress.Result {
    guard !store.sessions.isEmpty else { return .ignored }
    let i = store.sessions.firstIndex { $0.id == store.selectedID } ?? -1
    store.selectedID = store.sessions[max(0, min(store.sessions.count - 1, i + by))].id
    return .handled
  }
}

struct SessionRow: View {
  var session: SessionInfo
  var selected: Bool
  var running: Bool
  var unseen: Bool
  var needsYou: Bool

  var body: some View {
    HStack(spacing: 8) {
      ZStack {
        if needsYou { Circle().fill(Ola.vermilion).frame(width: 8, height: 8) }
        else if running { LampDot() }
        else if unseen { Circle().fill(Ola.vermilion).frame(width: 7, height: 7) }
      }
      .frame(width: 10)
      VStack(alignment: .leading, spacing: 1) {
        Text(session.title).font(OlaFont.sans(Metrics.ui + 0.5, selected ? .semibold : .regular)).foregroundStyle(selected ? Ola.onRoom : Ola.mist).lineLimit(1)
        if needsYou { Text("Needs your yes").font(OlaFont.sans(Metrics.meta, .medium)).foregroundStyle(Ola.vermilion) }
      }
      Spacer(minLength: 4)
      Text(running ? "now" : shortTime(session.updated)).font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.dim).monospacedDigit()
    }
    .padding(.horizontal, 10).padding(.vertical, 7)
    .background(RoundedRectangle(cornerRadius: 5).fill(selected ? Ola.roomRaised : .clear))
    .contentShape(Rectangle())
  }
}

struct MachineFooter: View {
  var store: OlaStore
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Rectangle().fill(Ola.roomRule).frame(height: 1)
      HStack(spacing: 10) {
        DeskMark(lit: store.connection == .open, working: !store.running.isEmpty)
        VStack(alignment: .leading, spacing: 2) {
          Text(title).font(OlaFont.sans(Metrics.ui, .semibold)).foregroundStyle(Ola.onRoom)
          Text(store.config?.url.host()?.components(separatedBy: ".").first ?? "").font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.dim).lineLimit(1)
        }
      }
      .padding(.horizontal, 16).padding(.bottom, 14).padding(.top, 4)
    }
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
      RoundedRectangle(cornerRadius: 3).fill(Ola.paper).frame(width: 34, height: 24)
      HStack(spacing: 3) {
        Circle().fill(lit ? Ola.leaf : Ola.ink3).frame(width: 4, height: 4)
        Circle().fill(working ? Ola.lamp : Ola.rule).frame(width: 4, height: 4)
      }
      .padding(5)
      HStack(spacing: 1.5) { ForEach(0..<4, id: \.self) { _ in Rectangle().fill(Ola.ink3).frame(width: 1, height: 7) } }
        .offset(x: 21, y: -13)
    }
    .frame(width: 34, height: 24)
  }
}

// MARK: files of the project

struct FilesPanel: View {
  var store: OlaStore
  @State private var preview: URL?
  @State private var loading: String?
  @State private var problem: String?
  @Environment(\.openWindow) private var openWindow

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text("Files").font(OlaFont.sans(Metrics.ui + 2, .semibold)).foregroundStyle(Ola.ink)
          Text(store.projectFolder.replacingOccurrences(of: "/Users/admin", with: "~")).font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink3)
        }
        Spacer()
        Button { Task { await reload() } } label: { Image(systemName: "arrow.clockwise") }.buttonStyle(.plain).foregroundStyle(Ola.ink2).help("Reload")
      }
      .padding(.horizontal, 16).padding(.vertical, 12)
      Rectangle().fill(Ola.rule).frame(height: 1)
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          FolderRows(store: store, path: "", depth: 0, open: open, page: { openWindow(id: "page", value: $0) }, loading: loading)
          if store.files[""]?.isEmpty == true {
            Text("Nothing here yet. What Ola makes appears here.").font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink3).padding(16)
          }
        }
        .padding(.vertical, 6)
      }
      if let problem { Text(problem).font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.vermilionText).padding(12) }
    }
    .background(Ola.details)
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
      HStack(spacing: 7) {
        if f.isDirectory {
          Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)).foregroundStyle(Ola.ink3).rotationEffect(.degrees(expanded.contains(f.path) ? 90 : 0)).frame(width: 10)
        } else { Color.clear.frame(width: 10) }
        Image(systemName: f.isDirectory ? "folder" : icon(f.name)).font(.system(size: 12)).foregroundStyle(Ola.blue).frame(width: 16)
        Text(f.name).font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink).lineLimit(1).truncationMode(.middle)
        Spacer()
        if loading == f.path { ProgressView().controlSize(.mini) }
        if f.name.hasSuffix(".html") || f.name.hasSuffix(".htm") {
          Button("Open") { page(f.path) }.buttonStyle(.plain).font(OlaFont.sans(Metrics.meta, .semibold)).foregroundStyle(Ola.blue)
        }
      }
      .padding(.leading, CGFloat(depth) * 14 + 12).padding(.trailing, 14).padding(.vertical, 5)
      .contentShape(Rectangle())
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
