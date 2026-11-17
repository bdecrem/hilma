import OlaKit
import QuickLook
import UniformTypeIdentifiers
import SwiftUI
import WebKit

/// Two looks were drawn for the window (see apple/README.md), both "paper laid on the blue room":
/// `sheet` lays the conversation and the files on the room as two sheets; `desk` lays one sheet,
/// with the files as its ruled right margin.
enum Treatment: String { case sheet, desk }
private struct TreatmentKey: EnvironmentKey { static let defaultValue = Treatment.desk }

/// The paper's edge on the room: a small radius and one soft shadow.
enum Sheet {
  static let radius: CGFloat = 5
  static let gap: CGFloat = Space.s
}

extension View {
  /// The files panel's paper: its own sheet, or the right margin of the one sheet.
  @ViewBuilder func filesPaper(_ t: Treatment) -> some View {
    switch t {
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
  @State private var viewed: URL?
  @Environment(\.openWindow) private var openWindow
  @Environment(\.treatment) private var treatment

  var body: some View {
    NavigationSplitView {
      Sidebar(store: store)
        .navigationSplitViewColumnWidth(min: 200, ideal: 232, max: 320)
    } detail: {
      VStack(spacing: 0) {
        ConnectionBar(store: store)
        ConversationPane(store: store, draft: $draft)
          .conversationPaper(treatment, filesShown: filesShown)
      }
      .background(Ola.room)
      .inspector(isPresented: $filesShown) {
        FilesPanel(store: store).filesPaper(treatment)
          .inspectorColumnWidth(min: 200, ideal: 248, max: 400)
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
          .help(filesShown ? "Hide the project\u{2019}s files" : "Show the project\u{2019}s files")
      }
    }
    .toolbarBackground(Ola.room, for: .windowToolbar)
    .toolbarBackground(.visible, for: .windowToolbar)
    .focusedSceneValue(\.olaDraft, $draft)
    .quickLookPreview($viewed)
    .sheet(isPresented: Binding(get: { (store.connection == .notSetUp && !LocalSettings.onThisMac) || connectShown }, set: { connectShown = $0 })) {
      ConnectForm(store: store) { connectShown = false }.frame(width: 400).interactiveDismissDisabled(store.connection == .notSetUp)
    }
    .onChange(of: store.connection) { _, c in if c == .refused { connectShown = true } }
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

/// The sidebar, at the system's own density: 13-point rows 28 points tall, 11-point labels.
struct Sidebar: View {
  @Bindable var store: OlaStore
  @State private var renaming: SessionInfo?
  @State private var newTitle = ""
  @State private var deleting: SessionInfo?
  @FocusState private var focused: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      ScrollView {
        VStack(alignment: .leading, spacing: 1) {
          Button { store.newSession() } label: {
            HStack(spacing: 6) {
              Image(systemName: "square.and.pencil").font(.system(size: Metrics.ui - 1, weight: .medium)).frame(width: SessionRow.markColumn)
              Text("New session").font(OlaFont.sans(Metrics.ui, .medium))
              Spacer()
              Text("\u{2318}N").font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.dim)
            }
            .foregroundStyle(Ola.onRoom)
            .padding(.horizontal, Space.s).frame(height: SessionRow.height)
            .contentShape(Rectangle())
            .hoverFill(Ola.roomHover, radius: 6, selected: store.selectedID == nil ? Ola.roomRaised : nil)
          }
          .buttonStyle(.plain)
          .help("Start a new session (\u{2318}N)")
          Text("Sessions").font(OlaFont.sans(Metrics.meta, .semibold)).foregroundStyle(Ola.dim)
            .padding(.horizontal, Space.s).padding(.top, Space.l).padding(.bottom, Space.xs)
          ForEach(store.sessions) { s in
            SessionRow(session: s, selected: store.selectedID == s.id, running: store.running.contains(s.id), unseen: store.unseen.contains(s.id), needsYou: store.needsYou(s.id))
              .onTapGesture { store.selectedID = s.id }
              .contextMenu {
                Button("Rename\u{2026}") { newTitle = s.title; renaming = s }
                Button("Delete\u{2026}", role: .destructive) { deleting = s }
              }
          }
          if store.sessions.isEmpty, store.connection == .open {
            Text("No sessions yet.").font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.dim).padding(.horizontal, Space.s).padding(.vertical, 6)
          }
        }
        .padding(.horizontal, Space.s).padding(.top, Space.xs).padding(.bottom, Space.s)
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
  static let height: CGFloat = 28
  static let markColumn: CGFloat = 14

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 6) {
      ZStack {
        if needsYou { Circle().fill(Ola.vermilion).frame(width: 7, height: 7) }
        else if running { LampDot() }
        else if unseen { Circle().fill(Ola.vermilion).frame(width: 6, height: 6) }
      }
      .frame(width: Self.markColumn, height: 8)
      .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 3.5 }
      VStack(alignment: .leading, spacing: 1) {
        Text(session.title).font(OlaFont.sans(Metrics.ui, selected ? .medium : .regular)).foregroundStyle(selected ? Ola.onRoom : Ola.mist)
          .lineLimit(1).truncationMode(.tail)
        if needsYou { Text("Needs your yes").font(OlaFont.sans(Metrics.meta, .medium)).foregroundStyle(Ola.vermilion) }
      }
      Spacer(minLength: Space.xs)
      Text(running ? "now" : shortTime(session.updated)).font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.dim).monospacedDigit()
    }
    .padding(.horizontal, Space.s).padding(.vertical, 6)
    .frame(minHeight: Self.height)
    .contentShape(Rectangle())
    .hoverFill(Ola.roomHover, radius: 6, selected: selected ? Ola.roomRaised : nil)
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
        Text(f.name).font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink).lineLimit(1).truncationMode(.middle)
        Spacer(minLength: Space.xs)
        if loading == f.path { ProgressView().controlSize(.mini) }
        if f.name.hasSuffix(".html") || f.name.hasSuffix(".htm") {
          Button("Open") { page(f.path) }.buttonStyle(LinkButton(weight: .semibold)).help("Open the page in its own window")
        }
      }
      .padding(.leading, CGFloat(depth) * 14 + 4).padding(.trailing, Space.s)
      .frame(height: 24)
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
