#if os(macOS)
import Foundation

/// The `ola` command: "On this Mac" in a terminal, in the folder you are in (the Claude Code
/// arrangement). It is the Ola app's own executable in a mode that never starts the interface
/// (`Ola.app/Contents/MacOS/Ola --cli …`, through the small `ola` launcher), so it has the app's
/// signature and reads the same Keychain item with no question. The setup is OlaKit's own:
/// `ModelDoor` for the model and web commands with the account, `LocalServer` for opencode (the same
/// config, permissions and environment as the app), opencode's own terminal interface on top.
public enum OlaCLI {
  public enum Command: Equatable {
    /// The conversation in the terminal; `continueLast` picks up the last one.
    case talk(continueLast: Bool)
    /// One request, the reply printed.
    case run(String)
    case login, logout, whoami, status, help, version
    /// Ola's skills here: their version and what each needs; `setup` installs the Python libraries.
    case skills(setup: Bool)
    /// This folder's fallbacks: shown, or one of them changed (`ola settings hosted on`).
    case settings([String])
    case installCommand
    case bad(String)
  }

  /// `args` are what came after `--cli`.
  public static func parse(_ args: [String]) -> Command {
    guard let first = args.first else { return .talk(continueLast: false) }
    switch first {
    case "-h", "--help", "help": return .help
    case "-v", "--version", "version": return .version
    case "-c", "--continue": return args.count == 1 ? .talk(continueLast: true) : .bad("ola -c takes nothing after it.")
    case "login", "logout", "whoami", "status":
      guard args.count == 1 else { return .bad("ola \(first) takes nothing after it.") }
      return ["login": .login, "logout": .logout, "whoami": .whoami, "status": .status][first]!
    case "run":
      let text = args.dropFirst().joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
      return text.isEmpty ? .bad("Say what Ola should do: ola run \"your request\".") : .run(text)
    case "install-command": return .installCommand
    case "settings": return .settings(Array(args.dropFirst()))
    case "skills":
      if args.count == 1 { return .skills(setup: false) }
      return args.count == 2 && args[1] == "setup" ? .skills(setup: true) : .bad("ola skills takes nothing after it, or setup.")
    default:
      if first.hasPrefix("-") { return .bad("ola doesn\u{2019}t know \(first). Try ola --help.") }
      return .run(args.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines))
    }
  }

  public static let help = """
  ola: Ola, in the folder you are in.

    ola                  talk with Ola here, in this terminal
    ola "a request"      ask once and print the reply (the same as: ola run "a request")
    ola -c               pick up the last conversation
    ola login            sign in to your Ola account with your name and password
    ola logout           sign out on this Mac
    ola whoami           who is signed in
    ola status           signed in or not, this folder, whether the model answers, Ola's skills
    ola skills           Ola's skills here: their version, and what each one needs
    ola skills setup     install the Python libraries the skills need (in Ola's own folder)

    ola /hosted "a request"   hand this one request to the hosted open model (it leaves Ola)
    ola /claude "a request"   hand this one request to Claude Code on this Mac, in this folder
    ola /ola "a request"      Ola's own model (the same as ola "a request")
    ola settings              this folder's fallbacks and the permissions, and how to change them
    ola settings permissions lots|ask
                              lots: Ola goes ahead without asking (the default); ask: before each step
  In the conversation, /hosted and /ola work the same way; /claude says how to reach Claude Code.

  Permissions are one setting for this Mac, shared with the Ola app: with lots of permissions Ola
  runs commands and changes files in this folder without asking; it still asks before a web search
  or download, and never works outside the folder. Conversations here also show in the Ola app, in
  "On this Mac". Ctrl-C stops.
  """

  /// The app's entry point calls this first: `--cli …` never returns, and neither does
  /// `--install-cli` (what tools/build.sh install-mac runs).
  public static func runIfRequested() {
    let args = CommandLine.arguments
    if args.count >= 2, args[1] == "--install-cli" {
      let r = CLIInstall.install(appExecutable: Bundle.main.executableURL)
      print(r.path != nil ? r.detail : "ola command NOT installed: \(r.detail)")
      exit(r.path != nil ? 0 : 1)
    }
    guard args.count >= 2, args[1] == "--cli" else { return }
    isolateForChecks()
    let command = parse(Array(args.dropFirst(2)))
    let code = Runner().run(command)
    exit(code)
  }

  /// Checks only: run the command beside the real app without touching anything of it. The app's
  /// settings go to their own suite (OLA_DEFAULTS_SUITE), Application Support/Ola to a scratch
  /// folder (OLA_SUPPORT_DIR); Keychain items get throwaway names (OLA_SECRET_PREFIX, SecretStore).
  public static func isolateForChecks() {
    let env = ProcessInfo.processInfo.environment
    if let suite = env["OLA_DEFAULTS_SUITE"], !suite.isEmpty, let d = UserDefaults(suiteName: suite) {
      LocalSettings.defaults = d
      AccountKeeper.defaults = d
    }
    if let dir = env["OLA_SUPPORT_DIR"], !dir.isEmpty {
      LocalServer.support = URL(fileURLWithPath: dir)
      // The installed skills too (~/Library/Ola/skills is the real app's).
      LocalServer.skillsHome = URL(fileURLWithPath: dir).appendingPathComponent("skills-home")
    }
    // The owner's own setup in a check: the gateway token from a file instead of the Keychain.
    if let f = env["OLA_MODEL_TOKEN_FILE"], let t = try? String(contentsOfFile: f, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty {
      LocalSettings.tokenOverride = t
    }
  }

  /// What happens, step by step, into a file (OLA_CLI_TRACE=<file>; for finding out why it is stuck).
  static let trace: (@Sendable (String) -> Void)? = ProcessInfo.processInfo.environment["OLA_CLI_TRACE"].map { path in
    { line in
      guard let h = FileHandle(forWritingAtPath: path) ?? { FileManager.default.createFile(atPath: path, contents: nil); return FileHandle(forWritingAtPath: path) }() else { return }
      h.seekToEndOfFile()
      h.write(Data("\(Date().timeIntervalSince1970) \(line)\n".utf8))
      try? h.close()
    }
  }

  /// Says things on the terminal: plain words on standard error, the reply on standard output.
  static func say(_ s: String) { FileHandle.standardError.write(Data((s + "\n").utf8)) }

  /// One line typed at the terminal after `prompt` (on standard error); with `secret`, nothing is
  /// shown while it is typed, and the terminal is put back even on Ctrl-C. Without a terminal, one
  /// line of standard input. nil at the end of input.
  static func ask(_ prompt: String, secret: Bool = false) -> String? {
    FileHandle.standardError.write(Data(prompt.utf8))
    let tty = isatty(STDIN_FILENO) == 1
    var saved = termios()
    let hide = secret && tty && tcgetattr(STDIN_FILENO, &saved) == 0
    if hide {
      echoSaved = saved
      var quiet = saved
      quiet.c_lflag &= ~tcflag_t(ECHO)
      quiet.c_lflag |= tcflag_t(ECHONL)
      signal(SIGINT) { _ in
        if var t = OlaCLI.echoSaved { tcsetattr(STDIN_FILENO, TCSANOW, &t) }
        FileHandle.standardError.write(Data("\n".utf8))
        exit(130)
      }
      tcsetattr(STDIN_FILENO, TCSAFLUSH, &quiet)
    }
    let line = readLine(strippingNewline: true)
    if hide {
      tcsetattr(STDIN_FILENO, TCSAFLUSH, &saved)
      signal(SIGINT, SIG_DFL)
      echoSaved = nil
    } else if secret, !tty, line != nil {
      FileHandle.standardError.write(Data("\n".utf8))
    }
    return line
  }

  nonisolated(unsafe) static var echoSaved: termios?

  final class Runner: @unchecked Sendable {
    let api = AccountAPI()
    var door: ModelDoor?
    var server: LocalServer?
    var configDir: URL?
    let folder = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)

    func run(_ c: Command) -> Int32 {
      switch c {
      case .help: print(OlaCLI.help); return 0
      case .version: print("ola \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "") (built on opencode \(OpencodeInstall.version), MIT License, \u{00A9} 2025 opencode)"); return 0
      case .bad(let s): say(s); return 2
      case .installCommand:
        let r = CLIInstall.install(appExecutable: Bundle.main.executableURL)
        say(r.path != nil ? r.message : r.message + " (" + r.detail + ")")
        return r.path != nil ? 0 : 1
      case .login: return blocking { await self.login() }
      case .logout: return blocking { await self.logout() }
      case .whoami: return blocking { await self.whoami() }
      case .status: return blocking { await self.status() }
      case .skills(let setup): return blocking { await self.skills(setup: setup) }
      case .settings(let a): return blocking { await self.settings(a) }
      case .run(let text): return blocking { await self.request(text) }
      case .talk(let last): return blocking { await self.work(.talk(continueLast: last)) }
      }
    }

    /// Runs async work from the synchronous entry point.
    func blocking(_ f: @escaping @Sendable () async -> Int32) -> Int32 {
      let sem = DispatchSemaphore(value: 0)
      nonisolated(unsafe) var code: Int32 = 1
      Task.detached {
        code = await f()
        sem.signal()
      }
      sem.wait()
      return code
    }

    var notSignedIn: String { "You\u{2019}re not signed in to Ola on this Mac. Sign in with: ola login" }

    /// `ola login`: "Name:", then "Password:" with nothing shown as it is typed, then "Signed in as
    /// bart." Never a browser (2026-11-17). Without a terminal (a script), the two lines come from
    /// standard input. An account that asks for its passkey too is told to sign in from the Ola app,
    /// which shows the passkey sheet; this command shares the app's sign-in.
    func login() async -> Int32 {
      guard let name = OlaCLI.ask("Name: ")?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty else { say("No name given, so nothing was done."); return 1 }
      guard let password = OlaCLI.ask("Password: ", secret: true), !password.isEmpty else { say("No password given, so nothing was done."); return 1 }
      do {
        let session = try await api.login(handle: name, password: password, deviceName: AccountAPI.thisMacName, kind: "cli", known: AccountKeeper.known)
        guard AccountKeeper.keep(session) else { say("This Mac\u{2019}s Keychain didn\u{2019}t take the sign-in. Try again."); return 1 }
        say("Signed in as \(session.person.handle).")
        return 0
      } catch is PasskeyNeeded {
        say(AccountError.passkeyRequired.errorDescription!)
        return 1
      } catch {
        say((error as? LocalizedError)?.errorDescription ?? "That didn\u{2019}t work. Try again.")
        return 1
      }
    }

    func logout() async -> Int32 {
      guard AccountKeeper.signedIn else { say("You weren\u{2019}t signed in on this Mac."); return 0 }
      if let s = AccountKeeper.session { try? await api.signOut(s) }
      AccountKeeper.forget()
      say("Signed out of Ola on this Mac.")
      return 0
    }

    func whoami() async -> Int32 {
      guard let s = AccountKeeper.session else { say(notSignedIn); return 1 }
      do {
        let me = try await api.me(s)
        print("\(me.person.name) (\(me.person.handle)), signed in on this Mac")
        return 0
      } catch AccountError.signedOut {
        AccountKeeper.forget()
        say("This Mac was signed out of Ola. Sign in again with: ola login")
        return 1
      } catch {
        // Offline: say who the Keychain says, and that it was not checked.
        print("\(s.person.name) (\(s.person.handle)), signed in on this Mac (not checked: \((error as? LocalizedError)?.errorDescription ?? "no answer"))")
        return 0
      }
    }

    /// "Skills:" lines: this Mac's version, the Ola machine's, and each skill's state here.
    func skillsLines() async -> [String] {
      let (v, states) = OlaSkills.current()
      guard let v else { return ["Skills:   none in this copy of Ola"] }
      let machine = await OlaSkills.machineVersion(token: AccountKeeper.session?.token)
      return ["Skills:   \(v.label). \(OlaSkills.compare(v, machine))"] + states.map { "          \($0.line)" }
    }

    func skills(setup: Bool) async -> Int32 {
      if setup {
        do {
          say(try await OlaSkills.setUpPython(progress: { OlaCLI.say($0) }))
        } catch {
          say((error as? LocalizedError)?.errorDescription ?? "The Python libraries didn\u{2019}t install.")
          return 1
        }
      }
      for l in await skillsLines() { print(l) }
      return 0
    }

    func status() async -> Int32 {
      let code = await account()
      for l in await skillsLines() { print(l) }
      return code
    }

    func account() async -> Int32 {
      var ok = true
      if let s = AccountKeeper.session {
        print("Account:  signed in as \(s.person.name)")
      } else {
        print("Account:  not signed in (ola login)")
        ok = false
      }
      print("Folder:   \((folder.path as NSString).abbreviatingWithTildeInPath)")
      print("Ola here: \(LocalServer.binary != nil ? "ready" : "will set itself up the first time you use it")")
      guard ok else { print("Model:    needs you to sign in first"); return 1 }
      do {
        let d = try await openDoor()
        var r = URLRequest(url: d.url.appendingPathComponent("v1/models"))
        r.setValue("Bearer \(d.key)", forHTTPHeaderField: "Authorization")
        r.timeoutInterval = 20
        let (_, res) = try await URLSession(configuration: .ephemeral).data(for: r)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        d.stop()
        switch code {
        case 200: print("Model:    answers")
        case 401: print("Model:    this Mac was signed out; sign in again with ola login"); return 1
        default: print("Model:    did not answer as expected (it said \(code))"); return 1
        }
        return 0
      } catch {
        print("Model:    no answer (\((error as? LocalizedError)?.errorDescription ?? "is this Mac online?"))")
        return 1
      }
    }

    func openDoor() async throws -> ModelDoor {
      if let door { return door }
      let d = ModelDoor(api: api) { AccountKeeper.session?.token }
      d.onSignedOut = {
        // Forgotten at once: nothing more goes to the server with it.
        AccountKeeper.forget()
        OlaCLI.say("This Mac was signed out of Ola. Sign in again with: ola login")
      }
      try await d.start()
      door = d
      return d
    }

    // MARK: working in this folder

    /// `model`: a model for this one request (`ola/hosted`, from /hosted); nil is Ola's own.
    func work(_ c: Command, model: String? = nil) async -> Int32 {
      // Signed in: the account's door. Not signed in, on the owner's own setup (a gateway token
      // pasted in Settings, Where Ola works): that, through the machine's forwarder, as the app does.
      let pasted = AccountKeeper.session == nil ? LocalSettings.token : nil
      guard AccountKeeper.session != nil || pasted != nil else { say(notSignedIn); return 1 }
      OlaCLI.trace?("\(pasted == nil ? "signed in" : "the pasted token"); folder \(folder.path)")
      sweepOldConfigs()
      if LocalServer.binary == nil {
        say("Getting Ola ready on this Mac. This happens once (about 70 MB).")
        let last = LastSeen()
        do {
          try await OpencodeInstall.install { f in
            if last.age > 1 || f >= 1 { last.touch(); FileHandle.standardError.write(Data("\r  \(Int(f * 100))%".utf8)) }
          }
          say("\r  ready.")
        } catch {
          say("")
          say((error as? LocalizedError)?.errorDescription ?? "Ola couldn\u{2019}t set itself up on this Mac.")
          return 1
        }
      }
      let config: ServerConfig
      do {
        let s = LocalServer(folder: folder)
        // The sessions are the app's ("On this Mac"); the config is this command's own, since it
        // names this command's door. No pid file: the app can never take this server for one it
        // left behind, and this one ends with the command (--stdio), a kill included.
        let cfg = LocalServer.support.appendingPathComponent("cli/\(getpid())")
        configDir = cfg
        s.configBase = cfg
        s.pidFileName = nil
        s.tiedToThisProcess = true
        // Permissions (ola settings permissions, the app's General pane): read at each start.
        s.askFirst = !PermissionSettings.lots
        server = s
        let route: ModelRoute
        if let pasted { route = .pasted(token: pasted) } else { route = .door(try await openDoor()) }
        // The person's own /hosted is the only way the hosted model is chosen here (the app opens the
        // door only while it hands a request over; in the terminal the typed command is the yes).
        if model == "ola/hosted" || { if case .talk = c { return true }; return false }() { door?.allowHosted = { true } }
        config = try await s.start(route: route, timeout: 45, trace: OlaCLI.trace)
      } catch {
        say((error as? LocalizedError)?.errorDescription ?? "Ola didn\u{2019}t start here.")
        cleanUp()
        return 1
      }
      guard let bin = LocalServer.binary else { cleanUp(); return 1 }
      var args: [String]
      switch c {
      case .run(let text): args = ["run", "--server", config.url.absoluteString] + (model.map { ["--model", $0] } ?? []) + [text]
      case .talk(let last): args = ["--server", config.url.absoluteString] + (last ? ["--continue"] : []) + [folder.path]
      default: args = []
      }
      // The interface runs with the server's own environment (the same config and state, nothing
      // from other tools), plus what the terminal needs to draw.
      var env = server?.environment ?? [:]
      let mine = ProcessInfo.processInfo.environment
      for k in ["TERM", "COLORTERM", "TERM_PROGRAM", "TERM_PROGRAM_VERSION", "LC_TERMINAL", "LC_TERMINAL_VERSION", "COLUMNS", "LINES", "NO_COLOR"] { if let v = mine[k] { env[k] = v } }
      env["OPENCODE_PASSWORD"] = config.password
      // posix_spawn, not Process: Process puts its child in a process group of its own, which the
      // terminal treats as background (the interface stops as soon as it touches the terminal).
      // This keeps it in the terminal's foreground group, so it gets the keys, Ctrl-C and resizes.
      guard let pid = Self.spawn(bin.path, args, env: env, cwd: folder.path) else {
        say("Ola\u{2019}s terminal interface didn\u{2019}t start.")
        cleanUp()
        return 1
      }
      OlaCLI.trace?("interface started, pid \(pid): \(args.first ?? "")")
      let stops = watchStops(pid)
      // If this process is killed outright (no chance to clean up), a small watcher ends the
      // interface and the agent: the server would end anyway (--stdio), the interface would not.
      let watcher = Self.watcher(parent: getpid(), ends: [pid] + (server?.pid.map { [$0] } ?? []))
      var status: Int32 = 0
      while waitpid(pid, &status, 0) == -1, errno == EINTR {}
      watcher?.terminate()
      stops.forEach { $0.cancel() }
      cleanUp()
      OlaCLI.trace?("interface ended, status \(status)")
      // Exited: its code. Ended by a signal: 128 + the signal, as shells report it.
      return status & 0x7f == 0 ? (status >> 8) & 0xff : 128 + (status & 0x7f)
    }

    /// Starts `path` in this process group, with default signal handling, in `cwd`.
    static func spawn(_ path: String, _ args: [String], env: [String: String], cwd: String) -> pid_t? {
      var fa: posix_spawn_file_actions_t?
      posix_spawn_file_actions_init(&fa)
      defer { posix_spawn_file_actions_destroy(&fa) }
      posix_spawn_file_actions_addchdir_np(&fa, cwd)
      var attr: posix_spawnattr_t?
      posix_spawnattr_init(&attr)
      defer { posix_spawnattr_destroy(&attr) }
      var defaults = sigset_t()
      sigemptyset(&defaults)
      for s in [SIGINT, SIGTERM, SIGHUP, SIGQUIT, SIGTSTP, SIGTTIN, SIGTTOU, SIGWINCH, SIGPIPE] { sigaddset(&defaults, s) }
      var none = sigset_t()
      sigemptyset(&none)
      posix_spawnattr_setsigdefault(&attr, &defaults)
      posix_spawnattr_setsigmask(&attr, &none)
      posix_spawnattr_setflags(&attr, Int16(POSIX_SPAWN_SETSIGDEF | POSIX_SPAWN_SETSIGMASK | POSIX_SPAWN_CLOEXEC_DEFAULT))
      // Only the terminal's three: everything else this process has open stays here.
      for fd in Int32(0)...2 { posix_spawn_file_actions_addinherit_np(&fa, fd) }
      let argv: [UnsafeMutablePointer<CChar>?] = ([path] + args).map { strdup($0) } + [nil]
      let envp: [UnsafeMutablePointer<CChar>?] = env.map { strdup("\($0.key)=\($0.value)") } + [nil]
      defer { argv.forEach { free($0) }; envp.forEach { free($0) } }
      var pid: pid_t = 0
      return posix_spawn(&pid, path, &fa, &attr, argv, envp) == 0 ? pid : nil
    }

    /// SIGINT is the interface's to handle (it reads Ctrl-C itself; a one-shot run is stopped by it
    /// directly, being in the same group); SIGTERM and SIGHUP sent to this command end it too.
    func watchStops(_ pid: pid_t) -> [DispatchSourceSignal] {
      var out: [DispatchSourceSignal] = []
      for sig in [SIGINT, SIGTERM, SIGHUP] {
        signal(sig, SIG_IGN)
        let s = DispatchSource.makeSignalSource(signal: sig, queue: .global())
        s.setEventHandler { if sig != SIGINT { kill(pid, SIGTERM) } }
        s.resume()
        out.append(s)
      }
      return out
    }

    /// A shell that waits for `parent` to be gone, then ends `ends` (TERM, then KILL). It ignores
    /// Ctrl-C and a closed terminal, so it outlives only the parent it watches.
    static func watcher(parent: Int32, ends: [Int32]) -> Process? {
      let list = ends.map(String.init).joined(separator: " ")
      let p = Process()
      p.executableURL = URL(fileURLWithPath: "/bin/sh")
      p.arguments = ["-c", "trap '' INT HUP; while kill -0 \(parent) 2>/dev/null; do sleep 0.5; done; kill -TERM \(list) 2>/dev/null; sleep 2; kill -KILL \(list) 2>/dev/null; exit 0"]
      p.standardInput = FileHandle.nullDevice
      p.standardOutput = FileHandle.nullDevice
      p.standardError = FileHandle.nullDevice
      return (try? p.run()) != nil ? p : nil
    }

    /// Config folders of earlier runs that were killed before they could clean up.
    func sweepOldConfigs() {
      let dir = LocalServer.support.appendingPathComponent("cli")
      for name in (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? [] {
        guard let pid = Int32(name), pid != getpid(), kill(pid, 0) != 0 else { continue }
        try? FileManager.default.removeItem(at: dir.appendingPathComponent(name))
      }
    }

    func cleanUp() {
      server?.stop()
      server = nil
      door?.stop()
      door = nil
      if let configDir { try? FileManager.default.removeItem(at: configDir) }
    }
  }
}
#endif
