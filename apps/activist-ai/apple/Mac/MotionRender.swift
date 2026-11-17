import AppKit
import OlaKit
import SwiftUI

/// `Ola -OlaMotion <dir>`: renders the working figures frame by frame at a fixed timestep into PNG
/// folders (tools/motion.sh turns them into MP4s and GIFs), off screen like Snapshot: no window is
/// shown, the app never becomes active. `-OlaOnly <part of a name>` for some.
/// `Ola -OlaMotionCPU <figure> <seconds>`: runs a live figure in a window ordered in far off every
/// display and prints the frames drawn and this process's CPU.
@MainActor
enum MotionRender {
  static func arg(_ name: String, _ n: Int = 1) -> String? {
    let a = CommandLine.arguments
    guard let i = a.firstIndex(of: name), i + n < a.count else { return nil }
    return a[i + n]
  }
  static var outputDirectory: URL? { arg("-OlaMotion").map { URL(fileURLWithPath: $0) } }
  static var cpuRequested: Bool { CommandLine.arguments.contains("-OlaMotionCPU") }

  // MARK: scripted scenes

  enum Cue { case mood(Double, WorkingMood), beat(Double) }

  /// The scene at t for a script, folded the way WorkingBook folds a live run.
  static func scene(_ ch: WorkingCharacter, _ cues: [Cue], specials: [Double]?, kind: Int? = nil, at t: Double) -> WorkingScene {
    var s = WorkingScene(character: ch, seed: 0x5EED_0FA1)
    s.specials = specials ?? []
    s.specialKind = kind
    for c in cues {
      switch c {
      case let .mood(at, m) where at <= t:
        if m != s.mood { s.previous = s.mood; if m == .working { s.loopOrigin = at }; s.mood = m; s.since = at }
      case let .beat(at) where at <= t: s.beat = at
      default: break
      }
    }
    return s
  }

  static func period(_ ch: WorkingCharacter) -> Double {
    switch ch { case .hop: Hop.period; case .swing: Swing.period; case .machine: Machine.bar; case .eyes: Eyes.line }
  }
  static func length(_ ch: WorkingCharacter, _ k: Int) -> Double {
    switch ch { case .hop: Hop.length(k); case .swing: Swing.length(k); case .machine: Machine.length(k); case .eyes: Eyes.length(k) }
  }
  static func kinds(_ ch: WorkingCharacter) -> Int {
    switch ch { case .hop: 2; case .swing: 2; case .machine: 1; case .eyes: 3 }
  }
  static func snap(_ ch: WorkingCharacter, _ t: Double) -> Double { ceil(t / period(ch) - 1e-9) * period(ch) }

  /// Working with a new step, the main special, another new step, a wait, back to work, done.
  static func showcase(_ ch: WorkingCharacter) -> (cues: [Cue], specials: [Double], end: Double) {
    let sp = snap(ch, 3.4), e = sp + length(ch, 0)
    let cues: [Cue] = [.mood(0, .working), .beat(1.8), .beat(e + 0.9), .mood(e + 2.3, .waiting), .mood(e + 5.6, .working), .beat(e + 6.6), .mood(e + 7.8, .done)]
    return (cues, [sp], e + 7.8 + WorkingArt.outro)
  }

  /// Every special one after the other, then a failure.
  static func specialsReel(_ ch: WorkingCharacter) -> (cues: [Cue], specials: [Double], end: Double) {
    var starts: [Double] = [], t = 1.2
    for k in 0..<kinds(ch) { let s = snap(ch, t); starts.append(s); t = s + length(ch, k) + 1.4 }
    let fail = t
    return ([.mood(0, .working), .mood(fail, .failed)], starts, fail + WorkingArt.outro)
  }

  static func label(_ s: WorkingScene, _ t: Double) -> String {
    if s.mood == .working, let sp = s.special(at: t, period: period(s.character), kinds: kinds(s.character), length: { length(s.character, $0) }) { return "special \(sp.kind + 1)" }
    if s.mood == .working && t - s.beat < 0.9 { return "new step" }
    return s.mood.rawValue
  }

