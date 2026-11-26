import OlaKit
import SafariServices
import SwiftUI

/// The phone app after pairing: Sessions, Settings, and Kit for an admin.
/// Two shapes were drawn (`-OlaLayout tabs|gear`): a tab bar, or Settings behind a gear on Sessions.
@MainActor
@Observable
final class AdminState {
  static let shared = AdminState()
  var token: AdminToken?
  var links: [AdminLink] = []

  init() {
    if ProcessInfo.processInfo.arguments.contains("-OlaAdminFixture") {
      // Screenshots: a made-up admin (never a real token).
      token = AdminToken("olaapp.bart.\(Int(Date().timeIntervalSince1970) + 86400).FIXTUREFIXTUREFIXTUREFIXTUREFIXTUREFIXTUREXX")
      links = [AdminLink(name: "Leave a note", what: "Say what you want done. Kit reads it in a minute or two.", href: URL(string: "https://example.com")!),
               AdminLink(name: "Talk it through", what: "An open conversation, out loud.", href: URL(string: "https://example.com")!),
               AdminLink(name: "Answer my questions", what: "A short check-in, about five minutes.", href: URL(string: "https://example.com")!)]
    } else {
      token = AdminAuth.load()
    }
  }
  var problem: String?
  var signedIn: Bool { token.map { !$0.expired() } ?? false }

  func refresh() async {
    guard !ProcessInfo.processInfo.arguments.contains("-OlaAdminFixture") else { return }
    if !signedIn { await viaOla() }
    guard let t = token else { return }
    do { links = try await AdminAuth.check(t) } catch let e as AdminAuth.Failure {
      if case .refused = e {
        signOut()
        await viaOla()
        if token == nil { problem = "Sign in again." }
      }
    } catch {}
  }

  /// An admin signed in to Ola needs no second sign-in (OLA-151; Bart, 2026-11-18: "user bart is an
  /// admin user and i want to see the voice chat tab"). Quiet for everyone else.
  func viaOla() async {
    guard let s = AccountKeeper.session, let (t, l) = try? await AdminAuth.signIn(ola: s) else { return }
    AdminAuth.save(t)
    token = t
    links = l
    problem = nil
  }

  func signIn(_ name: String, _ password: String) async -> Bool {
    problem = nil
    do {
      let (t, l) = try await AdminAuth.signIn(name: name, password: password)
      AdminAuth.save(t)
      token = t
      links = l
      return true
    } catch {
      problem = (error as? LocalizedError)?.errorDescription ?? "That did not work."
      return false
    }
  }

  func signOut() {
    AdminAuth.signOut()
    token = nil
    links = []
  }
}

enum PhoneLayout: String { case tabs, gear
  static var current: PhoneLayout {
    let a = ProcessInfo.processInfo.arguments
    if let i = a.firstIndex(of: "-OlaLayout"), i + 1 < a.count, let l = PhoneLayout(rawValue: a[i + 1]) { return l }
    return .tabs
  }
}

struct PhoneShell: View {
  @Bindable var store: OlaStore
  @Binding var path: [String]
  @Bindable private var admin = AdminState.shared
  @State private var tab = "sessions"
  @State private var settingsPath: [String] = []
  /// Light by default, as on the Mac (OLA-207, OLA-222).
  @AppStorage("ola.appearance") private var appearance = "light"

  var body: some View {
    Group {
      switch PhoneLayout.current {
      case .tabs:
        TabView(selection: $tab) {
          sessions(gear: false).tabItem { Label("Sessions", systemImage: "bubble.left.and.text.bubble.right") }.tag("sessions")
          if admin.signedIn {
            NavigationStack { KitRootView() }.tabItem { Label("Voice Chat", systemImage: "waveform") }.tag("kit")
          }
          NavigationStack { SettingsScreen(store: store) }.tabItem { Label("Settings", systemImage: "gearshape") }.tag("settings")
        }
        // Signing in or out adds or removes a tab: the bar is built again rather than patched.
        .id(admin.signedIn)
      case .gear:
        sessions(gear: true)
      }
    }
    .tint(Ola.blue)
    .preferredColorScheme(appearance == "light" ? .light : appearance == "dark" ? .dark : nil)
    .task { await admin.refresh() }
    .onAppear {
      let a = ProcessInfo.processInfo.arguments
      if let i = a.firstIndex(of: "-OlaTab"), i + 1 < a.count { tab = a[i + 1] }
    }
  }

