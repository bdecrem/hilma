import OlaKit
import SwiftUI

extension PhoneMode {
  /// The phone's two places are the two runtimes (meeting of 2026-11-18): the Ola machine is the
  /// cloud, the Mac is local ("Local: through your Mac").
  var runtime: Runtime { self == .machine ? .cloud : .local }
  init(_ r: Runtime) { self = r == .cloud ? .machine : .mac }
  var other: PhoneMode { self == .machine ? .mac : .machine }
}

/// The phone's two runtimes (OlaKit/PhoneWhere.swift): through the Mac (local), or on the Ola
/// machine directly (cloud). `store` holds the runtime on screen, `peer` the other one, so the
/// session list shows both (OLA-143); a session or New Session in the other runtime brings it on
/// screen with no pairing or sign-in again once both are set up.
@MainActor
@Observable
final class PhoneWhereState {
  static let shared = PhoneWhereState()
  private(set) var mode: PhoneMode? = PhoneWhere.mode
  private(set) var signedInName: String? = AccountKeeper.name
  /// A runtime that is not set up yet, chosen: the sheet that sets it up.
  var setup: PhoneMode?
  var problem: String?
  /// The other runtime's store (the app sets it).
  var peer: OlaStore?
  /// New Session's chooser on screen.
  var chooserShown = false

  /// Screenshots: no network, nothing kept but the choice.
  var fixture: Bool { ProcessInfo.processInfo.arguments.contains("-OlaFixture") }
  var shownName: String { signedInName ?? (fixture ? "Bart" : "") }

  /// The store that holds a runtime's sessions now (nil when that runtime is not listed).
  func store(_ r: Runtime, _ store: OlaStore) -> OlaStore? {
    if store.runtime == r || (store.runtime == nil && mode?.runtime == r) { return store }
    if let peer, peer.runtime == r { return peer }
    return nil
  }

  /// The last runtime chosen in New Session, else the one on screen.
  var defaultRuntime: Runtime { RuntimeChoice.last(.standard) ?? mode?.runtime ?? .cloud }

  /// Settings or a session row: work in that place now.
  func choose(_ m: PhoneMode, store: OlaStore) {
    guard m != mode else { return }
    if fixture { set(m); return }
    guard PhoneWhere.ready(m) else { setup = m; return }
    use(m, store: store)
  }

  /// That place on screen in `store`, the other in `peer` (each attached only when it changes).
  func use(_ m: PhoneMode, store: OlaStore) {
    set(m)
    if fixture { return }
    let front = PhoneWhere.config(m)
    let back = PhoneWhere.ready(m.other) ? PhoneWhere.config(m.other) : nil
    if store.config != front { store.attach(front, orSaved: false) }
    if let peer, peer.config != back { peer.attach(back, orSaved: false) }
  }

  /// New Session's choice: remembered as the next default, that runtime on screen, a new session.
  func startSession(_ r: Runtime, store: OlaStore) {
    RuntimeChoice.remember(r, .standard)
    let m = PhoneMode(r)
    if m != mode || store.runtime != r { use(m, store: store) }
    store.newSession()
  }

  /// A session of the other runtime, from the list: that runtime on screen, then the session.
  func open(_ r: Runtime, id: String, store: OlaStore) {
    let m = PhoneMode(r)
    if m != mode || store.runtime != r { use(m, store: store) }
    store.selectedID = id
  }

  func set(_ m: PhoneMode?) {
    PhoneWhere.mode = m
    mode = PhoneWhere.mode
  }

  /// Paired with a Mac (the store connected and saved it): the phone now works through it.
  func paired() {
    set(.mac)
    setup = nil
    if let peer, PhoneWhere.signedIn, peer.config == nil { peer.attach(PhoneWhere.config(.machine), orSaved: false) }
  }

  func signIn(handle: String, password: String, store: OlaStore) async -> Bool {
    problem = nil
    do {
      _ = try await PhoneWhere.signIn(handle: handle, password: password)
      signedInName = AccountKeeper.name
      setup = nil
      use(.machine, store: store)
      // An admin's Ola sign-in also brings the Voice Chat tab (OLA-151).
      Task { await AdminState.shared.refresh() }
      return true
    } catch {
      problem = (error as? LocalizedError)?.errorDescription ?? PhoneWhere.words(error)
      return false
    }
  }

