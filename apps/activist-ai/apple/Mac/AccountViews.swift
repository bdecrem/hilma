import AppKit
import OlaKit
import SwiftUI

/// Signing this Mac in to an Ola account, and what the app shows around it. Everything happens in
/// the app's own window (2026-11-17, "normal means you'd never leave the app"): a name and password,
/// the system's passkey sheet when the account asks for its passkey too, and right after the first
/// sign-in a skippable "Add a passkey?". The app holds the key in the Keychain and lends the agent
/// only the model door's key for this launch.
@MainActor
@Observable
final class AccountController {
  enum Phase: Equatable {
    case idle
    /// A name and password on their way to Ola.
    case working
    /// The system's passkey sheet is up (signing in).
    case passkey
    /// Just signed in, the account has no passkey: "Add a passkey?" (skippable).
    case offerPasskey
    /// The system's passkey sheet is up (making a new passkey).
    case addingPasskey
    /// The last try did not work (in plain words).
    case problem(String)
    /// Nothing went wrong, but it could not finish (sign-in not open yet).
    case notice(String)
    /// The server said this Mac's sign-in is over.
    case expired
  }

  private(set) var phase: Phase = .idle
  private(set) var name: String? = AccountKeeper.name
  private(set) var signedIn = AccountKeeper.signedIn
  private(set) var usage: String?
  /// Whether this build can show the passkey sheet (NativePasskey.available; screenshots set it).
  let passkeys: Bool
  /// A problem on the "Add a passkey?" step (it stays on that step).
  private(set) var passkeyProblem: String?
  /// Set after a sign-in on a Mac that was never set up, so it goes straight to "On this Mac".
  var onSignedIn: (() -> Void)?
  /// Called when the server ends this Mac's sign-in (a 401 from the door).
  var onSignedOut: (() -> Void)?
  private var task: Task<Void, Never>?
  private var door: ModelDoor?
  let api = AccountAPI()

  /// Screenshots: a still picture with no Keychain and no network.
  init(preview phase: Phase = .idle, name: String? = nil, passkeys: Bool = true, passkeyProblem: String? = nil) {
    self.phase = phase
    self.name = name
    self.passkeys = passkeys
    self.passkeyProblem = passkeyProblem
    signedIn = name != nil
    if [.offerPasskey, .addingPasskey].contains(phase) { fromGate = true }
  }
  var previewUsage: String? {
    get { usage }
    set { usage = newValue }
  }

  init() { passkeys = NativePasskey.available }

  // MARK: signing in

  /// The sign-in was started from the window's own sign-in screen (it stays on that screen).
  private(set) var fromGate = false
  /// Settings asked for the sign-in screen on a Mac that already works another way (the owner's).
  var wantsGate = false
  /// The window stays on the sign-in screen for the passkey steps.
  var inPasskeyStep: Bool { [.passkey, .offerPasskey, .addingPasskey].contains(phase) }

  /// "Not now" on "Add a passkey?" is remembered per name, so it is asked once.
  static let declinedKey = "ola.account.passkeyDeclined"

  /// The normal sign-in (2026-11-17): a name and password, straight from the app. A person who asks
  /// for their passkey too gets the system's passkey sheet next, in this window.
  func signIn(handle: String, password: String) {
    task?.cancel()
    fromGate = true
    passkeyProblem = nil
    phase = .working
    let h = handle.trimmingCharacters(in: .whitespacesAndNewlines)
    task = Task {
      do {
        let session = try await api.login(handle: h, password: password, deviceName: AccountAPI.thisMacName, kind: "mac", known: AccountKeeper.known)
        guard phase == .working else { return }
        finish(session)
      } catch let need as PasskeyNeeded {
        guard phase == .working else { return }
        await answer(need.ceremony)
      } catch {
        guard phase == .working else { return }
        fail(error)
      }
    }
  }

  /// "Sign in with a passkey": the passkey alone, no name or password.
  func signInWithPasskey() {
    task?.cancel()
    fromGate = true
    phase = .working
    task = Task {
      do {
        let c = try await api.passkeyCeremony(deviceName: AccountAPI.thisMacName, kind: "mac")
        await answer(c)
      } catch { fail(error) }
    }
  }

