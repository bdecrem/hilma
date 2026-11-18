import OlaKit
import QuickLook
import SwiftUI

@main
struct OlaPhoneApp: App {
  @UIApplicationDelegateAdaptor(PhoneAppDelegate.self) private var appDelegate
  @State private var store: OlaStore
  @Environment(\.scenePhase) private var phase

  init() {
    OlaFont.register()
    #if DEBUG
    KitShots.runIfAsked()
    #endif
    // `-OlaFixture <name>`: made-up sessions, no network (for simulator screenshots).
    let args = ProcessInfo.processInfo.arguments
    // `-OlaWhere mac|machine|none`: start in that place, as the Settings switch would leave it.
    if let i = args.firstIndex(of: "-OlaWhere"), i + 1 < args.count {
      PhoneWhere.mode = PhoneMode(rawValue: args[i + 1])
      #if DEBUG
      // A fresh install, for the first screen in the simulator.
      if args[i + 1] == "none", !args.contains("-OlaFixture") { Credentials.forget(); AccountKeeper.forget() }
      #endif
      PhoneWhereState.shared.set(PhoneWhere.mode)
    }
    if let i = args.firstIndex(of: "-OlaFixture"), i + 1 < args.count {
      _store = State(initialValue: OlaStore(fixture: Fixture.named(args[i + 1])))
    } else {
      // The place this phone works in: its Mac (the pairing), or the Ola machine (the sign-in).
      _store = State(initialValue: OlaStore(config: PhoneWhere.mode.flatMap(PhoneWhere.config)))
    }
  }

  var body: some Scene {
    WindowGroup {
      PhoneRoot(store: store)
        .onAppear {
          #if DEBUG
          // Simulator check against the real server: the password arrives in the environment
          // (SIMCTL_CHILD_OLA_PASSWORD), never on a command line, and goes into the Keychain.
          let env = ProcessInfo.processInfo.environment
          if let code = env["OLA_PAIR"].flatMap(PairingCode.parse) {
            Task { try? await store.connect(code.config); PhoneWhereState.shared.paired() }
            return
          }
          // Signing in to the Ola machine as a made-up account: the name and the password arrive
          // in the environment (SIMCTL_CHILD_OLA_SIGNIN_*), never on a command line, and the
          // sign-in goes the way the screen's Sign In button sends it.
          if let h = env["OLA_SIGNIN_HANDLE"], let pw = env["OLA_SIGNIN_PASSWORD"], !PhoneWhere.signedIn {
            Task { _ = await PhoneWhereState.shared.signIn(handle: h, password: pw, store: store) }
          }
          DebugHooks.run(store)
          #endif
          PhonePermissions.wire(store)
          store.start()
        }
        // The choice of the place the phone works in, read again whenever that place changes.
        .task(id: store.config?.url) { if !PhoneWhereState.shared.fixture { await PhonePermissions.shared.refresh(store) } }
        .onChange(of: phase) { _, p in
          store.isActive = p == .active
          if p != .active { PhonePushState.shared.setViewing(nil) }
          if p == .active, case .lost = store.connection { store.reconnect() }
          if p == .active, store.connection == .connecting { store.start() }
          if p == .active, !PhoneWhereState.shared.fixture { Task { await PhonePermissions.shared.refresh(store) } }
        }
    }
  }
}

struct PhoneRoot: View {
  @Bindable var store: OlaStore
  @State private var path: [String] = []
  @State private var askNotifications = false
  @Bindable private var push = PhonePushState.shared

  var body: some View {
    Group {
      if store.connection == .notSetUp {
        PhoneStart(store: store)
      } else {
        PhoneShell(store: store, path: $path)
      }
    }
    .onAppear {
      // A fixture opens on its session, so the screenshot shows the conversation.
      if ProcessInfo.processInfo.arguments.contains("-OlaOpen") { path = [store.selectedID ?? ""] }
    }
    .onAppear {
      push.store = store
      Task { await push.refreshAllowed() }
    }
    // After pairing, once: may Ola notify? (Not at first launch.)
    .onChange(of: store.connection) { _, c in
      if c == .open, store.config?.viaMac == true, !push.asked { askNotifications = true }
    }
    // Notifications come through the Mac: not asked on the Ola machine.
    .onChange(of: store.config?.account) { _, a in if a == true { askNotifications = false } }
    .alert("Get a notification when Ola is done or needs your OK?", isPresented: $askNotifications) {
      Button("Allow") { Task { await push.requestPermission() } }
      Button("Not now", role: .cancel) { push.asked = true }
    }
    // A tapped notification opens its session; an approval is right there.
    .onChange(of: push.openSession) { _, id in
      guard let id else { return }
      store.selectedID = id
      path = [id]
      push.openSession = nil
    }
    .onChange(of: store.sessions.first?.id) { _, id in
      // `-OlaOpenFirst`: open the newest session once the list arrives (a live screenshot).
      if let id, path.isEmpty, ProcessInfo.processInfo.arguments.contains("-OlaOpenFirst") { path = [id] }
    }
    .onChange(of: store.selectedID) { _, id in
      // `-OlaAsk`: the conversation the hook started is on screen.
      if let id, ProcessInfo.processInfo.arguments.contains("-OlaAsk") { path = [id] }
    }
  }
}