  func sessions(gear: Bool) -> some View {
    NavigationStack(path: $path) {
      SessionsHome(store: store, gear: gear) { path = [$0] }
        .navigationDestination(for: String.self) { id in
          switch id {
          case "settings": SettingsScreen(store: store)
          case "kit": KitRootView()
          default: ConversationScreen(store: store, id: id)
          }
        }
    }
  }
}

// MARK: Sessions, the home

/// One runtime's sessions in the list (OLA-143: the list says which runtime each session is on).
struct PhoneRuntimeSection: Identifiable {
  let runtime: Runtime
  let store: OlaStore
  var id: Runtime { runtime }
}

struct SessionsHome: View {
  @Bindable var store: OlaStore
  var gear: Bool
  var open: (String) -> Void
  @State private var query = ""
  @State private var renaming: SessionInfo?
  @State private var newTitle = ""
  @State private var deleting: SessionInfo?
  /// The store a rename or a delete is for (a session of either runtime).
  @State private var target: OlaStore?
  /// A tap or a double tap on "Cloud" or "Local" hides or shows that runtime's sessions (OLA-167).
  @AppStorage("ola.sessions.hidden.cloud") private var cloudHidden = false
  @AppStorage("ola.sessions.hidden.local") private var localHidden = false
  func hidden(_ r: Runtime) -> Bool { r == .cloud ? cloudHidden : localHidden }
  func toggle(_ r: Runtime) { if r == .cloud { cloudHidden.toggle() } else { localHidden.toggle() } }
  /// Checks only: `-OlaToggleRuntime local` toggles that header once at launch, through the same
  /// `toggle` a tap calls (the simulator has no tap), so a relaunch shows the kept state.
  static var toggledAtLaunch = false
  func toggleFromLaunchArguments() {
    let a = ProcessInfo.processInfo.arguments
    guard !Self.toggledAtLaunch, let i = a.firstIndex(of: "-OlaToggleRuntime"), i + 1 < a.count, let r = Runtime(rawValue: a[i + 1]) else { return }
    Self.toggledAtLaunch = true
    toggle(r)
  }
  @Bindable private var place = PhoneWhereState.shared

  /// The runtimes that are set up, cloud first, each with the store holding its sessions now.
  var sections: [PhoneRuntimeSection] {
    Runtime.allCases.compactMap { r in
      guard let s = place.store(r, store), s.config != nil else { return nil }
      return PhoneRuntimeSection(runtime: r, store: s)
    }
  }

  func shown(_ st: OlaStore) -> [SessionInfo] {
    let q = query.trimmingCharacters(in: .whitespaces).lowercased()
    return q.isEmpty ? st.sessions : st.sessions.filter { $0.title.lowercased().contains(q) || (st.previews[$0.id] ?? "").lowercased().contains(q) }
  }

  var allEmpty: Bool { sections.allSatisfy { $0.store.sessions.isEmpty } }

  /// A session of the runtime on screen opens as it is; one of the other runtime brings that
  /// runtime on screen first.
  func open(_ r: Runtime, _ s: SessionInfo, in st: OlaStore) {
    if st !== store { place.open(r, id: s.id, store: store) }
    open(s.id)
  }

