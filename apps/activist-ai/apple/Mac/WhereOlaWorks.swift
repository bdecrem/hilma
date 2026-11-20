import AppKit
import OlaKit
import SwiftUI

/// The two runtimes, both at once (OLA-143, meeting of 2026-11-18):
/// - **Cloud**, on the Ola machine: the agent and the files are on the machine; the phone follows.
/// - **Local**, on this Mac: the agent runs here in a folder Bart picks (the Claude Code
///   arrangement); only the model requests go to the machine. Its server runs whenever it is set up
///   (a folder, and a way to the model), so its sessions are listed and the phone can reach it.
/// Which one a session is in is chosen in New Session (`startSession`); the session list shows both
/// (`store` is the runtime on screen, `peer` the other one), and opening a session of the other
/// runtime brings that runtime on screen (`show`). `LocalSettings.shown` says which is on screen; what a
/// session may do (the fallbacks) follows that session's own runtime, never what is on screen.
@MainActor
@Observable
final class WhereOlaWorks {
  /// The runtime on screen: the conversation, the files, the commands.
  let store: OlaStore
  /// The other runtime: its session list, its approvals and finishes, live.
  let peer: OlaStore
  /// Signed in, "On this Mac" reaches the model through the account's door.
  let account: AccountController?
  private(set) var local: LocalServer?
  /// The local runtime's server, while it runs.
  private(set) var localConfig: ServerConfig?
  var problem: String?
  var starting = false
  /// While opencode is being fetched on a Mac that has none: how far (nil before the first byte).
  private(set) var installing = false
  private(set) var installFraction: Double?
  private(set) var installProblem: String?

  init(store: OlaStore, peer: OlaStore? = nil, account: AccountController? = nil) {
    self.store = store
    self.peer = peer ?? OlaStore(config: nil)
    self.account = account
  }

  /// The runtime on screen.
  var shown: Runtime { LocalSettings.shown }

  /// The store that holds a runtime's sessions now.
  func store(_ r: Runtime) -> OlaStore { r == shown ? store : peer }

  /// The store on a server, if either is (the relay's session yes, `PhoneLink`).
  func store(on c: ServerConfig?) -> OlaStore? {
    guard let c else { return nil }
    return store.config == c ? store : peer.config == c ? peer : nil
  }

  /// The cloud (OLA-150): the signed-in person's project on app.ola.cx, the same sessions the
  /// website shows (`OlaCloud`). No address and no second password: the account's sign-in is all.
  var cloudConfig: ServerConfig? { Self.cloudOverride ?? (account?.signedIn == true ? accountCloud : nil) }
  /// The project's config: the remembered one at launch, then what the server says (`refreshCloud`).
  private(set) var accountCloud: ServerConfig? = AccountKeeper.signedIn ? OlaCloud.saved() : nil
  /// The person's projects as the server last listed them (a picker in Settings when more than one).
  private(set) var cloudProjects: [CloudProject] = []
  /// Why the cloud has nothing to show (no project yet), or nil.
  private(set) var cloudProblem: String?
  /// A self-test's stand-in for the cloud (never set by the app).
  nonisolated(unsafe) static var cloudOverride: ServerConfig?

  /// Asks the server for the person's projects and attaches the chosen one (at launch, after a
  /// sign-in, Connect Again). Quiet when it does not answer: the remembered project stays.
  func refreshCloud() async {
    guard account?.signedIn == true, let s = AccountKeeper.session else {
      accountCloud = nil
      cloudProjects = []
      return
    }
    do {
      let (c, list) = try await OlaCloud.resolve(s)
      cloudProjects = list
      cloudProblem = c == nil ? OlaCloud.noProject : nil
      accountCloud = c
    } catch {
      return
    }
    attachBoth()
  }

  /// Settings' project picker: the cloud shows that project's sessions from now on.
  func chooseProject(_ slug: String) {
    guard let s = AccountKeeper.session, cloudProjects.contains(where: { $0.slug == slug }) else { return }
    OlaCloud.chosen = slug
    accountCloud = OlaCloud.config(token: s.token, project: slug)
    attachBoth()
  }

