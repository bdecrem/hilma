import OlaKit
import SwiftUI

// "Hop, skip" (OLA-225): Ola's one working indicator, on both apps. A coral ball hops across three
// faint dots, left, middle, right, middle, left; it squashes as it lands and the dot it lands on
// flashes coral. The spec is misc/ola-working-hop.zip (README and ola-hop.css); MOTION.md has the
// numbers. Drawn in a 240 by 120 box at 2:1: 48 by 24 on the run line, 32 by 16 in the session list.

extension Metrics {
  /// Beside "Working for 1 min 12 s · 3 steps".
  static let hopLine: CGFloat = 48
  /// Beside a running session in the sidebar or the session list.
  static let hopList: CGFloat = 32
}

/// The motion as numbers: every frame is a pure function of the time since the loop began, so a
/// render at a fixed time matches the CSS version frame for frame.
enum HopMotion {
  static let hop = 0.4
  static let loop = 1.6
  static let dots: [Double] = [90, 120, 150]
  static let dotY = 94.0, dotR = 6.0, ballR = 8.0, restY = 78.0, rise = 26.0
  /// Where each of the four hops starts and lands.
  static let path: [Double] = [90, 120, 150, 120, 90]
  static let coral = Color(red: 0xE8 / 255, green: 0x70 / 255, blue: 0x4A / 255)

  struct Frame: Equatable {
    /// The ball's center, in the box.
    var x: Double, y: Double
    /// Squash, anchored at the ball's bottom.
    var sx: Double, sy: Double
    /// How coral each dot is, 0 to 1.
    var lit: [Double]
  }

  /// Reduce Motion: the middle dot lit, the ball at rest where the loop starts (as the CSS shows it).
  static let still = Frame(x: 90, y: restY, sx: 1, sy: 1, lit: [0, 1, 0])

  /// The flash of each dot over the loop (ola-hop.css, @keyframes ola-lit-1..3; linear between keys).
  static let litKeys: [[(Double, Double)]] = [
    [(0, 1), (0.08, 0), (0.92, 0), (1, 1)],
    [(0, 0), (0.19, 0), (0.25, 1), (0.33, 0), (0.67, 0), (0.75, 1), (0.83, 0), (1, 0)],
    [(0, 0), (0.44, 0), (0.5, 1), (0.58, 0), (1, 0)],
  ]

  static func frame(_ t: Double) -> Frame {
    let t = max(0, t)
    let p = t.truncatingRemainder(dividingBy: loop) / loop
    let i = min(3, Int(p * 4))
    let u = p * 4 - Double(i)
    // Across at constant speed.
    let x = path[i] + (path[i + 1] - path[i]) * u
    // Up and down like gravity: easing into the top, speeding into the landing.
    let lift = u < 0.5
      ? rise * bezier(u / 0.5, 0.33, 0.66, 0.66, 1)
      : rise * (1 - bezier((u - 0.5) / 0.5, 0.33, 0, 0.66, 0.33))
    // Squashed at each landing, round again within the first and last 12 % of the hop.
    let s = u < 0.12 ? 1 - u / 0.12 : u > 0.88 ? (u - 0.88) / 0.12 : 0
    return Frame(x: x, y: restY - lift, sx: 1 + 0.3 * s, sy: 1 - 0.3 * s, lit: litKeys.map { keys(p, $0) })
  }

  /// Seconds until the hop in the air lands (0 on a landing), for stopping at the end of a hop.
  static func toLanding(_ t: Double) -> Double {
    let r = t.truncatingRemainder(dividingBy: hop)
    return r < 1e-6 ? 0 : hop - r
  }

  /// CSS's cubic-bezier(x1, y1, x2, y2) at progress x.
  static func bezier(_ x: Double, _ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double) -> Double {
    func b(_ s: Double, _ a: Double, _ c: Double) -> Double { 3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * c + s * s * s }
    let x = min(1, max(0, x))
    var lo = 0.0, hi = 1.0, s = x
    for _ in 0..<40 {
      let v = b(s, x1, x2)
      if abs(v - x) < 1e-7 { break }
      if v < x { lo = s } else { hi = s }
      s = (lo + hi) / 2
    }
    return b(s, y1, y2)
  }

