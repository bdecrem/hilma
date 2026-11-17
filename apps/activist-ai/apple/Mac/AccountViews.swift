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

  func signIn(fromGate gate: Bool = false) {
    attempt?.cancel()
    fromGate = gate || phase == .expired
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
        phase = .idle
        onSignedIn?()
        refreshUsage()
      } catch {
        guard attempt === s else { return }
        attempt = nil
        if (error as? AccountError) == .cancelled { phase = .idle; return }
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
    phase = .idle
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

struct SignInScreen: View {
  var account: AccountController

  var body: some View {
    GateSheet {
      switch account.phase {
      case .waiting:
        GateTitle(title: "Finish in your browser")
        GateText("Your browser opened Ola\u{2019}s sign-in page. Approve this Mac there with your passkey, and this window moves on by itself.")
        HStack(spacing: Space.s) {
          ProgressView().controlSize(.small)
          Text("Waiting for your browser\u{2026}").font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink3)
          Spacer()
          Button("Cancel") { account.cancel() }.buttonStyle(OlaButton(kind: .ghost))
        }
        .padding(.top, Space.xs)
        Button("Open the page again") { account.openPageAgain() }.buttonStyle(LinkButton())
      case .expired:
        GateTitle(title: "You\u{2019}ve been signed out on this Mac")
        GateText("Sign in again to keep working. Your sessions on this Mac are still here.")
        actions
      case .notice(let words):
        GateTitle(title: "Sign in to Ola")
        GateText(words)
        actions(try: true)
      case .problem(let words):
        GateTitle(title: "Sign in to Ola")
        Label(words, systemImage: "exclamationmark.circle").font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.vermilionText)
          .fixedSize(horizontal: false, vertical: true)
        actions(try: true)
      case .idle:
        GateTitle(title: "Sign in to Ola")
        GateText("Use your Ola account. Your browser opens so you can approve this Mac with your passkey.")
        actions
      }
    }
  }

  var actions: some View { actions(try: false) }

  func actions(try again: Bool) -> some View {
    HStack {
      Spacer()
      Button(again ? "Try Again" : "Sign In") { account.signIn(fromGate: true) }.buttonStyle(OlaButton(kind: .primary)).keyboardShortcut(.defaultAction)
    }
    .padding(.top, Space.xs)
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
            case .expired: StatusLine(kind: .problem, text: "Signed out. Sign in again to keep working.")
            case .problem(let p): StatusLine(kind: .problem, text: p)
            case .notice(let p): StatusLine(kind: .off, text: p)
            case .idle: StatusLine(kind: .off, text: "Not signed in")
            }
            SettingNote("Sign in with your Ola account to work on this Mac. Your browser opens so you can approve it with your passkey.")
              .padding(.leading, 18)
          }
          Spacer(minLength: Space.s)
          if account.phase == .waiting {
            Button("Cancel") { account.cancel() }
          } else {
            Button("Sign In\u{2026}") { account.signIn() }
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