  /// Whether a runtime can start a session now, and if not, what New Session says.
  func readiness(_ r: Runtime) -> (ready: Bool, why: String?) {
    switch r {
    case .cloud:
      if cloudConfig != nil { return (true, nil) }
      if account?.signedIn == true { return (false, cloudProblem ?? "Connecting\u{2026}") }
      return (false, "Sign in to Ola first.")
    case .local:
      if LocalSettings.folder == nil { return (false, "Choose the folder Ola works in first.") }
      if account?.signedIn != true, (LocalSettings.tokenOverride ?? (LocalSettings.defaults.bool(forKey: LocalSettings.tokenSavedKey) ? "saved" : nil)) == nil {
        return (false, "Sign in to Ola first.")
      }
      if installProblem != nil || (problem != nil && localConfig == nil && !starting) { return (false, problem ?? installProblem) }
      return (true, nil)
    }
  }

  /// Brings a runtime on screen (both stores keep their servers: a swap, no restart), and opens one
  /// of its sessions, or a new one.
  func show(_ r: Runtime, select id: String? = nil) {
    if r != shown {
      LocalSettings.shown = r
      let front = store.config, back = peer.config
      store.attach(back, orSaved: false)
      peer.attach(front, orSaved: false)
      configureClaude()
    }
    if let id { store.selectedID = id } else { store.newSession() }
  }

  /// New Session's choice: the runtime remembered as the next default, then a new session there.
  func startSession(in r: Runtime) {
    RuntimeChoice.remember(r, LocalSettings.defaults)
    show(r)
  }

  /// The last runtime chosen in New Session, else the one on screen.
  var defaultRuntime: Runtime { RuntimeChoice.last(LocalSettings.defaults) ?? shown }

  /// The folder and token the running local server was started with.
  private var localKey: String?
  /// How the local agent reaches the model (for asking the gateway about the hosted open model).
  private(set) var route: ModelRoute?
  /// The hosted open model, as the gateway answers for this Mac's caller.
  var hostedStatus = HostedStatus(unavailable: "Checking with Ola\u{2026}")
  /// Each apply gets a number; only the newest may attach a server (2026-11-16: two applies at
  /// once started two servers, the second ended the first as an orphan, and the store kept the
  /// dead one's address).
  private var generation = 0

  /// At launch and after every change of the setup. Safe to call any number of times, at once.
  /// The cloud runtime is attached at once; the local runtime's server is started when it is set
  /// up (it keeps running while the cloud is on screen) and stopped when it no longer is.
  func apply() async {
    defer { configureClaude() }
    generation += 1
    let mine = generation
    problem = nil
    attachBoth()
    await refreshCloud()
    guard let folder = LocalSettings.folder else {
      stopLocal()
      if shown == .local { problem = "Choose the folder Ola should work in." }
      return
    }
    if let p = Self.touch(folder) { problem = p; stopLocal(); return }
    let route: ModelRoute
    if let account, account.signedIn {
      do { route = try await account.route() } catch {
        problem = "Ola couldn\u{2019}t open its way to the model on this Mac. Try again."
        return
      }
    } else if let token = LocalSettings.token, !token.isEmpty {
      // The pasted-token path: the owner's own setup, kept.
      route = .pasted(token: token, modelURL: LocalSettings.modelURLOverride ?? LocalServer.defaultModelURL)
    } else {
      stopLocal()
      if shown == .local { problem = account == nil ? "Add the model token (on the machine: ola-bart.sh model-token)." : "Sign in to Ola (Settings, Account) to work on this Mac." }
      return
    }
    guard await ensureOpencode(), mine == generation else { return }
    let key = "\(folder.path)\n\(route.token)\n\(route.baseURL)"
    // Already running for this folder and token: only the stores to attach.
    if let local, local.isRunning, localKey == key, localConfig != nil { attachBoth(); return }
    starting = true
    defer { if mine == generation { starting = false } }
    stopLocal()
    let server = LocalServer(folder: folder)
    do {
      let config = try await server.start(route: route, timeout: 45)
      guard mine == generation else {
        // A newer apply took over while this one started: this server is not wanted.
        server.stop()
        return
      }
      local = server
      localKey = key
      localConfig = config
      self.route = route
      attachBoth()
      Task { await refreshHosted() }
    } catch {
      guard mine == generation else { return }
      problem = error.localizedDescription
      if shown == .local { store.problem = Problem(text: "The agent on this Mac did not start. Settings has the details and Try again.", detail: error.localizedDescription) }
    }
  }

