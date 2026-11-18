import AppKit
import OlaKit
import SwiftUI

/// Settings, as a Mac settings window: a toolbar of panes, each a short grouped form (labels on the
/// left, controls on the right, one line of help), none of them scrolling at its normal size.
/// (2026-11-17, Bart: "the layout of that is very poor on the Mac build": it was one tall window of
/// stacked cards. Two layouts were drawn and compared, apple-shots/settings: a toolbar of panes,
/// chosen, and a sidebar like System Settings.)
enum SettingsPane: String, CaseIterable, Identifiable {
  case general, account, models, skills, phone
  var id: String { rawValue }
  var title: String {
    switch self {
    case .general: "General"
    case .account: "Account"
    case .models: "Models"
    case .skills: "Skills"
    case .phone: "Phone"
    }
  }
  var symbol: String {
    switch self {
    case .general: "gearshape"
    case .account: "person.crop.circle"
    case .models: "cpu"
    case .skills: "wand.and.stars"
    case .phone: "iphone"
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
  @State private var connecting = false
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
      case .general: true
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
    .sheet(isPresented: $connecting) { ConnectForm(store: store) { connecting = false }.frame(width: 400) }
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
      if let whereOla { WhereSettings(controller: whereOla, tokenKnown: tokenKnown) }
      PermissionsSettings()
      if mode != "mac" { machine }
    case .account:
      if let account { AccountSettings(account: account, cli: cli) }
    case .models:
      if let whereOla { ModelsSettings(controller: whereOla, preview: fallbacksPreview) }
    case .skills:
      if let skills { SkillsSettings(info: skills) }
    case .phone:
      if let phoneLink { PhoneSettings(link: phoneLink) }
      if let phonePush { SettingsGroup(title: "Phone notifications") { PushSettings(push: phonePush) } }
    }
  }

  /// The machine's rows, only when Ola works there.
  var machine: some View {
    SettingsGroup(title: "Ola machine") {
      LabeledContent("Address") {
        Text(store.config?.url.host() ?? "Not connected").foregroundStyle(.secondary)
          .lineLimit(1).truncationMode(.middle).textSelection(.enabled).help(store.config?.url.absoluteString ?? "")
      }
      LabeledContent("Status") { StatusLine(kind: statusKind, text: statusText) }
      HStack {
        Button("Forget This Machine", role: .destructive) { store.forget() }
        Spacer()
        Button("Connect Again\u{2026}") { connecting = true }
      }
    }
  }

  static let snapshotSize = CGSize(width: width, height: 300)

  var statusKind: StatusLine.Kind {
    switch store.connection {
    case .open: .ok
    case .connecting: .busy
    case .lost, .refused: .problem
    case .notSetUp: .off
    }
  }

  var statusText: String {
    switch store.connection {
    case .open: "Connected"
    case .connecting: "Connecting"
    case .lost: "Not answering"
    case .refused: "Password refused"
    case .notSetUp: "Not set up"
    }
  }
}

/// Permissions: one switch, "Lots of permissions", for the whole app (both places it works), the
/// `ola` command, the phone and the Ola machine (PermissionSettings; OLA-139). Off is "Ask before
/// each step". On the machine the machine itself goes ahead, so the phone needs no Mac for it.
struct PermissionsSettings: View {
  @AppStorage(PermissionSettings.key) private var mode = PermissionMode.lots.rawValue
  @State private var problem: String?

  var body: some View {
    let lots = mode == PermissionMode.lots.rawValue
    SettingsGroup(title: "Permissions") {
      Toggle("Lots of permissions", isOn: Binding(get: { lots }, set: { on in
        let m: PermissionMode = on ? .lots : .ask
        mode = m.rawValue
        Task { problem = await PermissionSettings.set(m) }
      }))
      SettingNote((lots ? PermissionMode.lots.note : PermissionMode.ask.note) + " The same on your phone, in the ola command and on the Ola machine.")
      if let problem { SettingNote(problem) }
    }
    .task { await PermissionSettings.pull() }
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