  static func keys(_ p: Double, _ k: [(Double, Double)]) -> Double {
    for j in 0..<(k.count - 1) where p <= k[j + 1].0 {
      let w = k[j + 1].0 - k[j].0
      return w <= 0 ? k[j + 1].1 : k[j].1 + (k[j + 1].1 - k[j].1) * (p - k[j].0) / w
    }
    return k[k.count - 1].1
  }

  /// One frame into a box of any 2:1 size.
  static func draw(_ ctx: inout GraphicsContext, size: CGSize, frame f: Frame, dot: Color) {
    let k = size.width / 240
    func circle(_ cx: Double, _ cy: Double, _ r: Double) -> Path { Path(ellipseIn: CGRect(x: (cx - r) * k, y: (cy - r) * k, width: 2 * r * k, height: 2 * r * k)) }
    for (i, x) in dots.enumerated() {
      let c = circle(x, dotY, dotR)
      ctx.fill(c, with: .color(dot))
      if f.lit[i] > 0.001 { ctx.fill(c, with: .color(coral.opacity(f.lit[i]))) }
    }
    let w = 2 * ballR * f.sx, h = 2 * ballR * f.sy, bottom = f.y + ballR
    ctx.fill(Path(ellipseIn: CGRect(x: (f.x - w / 2) * k, y: (bottom - h) * k, width: w * k, height: h * k)), with: .color(coral))
  }
}

// Renders set these.
private struct HopClockKey: EnvironmentKey { static let defaultValue: Double? = nil }
private struct HopStillKey: EnvironmentKey { static let defaultValue = false }
private struct HopOriginKey: EnvironmentKey { static let defaultValue: Date? = nil }
extension EnvironmentValues {
  /// A fixed time into the loop, for frame-by-frame renders (no TimelineView).
  var hopClock: Double? { get { self[HopClockKey.self] } set { self[HopClockKey.self] = newValue } }
  /// Draw the Reduce Motion frame (renders).
  var hopStill: Bool { get { self[HopStillKey.self] } set { self[HopStillKey.self] = newValue } }
  /// When the loop began, set by `Hopping` so it knows where the hop in the air lands.
  var hopOrigin: Date? { get { self[HopOriginKey.self] } set { self[HopOriginKey.self] = newValue } }
}

/// The indicator, live: up to 60 frames a second, paused off screen and in the background; a still
/// frame with Reduce Motion. `label` is what VoiceOver says (once: the element never changes); nil
/// where the words beside it already say Ola is working.
struct OlaHop: View {
  var width: CGFloat = Metrics.hopLine
  var label: String? = "Working"
  @Environment(\.hopClock) private var clock
  @Environment(\.hopStill) private var still
  @Environment(\.hopOrigin) private var origin
  @Environment(\.accessibilityReduceMotion) private var reduce
  @Environment(\.colorScheme) private var scheme
  @Environment(\.scenePhase) private var phase
  @State private var appeared = Date()
  /// Checks that must see the motion on a Mac with Reduce Motion on (Snapshot.hopStop).
  nonisolated(unsafe) static var probeMotion = false
  @State private var onScreen = true

  /// The dots: navy at 25 % on light; on dark, the spec's cream at 40 %, or in Graphite and Ink the
  /// style's own text color at 40 % (Ink's cream, Graphite's near white). The ball stays coral.
  var dot: Color {
    if scheme != .dark { return Color(red: 0x2B / 255, green: 0x3A / 255, blue: 0x6E / 255).opacity(0.25) }
    if ThemeBox.shared.style == .standard { return Color(red: 0xF5 / 255, green: 0xEF / 255, blue: 0xE4 / 255).opacity(0.4) }
    let v = ThemeBox.shared.palette.text.dark
    return Color(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255).opacity(0.4)
  }

