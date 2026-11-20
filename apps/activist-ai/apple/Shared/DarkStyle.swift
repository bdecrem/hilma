import Observation
import SwiftUI

/// Two variations on the dark theme beside the standard one (OLA-221, Bart, 2026-11-19: "make me
/// two variations on the dark theme: lighter in the center pane and one more"). Light mode never
/// changes; a dark style replaces only the dark half of every role in the palette, so both apps
/// (they share this file and Theme.swift) get the same values.
/// - `graphite`: the frame (sidebar, toolbar, the room) stays near black and neutral; the page you
///   read is lifted two clear steps above it, a reading surface, separated by hairlines only.
/// - `ink`: Ola's own evening. The letter page's blue (#25407a) is the page, the deeper navy of its
///   buttons' text (#1a2a52) the frame, its cream (#f7f0e3) the text, and its vermilion comma
///   (#ff6a3d) the one accent (site/src/drawing.mjs, palette `b`).
enum DarkStyle: String, CaseIterable, Identifiable {
  case standard, graphite, ink
  var id: String { rawValue }
  static let key = "ola.darkStyle"

  var title: String {
    switch self {
    case .standard: "Standard"
    case .graphite: "Graphite"
    case .ink: "Ink"
    }
  }

  /// One line under the choice.
  var note: String {
    switch self {
    case .standard: "The dark gray of Notes and Mail."
    case .graphite: "A lighter page to read on, in a near-black frame."
    case .ink: "Ola\u{2019}s evening blue, cream text, the vermilion comma."
    }
  }

  static func saved(_ d: UserDefaults = .standard) -> DarkStyle { DarkStyle(rawValue: d.string(forKey: key) ?? "") ?? .standard }

  /// The dark half of every role in this style (nil: the palette's own).
  var tones: DarkTones? {
    switch self {
    case .standard: nil
    case .graphite: .graphite
    case .ink: .ink
    }
  }

  /// Makes this the style in use: every view that reads `Ola` redraws (`ThemeBox` is observed).
  @MainActor func apply(_ d: UserDefaults = .standard) {
    d.set(rawValue, forKey: Self.key)
    ThemeBox.shared.use(self)
  }
}

/// The palette in use, observed: a view that reads any `Ola` color redraws when it changes.
@Observable
final class ThemeBox {
  nonisolated(unsafe) static let shared = ThemeBox()
  var style: DarkStyle = DarkStyle.saved()
  var palette: Palette = Palette.base.darkened(DarkStyle.saved())

  /// A dark style on the base palette (Settings, and the screenshots).
  func use(_ s: DarkStyle, base: Palette = Palette.base) {
    style = s
    palette = base.darkened(s)
  }
}

/// The dark value of each role (sRGB hex). Every pair a person reads was measured
/// (~/Desktop/Ola/dark-themes/contrast.txt, tools/contrast.py): body text at least 7:1 on the page.
struct DarkTones {
  var chrome, chromeHover, chromeSelected, chromeRule, chromeText, chromeText2, chromeText3: UInt32
  var page, margin, code, field, separator, separatorStrong, hover, pressed, text, text2, text3: UInt32
  var accent, onAccent, accentText: UInt32
  var attention, attentionText, attentionWash, running, runningWash, ok: UInt32

  /// Graphite: neutral, a whisker cool. The frame #161618; the page lifted to #2c2c30 (the same step
  /// ChatGPT and Claude put between their two surfaces, in the other direction: here the page is
  /// the lighter one, as Bart asked); text #f0f0f2 on it at 12.4:1. Code sits a step below the
  /// page (an inset), the input a step above it (the lifted thing you type into). The accent is
  /// the Mac's Ola blue, lightened for a darker frame.
  static let graphite = DarkTones(
    chrome: 0x161618, chromeHover: 0x202023, chromeSelected: 0x2b2b2f, chromeRule: 0x252528,
    chromeText: 0xececef, chromeText2: 0xb9b9bf, chromeText3: 0x8a8a91,
    page: 0x2c2c30, margin: 0x28282c, code: 0x232327, field: 0x36363b,
    separator: 0x3a3a3f, separatorStrong: 0x4d4d53, hover: 0x343439, pressed: 0x3c3c41,
    text: 0xf0f0f2, text2: 0xc8c8ce, text3: 0x9d9da4,
    accent: 0x4673c8, onAccent: 0xffffff, accentText: 0xa8c1f0,
    attention: 0xee7a54, attentionText: 0xf5a07f, attentionWash: 0x3e2c26,
    running: 0xe6c47c, runningWash: 0x3a3527, ok: 0x93cf89)

  /// Ink: the letter page. Frame #1a2a52 (its navy), page #25407a (its ground), text #f7f0e3 (its
  /// cream) at 8.8:1, the comma #ff6a3d as the accent and as "Ola needs you" (it is the one color
  /// that asks), lamp #ffd27a (its link color) for what is happening now, its plant green for done.
  static let ink = DarkTones(
    chrome: 0x1a2a52, chromeHover: 0x21335f, chromeSelected: 0x2a3f72, chromeRule: 0x263a68,
    chromeText: 0xf7f0e3, chromeText2: 0xc9d2ea, chromeText3: 0x94a2c8,
    page: 0x25407a, margin: 0x223b72, code: 0x1d3468, field: 0x2d4b88,
    separator: 0x3a5690, separatorStrong: 0x5069a2, hover: 0x2c4985, pressed: 0x33518f,
    text: 0xf7f0e3, text2: 0xdbe1f0, text3: 0xadb9d8,
    accent: 0xff6a3d, onAccent: 0x1a1410, accentText: 0xffa98c,
    attention: 0xff6a3d, attentionText: 0xffa98c, attentionWash: 0x1d3468,
    running: 0xffd27a, runningWash: 0x3c4a6c, ok: 0x93d18a)
}

extension Palette {
  /// The palette the app starts from (the hidden `OlaPalette` default, else the chosen one).
  static var base: Palette { all.first { $0.id == UserDefaults.standard.string(forKey: "OlaPalette") } ?? chosen }

  /// The same palette with a dark style's values in its dark half; light is untouched.
  func darkened(_ s: DarkStyle) -> Palette {
    guard let d = s.tones else { return self }
    var p = self
    p.id = "\(id)-\(s.rawValue)"
    p.chrome.dark = d.chrome; p.chromeHover.dark = d.chromeHover; p.chromeSelected.dark = d.chromeSelected; p.chromeRule.dark = d.chromeRule
    p.chromeText.dark = d.chromeText; p.chromeText2.dark = d.chromeText2; p.chromeText3.dark = d.chromeText3
    p.page.dark = d.page; p.margin.dark = d.margin; p.code.dark = d.code; p.field.dark = d.field
    p.separator.dark = d.separator; p.separatorStrong.dark = d.separatorStrong; p.hover.dark = d.hover; p.pressed.dark = d.pressed
    p.text.dark = d.text; p.text2.dark = d.text2; p.text3.dark = d.text3
    p.accent.dark = d.accent; p.onAccent.dark = d.onAccent; p.accentText.dark = d.accentText
    p.attention.dark = d.attention; p.attentionText.dark = d.attentionText; p.attentionWash.dark = d.attentionWash
    p.running.dark = d.running; p.runningWash.dark = d.runningWash; p.ok.dark = d.ok
    return p
  }
}
