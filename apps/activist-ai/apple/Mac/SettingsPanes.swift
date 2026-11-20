import AppKit
import OlaKit
import SwiftUI

/// Settings, as a Mac settings window: a toolbar of panes, each a short grouped form (labels on the
/// left, controls on the right, one line of help), none of them scrolling at its normal size.
/// (2026-11-17, Bart: "the layout of that is very poor on the Mac build": it was one tall window of
/// stacked cards. Two layouts were drawn and compared, apple-shots/settings: a toolbar of panes,
/// chosen, and a sidebar like System Settings.)
enum SettingsPane: String, CaseIterable, Identifiable {
  case general, account, models, skills, phone, advanced
  var id: String { rawValue }
  var title: String {
    switch self {
    case .general: "General"
    case .account: "Account"
    case .models: "Models"
    case .skills: "Skills"
    case .phone: "Phone"
    case .advanced: "Advanced"
    }
  }
  var symbol: String {
    switch self {
    case .general: "gearshape"
    case .account: "person.crop.circle"
    case .models: "cpu"
    case .skills: "wand.and.stars"
    case .phone: "iphone"
    case .advanced: "gearshape.2"
    }
  }
}

struct SettingsView: View {
  var store: OlaStore
  var whereOla: WhereOlaWorks?
  var phoneLink: PhoneLink?
  var phonePush: PhonePush? = nil
  var account: AccountController? = nil
  var cli: CLIInstaller? = nil
  var tokenKnown: Bool? = nil
  /// Ola's skills (version, the Ola machine's, what each needs here).
  var skills: SkillsInfo? = nil
  var look: SettingsLook = .native
  /// Screenshots and checks: one pane only, without the window's toolbar.
  var only: SettingsPane? = nil
  /// Screenshots: the fallbacks to show, so drawing never reads the app's own.
  var fallbacksPreview: FallbackSettings? = nil
  /// Screenshots: Advanced as it would look (on, with a count), without asking the server.
  var keptPreview: KeptSettings.Preview? = nil
  @AppStorage("ola.settingsPane") private var chosen = SettingsPane.general.rawValue
  @AppStorage(LocalSettings.modeKey) private var mode = "machine"
  static let width: CGFloat = 560

  var panes: [SettingsPane] {
    SettingsPane.allCases.filter { p in
      switch p {
      case .account: account != nil
      case .models: whereOla != nil
      case .skills: skills != nil
      case .phone: phoneLink != nil || phonePush != nil
      case .general, .advanced: true
      }
    }
  }

  var body: some View {
    Group {
      if let only {
        pane(only)
      } else {
        TabView(selection: $chosen) {
          ForEach(panes) { p in
            pane(p).tabItem { Label(p.title, systemImage: p.symbol) }.tag(p.rawValue)
          }
        }
      }
    }
    .environment(\.settingsLook, look)
  }

  @ViewBuilder func pane(_ p: SettingsPane) -> some View {
    Form { content(p) }
      .formStyle(.grouped)
      .scrollDisabled(true)
      .fixedSize(horizontal: false, vertical: true)
      .frame(width: Self.width)
  }

  @ViewBuilder func content(_ p: SettingsPane) -> some View {
    switch p {
    case .general:
      AppearanceSettings(applies: only == nil)
      // The setup of each runtime; which one a session works in is chosen in New Session.
      machine
      if let whereOla { WhereSettings(controller: whereOla, tokenKnown: tokenKnown) }
      PermissionsSettings(cloudSetUp: cloudStore.config != nil || (account?.signedIn ?? AccountKeeper.signedIn))
      updates
    case .account:
      if let account { AccountSettings(account: account, cli: cli) }
    case .models:
      if let whereOla { ModelsSettings(controller: whereOla, preview: fallbacksPreview) }
    case .skills:
      if let skills { SkillsSettings(info: skills) }
    case .phone:
      if let phoneLink { PhoneSettings(link: phoneLink) }
      if let phonePush { SettingsGroup(title: "Phone notifications") { PushSettings(push: phonePush) } }
    case .advanced:
      KeptSettings(preview: keptPreview)
    }
  }

