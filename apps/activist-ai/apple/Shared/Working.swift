import OlaKit
import SwiftUI

// The working figure in the app: on the run line while Ola works (in place of the old lamp dot),
// and larger under the run when nothing new has appeared for a while. WorkingArt draws it.

extension Metrics {
  #if os(macOS)
  static let workingSmall: CGFloat = 26
  #else
  static let workingSmall: CGFloat = 28
  #endif
  static let workingLarge: CGFloat = 120
  /// Nothing new on screen for this long and the figure comes closer.
  static let workingIdle: Double = 20
}

extension WorkingMood {
  init(_ turn: Turn) {
    switch turn.status {
    case .sending, .working: self = turn.steps.contains { $0.status == .waiting } ? .waiting : .working
    case .done: self = .done
    case .failed, .stopped: self = .failed
    }
  }
}

/// When each run's mood changed and its last step arrived, in run seconds, as this app saw it.
@MainActor
final class WorkingBook {
  static let shared = WorkingBook()
  struct Entry { var mood: WorkingMood; var since: Double; var loopOrigin: Double; var previous: WorkingMood?; var beat: Double; var steps: Int }
  var entries: [String: Entry] = [:]

  func scene(_ turn: Turn, at t: Double) -> WorkingScene {
    let seed = M.seed(turn.id)
    let mood = WorkingMood(turn)
    var e = entries[turn.id] ?? Entry(mood: mood, since: mood == .waiting ? t - 30 : t, loopOrigin: t, previous: nil, beat: -100, steps: turn.steps.count)
    if mood != e.mood {
      e.previous = e.mood
      if mood == .working { e.loopOrigin = t }
      e.mood = mood
      e.since = t
    }
    if turn.steps.count > e.steps { e.beat = t }
    e.steps = turn.steps.count
    entries[turn.id] = e
    return WorkingScene(character: .pick(seed: seed), seed: seed, mood: e.mood, since: e.since, loopOrigin: e.loopOrigin, previous: e.previous, beat: e.beat)
  }
}

// Renders set these: the run's clock (no TimelineView) and whether the large figure shows.
private struct WorkingClockKey: EnvironmentKey { static let defaultValue: Double? = nil }
private struct WorkingLargeKey: EnvironmentKey { static let defaultValue: Bool? = nil }
private struct WorkingLargeShownKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
  /// Run seconds, for frame-by-frame renders.
  var workingClock: Double? { get { self[WorkingClockKey.self] } set { self[WorkingClockKey.self] = newValue } }
  /// Forces the large figure on or off (renders).
  var workingLarge: Bool? { get { self[WorkingLargeKey.self] } set { self[WorkingLargeKey.self] = newValue } }
  /// The large figure is on screen, so the small one steps aside (one animation at a time).
  var workingLargeShown: Bool { get { self[WorkingLargeShownKey.self] } set { self[WorkingLargeShownKey.self] = newValue } }
}

/// One frame of a figure.
struct WorkingCanvas: View {
  var scene: WorkingScene
  var t: Double
  var size: CGFloat
  var body: some View {
    Canvas { ctx, _ in WorkingArt.draw(&ctx, size: size, scene: scene, t: t) }
      .frame(width: size, height: size)
  }
}

/// The figure for a run, live: 60 frames a second at most, paused off screen, in the background,
/// and once a wait has settled into its pose. Reduce Motion: the still pose, breathing slowly.
struct WorkingFigure: View {
  var turn: Turn
  var size: CGFloat
  var hidden = false
  @Environment(\.workingClock) private var clock
  @Environment(\.accessibilityReduceMotion) private var reduce
  @Environment(\.scenePhase) private var phase
  @State private var onScreen = true
  @State private var settled = false

  /// Reduce Motion gets the calm version, unless `defaults write cx.ola.mac OlaWorkingMotion full`
  /// (Reduce Motion on for speed, not for comfort).
  var calm: Bool { (Self.probeReduce ?? reduce) && UserDefaults.standard.string(forKey: "OlaWorkingMotion") != "full" }

