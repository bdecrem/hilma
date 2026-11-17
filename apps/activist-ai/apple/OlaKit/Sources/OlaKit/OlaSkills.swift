#if os(macOS)
import AppKit
import Foundation

/// Ola's skills on this Mac: the same folder the Ola machine's sealed box gets
/// (`apps/activist-ai/skills`, at `/opt/ola/skills` there), carried in the app's Resources as
/// `OlaSkills/` with a `VERSION.json` (the commit and the content hash; `tools/skills.mjs` stages it
/// and a build refuses anything else). At each start of "On this Mac" or the `ola` command they are
/// copied fresh and read-only to `~/Library/Ola/skills` (LocalServer.installSkills, machine paths made
/// this Mac's), each skill's needs are checked (`ola/needs` in its SKILL.md), and the agent's config
/// names that folder and offers only Ola's skills that can run here. Personal Claude skills stay out
/// (OPENCODE_DISABLE_CLAUDE_CODE, and every other skill ID denied).
public enum OlaSkills {
  public struct Version: Codable, Equatable, Sendable {
    public var hash: String
    public var commit: String?
    public var skills: [String]?
    public init(hash: String, commit: String?, skills: [String]? = nil) {
      self.hash = hash
      self.commit = commit
      self.skills = skills
    }
    /// "4f1c09a2b7e3d811 (commit 9a1b2c3d4e5f)"
    public var label: String { hash + (commit.map { " (commit \($0.prefix(12)))" } ?? "") }
  }

  public enum Need: Equatable, Sendable, Hashable {
    case python(String), command(String)
    init?(_ token: String) {
      let parts = token.split(separator: ":", maxSplits: 1).map(String.init)
      guard parts.count == 2, !parts[1].isEmpty else { return nil }
      switch parts[0] {
      case "python": self = .python(parts[1])
      case "cmd": self = .command(parts[1])
      default: return nil
      }
    }
    /// The pip package for a Python module.
    var package: String? {
      guard case .python(let m) = self else { return nil }
      return ["PIL": "pillow", "docx": "python-docx", "yaml": "pyyaml", "bs4": "beautifulsoup4"][m] ?? m
    }
    public var label: String {
      switch self {
      case .python(let m): return "the Python library \(package ?? m)"
      case .command("pdfinfo"), .command("pdftotext"): return "poppler (pdfinfo, pdftotext)"
      case .command("ola-page"): return "the Ola app, open (on this Mac it draws the pages ola-page looks at)"
      case .command(let c): return "the program \(c)"
      }
    }
    /// How to get it, in one short phrase.
    public var how: String {
      switch self {
      case .python: return "get it with ola skills setup, or in Ola, Settings, Ola\u{2019}s skills, Get Python Libraries"
      case .command("pdfinfo"), .command("pdftotext"): return "get it with brew install poppler"
      case .command("ola-page"): return "open the Ola app"
      case .command(let c): return "install \(c)"
      }
    }
  }

  public struct Skill: Equatable, Sendable {
    public var name: String
    public var needs: [Need]
    /// nil: works on a Mac; else why not.
    public var notOnMac: String?
    /// A placeholder the model must not load (`disable-model-invocation: true`).
    public var hidden: Bool
  }

  public struct State: Equatable, Sendable {
    public var skill: Skill
    public var missing: [Need]
    public init(skill: Skill, missing: [Need]) {
      self.skill = skill
      self.missing = missing
    }
    public var ready: Bool { skill.notOnMac == nil && missing.isEmpty && !skill.hidden }
    /// One plain line: "chart: ready", "report: needs poppler (brew install poppler)", …
    public var line: String {
      if let why = skill.notOnMac { return "\(skill.name): not on this Mac; \(why)" }
      if skill.hidden { return "\(skill.name): not offered yet" }
      if missing.isEmpty { return "\(skill.name): ready" }
      let py = missing.compactMap(\.package)
      var others: [String] = []
      for m in missing where m.package == nil && !others.contains(m.label) { others.append(m.label) }
      let libs = py.isEmpty ? nil : py.count == 1 ? "the Python library \(py[0])" : "the Python libraries \(Self.list(py))"
      let what = [libs, others.isEmpty ? nil : Self.list(others)].compactMap { $0 }.joined(separator: ", and ")
      var hows: [String] = []
      for m in missing where !hows.contains(m.how) { hows.append(m.how) }
      return "\(skill.name): needs \(what); \(hows.joined(separator: "; "))"
    }
    static func list(_ a: [String]) -> String { a.count <= 1 ? (a.first ?? "") : a.dropLast().joined(separator: ", ") + " and " + a.last! }
  }

  // MARK: where they are

  /// The app's bundled copy. A check run from the repo points this at a staged copy.
  nonisolated(unsafe) public static var bundled: URL? = Bundle.main.resourceURL.map { $0.appendingPathComponent("OlaSkills") }.flatMap {
    FileManager.default.fileExists(atPath: $0.appendingPathComponent("VERSION.json").path) ? $0 : nil
  }