  /// Signs this phone out of the Ola machine. If it is paired with a Mac, it goes back to the Mac.
  func signOut(store: OlaStore) async {
    await PhoneWhere.signOut()
    signedInName = nil
    guard mode == .machine else { peer?.attach(nil, orSaved: false); return }
    if PhoneWhere.paired { use(.mac, store: store) } else {
      set(nil)
      store.attach(nil, orSaved: false)
    }
  }

  /// "Forget This Mac": the phone keeps the Ola machine if it is signed in there.
  func forgetMac(store: OlaStore) {
    Credentials.forget()
    if PhoneWhere.signedIn { use(.machine, store: store) } else {
      store.forget()
      set(nil)
    }
    if mode == .machine { peer?.attach(nil, orSaved: false) }
  }
}

extension PhoneMode: Identifiable { public var id: String { rawValue } }

/// "Lots of permissions" on the phone, one switch per runtime (OLA-142, meeting of 2026-11-18:
/// "settings follow the runtime, not the product"): the cloud's, kept on the Ola machine (its phone
/// door; the machine goes ahead by itself, Mac off), and the local runtime's, kept on the Mac
/// (through its relay). The phone never answers a step itself; under its runtime's Lots it only
/// keeps the card away while that runtime answers it (OlaStore.serverAnswers), and shows it should
/// the step still wait.
@MainActor
@Observable
final class PhonePermissions {
  static let shared = PhonePermissions()
  /// The last answer from each runtime, kept for the stores' check.
  nonisolated static func key(_ r: Runtime) -> String { "ola.phone.permissions.\(r.rawValue)" }
  nonisolated static func lots(_ r: Runtime) -> Bool { (UserDefaults.standard.string(forKey: key(r)) ?? PermissionMode.lots.rawValue) == PermissionMode.lots.rawValue }

  private(set) var modes: [Runtime: PermissionMode] = [.cloud: PhonePermissions.lots(.cloud) ? .lots : .ask, .local: PhonePermissions.lots(.local) ? .lots : .ask]
  var problem: [Runtime: String] = [:]

  func mode(_ r: Runtime) -> PermissionMode { modes[r] ?? .lots }

  /// A store asks at each step, by its own runtime's switch, so a change applies to the next one.
  static func wire(_ store: OlaStore) {
    store.goesAhead = { [weak store] action, resources in
      PhonePermissions.lots(store?.runtime ?? .cloud) && PermissionSettings.goesAhead(action: action, resources: resources)
    }
    store.serverAnswers = { true }
  }

  private func keep(_ m: PermissionMode, _ r: Runtime) {
    modes[r] = m
    UserDefaults.standard.set(m.rawValue, forKey: Self.key(r))
  }

  /// Where a runtime's switch is kept: the machine's door, or the Mac's relay (nil: not set up).
  func config(_ r: Runtime) -> ServerConfig? {
    let m = PhoneMode(r)
    return PhoneWhere.ready(m) ? PhoneWhere.config(m) : nil
  }

  /// Reads both switches (at launch, a switch, back in front, Settings). Quiet when one is away.
  func refresh() async {
    for r in Runtime.allCases {
      guard let c = config(r), let m = try? await MachinePermissions.get(c) else { continue }
      keep(m, r)
      problem[r] = nil
    }
  }

  func set(_ m: PermissionMode, _ r: Runtime) async {
    guard let c = config(r) else { return }
    let was = mode(r)
    modes[r] = m
    do {
      keep(try await MachinePermissions.set(m, c), r)
      problem[r] = nil
    } catch {
      modes[r] = was
      problem[r] = "That didn\u{2019}t reach \(r == .local ? "your Mac" : "the Ola machine"). Try again when it\u{2019}s connected."
    }
  }
}

struct PermissionsSection: View {
  @Bindable var store: OlaStore
  @Bindable private var perms = PhonePermissions.shared
  @Bindable private var place = PhoneWhereState.shared
  var body: some View {
    Section {
      ForEach(Runtime.allCases) { r in
        let ready = place.fixture || PhoneWhere.ready(PhoneMode(r))
        VStack(alignment: .leading, spacing: 4) {
          Toggle(isOn: Binding(get: { perms.mode(r) == .lots }, set: { on in
            Task { await perms.set(on ? .lots : .ask, r) }
          })) {
            Text(r == .cloud ? "In the cloud" : "Through your Mac")
          }
          .disabled(!ready)
          Text(!ready ? (r == .cloud ? "Sign in to the Ola machine first." : "Pair with your Mac first.") : perms.mode(r) == .lots ? "Ola goes ahead without asking." : "Ola asks before each step.")
            .font(.footnote).foregroundStyle(Ola.ink2)
          if let p = perms.problem[r] { Text(p).font(.footnote).foregroundStyle(Ola.vermilionText) }
        }
      }
    } header: { Text("Lots of permissions") } footer: {
      Text("One switch for each place Ola works, the same in every app there. Under it Ola runs commands, changes files, searches the web and downloads without asking, and never works outside its folder.")
    }
    .task(id: store.config?.url) { if !place.fixture { await perms.refresh() } }
  }
}