  var body: some View {
    List {
      if case .lost = store.connection {
        Section { NotReachable(store: store) }
      } else if store.connection == .refused, store.onMachine {
        Section { SignedOutRow(store: store) }
      }
      ForEach(sections) { sec in
        let r = sec.runtime, st = sec.store
        Section {
          ForEach(hidden(r) ? [] : shown(st)) { s in
            Button { open(r, s, in: st) } label: {
              SessionRow(session: s, preview: st.previews[s.id], running: st.running.contains(s.id), unseen: st.unseen.contains(s.id), needsYou: st.needsYou(s.id))
            }
            .listRowBackground(Ola.paper)
            .task { await st.loadPreview(s.id) }
            // A cloud session stays in its project, as on the website (OLA-150): no Delete there.
            .swipeActions {
              if r != .cloud { Button("Delete", systemImage: "trash") { target = st; deleting = s }.tint(Ola.vermilion) }
              Button("Rename", systemImage: "pencil") { target = st; newTitle = s.title; renaming = s }.tint(Ola.ink3)
            }
            .contextMenu {
              Button("Rename", systemImage: "pencil") { target = st; newTitle = s.title; renaming = s }
              if r != .cloud { Button("Delete", systemImage: "trash", role: .destructive) { target = st; deleting = s } }
            }
          }
          if !hidden(r), st.sessions.isEmpty, !allEmpty || st !== store {
            Text(emptyLine(r, st)).font(.subheadline).foregroundStyle(Ola.ink2).listRowBackground(Ola.paper)
          }
        } header: {
          // Which runtime: "Cloud  on the Ola machine", "Local  through your Mac".
          HStack(spacing: 6) {
            Image(systemName: r.symbol)
            Text(r.name).fontWeight(.semibold)
            Text(r.place(phone: true))
            Spacer(minLength: 4)
            if hidden(r) { Text("\(st.sessions.count)").monospacedDigit() }
            Image(systemName: "chevron.down").font(.caption2.weight(.semibold)).rotationEffect(.degrees(hidden(r) ? -90 : 0))
          }
          .font(.footnote).foregroundStyle(Ola.ink2).textCase(nil)
          // The whole header is the target, at least 44 points high (OLA-222): a double tap, as
          // Bart does on the Mac, or a single tap (the chevron included) hides or shows the
          // sessions. The double tap is attached first so it is recognized as one toggle, not two.
          .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
          .contentShape(Rectangle())
          .onTapGesture(count: 2) { withAnimation { toggle(r) } }
          .onTapGesture { withAnimation { toggle(r) } }
          .accessibilityElement(children: .ignore)
          .accessibilityAddTraits(.isButton)
          .accessibilityLabel("\(r.name) sessions, \(r.place(phone: true))")
          .accessibilityValue(hidden(r) ? "collapsed" : "expanded")
          .accessibilityHint(hidden(r) ? "Shows its sessions." : "Hides its sessions.")
          .accessibilityAction { toggle(r) }
        }
      }
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .background(Ola.paper)
    .onAppear { toggleFromLaunchArguments() }
    .overlay {
      if allEmpty {
        switch store.connection {
        case .connecting: ProgressView("Loading")
        case .open: ContentUnavailableView { Label("No sessions yet", systemImage: "bubble.left.and.text.bubble.right") } description: { Text("Start one, and choose where Ola works on it: on the Ola machine, or through your Mac.") } actions: { Button("New Session") { place.chooserShown = true }.buttonStyle(.borderedProminent) }
        default: EmptyView()
        }
      } else if !query.isEmpty, sections.allSatisfy({ shown($0.store).isEmpty }) {
        ContentUnavailableView.search(text: query)
      }
    }
    .searchable(text: $query, prompt: "Search")
    .refreshable { for sec in sections { await sec.store.refresh() } }
    .navigationTitle("Ola")
    .navigationBarTitleDisplayMode(.large)
    .toolbar {
      if gear {
        ToolbarItem(placement: .topBarLeading) {
          NavigationLink(value: "settings") { Image(systemName: "gearshape") }.accessibilityLabel("Settings")
        }
      }
      ToolbarItem(placement: .topBarTrailing) {
        // Where the session works is chosen first: cloud or local (OLA-143).
        Button { place.chooserShown = true } label: { Image(systemName: "square.and.pencil") }
          .accessibilityLabel("New session")
          .sensoryFeedback(.impact(weight: .light), trigger: store.selectedID)
      }
    }
    .sheet(isPresented: $place.chooserShown) { PhoneNewSessionSheet(store: store) { open("") } }
    .alert("Rename", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
      TextField("Name", text: $newTitle)
      Button("Rename") { if let s = renaming { Task { await (target ?? store).rename(s.id, to: newTitle) } } }
      Button("Cancel", role: .cancel) {}
    }
    .confirmationDialog("Delete \u{201C}\(deleting?.title ?? "")\u{201D}?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
      Button("Delete", role: .destructive) { if let s = deleting { Task { await (target ?? store).delete(s.id) } } }
    } message: {
      Text("This deletes it on your Mac too. Files stay.")
    }
  }

  /// The one line in a runtime's section that has no sessions to show.
  func emptyLine(_ r: Runtime, _ st: OlaStore) -> String {
    switch st.connection {
    case .open: return "No sessions here yet."
    case .connecting: return "Connecting\u{2026}"
    case .refused: return r == .cloud ? "Signed out. Sign in again in Settings." : "Pair with your Mac again in Settings."
    default: return r == .cloud ? "Ola is not answering." : "Your Mac is not reachable."
    }
  }
}

struct SessionRow: View {
  var session: SessionInfo
  var preview: String?
  var running: Bool
  var unseen: Bool
  var needsYou: Bool

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      VStack(alignment: .leading, spacing: 3) {
        HStack(alignment: .firstTextBaseline) {
          Text(session.title).font(.headline).foregroundStyle(Ola.ink).lineLimit(1)
          Spacer(minLength: 6)
          Text(shortTime(session.updated)).font(.subheadline).foregroundStyle(Ola.ink3).monospacedDigit()
        }
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Hopping(running: running) { hopping in
            if needsYou {
              Label("Needs your OK", systemImage: "exclamationmark.circle.fill").labelStyle(.titleAndIcon).foregroundStyle(Ola.vermilionText)
            } else if hopping {
              HStack(spacing: 6) { ListHop(label: nil); Text("Working") }.foregroundStyle(Ola.ink2)
            } else {
              Text(preview?.isEmpty == false ? preview! : " ").foregroundStyle(Ola.ink2).lineLimit(2)
            }
          }
          Spacer(minLength: 0)
          if unseen && !needsYou && !running { Circle().fill(Ola.action).frame(width: 9, height: 9).accessibilityLabel("New") }
        }
        .font(.subheadline)
      }
    }
    .padding(.vertical, 4)
    .contentShape(Rectangle())
    .accessibilityElement(children: .combine)
  }
}

