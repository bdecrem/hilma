import CoreText
import SwiftUI
#if os(macOS)
import AppKit
typealias PlatformColor = NSColor
#else
import UIKit
typealias PlatformColor = UIColor
#endif

// "Paper under the lamp" (ola-brand/app/spec.md). Evening blue is the room: the sessions and the
// machine live there. What you read is paper on the desk. Lamp yellow marks only what is happening
// now. Vermilion asks for you, and is never decoration.

extension Color {
  /// One color for light, one for dark.
  static func ola(_ light: UInt32, _ dark: UInt32) -> Color {
    func c(_ hex: UInt32) -> PlatformColor {
      PlatformColor(red: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: 1)
    }
    #if os(macOS)
    return Color(nsColor: NSColor(name: nil) { $0.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? c(dark) : c(light) })
    #else
    return Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? c(dark) : c(light) })
    #endif
  }
}

enum Ola {
  // The room (navigation).
  static let room = Color.ola(0x25407a, 0x14223f)
  static let roomRaised = Color.ola(0x1f386d, 0x1d3160)
  static let roomRule = Color.ola(0x34508b, 0x24365f)
  static let mist = Color.ola(0xc9d2ea, 0xc3cce4)
  static let dim = Color.ola(0x9fb0d6, 0x8b9cc4)
  static let onRoom = Color.ola(0xf7f0e3, 0xf3ecdf)
  // Paper (reading). At night the paper is lamp-lit: warm, dark, never blue.
  static let paper = Color.ola(0xf7f0e3, 0x1e1c19)
  static let details = Color.ola(0xefe6d3, 0x2a2723)
  static let rule = Color.ola(0xdccfb6, 0x3b372f)
  static let ink = Color.ola(0x141c33, 0xefe7d6)
  static let ink2 = Color.ola(0x4b5268, 0xbfb7a6)
  static let ink3 = Color.ola(0x5c6175, 0x9d9686)
  static let blue = Color.ola(0x25407a, 0xa9bdf0)
  // Signals.
  static let lamp = Color.ola(0xefcf82, 0xefcf82)
  static let lampWash = Color.ola(0xf6e4ae, 0x3f3519)
  static let vermilion = Color(red: 1, green: 0x6a / 255, blue: 0x3d / 255)
  static let vermilionText = Color.ola(0xb93d17, 0xff8a62)
  static let vermilionWash = Color.ola(0xfde0d4, 0x3d2219)
  static let leaf = Color.ola(0x3c7334, 0x8cc47f)
}

/// Bricolage Grotesque for the interface, Literata for what Ola writes, IBM Plex Mono in details.
enum OlaFont {
  static func sans(_ size: CGFloat, _ weight: Weight = .regular) -> Font {
    .custom(weight.sans, size: size)
  }
  static func serif(_ size: CGFloat, _ style: SerifStyle = .regular) -> Font {
    .custom(style.rawValue, size: size)
  }
  static func mono(_ size: CGFloat, medium: Bool = false) -> Font {
    .custom(medium ? "IBMPlexMono-Medium" : "IBMPlexMono-Regular", size: size)
  }

  enum Weight {
    case regular, medium, semibold, display
    var sans: String {
      switch self {
      case .regular: "OlaSans-Regular"
      case .medium: "OlaSans-Medium"
      case .semibold: "OlaSans-Semibold"
      case .display: "OlaSans-Display"
      }
    }
  }

  enum SerifStyle: String {
    case regular = "OlaSerif-Regular"
    case semibold = "OlaSerif-Semibold"
    case heading = "OlaSerif-Heading"
    case italic = "OlaSerif-Italic"
  }

  /// The fonts ship in the app bundle; registered once at launch for this process.
  static func register() {
    let names = ["OlaSans-Regular", "OlaSans-Medium", "OlaSans-Semibold", "OlaSans-Display", "OlaSerif-Regular", "OlaSerif-Semibold", "OlaSerif-Heading", "OlaSerif-Italic", "IBMPlexMono-Regular", "IBMPlexMono-Medium"]
    for n in names {
      guard let url = Bundle.main.url(forResource: n, withExtension: "ttf") else { continue }
      CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
    }
  }
}