  /// The system's passkey sheet answers a ceremony; the server gives this Mac its key.
  private func answer(_ c: PasskeyCeremony) async {
    guard passkeys else { phase = .problem(AccountError.passkeysNotInThisVersion.errorDescription!); return }
    phase = .passkey
    do {
      let a = try await NativePasskey.assert(c)
      guard phase == .passkey else { return }
      finish(try await api.loginPasskey(c, a))
    } catch {
      guard phase == .passkey else { return }
      fail(error)
    }
  }

  private func finish(_ session: AccountSession) {
    guard AccountKeeper.keep(session) else { phase = .problem("This Mac\u{2019}s Keychain didn\u{2019}t take the sign-in. Try again."); return }
    name = session.person.name
    signedIn = true
    let declined = AccountKeeper.defaults.stringArray(forKey: Self.declinedKey) ?? []
    // Right after the first sign-in, if the account has no passkey and the person has not said Not now.
    phase = session.hasPasskey == false && !declined.contains(session.person.handle) ? .offerPasskey : .idle
    if phase == .idle { wantsGate = false }
    onSignedIn?()
    refreshUsage()
  }

  private func fail(_ error: Error) {
    if (error as? AccountError) == .cancelled { phase = .idle; return }
    let words = (error as? LocalizedError)?.errorDescription ?? "That didn\u{2019}t work. Try again."
    phase = (error as? AccountError) == .notAvailableYet ? .notice(words) : .problem(words)
  }

  // MARK: "Add a passkey?"

  /// Add: the system's sheet makes a passkey for app.ola.cx, saved on the account with this Mac's key.
  func addPasskey() {
    guard passkeys, let s = AccountKeeper.session else { return }
    passkeyProblem = nil
    phase = .addingPasskey
    task = Task {
      do {
        let reg = try await api.addPasskeyOptions(s)
        let cred = try await NativePasskey.register(reg)
        try await api.addPasskeyVerify(s, reg, cred)
        guard phase == .addingPasskey else { return }
        closePasskeyStep()
      } catch {
        guard phase == .addingPasskey else { return }
        phase = .offerPasskey
        if (error as? AccountError) != .cancelled { passkeyProblem = (error as? LocalizedError)?.errorDescription ?? "The passkey wasn\u{2019}t added. Try again." }
      }
    }
  }

  /// Not now (or Continue when this build cannot add one): asked once per name.
  func skipPasskey() {
    if passkeys, let h = AccountKeeper.defaults.string(forKey: AccountKeeper.handleKey) {
      var declined = AccountKeeper.defaults.stringArray(forKey: Self.declinedKey) ?? []
      if !declined.contains(h) { declined.append(h) }
      AccountKeeper.defaults.set(declined, forKey: Self.declinedKey)
    }
    closePasskeyStep()
  }

  private func closePasskeyStep() {
    task?.cancel()
    passkeyProblem = nil
    wantsGate = false
    phase = .idle
  }

  func cancel() {
    task?.cancel()
    task = nil
    phase = .idle
  }

  /// Leaves the sign-in screen Settings opened (the Mac keeps working the way it did).
  func closeGate() {
    cancel()
    wantsGate = false
    fromGate = false
  }

  func signOut() async {
    if let s = AccountKeeper.session { try? await api.signOut(s) }
    forgetHere()
    phase = .idle
  }

  /// The server ended this Mac's sign-in: forget it and say so.
  func signedOutByServer() {
    guard signedIn else { return }
    forgetHere()
    phase = .expired
    onSignedOut?()
  }

  private func forgetHere() {
    AccountKeeper.forget()
    door?.stop()
    door = nil
    signedIn = false
    name = nil
    usage = nil
  }

  /// "You've used 42% of this week's share", when the server says.
  func refreshUsage() {
    Task {
      guard let s = AccountKeeper.session else { return }
      do { usage = try await api.usage(s) } catch AccountError.signedOut { signedOutByServer() } catch {}
    }
  }