#if DEBUG
/// Launch hooks for driving the app headlessly in the simulator (there is no window to tap):
///   -OlaAsk "<request>"          once connected, a new session with that request
///   -OlaSwitchAfter <s> <mode>   after s seconds, the Settings switch to mac or machine
///   -OlaPermissions lots|ask     once connected, the Settings switch "Lots of permissions"
@MainActor
enum DebugHooks {
  static func run(_ store: OlaStore) {
    let a = ProcessInfo.processInfo.arguments
    if let i = a.firstIndex(of: "-OlaAsk"), i + 1 < a.count {
      let text = a[i + 1]
      Task {
        // With a sign-in in the environment, the request is for the Ola machine: wait for it.
        let machine = ProcessInfo.processInfo.environment["OLA_SIGNIN_HANDLE"] != nil
        @MainActor func ready() -> Bool { store.connection == .open && (!machine || store.config?.account == true) }
        for _ in 0..<120 where !ready() { try? await Task.sleep(nanoseconds: 500_000_000) }
        guard ready() else { return }
        store.newSession()
        await store.send(text)
      }
    }
    // -OlaPermissions lots|ask: once connected, the Settings switch "Lots of permissions" (OLA-139).
    if let i = a.firstIndex(of: "-OlaPermissions"), i + 1 < a.count, let m = PermissionMode(rawValue: a[i + 1]) {
      Task {
        for _ in 0..<120 where store.connection != .open { try? await Task.sleep(nanoseconds: 500_000_000) }
        await PhonePermissions.shared.set(m, store: store)
      }
    }
    if let i = a.firstIndex(of: "-OlaSwitchAfter"), i + 2 < a.count, let s = Double(a[i + 1]), let m = PhoneMode(rawValue: a[i + 2]) {
      Task {
        try? await Task.sleep(nanoseconds: UInt64(s * 1_000_000_000))
        PhoneWhereState.shared.choose(m, store: store)
      }
    }
  }
}
#endif

// MARK: sessions, in the room