  /// The runtime on screen to `store`, the other to `peer`; a store already there is left alone.
  func attachBoth() {
    let cloud = cloudConfig
    let (front, back) = shown == .local ? (localConfig, cloud) : (cloud, localConfig)
    if store.config != front { store.attach(front, orSaved: false) }
    if peer.config != back { peer.attach(back, orSaved: false) }
  }

  private func stopLocal() {
    local?.stop()
    local = nil
    localKey = nil
    if localConfig != nil {
      localConfig = nil
      attachBoth()
    }
  }

  /// opencode is fetched the first time "On this Mac" needs it (a second Mac needs nothing else).
  /// Returns whether it is there now.
  func ensureOpencode() async -> Bool {
    if LocalServer.binary != nil { return true }
    guard !installing else { return false }
    installing = true
    installFraction = nil
    installProblem = nil
    defer { installing = false }
    do {
      try await OpencodeInstall.install { f in Task { @MainActor [weak self] in if self?.installing == true { self?.installFraction = f } } }
      return true
    } catch {
      installProblem = (error as? LocalizedError)?.errorDescription ?? "Ola couldn\u{2019}t set itself up on this Mac. Try again."
      problem = installProblem
      return false
    }
  }

  /// The folder Ola works in, from an open panel (the first-run screen and Settings).
  func chooseFolder() {
    let panel = NSOpenPanel()
    panel.canChooseDirectories = true
    panel.canChooseFiles = false
    panel.canCreateDirectories = true
    panel.prompt = "Work Here"
    guard panel.runModal() == .OK, let url = panel.url else { return }
    LocalSettings.defaults.set(url.path, forKey: LocalSettings.folderKey)
    // The app reads the folder now, so a macOS question about it comes while Bart is looking.
    if let p = Self.touch(url) {
      problem = p
      return
    }
    Task { await apply() }
  }

  /// Stops the local agent and starts it again.
  func restart() async {
    local?.stop()
    local = nil
    localKey = nil
    await apply()
  }

  /// For Settings: "Agent on this Mac: running", never an address.
  var localState: String {
    if starting { return "Starting" }
    if let local, local.isRunning, localConfig != nil { return store(.local).connection == .open ? "Running" : "Running, connecting" }
    return problem == nil ? "Not running" : "Did not start"
  }

  /// Right after the folder is picked, the app itself reads it, so that if macOS asks whether Ola
  /// may use that folder (Documents, Desktop, iCloud Drive), it asks now, while Bart is looking,
  /// not later in the background where the agent would wait on it.
  static func touch(_ folder: URL) -> String? {
    do {
      _ = try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
      return nil
    } catch {
      return "Ola cannot read \((folder.path as NSString).abbreviatingWithTildeInPath). Allow it in System Settings, Privacy and Security, Files and Folders, then Try again."
    }
  }

  func stop() {
    local?.stop()
    account?.stop()
  }
}

// MARK: Settings, the pieces

/// Two looks were drawn for Settings (see apple/README.md): `native`, the system's grouped form with
/// Ola's marks and status colors; `paper`, the same rows laid on Ola's paper in its own type.
enum SettingsLook { case native, paper }
private struct SettingsLookKey: EnvironmentKey { static let defaultValue = SettingsLook.native }
extension EnvironmentValues {
  var settingsLook: SettingsLook {
    get { self[SettingsLookKey.self] }
    set { self[SettingsLookKey.self] = newValue }
  }
}