struct NotReachable: View {
  var store: OlaStore
  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: store.onMachine ? "exclamationmark.triangle" : "desktopcomputer.trianglebadge.exclamationmark").foregroundStyle(Ola.vermilionText)
      VStack(alignment: .leading, spacing: 2) {
        Text(store.onMachine ? "Ola is not reachable" : "Your Mac is not reachable").font(.subheadline.weight(.semibold))
        Text(store.onMachine ? PhoneWhere.unreachableLine : "Ola on your phone works through the Mac app.").font(.footnote).foregroundStyle(Ola.ink2)
      }
      Spacer()
      Button("Try Again") { store.reconnect() }.buttonStyle(.bordered).controlSize(.small)
    }
    .padding(.vertical, 4)
  }
}

/// On the Ola machine, the phone's key no longer works (signed out, or removed under Your devices).
struct SignedOutRow: View {
  var store: OlaStore
  @State private var signingIn = false
  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: "person.crop.circle.badge.exclamationmark").foregroundStyle(Ola.vermilionText)
      VStack(alignment: .leading, spacing: 2) {
        Text("Signed out on this phone").font(.subheadline.weight(.semibold))
        Text("Sign in again to keep working in the cloud.").font(.footnote).foregroundStyle(Ola.ink2)
      }
      Spacer()
      Button("Sign In") { signingIn = true }.buttonStyle(.bordered).controlSize(.small)
    }
    .padding(.vertical, 4)
    .sheet(isPresented: $signingIn) { WhereSetupSheet(mode: .machine, store: store) }
  }
}

// MARK: Settings

struct SettingsScreen: View {
  @Bindable var store: OlaStore
  @Bindable private var push = PhonePushState.shared
  @Bindable private var admin = AdminState.shared
  @AppStorage("ola.appearance") private var appearance = "light"
  @AppStorage(DarkStyle.key) private var darkStyle = DarkStyle.standard.rawValue
  @Environment(\.colorScheme) private var scheme
  @State private var pairAgain = false
  @State private var forgetting = false
  @State private var signingIn = false
  @State private var signingOut = false
  @Bindable private var place = PhoneWhereState.shared

  /// The store holding each runtime's sessions (on screen, or the other one), when it is set up.
  var cloud: OlaStore? { place.store(.cloud, store) }
  var local: OlaStore? { place.store(.local, store) }
  var cloudReady: Bool { place.fixture ? cloud != nil : PhoneWhere.signedIn }
  var localReady: Bool { place.fixture ? local != nil : PhoneWhere.paired }

  var macState: String {
    switch local?.connection ?? .notSetUp {
    case .open: return "Connected"
    case .connecting: return "Connecting"
    case .lost: return "Not reachable"
    case .refused: return "Needs pairing again"
    case .notSetUp: return "Not paired"
    }
  }

  /// The Cloud section's one line: "Connected as Bart", "Connecting…", or "Not connected".
  var machineLine: String {
    switch cloud?.connection ?? .notSetUp {
    case .open:
      let first = place.shownName.split(separator: " ").first.map(String.init) ?? place.shownName
      return first.isEmpty ? "Connected" : "Connected as \(first)"
    case .connecting: return "Connecting\u{2026}"
    case .lost, .refused, .notSetUp: return "Not connected"
    }
  }