  /// This build and the update check (OLA-149: here, not in the Ola menu). The daily check at
  /// launch is unchanged.
  var updates: some View {
    SettingsGroup(title: "Updates") {
      LabeledContent("Version") { Text("\(UpdateCheck.thisVersion) (\(UpdateCheck.thisBuild))").foregroundStyle(.secondary) }
      HStack {
        Spacer()
        Button("Check for Updates\u{2026}") { Task { await UpdateCheck.check(userAsked: true) } }
      }
    }
  }

  /// The store holding the cloud runtime's sessions (on screen, or the other one).
  var cloudStore: OlaStore { whereOla?.store(.cloud) ?? store }

  /// The cloud runtime: one status line, and "Connect Again…" only when it is not connected
  /// (OLA-210, Bart: "it should just show status and 'connect again' if the status is Not
  /// Connected"). The cloud is the signed-in person's project on app.ola.cx (OLA-150): no address,
  /// no password of its own; signing out is Account's own control. A picker only when the person
  /// has more than one project.
  var machine: some View {
    SettingsGroup(title: "Cloud: on the Ola machine") {
      HStack(alignment: .firstTextBaseline) {
        StatusLine(kind: statusKind, text: statusText)
        Spacer(minLength: Space.s)
        if needsConnecting {
          if account?.signedIn ?? AccountKeeper.signedIn {
            Button("Connect Again\u{2026}") { cloudStore.reconnect(); Task { await whereOla?.refreshCloud() } }
          } else {
            Button("Sign In\u{2026}") { account?.wantsGate = true }
          }
        }
      }
      if let w = whereOla, w.cloudProjects.count > 1 {
        Picker("Project", selection: Binding(get: { OlaCloud.project(of: w.cloudConfig) ?? "" }, set: { w.chooseProject($0) })) {
          ForEach(w.cloudProjects) { Text($0.name).tag($0.slug) }
        }
      }
      if let p = whereOla?.cloudProblem { SettingNote(p) }
    }
  }

  static let snapshotSize = CGSize(width: width, height: 300)

  var needsConnecting: Bool {
    switch cloudStore.connection {
    case .open, .connecting: false
    case .lost, .refused, .notSetUp: true
    }
  }

  var statusKind: StatusLine.Kind {
    switch cloudStore.connection {
    case .open: .ok
    case .connecting: .busy
    case .lost, .refused: .problem
    case .notSetUp: .off
    }
  }

  /// The signed-in person's name, when this Mac knows it (never read from the Keychain to draw).
  var personName: String? { (account?.name ?? AccountKeeper.name).flatMap { $0.isEmpty ? nil : $0 } }

  var statusText: String {
    switch cloudStore.connection {
    case .open: personName.map { "Connected as \($0.split(separator: " ").first.map(String.init) ?? $0)" } ?? "Connected"
    case .connecting: "Connecting\u{2026}"
    case .lost, .refused, .notSetUp: "Not connected"
    }
  }
}

/// Permissions: "Lots of permissions", one switch per runtime (OLA-142, meeting of 2026-11-18:
/// "settings follow the runtime, not the product"). Cloud: sent with each cloud session from this
/// Mac, as the website sends its own switch (OLA-150). Local: this Mac's agent, the `ola` command, and the phone
/// through this Mac. Off is "Ask before each step".
struct PermissionsSettings: View {
  var cloudSetUp: Bool
  @AppStorage(PermissionSettings.key) private var local = PermissionMode.lots.rawValue
  @AppStorage(PermissionSettings.cloudKey) private var cloud = PermissionMode.lots.rawValue
  @State private var problem: String?

  var body: some View {
    SettingsGroup(title: "Permissions") {
      VStack(alignment: .leading, spacing: 2) {
        Toggle("Lots of permissions in the cloud", isOn: Binding(get: { cloud == PermissionMode.lots.rawValue }, set: { on in
          let m: PermissionMode = on ? .lots : .ask
          let was = cloud
          cloud = m.rawValue
          Task {
            problem = await PermissionSettings.setCloud(m)
            if problem != nil { cloud = was }
          }
        }))
        .disabled(!cloudSetUp)
        SettingNote(cloudSetUp ? (cloud == PermissionMode.lots.rawValue ? PermissionMode.lots.note : PermissionMode.ask.note) + " For the cloud sessions you work in from this Mac." : "Sign in to Ola first.")
      }
      VStack(alignment: .leading, spacing: 2) {
        Toggle("Lots of permissions on this Mac", isOn: Binding(get: { local == PermissionMode.lots.rawValue }, set: { on in
          let m: PermissionMode = on ? .lots : .ask
          local = m.rawValue
          Task { _ = await PermissionSettings.set(m) }
        }))
        SettingNote((local == PermissionMode.lots.rawValue ? PermissionMode.lots.note : PermissionMode.ask.note) + " The same in the ola command and on your phone through this Mac.")
      }
      if let problem { StatusLine(kind: .problem, text: problem) }
    }
  }
}