/// The type scale. Nothing outside it. On the Mac the interface is the system's own size (13 body,
/// 11 secondary) and only what Ola writes sits a step above, at 15; the phone keeps its larger sizes.
enum Metrics {
  #if os(macOS)
  /// Sheet and empty-state titles (Bricolage display).
  static let title: CGFloat = 20
  /// The approval's question.
  static let heading: CGFloat = 15
  /// What Ola writes (Literata), and what you write to it.
  static let reading: CGFloat = 15
  /// Every control, row and label.
  static let ui: CGFloat = 13
  /// Times, counts, captions, section labels.
  static let meta: CGFloat = 11
  /// Code and command details (IBM Plex Mono).
  static let mono: CGFloat = 12
  #else
  static let title: CGFloat = 24
  static let heading: CGFloat = 18
  static let reading: CGFloat = 16.5
  static let ui: CGFloat = 15.5
  static let meta: CGFloat = 13
  static let mono: CGFloat = 12.5
  #endif
  /// Extra space between lines of reading text, on top of Literata's own (1.49 em): about 1.58 in all.
  static var readingLeading: CGFloat { reading * 0.09 }
}

/// The spacing scale (points). Nothing outside it.
enum Space {
  static let xs: CGFloat = 4
  static let s: CGFloat = 8
  static let m: CGFloat = 12
  static let l: CGFloat = 16
  static let xl: CGFloat = 24
  static let xxl: CGFloat = 32
}

extension Ola {
  /// Hover and pressed fills: on paper a shade of the rule, on the room a lift toward the selection.
  static let paperHover = Color.ola(0xece2cd, 0x2c2925)
  static let paperPressed = Color.ola(0xe3d7be, 0x35312b)
  static let roomHover = Color.ola(0x2b4886, 0x1a2b52)
  /// The composer and text fields: paper a shade lighter than the page.
  static let field = Color.ola(0xfcf8f0, 0x26241f)
  /// The primary button's fill, the room's blue (lifted at night so it reads on dark paper).
  static let action = Color.ola(0x25407a, 0x3a5aa0)
}

/// A fill that answers the pointer: hover, then pressed.
struct HoverFill: ViewModifier {
  var hover: Color
  var radius: CGFloat = 5
  var selected: Color? = nil
  @State private var over = false
  func body(content: Content) -> some View {
    content
      .background(RoundedRectangle(cornerRadius: radius).fill(selected ?? (over ? hover : .clear)))
      .onHover { over = $0 }
  }
}

extension View {
  func hoverFill(_ hover: Color, radius: CGFloat = 5, selected: Color? = nil) -> some View {
    modifier(HoverFill(hover: hover, radius: radius, selected: selected))
  }
}

/// A small text button (Copy, Show details, Open, Dismiss): no box, underlined on hover, dimmed
/// while pressed.
struct LinkButton: ButtonStyle {
  var color: Color = Ola.blue
  var size: CGFloat = Metrics.meta
  var weight: OlaFont.Weight = .medium
  func makeBody(configuration: Configuration) -> some View { LinkLabel(configuration: configuration, color: color, size: size, weight: weight) }
  struct LinkLabel: View {
    var configuration: Configuration
    var color: Color
    var size: CGFloat
    var weight: OlaFont.Weight
    @State private var over = false
    @Environment(\.isEnabled) private var enabled
    var body: some View {
      configuration.label.font(OlaFont.sans(size, weight)).foregroundStyle(color)
        .underline(over && enabled, color: color.opacity(0.5))
        .opacity(!enabled ? 0.45 : configuration.isPressed ? 0.6 : 1)
        .contentShape(Rectangle())
        .onHover { over = $0 }
    }
  }
}

extension Color {
  /// The keyboard focus ring color the system uses (follows the user's accent color).
  static var olaFocus: Color {
    #if os(macOS)
    Color(nsColor: .keyboardFocusIndicatorColor)
    #else
    Color.accentColor
    #endif
  }
}

extension StepIconName {
  static func symbol(_ icon: String) -> String {
    switch icon {
    case "look": "folder"
    case "read": "doc.text"
    case "write": "square.and.pencil"
    case "change": "pencil"
    case "run": "terminal"
    case "check": "checkmark.circle"
    case "search": "magnifyingglass"
    case "think": "list.bullet"
    default: "wrench.adjustable"
    }
  }
}

enum StepIconName {}

/// Short times for the session list: "now", "4:02 PM", "Tue", "Dec 2".
func shortTime(_ d: Date, now: Date = .now) -> String {
  let s = now.timeIntervalSince(d)
  if s < 60 { return "now" }
  let cal = Calendar.current
  if cal.isDate(d, inSameDayAs: now) { return d.formatted(date: .omitted, time: .shortened) }
  if s < 6 * 86_400 { return d.formatted(.dateTime.weekday(.abbreviated)) }
  return d.formatted(.dateTime.month(.abbreviated).day())
}