  /// One card: the figure large, the run line at its real size under it, and a label.
  struct Card: View {
    var scene: WorkingScene
    var t: Double
    var label: String
    var body: some View {
      VStack(spacing: 0) {
        HStack {
          Text(scene.character.rawValue).font(OlaFont.mono(11, medium: true)).foregroundStyle(Ola.ink2)
          Spacer()
          Text(label).font(OlaFont.mono(11)).foregroundStyle(Ola.ink3)
          Text(String(format: "%5.2f s", t)).font(OlaFont.mono(11)).foregroundStyle(Ola.ink3).monospacedDigit()
        }
        .padding(.horizontal, 16).padding(.top, 12)
        Spacer(minLength: 0)
        WorkingCanvas(scene: scene, t: t, size: 140)
        Spacer(minLength: 0)
        HStack(spacing: Space.s) {
          Color.clear.frame(width: 7, height: 7).overlay { WorkingCanvas(scene: scene, t: t, size: Metrics.workingSmall).offset(x: -1) }
            .frame(width: Metrics.youColumn - Space.s, alignment: .leading)
          Text("Working for \(Int(t)) s \u{00B7} 3 steps").font(OlaFont.sans(Metrics.ui, .medium)).foregroundStyle(Ola.ink2)
          Spacer()
        }
        .padding(.horizontal, 40).padding(.bottom, 18)
      }
      .frame(width: 360, height: 300)
      .background(Ola.paper)
    }
  }

  // MARK: rendering

  final class Recorder {
    let host: NSHostingView<AnyView>
    let window: NSWindow
    let dir: URL
    var n = 0
    init(size: CGSize, appearance: NSAppearance.Name, dir: URL) {
      host = NSHostingView(rootView: AnyView(EmptyView()))
      window = NSWindow(contentRect: NSRect(origin: CGPoint(x: -20_000, y: -20_000), size: size), styleMask: [.borderless], backing: .buffered, defer: false)
      window.appearance = NSAppearance(named: appearance)
      window.contentView = host
      window.isReleasedWhenClosed = false
      window.setFrame(NSRect(origin: CGPoint(x: -20_000, y: -20_000), size: size), display: false)
      self.dir = dir
      try? FileManager.default.removeItem(at: dir)
      try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }
    func frame<V: View>(_ view: V, settle: TimeInterval = 0) {
      host.rootView = AnyView(view)
      RunLoop.main.run(until: Date().addingTimeInterval(settle))
      host.layoutSubtreeIfNeeded()
      guard let rep = host.bitmapImageRepForCachingDisplay(in: host.bounds) else { return }
      host.cacheDisplay(in: host.bounds, to: rep)
      n += 1
      try? rep.representation(using: .png, properties: [:])?.write(to: dir.appendingPathComponent(String(format: "%05d.png", n)))
    }
    func close() { window.close() }
  }

  static func render(_ name: String, _ ch: WorkingCharacter, _ script: (cues: [Cue], specials: [Double], end: Double), kind: Int? = nil, appearance: NSAppearance.Name, fps: Double, into dir: URL) {
    let rec = Recorder(size: CGSize(width: 360, height: 300), appearance: appearance, dir: dir.appendingPathComponent("frames/\(name)"))
    let count = Int(script.end * fps)
    for i in 0..<count {
      let t = Double(i) / fps
      let s = scene(ch, script.cues, specials: script.specials, kind: kind, at: t)
      rec.frame(Card(scene: s, t: t, label: label(s, t)))
    }
    rec.close()
    print("\(name): \(count) frames")
  }

  // MARK: a whole made-up run in the real conversation