/// Models: Ola's own model always; Claude and the hosted open model only when the person says so.
struct ModelsSettings: View {
  var controller: WhereOlaWorks
  var preview: FallbackSettings?
  @State private var f: FallbackSettings
  @State private var asking: Fallback?

  init(controller: WhereOlaWorks, preview: FallbackSettings?) {
    self.controller = controller
    self.preview = preview
    _f = State(initialValue: preview ?? FallbackSettings.load(controller.fallbackFolder))
  }

  var body: some View {
    let claudeWhy = controller.claudeUnavailable
    let hostedWhy = controller.hostedUnavailable
    let provider = controller.hostedStatus.provider
    Section {
      Toggle(isOn: binding(.claude)) {
        Text("Fallback to Claude")
        Text(claudeWhy ?? "Claude Code on this Mac, with your own Claude login.")
      }
      .disabled(claudeWhy != nil && !f.claude)
      Toggle(isOn: binding(.hosted)) {
        Text("Fallback to the hosted open model")
        Text(hostedWhy ?? (["A bigger open model at \(provider ?? "an outside company")", controller.hostedStatus.monthLine].compactMap { $0 }.joined(separator: ". ") + "."))
      }
      .disabled(hostedWhy != nil && !f.hosted)
    } header: {
      Text("Fallbacks")
    } footer: {
      Text("Off unless you turn them on. Type /claude or /hosted before a request to hand over just that one.")
        .font(.callout).foregroundStyle(.secondary)
    }
    Section("When a request looks like a stretch") {
      Picker("Ola", selection: Binding(get: { f.stretch }, set: { f.stretch = $0; save() })) {
        ForEach(StretchMode.allCases, id: \.self) { Text($0.label).tag($0) }
      }
      if f.claude && f.hosted && f.stretch == .handover {
        Picker("Hand it to", selection: Binding(get: { f.stretchTo }, set: { f.stretchTo = $0; save() })) {
          Text("The hosted open model").tag(Fallback.hosted)
          Text("Claude").tag(Fallback.claude)
        }
      }
    }
    .onAppear { f = preview ?? FallbackSettings.load(controller.fallbackFolder) }
    .alert(asking == .claude ? "Turn on Fallback to Claude?" : "Turn on Fallback to the hosted open model?", isPresented: Binding(get: { asking != nil }, set: { if !$0 { asking = nil } })) {
      Button("Turn On") {
        if asking == .claude { f.claude = true } else { f.hosted = true }
        asking = nil
        save()
      }
      Button("Cancel", role: .cancel) { asking = nil }
    } message: {
      Text(asking == .claude ? FallbackWords.claudeConsent : FallbackWords.hostedConsent(provider))
    }
  }

  /// Turning one on asks first, with the consent text; turning it off does not.
  func binding(_ which: Fallback) -> Binding<Bool> {
    Binding(get: { f.isOn(which) }, set: { on in
      if on { asking = which } else {
        if which == .claude { f.claude = false } else { f.hosted = false }
        save()
      }
    })
  }

  func save() {
    guard preview == nil else { return }
    controller.saveFallbacks(f)
  }
}

/// Snapshots only: the Settings window as drawn by the system, in one of two layouts to compare:
/// a toolbar of panes (chosen) or a sidebar of panes like System Settings.
struct SettingsSnapshot: View {
  enum Layout { case toolbar, sidebar }
  var layout: Layout
  var pane: SettingsPane
  var panes: [SettingsPane] = SettingsPane.allCases
  var settings: SettingsView