  var paused: Bool {
    #if os(macOS)
    let away = phase == .background
    #else
    let away = phase != .active
    #endif
    return !onScreen || away
  }

  var body: some View {
    let dot = dot
    let size = CGSize(width: width, height: width / 2)
    Group {
      if let clock {
        canvas(HopMotion.frame(clock), dot, size)
      } else if still || (reduce && !Self.probeMotion) {
        canvas(HopMotion.still, dot, size)
      } else {
        TimelineView(.animation(minimumInterval: 1.0 / 60, paused: paused)) { ctx in
          canvas(HopMotion.frame(ctx.date.timeIntervalSince(origin ?? appeared)), dot, size)
        }
      }
    }
    .frame(width: size.width, height: size.height)
    .onAppear { onScreen = true }
    .onDisappear { onScreen = false }
    .modifier(VisibleOnScroll(onScreen: $onScreen))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(label ?? "")
    .accessibilityHidden(label == nil)
  }

  func canvas(_ f: HopMotion.Frame, _ dot: Color, _ size: CGSize) -> some View {
    Canvas { ctx, _ in HopMotion.draw(&ctx, size: size, frame: f, dot: dot) }
  }
}

/// Keeps the hop going after the work ends until the hop in the air lands (never cut off mid-air),
/// then hands `hopping == false` to the content. With Reduce Motion it stops at once.
struct Hopping<Content: View>: View {
  var running: Bool
  @ViewBuilder var content: (_ hopping: Bool) -> Content
  @Environment(\.hopClock) private var clock
  @Environment(\.accessibilityReduceMotion) private var reduce
  @State private var origin: Date?
  @State private var landing: Date?

  var body: some View {
    content(running || landing != nil)
      .environment(\.hopOrigin, origin)
      .onAppear { if running, origin == nil { origin = Date() } }
      .onChange(of: running) { was, now in
        if now {
          landing = nil
          if origin == nil { origin = Date() }
        } else if was, clock == nil, !reduce || OlaHop.probeMotion, let origin {
          let left = HopMotion.toLanding(Date().timeIntervalSince(origin))
          if left > 0 { landing = Date().addingTimeInterval(left) } else { self.origin = nil }
        } else {
          origin = nil
        }
      }
      .task(id: landing) {
        guard let landing else { return }
        try? await Task.sleep(for: .seconds(max(0, landing.timeIntervalSinceNow)))
        if !Task.isCancelled, !running {
          self.landing = nil
          origin = nil
        }
      }
  }
}

/// Pauses the hop when it is scrolled out of view (where the system can say so).
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

/// The run line's leading mark: the hop while Ola works (finishing the hop in the air when it
/// stops), then the chevron. The hop is wider than the mark's column and spills into the margin,
/// so the line's layout is unchanged.
struct RunMark: View {
  var turn: Turn
  var isOpen: Bool

  var body: some View {
    Hopping(running: turn.isRunning) { hopping in
      ZStack(alignment: .leading) {
        if hopping {
          // The motion fills y 44..100 of the 120 box: lifted 2.4 pt so it centers on the line.
          Color.clear.frame(width: 7, height: 7)
            .overlay { OlaHop(width: Metrics.hopLine, label: nil).offset(y: -2.4) }
        } else {
          Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)).foregroundStyle(Ola.ink3).rotationEffect(.degrees(isOpen ? 90 : 0))
            .transition(.opacity)
        }
      }
    }
  }
}

/// The mark beside a running session in a list: the hop at 32 by 16 over a 10 by 8 slot.
struct ListHop: View {
  var label: String? = "Working"
  var body: some View {
    Color.clear.frame(width: 10, height: 8)
      .overlay { OlaHop(width: Metrics.hopList, label: label).offset(y: -1.6) }
  }
}
