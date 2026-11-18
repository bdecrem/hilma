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
    guard let t = token, !ProcessInfo.processInfo.arguments.contains("-OlaAdminFixture") else { return }
    do { links = try await AdminAuth.check(t) } catch let e as AdminAuth.Failure {
      if case .refused = e { signOut(); problem = "Sign in again." }
    } catch {}
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
  @AppStorage("ola.appearance") private var appearance = "system"

  var body: some View {
    Group {
      switch PhoneLayout.current {
      case .tabs:
        TabView(selection: $tab) {
          sessions(gear: false).tabItem { Label("Sessions", systemImage: "bubble.left.and.text.bubble.right") }.tag("sessions")
          if admin.signedIn {
            NavigationStack { KitRootView() }.tabItem { Label("Kit", systemImage: "waveform") }.tag("kit")
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

struct SessionsHome: View {
  @Bindable var store: OlaStore
  var gear: Bool
  var open: (String) -> Void
  @State private var query = ""
  @State private var renaming: SessionInfo?
  @State private var newTitle = ""
  @State private var deleting: SessionInfo?

  var shown: [SessionInfo] {
    let q = query.trimmingCharacters(in: .whitespaces).lowercased()
    return q.isEmpty ? store.sessions : store.sessions.filter { $0.title.lowercased().contains(q) || (store.previews[$0.id] ?? "").lowercased().contains(q) }
  }

  var body: some View {
    List {
      if case .lost = store.connection {
        Section { NotReachable(store: store) }
      } else if store.connection == .refused, store.onMachine {
        Section { SignedOutRow(store: store) }
      }
      ForEach(shown) { s in
        Button { open(s.id) } label: {
          SessionRow(session: s, preview: store.previews[s.id], running: store.running.contains(s.id), unseen: store.unseen.contains(s.id), needsYou: store.needsYou(s.id))
        }
        .listRowBackground(Ola.paper)
        .task { await store.loadPreview(s.id) }
        .swipeActions {
          Button("Delete", systemImage: "trash") { deleting = s }.tint(Ola.vermilion)
          Button("Rename", systemImage: "pencil") { newTitle = s.title; renaming = s }.tint(Ola.ink3)
        }
        .contextMenu {
          Button("Rename", systemImage: "pencil") { newTitle = s.title; renaming = s }
          Button("Delete", systemImage: "trash", role: .destructive) { deleting = s }
        }
      }
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .background(Ola.paper)
    .overlay {
      if store.sessions.isEmpty {
        switch store.connection {
        case .connecting: ProgressView("Loading")
        case .open: ContentUnavailableView { Label("No sessions yet", systemImage: "bubble.left.and.text.bubble.right") } description: { Text(store.onMachine ? "Start one and Ola gets to work on the Ola machine." : "Start one and Ola gets to work on your Mac.") } actions: { Button("New Session") { store.newSession(); open("") }.buttonStyle(.borderedProminent) }
        default: EmptyView()
        }
      } else if shown.isEmpty {
        ContentUnavailableView.search(text: query)
      }
    }
    .searchable(text: $query, prompt: "Search")
    .refreshable { await store.refresh() }
    .navigationTitle("Ola")
    .navigationBarTitleDisplayMode(.large)
    .toolbar {
      if gear {
        ToolbarItem(placement: .topBarLeading) {
          NavigationLink(value: "settings") { Image(systemName: "gearshape") }.accessibilityLabel("Settings")
        }
      }
      ToolbarItem(placement: .topBarTrailing) {
        Button { store.newSession(); open("") } label: { Image(systemName: "square.and.pencil") }
          .accessibilityLabel("New session")
          .sensoryFeedback(.impact(weight: .light), trigger: store.selectedID)
      }
    }
    .alert("Rename", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
      TextField("Name", text: $newTitle)
      Button("Rename") { if let s = renaming { Task { await store.rename(s.id, to: newTitle) } } }
      Button("Cancel", role: .cancel) {}
    }
    .confirmationDialog("Delete \u{201C}\(deleting?.title ?? "")\u{201D}?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
      Button("Delete", role: .destructive) { if let s = deleting { Task { await store.delete(s.id) } } }
    } message: {
      Text(store.onMachine ? "This deletes it on the Ola machine, for your Mac too. Files stay." : "This deletes it on your Mac too. Files stay.")
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
          if needsYou {
            Label("Needs your OK", systemImage: "exclamationmark.circle.fill").labelStyle(.titleAndIcon).foregroundStyle(Ola.vermilionText)
          } else if running {
            HStack(spacing: 6) { Circle().fill(Ola.lamp).frame(width: 7, height: 7); Text("Working") }.foregroundStyle(Ola.ink2)
          } else {
            Text(preview?.isEmpty == false ? preview! : " ").foregroundStyle(Ola.ink2).lineLimit(2)
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
        Text(store.onMachine ? "The Ola machine is not reachable" : "Your Mac is not reachable").font(.subheadline.weight(.semibold))
        Text(store.onMachine ? PhoneWhere.unreachableLine(tailscaleOn: PhoneWhere.tailscaleOn || PhoneWhereState.shared.fixture) : "Ola on your phone works through the Mac app.").font(.footnote).foregroundStyle(Ola.ink2)
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
        Text("Sign in again to keep working on the Ola machine.").font(.footnote).foregroundStyle(Ola.ink2)
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
  @AppStorage("ola.appearance") private var appearance = "system"
  @AppStorage("OlaWorking") private var working = ""
  @State private var pairAgain = false
  @State private var forgetting = false
  @State private var signingIn = false
  @State private var signingOut = false
  @Bindable private var place = PhoneWhereState.shared

  var macState: String {
    switch store.connection {
    case .open: return "Connected"
    case .connecting: return "Connecting"
    case .lost: return "Not reachable"
    case .refused: return "Needs pairing again"
    case .notSetUp: return "Not paired"
    }
  }

  var machineState: String {
    switch store.connection {
    case .open: return "Connected"
    case .connecting: return "Connecting"
    case .lost: return !PhoneWhere.tailscaleOn && !place.fixture ? "Tailscale is off on this phone" : "Not answering"
    case .refused: return "Signed out"
    case .notSetUp: return "Not signed in"
    }
  }

  var body: some View {
    Form {
      WhereSection(store: store)
      PermissionsSection(store: store)
      if place.mode == .machine {
        Section("Ola machine") {
          LabeledContent("Signed in as", value: place.shownName)
          LabeledContent("Status", value: machineState)
          Button("Sign Out", role: .destructive) { signingOut = true }
        }
      } else {
        Section("My Mac") {
          LabeledContent("Mac", value: store.config?.macName ?? "Not paired")
          LabeledContent("Status", value: macState)
          if let mode = store.macHello?["mode"].string {
            LabeledContent("Ola works", value: mode == "mac" ? "On the Mac" : "On the Ola machine")
          }
          Button("Pair Again") { pairAgain = true }
          Button("Forget This Mac", role: .destructive) { forgetting = true }
        }
      }
      if place.mode != .machine { Section {
        if push.allowed && push.token != nil {
          Toggle("Finished", isOn: Binding(get: { push.finished }, set: { push.finished = $0 }))
          Toggle("Needs me", isOn: Binding(get: { push.needs }, set: { push.needs = $0 }))
        } else if !push.allowed {
          Button("Allow Notifications") { Task { await push.requestPermission() } }
        } else {
          Text("Not available in this build yet.").foregroundStyle(Ola.ink2)
        }
      } header: { Text("Notifications") } footer: { Text("They come only while Ola is open on your Mac.") } }
      Section("Working animation") {
        HStack(spacing: 14) {
          WorkingFigure(turn: Turn(id: "preview-\(working)", request: "", at: .now, status: .working), size: 56)
            .frame(width: 56, height: 56)
            .id(working)
            .accessibilityHidden(true)
          Picker("Animation", selection: $working) {
            Text("Surprise me").tag("")
            Text("Swing").tag("swing")
            Text("Hop").tag("hop")
            Text("Machine").tag("machine")
            Text("Eyes").tag("eyes")
          }
          .pickerStyle(.menu)
        }
      }
      Section("Appearance") {
        Picker("Appearance", selection: $appearance) {
          Text("System").tag("system")
          Text("Light").tag("light")
          Text("Dark").tag("dark")
        }
        .pickerStyle(.segmented)
      }
      if place.mode != .machine {
        Section {
          LabeledContent("Fallback to Claude", value: store.macHello?["claude"].string.flatMap { $0.isEmpty ? nil : $0 } ?? "Unknown")
        } footer: { Text("Set on your Mac.") }
      }
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
    .navigationTitle("Settings")
    .task { await store.loadMacHello(); await push.refreshAllowed() }
    .sheet(isPresented: $pairAgain) { PairScreen(store: store) { pairAgain = false } }
    .sheet(isPresented: $signingIn) { AdminSignIn { signingIn = false } }
    .sheet(item: $place.setup) { m in WhereSetupSheet(mode: m, store: store) }
    .confirmationDialog("Forget this Mac?", isPresented: $forgetting, titleVisibility: .visible) {
      Button("Forget", role: .destructive) { place.forgetMac(store: store) }
    } message: { Text("You can pair again later.") }
    .confirmationDialog("Sign out of the Ola machine?", isPresented: $signingOut, titleVisibility: .visible) {
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