  var body: some View {
    switch layout {
    case .toolbar:
      VStack(spacing: 0) {
        VStack(spacing: 6) {
          Text(pane.title).font(.system(size: 13, weight: .semibold))
          HStack(spacing: 2) {
            ForEach(panes) { p in
              VStack(spacing: 3) {
                Image(systemName: p.symbol).font(.system(size: 19)).frame(height: 22)
                Text(p.title).font(.system(size: 11))
              }
              .frame(width: 66, height: 46)
              .foregroundStyle(p == pane ? Color.accentColor : .secondary)
              .background(RoundedRectangle(cornerRadius: 6).fill(p == pane ? Color.primary.opacity(0.08) : .clear))
            }
          }
        }
        .padding(.top, 8).padding(.bottom, 6)
        .frame(maxWidth: .infinity)
        .background(Color(nsColor: .windowBackgroundColor))
        Divider()
        settings.pane(pane)
      }
      .background(Color(nsColor: .windowBackgroundColor))
      .frame(width: SettingsView.width)
    case .sidebar:
      HStack(spacing: 0) {
        VStack(alignment: .leading, spacing: 2) {
          ForEach(panes) { p in
            Label(p.title, systemImage: p.symbol).font(.system(size: 13))
              .padding(.horizontal, 8).padding(.vertical, 5)
              .frame(maxWidth: .infinity, alignment: .leading)
              .foregroundStyle(p == pane ? Color.white : .primary)
              .background(RoundedRectangle(cornerRadius: 6).fill(p == pane ? Color.accentColor : .clear))
          }
          Spacer()
        }
        .padding(10).frame(width: 170)
        .background(Color(nsColor: .underPageBackgroundColor))
        Divider()
        settings.pane(pane)
      }
      .background(Color(nsColor: .windowBackgroundColor))
    }
  }
}

/// Advanced: "Store your conversations on ola.cx to help us improve our systems" (OLA-159; Bart's
/// words). Off by default. On: each finished request and its answer goes to the Ola machine; the
/// person sees how many are kept and can delete them all.
struct KeptSettings: View {
  struct Preview { var on: Bool; var count: Int?; var signedIn: Bool }
  var preview: Preview? = nil
  @AppStorage(KeptConversations.key) private var on = false
  @State private var count: Int?
  @State private var since: Date?
  @State private var deleting = false
  @State private var note: String?

  var signedIn: Bool { preview?.signedIn ?? AccountKeeper.signedIn }
  var isOn: Bool { preview?.on ?? on }
  var shownCount: Int? { preview?.count ?? count }

  var body: some View {
    SettingsGroup(title: "Helping Ola get better") {
      VStack(alignment: .leading, spacing: 2) {
        Toggle("Store your conversations on ola.cx to help us improve our systems", isOn: Binding(get: { isOn }, set: { on = $0; Task { await refresh() } }))
          .disabled(!signedIn)
        SettingNote(signedIn
          ? "Off unless you turn it on. On: each request you finish and Ola\u{2019}s answer are kept on the Ola machine, with the steps in words. Never your files."
          : "Sign in to Ola first (Settings, Account).")
      }
      if signedIn, let n = shownCount, n > 0 || isOn {
        HStack(alignment: .firstTextBaseline) {
          Text(n == 0 ? "Nothing is kept yet." : n == 1 ? "1 request is kept." : "\(n) requests are kept.").foregroundStyle(.secondary)
          Spacer(minLength: Space.s)
          Button("Delete What Is Kept\u{2026}", role: .destructive) { deleting = true }.disabled(n == 0)
        }
      }
      if let note { SettingNote(note) }
    }
    .task { await refresh() }
    .confirmationDialog("Delete every conversation kept on ola.cx?", isPresented: $deleting, titleVisibility: .visible) {
      Button("Delete", role: .destructive) {
        Task {
          let n = await KeptConversations.deleteAll()
          note = n == nil ? "That did not reach the Ola machine. Try again." : "Deleted."
          await refresh()
        }
      }
    } message: { Text("This removes them from the Ola machine. Your sessions on this Mac stay as they are.") }
  }

  func refresh() async {
    guard preview == nil, AccountKeeper.signedIn else { return }
    if let s = await KeptConversations.status() { count = s.count; since = s.since }
  }
}