  var machineNeedsConnecting: Bool {
    switch cloud?.connection ?? .notSetUp {
    case .open, .connecting: return false
    case .lost, .refused, .notSetUp: return true
    }
  }

  var machineDot: Color {
    switch cloud?.connection ?? .notSetUp {
    case .open: return Ola.leaf
    case .connecting: return Ola.lamp
    case .lost, .refused, .notSetUp: return Ola.vermilion
    }
  }

  /// In Graphite and Ink the groups are the style's page on its frame (OLA-221); otherwise the system's.
  var styled: Bool { scheme == .dark && ThemeBox.shared.style != .standard }

  var body: some View {
    Form { Group {
      // The setup of each runtime. Which one a session works in is chosen in New Session (OLA-143).
      Section {
        if cloudReady {
          // One status line, Connect Again only when not connected (OLA-210, as on the Mac).
          Label { Text(machineLine) } icon: { Circle().fill(machineDot).frame(width: 8, height: 8) }
          if machineNeedsConnecting { Button("Connect Again\u{2026}") { place.setup = .machine } }
          LabeledContent("Server", value: AccountServer.name())
          Button("Sign Out", role: .destructive) { signingOut = true }
        } else {
          Button("Sign In to Ola\u{2026}") { place.setup = .machine }
        }
      } header: { Text("Cloud: on the Ola machine") } footer: {
        Text(cloudReady ? "The same sessions as on the website. Works with your Mac off." : "Your phone works in your Ola projects, the same sessions as the website, even when your Mac is off.")
      }
      Section {
        if localReady {
          LabeledContent("Mac", value: local?.config?.macName ?? "Not paired")
          LabeledContent("Status", value: macState)
          Button("Pair Again") { pairAgain = true }
          Button("Forget This Mac", role: .destructive) { forgetting = true }
        } else {
          Button("Pair with Your Mac\u{2026}") { place.setup = .mac }
        }
      } header: { Text("Local: through your Mac") } footer: {
        Text(localReady ? "Ola works on your Mac, in its folder. Your Mac needs to be on." : "Scan the code in Ola on your Mac (Settings, Phone).")
      }
      PermissionsSection(store: store)
      if localReady { Section {
        if push.allowed && push.token != nil {
          Toggle("Finished", isOn: Binding(get: { push.finished }, set: { push.finished = $0 }))
          Toggle("Needs me", isOn: Binding(get: { push.needs }, set: { push.needs = $0 }))
        } else if !push.allowed {
          Button("Allow Notifications") { Task { await push.requestPermission() } }
        } else {
          Text("Not available in this build yet.").foregroundStyle(Ola.ink2)
        }
      } header: { Text("Notifications") } footer: { Text("They come only while Ola is open on your Mac.") } }
      Section {
        Picker("Appearance", selection: $appearance) {
          Text("Light").tag("light")
          Text("Dark").tag("dark")
          Text("Match iPhone").tag("system")
        }
        // Two variations on dark (OLA-221), while the app is dark (chosen, or the phone's).
        if appearance == "dark" || scheme == .dark {
          Picker("Dark style", selection: Binding(get: { darkStyle }, set: { v in
            darkStyle = v
            (DarkStyle(rawValue: v) ?? .standard).apply()
          })) {
            ForEach(DarkStyle.allCases) { Text($0.title).tag($0.rawValue) }
          }
        }
      } header: {
        Text("Appearance")
      } footer: {
        if appearance == "dark" || scheme == .dark { Text((DarkStyle(rawValue: darkStyle) ?? .standard).note) }
      }
      if localReady {
        Section {
          LabeledContent("Fallback to Claude", value: local?.macHello?["claude"].string.flatMap { $0.isEmpty ? nil : $0 } ?? "Unknown")
        } footer: { Text("Set on your Mac.") }
      }
      PhoneKeptSection()
      Section("Admin") {
        if admin.signedIn, let t = admin.token {
          LabeledContent("Signed in", value: t.user)
          Button("Sign Out", role: .destructive) { admin.signOut() }
        } else {
          Button("Sign In") { signingIn = true }
          if let p = admin.problem { Text(p).foregroundStyle(Ola.vermilionText) }
        }
      }
      Section("About") {
        HStack(spacing: 12) {
          Image("Mark").resizable().frame(width: 44, height: 44).clipShape(RoundedRectangle(cornerRadius: 10)).accessibilityHidden(true)
          VStack(alignment: .leading, spacing: 2) {
            Text("Ola").font(.headline)
            Text("Version \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?") (\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "?"))").font(.subheadline).foregroundStyle(Ola.ink2)
            Text("Made for Bart").font(.subheadline).foregroundStyle(Ola.ink2)
          }
        }
      }
    }
    .listRowBackground(styled ? Ola.paper : nil)
    }
    .scrollContentBackground(styled ? .hidden : .automatic)
    .background(styled ? Ola.room : Color.clear)
    .navigationTitle("Settings")
    .task { await local?.loadMacHello(); await push.refreshAllowed() }
    .sheet(isPresented: $pairAgain) { WhereSetupSheet(mode: .mac, store: store) }
    .sheet(isPresented: $signingIn) { AdminSignIn { signingIn = false } }
    .sheet(item: $place.setup) { m in WhereSetupSheet(mode: m, store: store) }
    .confirmationDialog("Forget this Mac?", isPresented: $forgetting, titleVisibility: .visible) {
      Button("Forget", role: .destructive) { place.forgetMac(store: store) }
    } message: { Text("You can pair again later.") }
    .confirmationDialog("Sign out of Ola?", isPresented: $signingOut, titleVisibility: .visible) {
      Button("Sign Out", role: .destructive) { Task { await place.signOut(store: store) } }
    } message: { Text(PhoneWhere.paired ? "Your phone goes back to working through your Mac." : "You can sign in again later.") }
  }
}