  public static func version(at dir: URL? = bundled) -> Version? {
    guard let dir, let d = try? Data(contentsOf: dir.appendingPathComponent("VERSION.json")) else { return nil }
    return try? JSONDecoder().decode(Version.self, from: d)
  }

  /// The skills in a folder, read from each SKILL.md's frontmatter.
  public static func read(at dir: URL? = bundled) -> [Skill] {
    guard let dir else { return [] }
    let names = ((try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []).filter { !$0.hasPrefix(".") && !$0.hasPrefix("_") }.sorted()
    return names.compactMap { n in
      guard let text = try? String(contentsOf: dir.appendingPathComponent("\(n)/SKILL.md"), encoding: .utf8) else { return nil }
      return parse(name: n, skillMD: text)
    }
  }

  static func parse(name: String, skillMD text: String) -> Skill {
    var meta: [String: String] = [:]
    let lines = text.components(separatedBy: "\n")
    if lines.first == "---" {
      for l in lines.dropFirst() {
        if l == "---" { break }
        let t = l.trimmingCharacters(in: .whitespaces)
        guard let c = t.firstIndex(of: ":") else { continue }
        meta[String(t[..<c])] = t[t.index(after: c)...].trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "\""))
      }
    }
    let needs = (meta["ola/needs"] ?? "none").split(separator: " ").compactMap { Need(String($0)) }
    let mac = meta["ola/mac"] ?? "yes"
    let notOnMac: String? = mac == "yes" ? nil : (mac.hasPrefix("no, ") ? String(mac.dropFirst(4)) : mac)
    return Skill(name: name, needs: needs, notOnMac: notOnMac, hidden: meta["disable-model-invocation"] == "true")
  }

  // MARK: on this Mac

  /// The Python libraries Ola sets up for its skills, in the app's own folder (Settings, or
  /// `ola skills setup`): a virtual environment, first on the agent's PATH once it exists.
  public static var python: URL { LocalServer.support.appendingPathComponent("python") }
  public static var pythonBin: URL { python.appendingPathComponent("bin") }

  /// What each skill needs, checked with the agent's own PATH (the same `python3` it will run).
  public static func check(_ skills: [Skill], path: String) -> [State] {
    let modules = Array(Set(skills.flatMap { $0.needs }.compactMap { n -> String? in if case .python(let m) = n { return m } else { return nil } })).sorted()
    var have: [String: Bool] = [:]
    if !modules.isEmpty, let py = which("python3", path: path) {
      let p = Process()
      p.executableURL = py
      p.arguments = ["-c", "import importlib.util, json, sys\nout = {}\nfor m in sys.argv[1:]:\n    try:\n        out[m] = importlib.util.find_spec(m) is not None\n    except Exception:\n        out[m] = False\nprint(json.dumps(out))", ] + modules
      p.environment = ["PATH": path, "HOME": NSHomeDirectory()]
      let pipe = Pipe()
      p.standardOutput = pipe
      p.standardError = FileHandle.nullDevice
      if (try? p.run()) != nil {
        let d = pipe.fileHandleForReading.readDataToEndOfFile()
        p.waitUntilExit()
        for (k, v) in JSON.parse(d)?.object ?? [:] { have[k] = v.bool ?? false }
      }
    }
    return skills.map { s in
      State(skill: s, missing: s.needs.filter { n in
        switch n {
        case .python(let m): return have[m] != true
        case .command("ola-page"): return which("ola-page", path: path) == nil || !appDraws
        case .command(let c): return which(c, path: path) == nil
        }
      })
    }
  }

  /// ola-page on this Mac asks the Ola app to draw the page (Mac/PageRender.swift): true in the app
  /// itself, and in the `ola` command while the app is open.
  static var appDraws: Bool {
    if Bundle.main.bundleIdentifier == "cx.ola.mac" && !CommandLine.arguments.contains("--cli") { return true }
    return NSRunningApplication.runningApplications(withBundleIdentifier: "cx.ola.mac").contains { $0.processIdentifier != getpid() }
  }

  static func which(_ name: String, path: String) -> URL? {
    for d in path.split(separator: ":") {
      let u = URL(fileURLWithPath: String(d)).appendingPathComponent(name)
      if FileManager.default.isExecutableFile(atPath: u.path) { return u }
    }
    return nil
  }

  /// This Mac's skills and their state, as the agent would get them now (for `ola status` and
  /// Settings): installs the bundled copy if needed and checks with the agent's PATH.
  public static func current() -> (Version?, [State]) {
    // The bundle itself (the installed copy is the running agent's, rewritten only at a start).
    let src = LocalServer.skillsSource
    let py = FileManager.default.isExecutableFile(atPath: pythonBin.appendingPathComponent("python3").path) ? pythonBin.path + ":" : ""
    let tools = LocalServer.support.appendingPathComponent("web-tools").path + ":"
    return (version(at: src), check(read(at: src), path: tools + py + "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"))
  }

  /// What the agent is told about Ola's skills here, after the standing instructions.
  public static func notes(_ states: [State], dir: String) -> String {
    let ready = states.filter(\.ready).map(\.skill.name)
    let notReady = states.filter { !$0.ready && !$0.skill.hidden }
    var s = "Ola's skills on this Mac are in \"\(dir)\" (where a skill says /opt/ola/skills, it means that folder; where it says /work, it means the project folder here)."
    s += ready.isEmpty ? " None is ready here yet." : " Ready: \(State.list(ready))."
    if !notReady.isEmpty {
      s += " Not ready, so not offered: " + notReady.map(\.line).joined(separator: "; ") + "."
      s += " When a request needs one of those, do not improvise it: tell the person in one or two sentences what is missing and how to get it, as written here."
    }
    return s
  }

  // MARK: setting up the Python libraries

  /// Makes the virtual environment (from this Mac's python3) and installs the Python libraries
  /// the skills that work on a Mac need. Returns one plain line; throws with what went wrong.
  public static func setUpPython(_ skills: [Skill] = read(), progress: @escaping @Sendable (String) -> Void = { _ in }) async throws -> String {
    let pkgs = Array(Set(skills.filter { $0.notOnMac == nil && !$0.hidden }.flatMap(\.needs).compactMap(\.package))).sorted()
    guard !pkgs.isEmpty else { return "Nothing to set up." }
    let fm = FileManager.default
    guard let base = ["/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3"].first(where: { fm.isExecutableFile(atPath: $0) }) else {
      throw SkillsError("No python3 on this Mac. Install Xcode's command line tools (xcode-select --install) or Homebrew's Python (brew install python), then try again.")
    }
    func run(_ exe: String, _ args: [String]) throws {
      let p = Process()
      p.executableURL = URL(fileURLWithPath: exe)
      p.arguments = args
      p.environment = ["PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin", "HOME": NSHomeDirectory()]
      let pipe = Pipe()
      p.standardOutput = pipe
      p.standardError = pipe
      try p.run()
      let d = pipe.fileHandleForReading.readDataToEndOfFile()
      p.waitUntilExit()
      if p.terminationStatus != 0 {
        let tail = String(decoding: d, as: UTF8.self).split(separator: "\n").suffix(3).joined(separator: " / ")
        throw SkillsError("\((exe as NSString).lastPathComponent) \(args.prefix(3).joined(separator: " ")) failed: \(tail)")
      }
    }
    if !fm.isExecutableFile(atPath: pythonBin.appendingPathComponent("python3").path) {
      progress("Making a Python environment for Ola\u{2019}s skills\u{2026}")
      try run(base, ["-m", "venv", python.path])
    }
    progress("Installing \(State.list(pkgs))\u{2026}")
    try run(pythonBin.appendingPathComponent("python3").path, ["-m", "pip", "install", "--disable-pip-version-check", "--quiet", "--upgrade"] + pkgs)
    let size = (try? fm.subpathsOfDirectory(atPath: python.path))?.reduce(Int64(0)) { a, p in a + Int64((try? fm.attributesOfItem(atPath: python.appendingPathComponent(p).path)[.size] as? Int) ?? 0) } ?? 0
    return "Installed \(State.list(pkgs)) for Ola\u{2019}s skills (\(size / 1_000_000) MB, in \((python.path as NSString).abbreviatingWithTildeInPath))."
  }

  // MARK: the Ola machine's version

  /// The skills the Ola machine installed (`GET /api/device/version`, a signed-in Mac only). nil
  /// when it cannot be known (not signed in, offline, or a server older than that route).
  public static func machineVersion(token: String?, base: URL = AccountAPI.configured) async -> Version? {
    guard let token else { return nil }
    var s = base.absoluteString
    if s.hasSuffix("/") { s.removeLast() }
    guard let url = URL(string: s + "/api/device/version") else { return nil }
    var r = URLRequest(url: url)
    r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    r.timeoutInterval = 15
    guard let (d, res) = try? await AccountAPI.session.data(for: r), (res as? HTTPURLResponse)?.statusCode == 200,
          let j = JSON.parse(d), let h = j["skills"]["hash"].string else { return nil }
    return Version(hash: h, commit: j["skills"]["commit"].string ?? j["commit"].string)
  }

  /// One plain sentence comparing this Mac's skills with the Ola machine's.
  public static func compare(_ mine: Version?, _ machine: Version?) -> String {
    guard let mine else { return "This copy of Ola carries no skills." }
    guard let machine else { return "The Ola machine\u{2019}s skills version is not known from here (sign in to compare, or its server is older than this app)." }
    if machine.hash == mine.hash { return "The same as the Ola machine\u{2019}s." }
    return "Different from the Ola machine\u{2019}s (\(machine.label)): one of the two is newer, so results can differ until both are updated."
  }
}

/// A plain sentence about why the skills' setup did not work.
public struct SkillsError: LocalizedError, Sendable {
  public var message: String
  public init(_ message: String) { self.message = message }
  public var errorDescription: String? { message }
}
#endif
