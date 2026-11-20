import CoreText
import SwiftUI
#if os(macOS)
import AppKit
typealias PlatformColor = NSColor
#else
import UIKit
typealias PlatformColor = UIColor
#endif

// "Paper under the lamp" (ola-brand/app/spec.md). The frame is the room in shadow: the sessions and
// the machine live there. What you read is paper on the desk, one tone lifted. Lamp yellow marks only
// what is happening now. Vermilion asks for you, and is never decoration.

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

/// One role's value: its light and its dark hex. A dark style (DarkStyle.swift) replaces `dark`.
struct Tone: Equatable {
  var light: UInt32
  var dark: UInt32
  static func ola(_ light: UInt32, _ dark: UInt32) -> Tone { Tone(light: light, dark: dark) }
  var color: Color { .ola(light, dark) }
}

/// The palette (design pass two, 2026-11-16). Tone does the work, not hue: a small warm ramp per
/// mode (the frame around the work, the page you read, hairlines, three levels of text), one accent,
/// and one color that means "Ola needs you". Each value is named by its role. Three palettes were
/// drawn side by side (apple-shots/polish-2/palettes.png); the chosen one is the default and the
/// other two can be shown without a rebuild: `defaults write cx.ola.mac OlaPalette A|B|C`
/// (on the phone, the same key in cx.ola.mac).
struct Palette {
  var id: String
  // The frame: sidebar, title bar, the room around the page. One tonal step from the page.
  var chrome: Tone
  var chromeHover: Tone
  var chromeSelected: Tone
  var chromeRule: Tone
  var chromeText: Tone
  var chromeText2: Tone
  var chromeText3: Tone
  // The page: what you read, and the files beside it.
  var page: Tone
  var margin: Tone
  var code: Tone
  var field: Tone
  var separator: Tone
  var separatorStrong: Tone
  var hover: Tone
  var pressed: Tone
  var text: Tone
  var text2: Tone
  var text3: Tone
  // The one accent: the primary button, links, step icons.
  var accent: Tone
  var onAccent: Tone
  var accentText: Tone
  // Signals.
  var attention: Tone
  var attentionText: Tone
  var attentionWash: Tone
  var running: Tone
  var runningWash: Tone
  var ok: Tone

  /// The warm ramp all three share (light, dark).
  static func base(id: String) -> Palette {
    Palette(
      id: id,
      chrome: .ola(0xebe6dd, 0x1b1a18), chromeHover: .ola(0xe3ddd3, 0x242220), chromeSelected: .ola(0xdcd5c8, 0x2e2c29),
      chromeRule: .ola(0xddd6ca, 0x2a2825), chromeText: .ola(0x1d1b18, 0xeee9e0), chromeText2: .ola(0x3b3732, 0xc7c0b5), chromeText3: .ola(0x69635a, 0x8f887d),
      page: .ola(0xfbf8f2, 0x252320), margin: .ola(0xf4f0e8, 0x201e1c), code: .ola(0xf1ece2, 0x2f2c28), field: .ola(0xfffdf9, 0x2b2926),
      separator: .ola(0xe6e0d5, 0x33302c), separatorStrong: .ola(0xd3cbbd, 0x46423c),
      hover: .ola(0xf0ebe2, 0x2c2a26), pressed: .ola(0xe7e1d6, 0x34312d),
      text: .ola(0x1d1b18, 0xf2ede4), text2: .ola(0x4d4841, 0xc6bfb3), text3: .ola(0x6b655c, 0x978f83),
      accent: .ola(0x2b2824, 0xebe5da), onAccent: .ola(0xfbf8f2, 0x1d1b18), accentText: .ola(0x2b2824, 0xebe5da),
      attention: .ola(0xd2532c, 0xe5734d), attentionText: .ola(0xad4220, 0xf09572), attentionWash: .ola(0xf8e9e1, 0x35271f),
      running: .ola(0xd9a940, 0xe3c278), runningWash: .ola(0xf6eccf, 0x332d1f), ok: .ola(0x3f7a3a, 0x92c585))
  }

  /// A: ink and paper. Warm monochrome; the accent is the ink itself.
  static let ink = base(id: "A")