  var body: some View {
    Group {
      if let clock {
        WorkingCanvas(scene: WorkingBook.shared.scene(turn, at: clock), t: clock, size: size)
      } else if calm {
        // Reduce Motion: the still pose, breathing slowly while it works. Eight steps a second are
        // plenty for a fade this slow, and cost far less than a SwiftUI repeating animation.
        if WorkingMood(turn) == .working && !paused {
          TimelineView(.periodic(from: turn.at, by: 1.0 / 8)) { ctx in
            let x = ctx.date.timeIntervalSince(turn.at)
            WorkingCanvas(scene: calmScene(), t: 0, size: size).opacity(0.75 + 0.25 * cos(2 * .pi * x / 3.2))
          }
        } else {
          WorkingCanvas(scene: calmScene(), t: 0, size: size)
        }
      } else {
        TimelineView(.animation(minimumInterval: 1.0 / 60, paused: paused)) { ctx in
          let t = ctx.date.timeIntervalSince(turn.at)
          WorkingCanvas(scene: WorkingBook.shared.scene(turn, at: t), t: t, size: size)
        }
      }
    }
    .frame(width: size, height: size)
    .opacity(hidden ? 0 : 1)
    .onAppear { onScreen = true }
    .onDisappear { onScreen = false }
    .modifier(VisibleOnScroll(onScreen: $onScreen))
    .task(id: WorkingMood(turn)) {
      // A wait holds still once it has turned to look: no frames needed.
      settled = false
      guard WorkingMood(turn) == .waiting, clock == nil else { return }
      try? await Task.sleep(for: .seconds(WorkingArt.waitSettles))
      if !Task.isCancelled { settled = true }
    }
    .accessibilityHidden(true)
  }

  func calmScene() -> WorkingScene {
    var s = WorkingBook.shared.scene(turn, at: Date().timeIntervalSince(turn.at))
    s.calm = true
    return s
  }

  /// The CPU probe draws in a window no display shows; it counts as on screen there.
  nonisolated(unsafe) static var probeOnScreen = false
  nonisolated(unsafe) static var probeReduce: Bool?

  var paused: Bool {
    #if os(macOS)
    let away = phase == .background
    #else
    let away = phase != .active
    #endif
    return hidden || !(onScreen || Self.probeOnScreen) || away || settled
  }
}

/// Pauses the figure when it is scrolled out of view (where the system can say so).
private struct VisibleOnScroll: ViewModifier {
  @Binding var onScreen: Bool
  func body(content: Content) -> some View {
    if #available(macOS 15.0, iOS 18.0, *) {
      content.onScrollVisibilityChange(threshold: 0.01) { onScreen = $0 }
    } else {
      content
    }
  }
}

/// The run line's leading mark: the figure while Ola works and for its short goodbye, then the
/// chevron. The figure is larger than the mark's column and spills into the margin, so the line's
/// layout is unchanged.
struct RunMark: View {
  var turn: Turn
  var isOpen: Bool
  @Environment(\.workingClock) private var clock
  @Environment(\.workingLargeShown) private var largeShown
  /// When the run ended while this line was on screen (run seconds), for the goodbye.
  @State private var endedAt: Double?

  var runNow: Double { clock ?? Date().timeIntervalSince(turn.at) }

  var body: some View {
    let outro = endedAt.map { runNow - $0 < WorkingArt.outro } ?? false
    ZStack(alignment: .leading) {
      if turn.isRunning || outro {
        Color.clear.frame(width: 7, height: 7)
          .overlay { WorkingFigure(turn: turn, size: Metrics.workingSmall, hidden: largeShown && turn.isRunning).offset(x: -1) }
      } else {
        Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)).foregroundStyle(Ola.ink3).rotationEffect(.degrees(isOpen ? 90 : 0))
          .transition(.opacity)
      }
    }
    .onChange(of: turn.isRunning) { was, now in if was && !now { endedAt = runNow } }
    .task(id: endedAt) {
      guard let endedAt, clock == nil else { return }
      try? await Task.sleep(for: .seconds(max(0, WorkingArt.outro - (runNow - endedAt))))
      withAnimation(.easeOut(duration: 0.2)) { self.endedAt = nil }
    }
  }
}

/// The larger figure under a long quiet run. It comes when nothing new has appeared for a while and
/// tucks back into the run line when a step arrives, the answer starts or Ola asks for a yes.
struct WorkingStage: View {
  var turn: Turn
  var waiting: Bool
  @Binding var shown: Bool
  @Environment(\.workingLarge) private var forced
  @Environment(\.accessibilityReduceMotion) private var reduce

  /// Anything new on screen restarts the wait.
  var activity: String { "\(turn.id) \(turn.steps.count) \(turn.steps.map(\.status.rawValue).joined()) \(turn.answer.count) \(turn.notes.count) \(waiting)" }

  var body: some View {
    let show = forced ?? shown
    ZStack(alignment: .topLeading) {
      if show && turn.isRunning && !waiting {
        WorkingFigure(turn: turn, size: Metrics.workingLarge)
          .padding(.leading, Metrics.youColumn - Space.s).padding(.top, Space.l)
          .transition(reduce ? .opacity : .scale(scale: 0.2, anchor: .topLeading).combined(with: .opacity))
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .animation(reduce ? .easeInOut(duration: 0.3) : .spring(response: 0.45, dampingFraction: 0.72), value: show && turn.isRunning && !waiting)
    .task(id: activity) {
      if shown { shown = false }
      guard turn.isRunning, !waiting, forced == nil else { return }
      try? await Task.sleep(for: .seconds(Metrics.workingIdle))
      if !Task.isCancelled { shown = true }
    }
  }
}