/// A line of explanation under a setting: secondary, 11 points, wraps, never truncates.
struct SettingNote: View {
  var text: String
  init(_ text: String) { self.text = text }
  @Environment(\.settingsLook) private var look
  var body: some View {
    Text(text).font(look == .paper ? OlaFont.sans(Metrics.meta) : .system(size: 11)).foregroundStyle(.secondary)
      .fixedSize(horizontal: false, vertical: true)
  }
}

/// Status shown as status: a dot in the signal's color and the words in the text color.
struct StatusLine: View {
  enum Kind { case ok, busy, problem, off }
  var kind: Kind
  var text: String
  @Environment(\.settingsLook) private var look
  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 6) {
      Group {
        if kind == .busy { ProgressView().controlSize(.mini) }
        else { Circle().fill(color).frame(width: 7, height: 7) }
      }
      .frame(width: 12).alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 4 }
      Text(text).foregroundStyle(kind == .off ? .secondary : .primary).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
    }
  }
  var color: Color {
    switch kind {
    case .ok: Ola.leaf
    case .busy: Ola.lamp
    case .problem: Ola.vermilion
    case .off: Color.secondary.opacity(0.5)
    }
  }
}

/// One choice of a setting: a radio, a short label, a line of explanation under it, and a small
/// drawing of where that is. The whole row is the target.
struct ChoiceRow<Mark: View>: View {
  var title: String
  var detail: String
  var selected: Bool
  var mark: Mark
  var choose: () -> Void
  @Environment(\.settingsLook) private var look
  @State private var over = false

  init(_ title: String, detail: String, selected: Bool, @ViewBuilder mark: () -> Mark, choose: @escaping () -> Void) {
    self.title = title; self.detail = detail; self.selected = selected; self.mark = mark(); self.choose = choose
  }

  var body: some View {
    Button(action: choose) {
      HStack(alignment: .top, spacing: 10) {
        Radio(on: selected).padding(.top, 1)
        VStack(alignment: .leading, spacing: 2) {
          Text(title).font(look == .paper ? OlaFont.sans(Metrics.ui, .medium) : .system(size: 13))
          SettingNote(detail)
        }
        Spacer(minLength: Space.s)
        mark.frame(width: 32, height: 22)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(selected ? [.isSelected] : [])
  }
}

/// A radio button drawn as the system draws one, in Ola's blue.
struct Radio: View {
  var on: Bool
  var body: some View {
    ZStack {
      Circle().fill(on ? Ola.action : Color(nsColor: .controlBackgroundColor))
      Circle().strokeBorder(on ? Color.clear : Color(nsColor: .separatorColor), lineWidth: 1)
      if on { Circle().fill(Ola.onAction).frame(width: 5, height: 5) }
    }
    .frame(width: 14, height: 14)
    .shadow(color: .black.opacity(on ? 0 : 0.08), radius: 0.5, y: 0.5)
  }
}

/// This Mac, drawn like the machine's DeskMark: a small screen on a foot.
struct MacMark: View {
  var body: some View {
    // A screen of paper with its one light, on a short foot: the same hand as the DeskMark.
    VStack(spacing: 0) {
      ZStack(alignment: .bottomLeading) {
        RoundedRectangle(cornerRadius: 2.5).fill(Ola.field).frame(width: 24, height: 16)
          .overlay(RoundedRectangle(cornerRadius: 2.5).strokeBorder(Ola.ruleStrong, lineWidth: 0.5))
        Circle().fill(Ola.leaf).frame(width: 3.5, height: 3.5).padding(4)
      }
      Rectangle().fill(Ola.ink3).frame(width: 6, height: 3)
    }
  }
}

/// A section of Settings in either look. Native: the grouped form's own Section. Paper: a
/// heading and its rows on paper, with hairlines between rows.
struct SettingsGroup<Content: View>: View {
  var title: String
  @ViewBuilder var content: Content
  @Environment(\.settingsLook) private var look
  var body: some View {
    switch look {
    case .native:
      Section { content } header: { Text(title) }
    case .paper:
      VStack(alignment: .leading, spacing: 0) {
        Text(title).font(OlaFont.sans(Metrics.ui, .semibold)).foregroundStyle(Ola.ink).padding(.bottom, Space.s)
        VStack(alignment: .leading, spacing: 0) {
          if #available(macOS 15, *) {
            Group(subviews: content) { rows in
              ForEach(Array(rows.enumerated()), id: \.offset) { i, row in
                row.padding(.vertical, 10).frame(maxWidth: .infinity, alignment: .leading)
                if i < rows.count - 1 { Rectangle().fill(Ola.rule).frame(height: 1) }
              }
            }
          } else {
            VStack(alignment: .leading, spacing: Space.m) { content }.padding(.vertical, Space.m)
          }
        }
        .padding(.horizontal, Space.m)
        .background(Ola.field, in: RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Ola.rule, lineWidth: 1))
      }
    }
  }
}