extension OlaStore {
  /// On the Ola machine directly (not through the Mac).
  var onMachine: Bool { config?.account == true || (config == nil && PhoneWhereState.shared.mode == .machine) || (ProcessInfo.processInfo.arguments.contains("-OlaFixture") && PhoneWhereState.shared.mode == .machine) }
}

// MARK: the first screen

/// Nothing set up yet: pair with the Mac, or sign in to the Ola machine.
struct PhoneStart: View {
  var store: OlaStore
  @Bindable private var place = PhoneWhereState.shared
  @State private var picked: PhoneMode?
  @State private var started = false

  var body: some View {
    Group {
      switch picked {
      case .mac?:
        PairScreen(store: store, other: { picked = .machine })
      case .machine?:
        MachineSignIn(store: store, other: { picked = .mac })
      case nil:
        choice
      }
    }
    .onAppear {
      guard !started else { return }
      started = true
      picked = place.mode
    }
  }

  var choice: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        Image("Mark").resizable().frame(width: 48, height: 48).clipShape(RoundedRectangle(cornerRadius: 11))
        Text("Ola").font(OlaFont.sans(26, .display)).foregroundStyle(Ola.ink)
        Text("Choose where Ola works for this phone. You can change it later in Settings.")
          .font(OlaFont.serif(Metrics.reading)).foregroundStyle(Ola.ink2).fixedSize(horizontal: false, vertical: true)
        StartChoice(title: "Pair with your Mac", detail: "Your phone shows what Ola on your Mac is doing, including work on the Mac itself.", symbol: "laptopcomputer") { picked = .mac }
        StartChoice(title: "Sign in to the Ola machine", detail: "Your phone works with the Ola machine directly, even when your Mac is off.", symbol: "server.rack") { picked = .machine }
      }
      .padding(24)
    }
    .background(Ola.paper)
  }
}

struct StartChoice: View {
  var title: String
  var detail: String
  var symbol: String
  var go: () -> Void
  var body: some View {
    Button(action: go) {
      HStack(alignment: .top, spacing: 14) {
        Image(systemName: symbol).font(.system(size: 20)).foregroundStyle(Ola.blue).frame(width: 28).padding(.top, 2)
        VStack(alignment: .leading, spacing: 4) {
          Text(title).font(OlaFont.sans(Metrics.ui + 2, .semibold)).foregroundStyle(Ola.ink)
          Text(detail).font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink2).fixedSize(horizontal: false, vertical: true).multilineTextAlignment(.leading)
        }
        Spacer(minLength: 0)
        Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Ola.ink3).padding(.top, 4)
      }
      .padding(16)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Ola.field, in: RoundedRectangle(cornerRadius: 12))
      .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Ola.rule, lineWidth: 1))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}

// MARK: signing in to the Ola machine