struct SessionsScreen: View {
  @Bindable var store: OlaStore
  var open: (String) -> Void
  @State private var renaming: SessionInfo?
  @State private var newTitle = ""
  @State private var deleting: SessionInfo?
  @State private var reconnectShown = false
  @State private var notificationsShown = false
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    List {
      Section {
        ForEach(store.sessions) { s in
          Button { open(s.id) } label: {
            PhoneSessionRow(session: s, running: store.running.contains(s.id), unseen: store.unseen.contains(s.id), needsYou: store.needsYou(s.id))
          }
          .listRowBackground(Ola.room)
          .listRowSeparatorTint(Ola.roomRule)
          .swipeActions {
            Button("Delete") { deleting = s }.tint(Ola.vermilion)
            Button("Rename") { newTitle = s.title; renaming = s }.tint(Ola.roomRaised)
          }
          .contextMenu {
            Button("Rename", systemImage: "pencil") { newTitle = s.title; renaming = s }
            Button("Delete", systemImage: "trash", role: .destructive) { deleting = s }
          }
        }
      } header: {
        PhoneMachineHeader(store: store)
      }
      if store.sessions.isEmpty, store.connection == .open {
        Text("No sessions yet. Start one with the pencil above.").font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.dim).listRowBackground(Ola.room)
      }
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .background(Ola.room)
    .refreshable { await store.refresh() }
    .navigationTitle("Ola")
    .navigationBarTitleDisplayMode(.inline)
    // The bar is the frame's tone in each mode, so the system draws its title in the right ink.
    .toolbarBackground(UIScheme.room(scheme), for: .navigationBar)
    .toolbarBackground(.visible, for: .navigationBar)
    .toolbar {
      ToolbarItem(placement: .principal) {
        HStack(spacing: 8) {
          Image("Mark").resizable().frame(width: 24, height: 24).clipShape(RoundedRectangle(cornerRadius: 6))
          Text("Ola").font(OlaFont.sans(20, .display)).foregroundStyle(Ola.onRoom)
        }
      }
      ToolbarItem(placement: .topBarLeading) {
        Menu {
          Button("Notifications", systemImage: "bell") { notificationsShown = true }
          Button("Pair again", systemImage: "qrcode") { reconnectShown = true }
          Button("Forget this Mac", systemImage: "xmark.circle", role: .destructive) { store.forget() }
        } label: { Image(systemName: "ellipsis.circle") }
      }
      ToolbarItem(placement: .topBarTrailing) {
        Button { store.newSession(); open("") } label: { Image(systemName: "square.and.pencil") }.accessibilityLabel("New session")
      }
    }
    .alert("Rename session", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
      TextField("Name", text: $newTitle)
      Button("Rename") { if let s = renaming { Task { await store.rename(s.id, to: newTitle) } } }
      Button("Cancel", role: .cancel) {}
    }
    .confirmationDialog("Delete \u{201C}\(deleting?.title ?? "")\u{201D}?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
      Button("Delete Session", role: .destructive) { if let s = deleting { Task { await store.delete(s.id) } } }
    } message: {
      Text("It is deleted on the machine, for the Mac too. Files Ola made stay in the folder.")
    }
    .sheet(isPresented: $notificationsShown) { NotificationSettingsSheet().presentationDetents([.medium]) }
    .sheet(isPresented: Binding(get: { reconnectShown || store.connection == .refused }, set: { reconnectShown = $0 })) {
      PairScreen(store: store) { reconnectShown = false }
    }
  }
}

struct PhoneMachineHeader: View {
  var store: OlaStore
  var body: some View {
    HStack(spacing: 10) {
      DeskMarkSmall(lit: store.connection == .open, working: !store.running.isEmpty)
      VStack(alignment: .leading, spacing: 1) {
        Text(status).font(OlaFont.sans(Metrics.meta + 0.5, .semibold)).foregroundStyle(Ola.onRoom)
        Text(store.config?.url.host() ?? "").font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.dim)
      }
      Spacer()
      if case .lost = store.connection { Button("Try now") { store.reconnect() }.font(OlaFont.sans(Metrics.meta, .semibold)).foregroundStyle(Ola.lamp) }
    }
    .textCase(nil)
    .padding(.vertical, 8)
  }
  var status: String {
    switch store.connection {
    case .open: store.running.isEmpty ? "The machine is idle" : store.running.count == 1 ? "Working on 1 session" : "Working on \(store.running.count) sessions"
    case .connecting: "Connecting"
    case .lost: "The machine is not answering"
    case .refused: "The password was refused"
    case .notSetUp: "Not connected"
    }
  }
}

struct DeskMarkSmall: View {
  var lit: Bool
  var working: Bool
  var body: some View {
    ZStack(alignment: .bottomLeading) {
      RoundedRectangle(cornerRadius: 3).fill(Ola.paper).frame(width: 30, height: 21)
      HStack(spacing: 3) {
        Circle().fill(lit ? Ola.leaf : Ola.ink3).frame(width: 4, height: 4)
        Circle().fill(working ? Ola.lamp : Ola.rule).frame(width: 4, height: 4)
      }
      .padding(5)
    }
  }
}

struct PhoneSessionRow: View {
  var session: SessionInfo
  var running: Bool
  var unseen: Bool
  var needsYou: Bool
  var body: some View {
    HStack(alignment: .center, spacing: 12) {
      ZStack {
        if needsYou { Circle().fill(Ola.vermilion).frame(width: 9, height: 9) }
        else if running { LampDot() }
        else if unseen { Circle().fill(Ola.vermilion).frame(width: 8, height: 8) }
      }
      .frame(width: 12)
      VStack(alignment: .leading, spacing: 3) {
        Text(session.title).font(OlaFont.sans(Metrics.ui + 1, unseen || needsYou ? .semibold : .medium)).foregroundStyle(Ola.onRoom).lineLimit(2)
        Text(needsYou ? "Needs your yes" : running ? "Working" : shortTime(session.updated))
          .font(OlaFont.sans(Metrics.meta, needsYou ? .semibold : .regular)).foregroundStyle(needsYou ? Ola.vermilion : running ? Ola.lamp : Ola.dim)
      }
      Spacer()
      Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Ola.dim.opacity(0.7))
    }
    .padding(.vertical, 6)
    .contentShape(Rectangle())
  }
}

