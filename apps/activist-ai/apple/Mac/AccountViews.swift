import AppKit
import OlaKit
import SwiftUI

/// Signing this Mac in to an Ola account, and what the app shows around it. The browser does the
/// approving (a passkey on the account's page); the app holds the token in the Keychain and lends
/// the agent only the model door's key for this launch.
@MainActor
@Observable
final class AccountController {
  enum Phase: Equatable {
    case idle
    /// A name and password on their way to Ola.
    case working
    /// The browser is open on the account's page; waiting for it to come back.
    case waiting
    /// The last try did not work (in plain words).
    case problem(String)
    /// Nothing went wrong, but it could not finish (sign-in not open yet, the browser took too long).
    case notice(String)
    /// The server said this Mac's sign-in is over.
    case expired
  }

  private(set) var phase: Phase = .idle
  private(set) var name: String? = AccountKeeper.name
  private(set) var signedIn = AccountKeeper.signedIn
  private(set) var usage: String?
  /// Set after a sign-in on a Mac that was never set up, so it goes straight to "On this Mac".
  var onSignedIn: (() -> Void)?
  /// Called when the server ends this Mac's sign-in (a 401 from the door).
  var onSignedOut: (() -> Void)?
  private var attempt: DeviceSignIn?
  private var pageURL: URL?
  private var door: ModelDoor?
  let api = AccountAPI()

  /// Screenshots: a still picture with no Keychain and no network.
  init(preview phase: Phase = .idle, name: String? = nil) {
    self.phase = phase
    self.name = name
    signedIn = name != nil
  }
  var previewUsage: String? {
    get { usage }
    set { usage = newValue }
  }

  init() {}

  // MARK: signing in

  /// The sign-in was started from the window's own sign-in screen (it stays on that screen).
  private(set) var fromGate = false
  /// Settings asked for the sign-in screen on a Mac that already works another way (the owner's).
  var wantsGate = false
  /// The words under the browser wait when a right password was followed by "your passkey too".
  private(set) var passkeyNote = false

  /// The normal sign-in (2026-11-17): a name and password, straight from the app. A person who asks
  /// for their passkey too is sent on to the browser, where the passkey finishes it.
  func signIn(handle: String, password: String) {
    attempt?.cancel()
    attempt = nil
    fromGate = true
    passkeyNote = false
    phase = .working
    Task {
      do {
        let session = try await api.login(handle: handle.trimmingCharacters(in: .whitespacesAndNewlines), password: password, deviceName: DeviceSignIn.thisMacName, kind: "mac", known: AccountKeeper.known)
        guard phase == .working else { return }
        guard AccountKeeper.keep(session) else { phase = .problem("This Mac\u{2019}s Keychain didn\u{2019}t take the sign-in. Try again."); return }
        name = session.person.name
        signedIn = true
        wantsGate = false
        phase = .idle
        onSignedIn?()
        refreshUsage()
      } catch AccountError.passkeyRequired {
        guard phase == .working else { return }
        passkeyNote = true
        signIn(fromGate: true)
      } catch {
        guard phase == .working else { return }
        if (error as? AccountError) == .cancelled { phase = .idle; return }
        phase = .problem((error as? LocalizedError)?.errorDescription ?? "That didn\u{2019}t work. Try again.")
      }
    }
  }

  func signIn(fromGate gate: Bool = false) {
    attempt?.cancel()
    fromGate = gate || phase == .expired
    let wasExpired = phase == .expired
    phase = .waiting
    let s = DeviceSignIn(api: api, kind: "mac")
    attempt = s
    Task {
      do {
        let url = try await s.start()
        pageURL = url
        NSWorkspace.shared.open(url)
        let session = try await s.finish()
        guard attempt === s else { return }
        guard AccountKeeper.keep(session) else { phase = .problem("This Mac\u{2019}s Keychain didn\u{2019}t take the sign-in. Try again."); return }
        attempt = nil
        name = session.person.name
        signedIn = true
        wantsGate = false
        passkeyNote = false
        phase = .idle
        onSignedIn?()
        refreshUsage()
      } catch {
        guard attempt === s else { return }
        attempt = nil
        // Cancelled here or on the account's page: back to the signed-out screen, no error tone.
        if [.cancelled, .cancelledInBrowser].contains(error as? AccountError) { phase = wasExpired ? .expired : .idle; return }
        let words = (error as? LocalizedError)?.errorDescription ?? "That didn\u{2019}t work. Try again."
        let calm: Set<AccountError> = [.notAvailableYet, .timedOut]
        phase = (error as? AccountError).map(calm.contains) == true ? .notice(words) : .problem(words)
      }
    }
  }

  /// Opens the account's page again (a closed tab, a browser that came up behind).
  func openPageAgain() { if let pageURL { NSWorkspace.shared.open(pageURL) } }

  func cancel() {
    attempt?.cancel()
    attempt = nil
    passkeyNote = false
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
/// for an account that asks for its passkey too, the browser finishes it.
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
      case .waiting:
        GateTitle(title: "Finish in your browser")
        GateText(account.passkeyNote
          ? "Your account asks for your passkey too. Your browser opened Ola\u{2019}s page: sign in there, use your passkey, and approve this Mac. This window moves on by itself."
          : "Your browser opened Ola\u{2019}s sign-in page. Approve this Mac there, and this window moves on by itself.")
        HStack(spacing: Space.s) {
          ProgressView().controlSize(.small)
          Text("Waiting for your browser\u{2026}").font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink3)
          Spacer()
          Button("Cancel") { account.cancel() }.buttonStyle(OlaButton(kind: .ghost))
        }
        .padding(.top, Space.xs)
        Button("Open the page again") { account.openPageAgain() }.buttonStyle(LinkButton())
      default:
        GateTitle(title: account.phase == .expired ? "You\u{2019}ve been signed out on this Mac" : "Sign in to Ola")
        GateText(account.phase == .expired ? "Sign in again to keep working. Your sessions on this Mac are still here." : "Use the name and password of your Ola account. Ola then works in a folder you choose on this Mac.")
        form
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
          Button("Sign in with your browser instead") { account.signIn(fromGate: true) }.buttonStyle(LinkButton())
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
            case .waiting: StatusLine(kind: .busy, text: "Finish signing in in your browser")
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
          if account.phase == .waiting {
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