  static func runClip(_ ch: WorkingCharacter, appearance: NSAppearance.Name, fps: Double, into dir: URL, name: String) {
    WorkingCharacter.forced = ch
    WorkingBook.shared.entries = [:]
    let base = Fixture.approval
    let old = base.conversations["s1"]!
    let done = old.turns[0]
    let template = old.turns[1].steps[0]
    let approval = old.approval!
    func step(_ id: String, _ tool: String, _ icon: StepIcon, _ verb: String, _ object: String, _ status: Step.Status, _ result: String? = nil) -> Step {
      var s = template
      s.id = id; s.tool = tool; s.icon = icon; s.verb = verb; s.object = object; s.status = status; s.result = result; s.input = ""; s.output = ""
      return s
    }
    let answer = "Done. chart.html shows hours by city as four bars: Fresno 98, Stockton 71, Modesto 64, Merced 40. Open it in a browser to see it."
    var fixture = base
    fixture.conversations["s1"] = Conversation(sessionID: "s1", directory: old.directory, turns: [done], approval: nil)
    let store = OlaStore(fixture: fixture)
    let rec = Recorder(size: CGSize(width: 720, height: 640), appearance: appearance, dir: dir.appendingPathComponent("frames/\(name)"))
    let end = 18.0
    let start = Date()
    for i in 0..<Int(end * fps) {
      let c = Double(i) / fps
      var steps: [Step] = []
      if c >= 1.5 { steps.append(step("a", "read", .read, "Read", "summary.md", c < 2.3 ? .running : .done, c < 2.3 ? nil : "18 lines")) }
      if c >= 2.9 { steps.append(step("b", "bash", .run, "Ran", "python3 check.py", c < 8.8 ? .running : .done, c < 8.8 ? nil : "4 cities")) }
      if c >= 9.4 { steps.append(step("c", "write", .write, "Wrote", "chart.html", c < 12.6 ? .waiting : .done, c < 12.6 ? nil : "24 lines")) }
      let status: Turn.Status = c < 0.5 ? .sending : c < 14.8 ? .working : .done
      let shown = Int(Double(answer.count) * M.seg(c, 13.3, 14.6))
      var turn = Turn(id: "u-run", request: "Now make a small chart of hours by city and save it as chart.html.", at: Date().addingTimeInterval(-c), status: status, steps: steps, answer: String(answer.prefix(shown)))
      if status == .done { turn.ended = Date() }
      let convo = Conversation(sessionID: "s1", directory: old.directory, turns: [done, turn], approval: c >= 9.6 && c < 12.6 ? approval : nil)
      store.previewSet("s1", convo, running: status != .done)
      let large = c >= 4.0 && c < 8.8
      let view = ConversationPane(store: store, draft: .constant(""))
        .environment(\.workingClock, c)
        .environment(\.workingLarge, large)
        .frame(width: 720, height: 640)
        .background(Ola.paper)
      // Real time passes between frames so the app's own SwiftUI animations (the reaction, the
      // approval sliding in, the step rows) play as they do in the app.
      let due = start.addingTimeInterval(c)
      rec.frame(view, settle: max(0.001, due.timeIntervalSinceNow))
    }
    rec.close()
    WorkingCharacter.forced = nil
    print("\(name): \(rec.n) frames")
  }

  static func run(to dir: URL) {
    NSApplication.shared.setActivationPolicy(.prohibited)
    let only = arg("-OlaOnly")
    func want(_ n: String) -> Bool { only == nil || n.contains(only!) }
    for ch in WorkingCharacter.allCases {
      for (mode, ap) in [("light", NSAppearance.Name.aqua), ("dark", .darkAqua)] where want("\(ch.rawValue)-\(mode)") {
        render("\(ch.rawValue)-\(mode)", ch, showcase(ch), appearance: ap, fps: 60, into: dir)
      }
      if want("\(ch.rawValue)-specials") { render("\(ch.rawValue)-specials", ch, specialsReel(ch), appearance: .aqua, fps: 60, into: dir) }
    }
    for ch in WorkingCharacter.allCases where want("run-\(ch.rawValue)") {
      runClip(ch, appearance: .aqua, fps: 30, into: dir, name: "run-\(ch.rawValue)")
    }
    if want("run-dark") { runClip(.hop, appearance: .darkAqua, fps: 30, into: dir, name: "run-dark") }
    exit(0)
  }

  // MARK: CPU