struct AdminSignIn: View {
  var done: () -> Void
  @Bindable private var admin = AdminState.shared
  @State private var name = ""
  @State private var password = ""
  @State private var busy = false
  @FocusState private var field: Int?

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("Name", text: $name).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled().focused($field, equals: 0)
            .submitLabel(.next).onSubmit { field = 1 }
          SecureField("Password", text: $password).textContentType(.password).focused($field, equals: 1)
            .submitLabel(.go).onSubmit(go)
        } footer: { Text("Your kochitolabs account.") }
        if let p = admin.problem { Text(p).foregroundStyle(Ola.vermilionText) }
      }
      .navigationTitle("Admin Sign In")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: done) }
        ToolbarItem(placement: .confirmationAction) {
          if busy { ProgressView() } else { Button("Sign In", action: go).disabled(name.isEmpty || password.isEmpty) }
        }
      }
      .onAppear { field = 0 }
    }
  }

  func go() {
    guard !name.isEmpty, !password.isEmpty else { return }
    busy = true
    Task {
      let ok = await admin.signIn(name, password)
      busy = false
      password = ""
      if ok { done() }
    }
  }
}

// MARK: Kit (admins only)

/// The admin-only destination. The voice feature replaces this screen: start from here.
struct KitRootView: View {
  var body: some View {
    // Kit's voice: meetings and notes. The token is the admin sign-in's, read from the Keychain at each call.
    KitScreen(api: KitAPI(token: { AdminAuth.load()?.token }))
      .navigationTitle("Kit")
  }
}

/// Advanced, on the phone: the same switch as the Mac's (OLA-159), off by default.
struct PhoneKeptSection: View {
  @AppStorage(KeptConversations.key) private var on = false
  @State private var count: Int?
  @State private var deleting = false
  var signedIn: Bool { AccountKeeper.signedIn }

  var body: some View {
    Section {
      Toggle("Store your conversations on ola.cx to help us improve our systems", isOn: $on).disabled(!signedIn)
      if signedIn, let n = count, n > 0 {
        Button("Delete What Is Kept (\(n))", role: .destructive) { deleting = true }
      }
    } header: { Text("Advanced") } footer: {
      Text(signedIn ? "Off unless you turn it on. On: each request you finish and Ola\u{2019}s answer are kept on the Ola machine, with the steps in words. Never your files." : "Sign in to Ola first.")
    }
    .task(id: on) { if signedIn, let s = await KeptConversations.status() { count = s.count } }
    .confirmationDialog("Delete every conversation kept on ola.cx?", isPresented: $deleting, titleVisibility: .visible) {
      Button("Delete", role: .destructive) { Task { _ = await KeptConversations.deleteAll(); if let s = await KeptConversations.status() { count = s.count } } }
    }
  }
}