/// A name and password, straight in the app (the Mac's way): this phone gets its own key, listed
/// under Your devices. No passkey step.
struct MachineSignIn: View {
  var store: OlaStore
  /// "Pair with your Mac instead", on the first screen.
  var other: (() -> Void)? = nil
  var onDone: () -> Void = {}
  /// Why the sign-in is asked for again (signed out by the server), or nil.
  var reason: String? = nil
  @Bindable private var place = PhoneWhereState.shared
  @State private var name = ""
  @State private var password = ""
  @State private var busy = false
  @FocusState private var field: Int?
  private let tailscaleOn = PhoneWhere.tailscaleOn

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        Image("Mark").resizable().frame(width: 48, height: 48).clipShape(RoundedRectangle(cornerRadius: 11))
        Text("Sign in to the Ola machine").font(OlaFont.sans(26, .display)).foregroundStyle(Ola.ink).fixedSize(horizontal: false, vertical: true)
        Text(reason ?? "Your phone works with Ola on the Ola machine directly, even when your Mac is off. Use your Ola name and password.")
          .font(OlaFont.serif(Metrics.reading)).foregroundStyle(Ola.ink2).fixedSize(horizontal: false, vertical: true)
        if !tailscaleOn && !place.fixture {
          Label("Turn on Tailscale on this phone.", systemImage: "exclamationmark.circle")
            .font(OlaFont.sans(Metrics.ui, .medium)).foregroundStyle(Ola.ink).fixedSize(horizontal: false, vertical: true)
        }
        VStack(spacing: 10) {
          TextField("Name", text: $name).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled()
            .font(OlaFont.sans(Metrics.ui + 1)).field().focused($field, equals: 0).submitLabel(.next).onSubmit { field = 1 }
          SecureField("Password", text: $password).textContentType(.password)
            .font(OlaFont.sans(Metrics.ui + 1)).field().focused($field, equals: 1).submitLabel(.go).onSubmit(go)
        }
        HStack {
          if busy { ProgressView() }
          Spacer()
          Button("Sign In", action: go).buttonStyle(OlaButton(kind: ready ? .primary : .ghost)).disabled(!ready || busy)
        }
        if let p = place.problem { Text(p).font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.vermilionText).fixedSize(horizontal: false, vertical: true) }
        if let other {
          Button("Pair with your Mac instead", action: other).font(OlaFont.sans(Metrics.ui, .medium)).foregroundStyle(Ola.blue).padding(.top, 8)
        }
      }
      .padding(24)
    }
    .background(Ola.paper)
    .scrollDismissesKeyboard(.interactively)
    .onAppear { place.problem = nil }
  }

  var ready: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty && !password.isEmpty }

  func go() {
    guard ready, !busy else { return }
    busy = true
    Task {
      let ok = await place.signIn(handle: name, password: password, store: store)
      busy = false
      password = ""
      if ok { onDone() }
    }
  }
}

/// New Session (OLA-143, meeting of 2026-11-18): Bart, "there will be a new session button in the
/// iPhone app and in the Mac app, and there'll be a nice UI where you get to pick if it's in the
/// cloud or if it's in the local runtime. For the iPhone, local means the Mac runtime." A sheet with
/// the system's own grouped list: the two runtimes, one line each, the last choice ticked; one tap
/// starts the session. A runtime not set up yet says so, and a tap sets it up.
struct PhoneNewSessionSheet: View {
  var store: OlaStore
  /// After the choice: the new session's screen.
  var started: () -> Void
  @Bindable private var place = PhoneWhereState.shared
  @Environment(\.dismiss) private var dismiss
  @State private var setup: PhoneMode?

  var body: some View {
    NavigationStack {
      List {
        Section {
          ForEach(Runtime.allCases) { r in row(r) }
        } header: {
          Text("Where should Ola work?").textCase(nil)
        }
      }
      .listStyle(.insetGrouped)
      .navigationTitle("New Session")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
      .sheet(item: $setup) { m in WhereSetupSheet(mode: m, store: store) }
    }
    .presentationDetents([.height(300), .medium])
    .tint(Ola.blue)
  }

  func ready(_ r: Runtime) -> Bool { place.fixture ? !ProcessInfo.processInfo.arguments.contains("-OlaNotPaired") || r == .cloud : PhoneWhere.ready(PhoneMode(r)) }

  func row(_ r: Runtime) -> some View {
    let ok = ready(r)
    return Button {
      guard ok else { setup = PhoneMode(r); return }
      place.startSession(r, store: store)
      dismiss()
      started()
    } label: {
      HStack(spacing: 14) {
        Image(systemName: r.symbol).font(.title3).foregroundStyle(ok ? Ola.blue : Ola.ink3).frame(width: 30)
        VStack(alignment: .leading, spacing: 2) {
          Text("\(r.name): \(r.place(phone: true))").foregroundStyle(ok ? Ola.ink : Ola.ink2)
          Text(ok ? r.detail(phone: true) : r == .cloud ? "Not set up yet. Tap to sign in to the Ola machine." : "Not set up yet. Tap to pair with your Mac.")
            .font(.footnote).foregroundStyle(Ola.ink2).fixedSize(horizontal: false, vertical: true)
        }
        Spacer(minLength: 8)
        if ok, r == place.defaultRuntime { Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(Ola.blue) }
      }
      .padding(.vertical, 4)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(r == place.defaultRuntime ? [.isSelected] : [])
  }
}

/// The sheet for a switch to a place that is not set up yet.
struct WhereSetupSheet: View {
  var mode: PhoneMode
  var store: OlaStore
  @Environment(\.dismiss) private var dismiss
  var body: some View {
    NavigationStack {
      Group {
        switch mode {
        case .mac: PairScreen(store: store) { dismiss() }
        case .machine: MachineSignIn(store: store) { dismiss() }
        }
      }
      .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
    }
  }
}