// MARK: the conversation, on paper

struct ConversationScreen: View {
  @Bindable var store: OlaStore
  var id: String
  @State private var draft = ""
  @State private var filesShown = false
  @State private var viewed: ViewedItem?

  var body: some View {
    VStack(spacing: 0) {
      ConnectionBar(store: store)
      ConversationPane(store: store, draft: $draft, columnWidth: 640, sidePadding: 18)
    }
    .background(Ola.paper)
    .navigationTitle(store.selected?.title ?? "New session")
    .navigationBarTitleDisplayMode(.inline)
    .toolbarBackground(Ola.paper, for: .navigationBar)
    .toolbarBackground(.visible, for: .navigationBar)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button { filesShown = true } label: { Image(systemName: "folder") }.tint(Ola.blue).accessibilityLabel("Files")
      }
    }
    .onAppear {
      if !id.isEmpty, store.selectedID != id { store.selectedID = id }
      store.onView = { viewed = ViewedItem(item: $0) }
      store.onFiles = { filesShown = true }
      PhonePushState.shared.setViewing(store.selectedID)
    }
    .onDisappear { PhonePushState.shared.setViewing(nil) }
    .toolbar(.hidden, for: .tabBar)
    // Haptics where an iPhone app has them: an answer to an approval, a run done.
    .sensoryFeedback(.success, trigger: store.conversation?.turns.last?.status == .done)
    .sensoryFeedback(.selection, trigger: store.conversation?.turns.count)
    .onChange(of: store.selectedID) { _, id in PhonePushState.shared.setViewing(id) }
    .sheet(item: $viewed) { v in ResultViewer(store: store, item: v.item) }
    .sensoryFeedback(.warning, trigger: store.conversation?.approval?.id) { _, new in new != nil }
    .sheet(isPresented: $filesShown) { PhoneFiles(store: store) }
  }
}

struct PhoneFiles: View {
  var store: OlaStore
  @State private var preview: URL?
  @State private var page: String?
  @State private var folder = ""

  var body: some View {
    NavigationStack {
      List {
        ForEach(store.files[folder] ?? []) { f in
          Button {
            if f.isDirectory { folder = f.path; Task { await store.loadFiles(f.path) } }
            else if f.name.hasSuffix(".html") { page = f.path }
            else { open(f) }
          } label: {
            Label(f.name, systemImage: f.isDirectory ? "folder" : "doc").font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink)
          }
          .listRowBackground(Ola.paper)
        }
      }
      .scrollContentBackground(.hidden)
      .background(Ola.paper)
      .navigationTitle(folder.isEmpty ? "Files" : folder)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        if !folder.isEmpty {
          ToolbarItem(placement: .topBarLeading) {
            Button("Up") { folder = (folder.dropLast() as Substring).split(separator: "/").dropLast().joined(separator: "/").appending(folder.split(separator: "/").count > 1 ? "/" : "") }
          }
        }
      }
      .task { await store.loadFiles(folder) }
      .refreshable { await store.loadFiles(folder) }
      .quickLookPreview($preview)
      .sheet(item: Binding(get: { page.map { PagePath(path: $0) } }, set: { page = $0?.path })) { p in
        NavigationStack { PageView(store: store, path: p.path).ignoresSafeArea(edges: .bottom).navigationTitle((p.path as NSString).lastPathComponent).navigationBarTitleDisplayMode(.inline) }
      }
    }
    .tint(Ola.blue)
  }

  func open(_ f: FileEntry) {
    Task {
      guard let data = try? await store.read(f.path) else { return }
      let url = FileManager.default.temporaryDirectory.appendingPathComponent("ola-files").appendingPathComponent(f.path)
      try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      try? data.write(to: url)
      preview = url
    }
  }
}

struct PagePath: Identifiable { var path: String; var id: String { path } }

enum UIScheme {
  static func room(_ scheme: ColorScheme) -> Color {
    _ = scheme
    return Ola.room
  }
}