  // MARK: the model door

  /// The door for this launch, started on first use. The account token is read from the Keychain
  /// only when the first request goes through it.
  func route() async throws -> ModelRoute {
    if door == nil {
      let d = ModelDoor(api: api) { AccountKeeper.session?.token }
      d.onSignedOut = { Task { @MainActor [weak self] in self?.signedOutByServer() } }
      door = d
    }
    try await door!.start()
    return .door(door!)
  }

  func stop() { door?.stop() }
}

// MARK: the screens before the window

/// What the window shows before the conversation: sign in, choose a folder, or get ready. Each is
/// one sheet of paper on the room, one thing to do.
struct GateSheet<Content: View>: View {
  @ViewBuilder var content: Content
  var body: some View {
    ZStack {
      Ola.room.ignoresSafeArea()
      VStack(alignment: .leading, spacing: Space.l) { content }
        .padding(Space.xxl)
        .frame(width: 440, alignment: .leading)
        .background(Ola.paper, in: RoundedRectangle(cornerRadius: Sheet.radius))
        .overlay(RoundedRectangle(cornerRadius: Sheet.radius).strokeBorder(Ola.roomRule, lineWidth: 1))
        .shadow(color: .black.opacity(0.06), radius: 2, y: 1)
    }
  }
}

struct GateTitle: View {
  var title: String
  var body: some View {
    VStack(alignment: .leading, spacing: Space.l) {
      Image("Mark").resizable().frame(width: 40, height: 40).clipShape(RoundedRectangle(cornerRadius: 9))
      Text(title).font(OlaFont.sans(Metrics.title, .display)).foregroundStyle(Ola.ink).fixedSize(horizontal: false, vertical: true)
    }
  }
}

struct GateText: View {
  var text: String
  init(_ text: String) { self.text = text }
  var body: some View {
    Text(text).font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink2).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
  }
}

/// The first screen on a Mac with nothing set up: sign in with your Ola name and password (what
/// everyone uses), or, for the owner, his own setup (the Ola machine directly). After a right password
/// for an account that asks for its passkey too, the system's passkey sheet finishes it, here.
struct SignInScreen: View {
  var account: AccountController
  /// The owner's way: the Ola machine directly (its address and password, as before sign-in existed).
  var useOwnSetup: (() -> Void)?
  @State private var handle = AccountKeeper.defaults.string(forKey: "ola.account.lastHandle") ?? ""
  @State private var password = ""
  @FocusState private var focus: Field?
  enum Field { case handle, password }