  /// B: the same paper, with the brand's evening blue kept as the accent only, never a surface.
  static let blueInk: Palette = {
    var p = base(id: "B")
    p.accent = .ola(0x2f5597, 0x4369ad); p.onAccent = .ola(0xffffff, 0xffffff); p.accentText = .ola(0x2c5194, 0x98b4e6)
    p.chromeSelected = .ola(0xdcdee3, 0x2b2e34)
    return p
  }()

  /// C: dusk. The frame takes a trace of the evening blue at low chroma (slate), the page stays
  /// warm, the accent is the blue.
  static let dusk: Palette = {
    var p = blueInk
    p.id = "C"
    p.chrome = .ola(0xe5e7eb, 0x181b20); p.chromeHover = .ola(0xdcdfe5, 0x20242a); p.chromeSelected = .ola(0xd4d9e1, 0x2a3039)
    p.chromeRule = .ola(0xd5d9e0, 0x262a31); p.chromeText = .ola(0x1b1e24, 0xe8eaee); p.chromeText2 = .ola(0x363b44, 0xbcc2cc); p.chromeText3 = .ola(0x5f6673, 0x868d99)
    return p
  }()

  /// N: the Mac's own (OLA-207, 2026-11-19). Bart on 0.1 (16): "something kinda of big or square
  /// ... and the dark-grey on darker-grey mode is obviously a dark mode where i would expect a light
  /// mode". The Mac now looks like the Mac: a white page in light (the near-black #1e1e1e of Notes
  /// and Mail in dark), neutral grays where the warm ramp was, text at the system's label contrast
  /// (#1d1d1f on white, 16.8:1; #f2f2f4 on #1e1e1e, 15.6:1), and the brand's blue as the accent.
  /// The sidebar and toolbar are the system's own (their values here only draw the screenshots).
  static let native: Palette = {
    var p = blueInk
    p.id = "N"
    p.chrome = .ola(0xe9e9eb, 0x2a2a2c); p.chromeHover = .ola(0xdedee1, 0x353538); p.chromeSelected = .ola(0xd5d5d9, 0x3d3d41)
    p.chromeRule = .ola(0xd6d6d9, 0x3a3a3d); p.chromeText = .ola(0x1d1d1f, 0xf2f2f4); p.chromeText2 = .ola(0x3c3c41, 0xd1d1d6); p.chromeText3 = .ola(0x6e6e73, 0x98989d)
    p.page = .ola(0xffffff, 0x1e1e1e); p.margin = .ola(0xfbfbfc, 0x232325); p.code = .ola(0xf4f4f6, 0x2a2a2d); p.field = .ola(0xffffff, 0x262628)
    p.separator = .ola(0xe5e5e8, 0x343437); p.separatorStrong = .ola(0xcfcfd4, 0x4a4a4e)
    p.hover = .ola(0xf2f2f4, 0x2c2c2f); p.pressed = .ola(0xe8e8eb, 0x343437)
    p.text = .ola(0x1d1d1f, 0xf2f2f4); p.text2 = .ola(0x48484d, 0xc7c7cc); p.text3 = .ola(0x6e6e73, 0x98989d)
    p.accent = .ola(0x2f5597, 0x4a72b8); p.accentText = .ola(0x2c5194, 0x9db8e8)
    p.attentionWash = .ola(0xfcefe9, 0x3a2620); p.runningWash = .ola(0xfaf3dc, 0x353020)
    return p
  }()

  /// The same on the Mac and the phone (OLA-222, Bart: "have the styles on the iphone app match
  /// the macos app"): the native palette, its dark styles from DarkStyle.swift.
  static let all = [native, ink, blueInk, dusk]
  static let chosen = native
  /// The one in use: the hidden default `OlaPalette`, else the chosen one, in the dark style chosen
  /// in Settings (OLA-221). Observed, so changing it redraws every view that reads `Ola`.
  static var current: Palette {
    get { ThemeBox.shared.palette }
    set { ThemeBox.shared.palette = newValue }
  }
}

