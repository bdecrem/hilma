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

/// Reading sizes differ on the phone (spec: 17 on a desktop, 16.5 on a phone).
enum Metrics {
  #if os(macOS)
  static let reading: CGFloat = 16
  static let ui: CGFloat = 13.5
  static let meta: CGFloat = 12
  static let mono: CGFloat = 11.5
  #else
  static let reading: CGFloat = 16.5
  static let ui: CGFloat = 15.5
  static let meta: CGFloat = 13
  static let mono: CGFloat = 12.5
  #endif
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