  var body: some View {
    GateSheet {
      switch account.phase {
      case .passkey, .addingPasskey:
        GateTitle(title: account.phase == .passkey ? "Use your passkey" : "Add a passkey")
        GateText(account.phase == .passkey
          ? "Your account asks for your passkey too. Use Touch ID in the window that opened to finish signing in."
          : "Use Touch ID in the window that opened. The passkey is saved in your iCloud Keychain.")
        HStack(spacing: Space.s) {
          ProgressView().controlSize(.small)
          Text("Waiting for your passkey\u{2026}").font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink3)
          Spacer()
          Button("Cancel") { account.phase == .passkey ? account.cancel() : account.skipPasskey() }.buttonStyle(OlaButton(kind: .ghost))
        }
        .padding(.top, Space.xs)
      case .offerPasskey:
        GateTitle(title: "Add a passkey?")
        GateText(account.passkeys
          ? "Next time, sign in with Touch ID instead of typing your password."
          : "Next time, sign in with Touch ID instead of typing your password. Adding a passkey in the app arrives with the next update.")
        if let p = account.passkeyProblem {
          Label(p, systemImage: "exclamationmark.circle").font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.vermilionText)
            .fixedSize(horizontal: false, vertical: true)
        }
        HStack(spacing: Space.s) {
          Spacer()
          if account.passkeys {
            Button("Not Now") { account.skipPasskey() }.buttonStyle(OlaButton(kind: .ghost))
            Button("Add Passkey") { account.addPasskey() }.buttonStyle(OlaButton(kind: .primary)).keyboardShortcut(.defaultAction)
          } else {
            Button("Continue") { account.skipPasskey() }.buttonStyle(OlaButton(kind: .primary)).keyboardShortcut(.defaultAction)
          }
        }
        .padding(.top, Space.xs)
      default:
        GateTitle(title: account.phase == .expired ? "You\u{2019}ve been signed out on this Mac" : "Sign in to Ola")
        GateText(account.phase == .expired ? "Sign in again to keep working. Your sessions on this Mac are still here." : "Use the name and password of your Ola account. Ola then works in a folder you choose on this Mac.")
        form
        // A wrong password, a refusal or a wait: one plain line under the fields.
        switch account.phase {
        case .problem(let words):
          Label(words, systemImage: "exclamationmark.circle").font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.vermilionText)
            .fixedSize(horizontal: false, vertical: true)
        case .notice(let words):
          GateText(words)
        default:
          EmptyView()
        }
        HStack(spacing: Space.s) {
          if account.phase == .working { ProgressView().controlSize(.small); Text("Signing in\u{2026}").font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink3) }
          Spacer()
          if account.wantsGate { Button("Cancel") { account.closeGate() }.buttonStyle(OlaButton(kind: .ghost)) }
          Button("Sign In", action: submit).buttonStyle(OlaButton(kind: .primary)).keyboardShortcut(.defaultAction)
            .disabled(account.phase == .working || handle.trimmingCharacters(in: .whitespaces).isEmpty || password.isEmpty)
        }
        .padding(.top, Space.xs)
        Divider().overlay(Ola.rule).padding(.vertical, Space.xs)
        VStack(alignment: .leading, spacing: Space.xs) {
          if account.passkeys { Button("Sign in with a passkey") { account.signInWithPasskey() }.buttonStyle(LinkButton()) }
          if let useOwnSetup { Button("Use my own Ola machine instead", action: useOwnSetup).buttonStyle(LinkButton()) }
          Text("Forgot your password? Ask Bart for a link to choose a new one.").font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink3)
        }
      }
    }
    .onAppear { focus = handle.isEmpty ? .handle : .password }
  }

  var form: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("Your name for Ola").font(OlaFont.sans(Metrics.meta, .semibold)).foregroundStyle(Ola.ink2)
      TextField("", text: $handle).textFieldStyle(.plain).font(OlaFont.sans(Metrics.ui)).textContentType(.username)
        .autocorrectionDisabled().focused($focus, equals: .handle).field(focused: focus == .handle)
        .onSubmit { focus = .password }
      Text("Password").font(OlaFont.sans(Metrics.meta, .semibold)).foregroundStyle(Ola.ink2).padding(.top, Space.xs)
      SecureField("", text: $password).textFieldStyle(.plain).font(OlaFont.sans(Metrics.ui)).textContentType(.password)
        .focused($focus, equals: .password).field(focused: focus == .password).onSubmit(submit)
    }
  }

  func submit() {
    let h = handle.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !h.isEmpty, !password.isEmpty, account.phase != .working else { return }
    AccountKeeper.defaults.set(h, forKey: "ola.account.lastHandle")
    account.signIn(handle: h, password: password)
    password = ""
  }
}

/// After signing in on a new Mac: the one folder Ola works in.
struct FolderScreen: View {
  var choose: () -> Void
  var body: some View {
    GateSheet {
      GateTitle(title: "Choose a folder for Ola")
      GateText("Ola works in one folder on this Mac. It reads what\u{2019}s there, and asks you before it changes a file or runs a command.")
      HStack {
        Spacer()
        Button("Choose a Folder\u{2026}", action: choose).buttonStyle(OlaButton(kind: .primary)).keyboardShortcut(.defaultAction)
      }
      .padding(.top, Space.xs)
    }
  }
}