struct WhereSettings: View {
  var controller: WhereOlaWorks
  @AppStorage(LocalSettings.folderKey) private var folder = ""
  /// Screenshots pass this, so drawing Settings never reads the Keychain.
  var tokenKnown: Bool? = nil
  @State private var token = ""
  @State private var tokenSaved = false

  var shortFolder: String { (folder as NSString).abbreviatingWithTildeInPath }
  var signedIn: Bool { controller.account?.signedIn ?? false }

  /// Since OLA-143 Settings keeps only the setup: which runtime a session works in is chosen in New
  /// Session. This group is the local runtime's setup (its folder, the owner's pasted token, its
  /// agent); the cloud's is `MachineSetup`.
  var body: some View {
    SettingsGroup(title: "Local: on this Mac") {
      Group {
        LabeledContent("Folder") {
          HStack(spacing: Space.s) {
            Text(folder.isEmpty ? "None chosen" : shortFolder).foregroundStyle(folder.isEmpty ? .secondary : .primary)
              .lineLimit(1).truncationMode(.middle).help(folder.isEmpty ? "No folder chosen yet" : shortFolder)
            Button("Choose\u{2026}") { choose() }
          }
        }
        // The pasted-token row (the owner's own setup), only when not signed in.
        if !signedIn { LabeledContent {
          HStack(spacing: Space.s) {
            SecureField("Model token", text: $token, prompt: Text(tokenSaved ? "Saved in the Keychain" : "ola-bart.sh model-token")).labelsHidden()
              .textFieldStyle(.roundedBorder).frame(width: 200)
            Button("Save") {
              LocalSettings.saveToken(token.trimmingCharacters(in: .whitespacesAndNewlines))
              token = ""
              tokenSaved = true
              Task { await controller.apply() }
            }
            .disabled(token.isEmpty)
          }
        } label: {
          Text("Model token")
        } }
        VStack(alignment: .leading, spacing: 6) {
          if controller.starting {
            StatusLine(kind: .busy, text: "Starting the agent on this Mac. This can take up to 45 seconds.")
          } else if let p = controller.problem {
            StatusLine(kind: .problem, text: p)
            Button("Try Again") { Task { await controller.apply() } }.padding(.leading, 18)
          } else {
            HStack(alignment: .firstTextBaseline) {
              StatusLine(kind: agentKind, text: "Agent on this Mac: \(controller.localState)")
              Spacer(minLength: Space.s)
              Button("Restart the Agent") { Task { await controller.restart() } }.disabled(controller.starting)
            }
          }
          SettingNote("Sessions here stay on this Mac. Choose where each session works in New Session (\u{2318}N).")
        }
      }
      .onAppear(perform: loadTokenState)
    }
  }

  var agentKind: StatusLine.Kind {
    switch controller.localState {
    case "Running": .ok
    case "Starting", "Running, connecting": .busy
    case "Did not start": .problem
    default: .off
    }
  }

  /// Never reads the Keychain just to draw Settings: a flag says a token was saved.
  func loadTokenState() {
    tokenSaved = tokenKnown ?? (LocalSettings.defaults.bool(forKey: LocalSettings.tokenSavedKey) || (SecretStore.isKnown(.modelToken) && LocalSettings.token != nil))
  }