  static func measureCPU() {
    let name = arg("-OlaMotionCPU") ?? "hop"
    let seconds = Double(arg("-OlaMotionCPU", 2) ?? "20") ?? 20
    let big = CommandLine.arguments.contains("-OlaLarge")
    let ch = WorkingCharacter(rawValue: name)
    WorkingCharacter.forced = ch
    WorkingFigure.probeOnScreen = !CommandLine.arguments.contains("-OlaPaused")
    WorkingFigure.probeReduce = CommandLine.arguments.contains("-OlaCalm")
    let turn = Turn(id: "cpu", request: "x", at: Date(), status: .working)
    let view = VStack {
      if name == "plain" {
        // The control: the simplest TimelineView and Canvas at the same size.
        TimelineView(.animation(minimumInterval: 1.0 / 60, paused: false)) { ctx in
          Canvas { g, _ in WorkingArt.drawn &+= 1; g.fill(Path(ellipseIn: CGRect(x: 10 + 20 * sin(ctx.date.timeIntervalSince1970), y: 10, width: 20, height: 20)), with: .color(.orange)) }
        }
        .frame(width: big ? Metrics.workingLarge : Metrics.workingSmall, height: big ? Metrics.workingLarge : Metrics.workingSmall)
      } else if name == "lamp" {
        LampDot()  // the old mark, for comparison
      } else if ch == nil {
        Circle().fill(Ola.lamp).frame(width: 7, height: 7)  // nothing animating: the floor
      } else {
        WorkingFigure(turn: turn, size: big ? Metrics.workingLarge : Metrics.workingSmall)
      }
    }
    .frame(width: 200, height: 200).background(Ola.paper)
    .environment(\.scenePhase, .active)
    let host = NSHostingView(rootView: view)
    let far = CGPoint(x: -30_000, y: -30_000)
    let window = SnapshotWindow(contentRect: NSRect(origin: far, size: CGSize(width: 200, height: 200)), styleMask: [.borderless], backing: .buffered, defer: false)
    window.contentView = host
    window.isReleasedWhenClosed = false
    NSApplication.shared.setActivationPolicy(.accessory)
    window.orderFrontRegardless()
    window.setFrameOrigin(far)
    // On the app's own event loop, as in real use: settle 2 s, then measure.
    CPUProbe.start(name: big ? name + " (large)" : name, character: ch, seconds: seconds, window: window)
    NSApplication.shared.run()
  }
}

@MainActor
final class CPUProbe {
  static var current: CPUProbe?
  let name: String, character: WorkingCharacter?, seconds: Double, window: NSWindow
  var c0 = 0.0, d0 = 0, w0 = Date()
  init(name: String, character: WorkingCharacter?, seconds: Double, window: NSWindow) { self.name = name; self.character = character; self.seconds = seconds; self.window = window }

  static func start(name: String, character: WorkingCharacter?, seconds: Double, window: NSWindow) {
    let p = CPUProbe(name: name, character: character, seconds: seconds, window: window)
    current = p
    Timer.scheduledTimer(withTimeInterval: 2, repeats: false) { _ in MainActor.assumeIsolated { CPUProbe.current?.begin() } }
  }
  static func cpu() -> Double { var u = rusage(); getrusage(RUSAGE_SELF, &u); return Double(u.ru_utime.tv_sec) + Double(u.ru_utime.tv_usec) / 1e6 + Double(u.ru_stime.tv_sec) + Double(u.ru_stime.tv_usec) / 1e6 }

  func begin() {
    c0 = Self.cpu(); d0 = WorkingArt.drawn; w0 = Date()
    Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { _ in MainActor.assumeIsolated { CPUProbe.current?.end() } }
  }

  func end() {
    let wall = Date().timeIntervalSince(w0)
    print(String(format: "%@: %.1f frames/s drawn, CPU %.2f%% of one core over %.0f s", name, Double(WorkingArt.drawn - d0) / wall, (Self.cpu() - c0) / wall * 100, wall))
    // The drawing alone, frame after frame into a bitmap, for the cost per frame.
    if let ch = character {
      let renderer = ImageRenderer(content: WorkingCanvas(scene: WorkingScene(character: ch, seed: 7), t: 0, size: Metrics.workingSmall))
      renderer.scale = 2
      let t0 = Date(), n = 300
      for i in 0..<n {
        renderer.content = WorkingCanvas(scene: WorkingScene(character: ch, seed: 7), t: Double(i) / 60, size: Metrics.workingSmall)
        _ = renderer.cgImage
      }
      print(String(format: "%@: %.0f microseconds to draw one frame off screen (ImageRenderer, 2x)", name, Date().timeIntervalSince(t0) / Double(n) * 1e6))
    }
    window.orderOut(nil)
    exit(0)
  }
}