/// The roles under the names the views use. The old names (room, paper, ink, vermilion) stay so
/// the views read the same; their values come from the palette.
enum Ola {
  static var p: Palette { Palette.current }
  // The frame.
  static var room: Color { p.chrome.color }
  static var roomRaised: Color { p.chromeSelected.color }
  static var roomHover: Color { p.chromeHover.color }
  static var roomRule: Color { p.chromeRule.color }
  static var onRoom: Color { p.chromeText.color }
  static var mist: Color { p.chromeText2.color }
  static var dim: Color { p.chromeText3.color }
  // The page.
  static var paper: Color { p.page.color }
  static var details: Color { p.code.color }
  static var margin: Color { p.margin.color }
  static var field: Color { p.field.color }
  static var rule: Color { p.separator.color }
  static var ruleStrong: Color { p.separatorStrong.color }
  static var paperHover: Color { p.hover.color }
  static var paperPressed: Color { p.pressed.color }
  static var ink: Color { p.text.color }
  static var ink2: Color { p.text2.color }
  static var ink3: Color { p.text3.color }
  // The accent.
  static var action: Color { p.accent.color }
  static var onAction: Color { p.onAccent.color }
  static var blue: Color { p.accentText.color }
  // Signals.
  static var lamp: Color { p.running.color }
  static var lampWash: Color { p.runningWash.color }
  static var vermilion: Color { p.attention.color }
  static var vermilionText: Color { p.attentionText.color }
  static var vermilionWash: Color { p.attentionWash.color }
  static var leaf: Color { p.ok.color }
}

/// Bricolage Grotesque for the interface, Literata for what Ola writes, IBM Plex Mono in details.
///
/// One family: the system's (OLA-207 on the Mac, OLA-222 on the phone). Notes, Mail and ChatGPT set
/// the interface and what you read in San Francisco; Bricolage beside Literata beside a system
/// sidebar and menus read as three voices at once, and both run large for their point size
/// (Bricolage's x-height; Literata at 15 looked like 17). On the phone every size follows the
/// person's Dynamic Type setting (`scaled`), from the iOS default sizes in `Metrics`.
enum OlaFont {
  /// A size as the person's text size setting makes it (the phone; the Mac's are fixed, as the
  /// Mac's own apps are).
  static func scaled(_ size: CGFloat) -> CGFloat {
    #if os(macOS)
    size
    #else
    UIFontMetrics.default.scaledValue(for: size)
    #endif
  }
  static func sans(_ size: CGFloat, _ weight: Weight = .regular) -> Font {
    .system(size: scaled(size), weight: weight.system)
  }
  static func serif(_ size: CGFloat, _ style: SerifStyle = .regular) -> Font {
    switch style {
    case .regular: .system(size: scaled(size))
    case .semibold: .system(size: scaled(size), weight: .semibold)
    case .heading: .system(size: scaled(size), weight: .bold)
    case .italic: .system(size: scaled(size)).italic()
    }
  }
  static func mono(_ size: CGFloat, medium: Bool = false) -> Font {
    .system(size: scaled(size), weight: medium ? .medium : .regular, design: .monospaced)
  }

  enum Weight {
    case regular, medium, semibold, display
    var system: Font.Weight {
      switch self {
      case .regular: .regular
      case .medium: .medium
      case .semibold: .semibold
      case .display: .bold
      }
    }
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
  /// Sheet and empty-state titles.
  static let title: CGFloat = 17
  /// The approval's question.
  static let heading: CGFloat = 14
  /// What Ola writes, and what you write to it: one step above the interface, as Mail sets a
  /// message (OLA-207: 15-point Literata read as 17).
  static let reading: CGFloat = 14
  /// Every control, row and label.
  static let ui: CGFloat = 13
  /// Times, counts, captions, section labels.
  static let meta: CGFloat = 11
  /// Code and command details (IBM Plex Mono).
  static let mono: CGFloat = 12
  #else
  // The Mac's scale on iOS's own default sizes (OLA-222), never below them: what Ola writes at
  // Body (17), every control and row at Callout (16), one step under it as on the Mac; times and
  // captions at Footnote (13); titles at Title 2 (22); the approval's question at Headline (17);
  // code at Subheadline (15), the Mac's 12 to 14. All of them follow Dynamic Type.
  static let title: CGFloat = 22
  static let heading: CGFloat = 17
  static let reading: CGFloat = 17
  static let ui: CGFloat = 16
  static let meta: CGFloat = 13
  static let mono: CGFloat = 15
  #endif
  /// Extra space between lines of reading text: San Francisco's own line is about 1.19 em, about
  /// 1.45 in all, on both.
  static var readingLeading: CGFloat { OlaFont.scaled(reading) * 0.26 }
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