  func choose() { controller.chooseFolder() }
}

// MARK: Fallback to Claude

extension WhereOlaWorks {
  static let claudeKey = "ola.claude.enabled"

  /// Why Fallback to Claude cannot be used in a runtime, or nil. Each runtime has its own switches
  /// (OLA-220, Bart, 2026-11-18: settings "should always try to follow the runtime, not the
  /// product"); which runtime is on screen does not matter.
  func claudeUnavailable(_ r: Runtime) -> String? {
    switch r {
    case .cloud: return Self.notInCloud
    case .local: return LocalSettings.folder == nil ? Self.localNotSetUp : ClaudeRunner.unavailable()
    }
  }

  /// Why the hosted open model cannot be used in a runtime, or nil.
  func hostedUnavailable(_ r: Runtime) -> String? {
    switch r {
    case .cloud: return Self.notInCloud
    case .local: return LocalSettings.folder == nil ? Self.localNotSetUp : hostedStatus.unavailable
    }
  }

  static let notInCloud = "Not yet in cloud sessions from this Mac. Cloud sessions use Ola\u{2019}s own model."
  static let localNotSetUp = "Choose the folder Local works in first (Settings, General)."
  /// The key the local runtime's fallbacks are kept under while it has no folder.
  static let noFolder = "local"

  /// The folder a runtime's fallback settings belong to: the one Local works in, or the machine's.
  func fallbackFolder(_ r: Runtime) -> String {
    switch r {
    case .cloud: return FallbackSettings.machineFolder
    case .local: return LocalSettings.folder?.standardizedFileURL.path ?? Self.noFolder
    }
  }

  /// Asks the gateway, as this Mac's caller, whether the hosted open model is there for it (the
  /// local runtime's route, whichever runtime is on screen).
  func refreshHosted() async {
    guard let route else { return }
    hostedStatus = await HostedStatus.check(baseURL: route.baseURL, token: route.token)
    configureClaude()
  }

  /// Saves one runtime's fallbacks and tells both stores.
  func saveFallbacks(_ s: FallbackSettings, for r: Runtime) {
    FallbackSettings.save(s, for: fallbackFolder(r))
    configureClaude()
  }

  /// Tells each store about the fallbacks of its own runtime: whether each can run, whether it is on,
  /// and how (Claude Code here, in the session's folder; the hosted open model through the door).
  func configureClaude() {
    configure(store, as: shown)
    configure(peer, as: shown == .local ? .cloud : .local)
  }

  private func configure(_ s: OlaStore, as r: Runtime) {
    s.claudeTurnsBase = LocalServer.support
    let reason = claudeUnavailable(r)
    let f = FallbackSettings.load(fallbackFolder(r))
    s.fallbacks = f
    s.claudeUnavailable = reason
    s.claudeOn = reason == nil && f.claude
    s.hosted = HostedStatus(unavailable: hostedUnavailable(r), provider: hostedStatus.provider, usedUSD: hostedStatus.usedUSD, capUSD: hostedStatus.capUSD)
    s.hostedOn = f.hosted && s.hosted.unavailable == nil
    if (!s.claudeOn && s.nextEngine == .claude && !s.nextOnly) || (!s.hostedOn && s.nextEngine == .hosted && !s.nextOnly) { s.nextEngine = .ola }
    s.onFallbacksChanged = { [weak self] f in self?.saveFallbacks(f, for: r) }
    let gate = account?.hostedGate
    s.hostedArm = { on in gate?.set(on) }
    if r == .local, let folder = LocalSettings.folder { s.localFiles = { Stretch.localFiles(folder) } } else { s.localFiles = nil }
    guard reason == nil, let bin = ClaudeRunner.find() else { s.claudeLauncher = nil; return }
    let fallback = LocalSettings.folder
    s.claudeLauncher = { session, request, context in
      let folder = session.directory.map { URL(fileURLWithPath: $0) } ?? fallback ?? FileManager.default.homeDirectoryForCurrentUser
      return ClaudeRunner(binary: bin, folder: folder, request: request, context: context)
    }
  }
}