/// The first time on a Mac: opencode is fetched and checked (OpencodeInstall).
struct InstallScreen: View {
  var fraction: Double?
  var problem: String?
  var retry: () -> Void
  var body: some View {
    GateSheet {
      GateTitle(title: "Getting Ola ready on this Mac")
      if let problem {
        Label(problem, systemImage: "exclamationmark.circle").font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.vermilionText)
          .fixedSize(horizontal: false, vertical: true)
        HStack {
          Spacer()
          Button("Try Again", action: retry).buttonStyle(OlaButton(kind: .primary)).keyboardShortcut(.defaultAction)
        }
      } else {
        GateText("This happens once. Ola downloads what it needs to work here, about 70 MB, and checks it before using it.")
        VStack(alignment: .leading, spacing: Space.xs) {
          // Drawn, not the system's bar: it stays in Ola's blue even while the window is behind.
          GeometryReader { g in
            ZStack(alignment: .leading) {
              Capsule().fill(Ola.details)
              Capsule().fill(Ola.action).frame(width: max(6, g.size.width * min(max(fraction ?? 0, 0), 1)))
            }
          }
          .frame(height: 6)
          .animation(.easeOut(duration: 0.2), value: fraction)
          Text(words).font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink3).monospacedDigit()
        }
        .padding(.top, Space.xs)
      }
    }
  }

  var words: String {
    guard let f = fraction else { return "Starting\u{2026}" }
    return f >= 1 ? "Checking and setting up\u{2026}" : "Downloading, \(Int(f * 100))%"
  }
}

// MARK: Settings

struct AccountSettings: View {
  var account: AccountController
  var cli: CLIInstaller?

  var body: some View {
    SettingsGroup(title: "Account") {
      if account.signedIn, let name = account.name {
        LabeledContent("Name") { Text(name) }
        HStack(alignment: .firstTextBaseline) {
          VStack(alignment: .leading, spacing: 4) {
            StatusLine(kind: .ok, text: "Signed in on this Mac")
            if let u = account.usage { SettingNote(u).padding(.leading, 18) }
          }
          Spacer(minLength: Space.s)
          Button("Sign Out") { Task { await account.signOut() } }
        }
      } else {
        HStack(alignment: .firstTextBaseline) {
          VStack(alignment: .leading, spacing: 4) {
            switch account.phase {
            case .passkey, .addingPasskey, .offerPasskey: StatusLine(kind: .busy, text: "Finish signing in in the Ola window")
            case .working: StatusLine(kind: .busy, text: "Signing in")
            case .expired: StatusLine(kind: .problem, text: "Signed out. Sign in again to keep working.")
            case .problem(let p): StatusLine(kind: .problem, text: p)
            case .notice(let p): StatusLine(kind: .off, text: p)
            case .idle: StatusLine(kind: .off, text: "Not signed in")
            }
            SettingNote("Sign in with your Ola name and password to work on this Mac with your own account.")
              .padding(.leading, 18)
          }
          Spacer(minLength: Space.s)
          if account.phase == .passkey {
            Button("Cancel") { account.cancel() }
          } else {
            // The window shows the sign-in screen (name and password).
            Button("Sign In\u{2026}") { account.wantsGate = true; NSApp.activate(); NSApp.windows.first { $0.identifier?.rawValue.hasPrefix("main") == true || $0.title == "Ola" }?.makeKeyAndOrderFront(nil) }
          }
        }
      }
      if let cli {
        HStack(alignment: .firstTextBaseline) {
          VStack(alignment: .leading, spacing: 2) {
            Text("The ola command")
            SettingNote(cli.result ?? "Work with Ola in Terminal, in any folder: type ola there.")
          }
          Spacer(minLength: Space.s)
          Button(cli.installed ? "Install Again" : "Install") { cli.install() }
        }
      }
    }
  }
}

/// Settings' "Install the ola command": the same as tools/build.sh install-mac does.
@MainActor
@Observable
final class CLIInstaller {
  private(set) var result: String?
  private(set) var installed = CLIInstall.installedPath() != nil

  init(result: String? = nil, installed: Bool? = nil) {
    self.result = result
    if let installed { self.installed = installed }
  }

  func install() {
    let r = CLIInstall.install(appExecutable: Bundle.main.executableURL)
    result = r.message
    installed = r.path != nil
  }
}
