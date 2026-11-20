import AppKit
import SwiftUI

/// Light, Dark, or Match this Mac (OLA-207). Bart on 0.1 (16): "the dark-grey on darker-grey mode
/// is obviously a dark mode where i would expect a light mode": the app followed the system, which
/// is Dark on his iMac. Light is the default; the choice is his, not the runtime's (OlaKit/Runtime).
enum AppearanceChoice: String, CaseIterable, Identifiable {
  case light, dark, system
  var id: String { rawValue }
  static let key = "ola.appearance"

  var title: String {
    switch self {
    case .light: "Light"
    case .dark: "Dark"
    case .system: "Match this Mac"
    }
  }

  static func saved(_ d: UserDefaults = .standard) -> AppearanceChoice {
    AppearanceChoice(rawValue: d.string(forKey: key) ?? "") ?? .light
  }

  var appearance: NSAppearance? {
    switch self {
    case .light: NSAppearance(named: .aqua)
    case .dark: NSAppearance(named: .darkAqua)
    case .system: nil
    }
  }

  /// Every window of the app, Settings and pages included.
  @MainActor static func apply(_ c: AppearanceChoice = saved()) {
    NSApplication.shared.appearance = c.appearance
  }
}

/// General, Appearance.
struct AppearanceSettings: View {
  @AppStorage(AppearanceChoice.key) private var choice = AppearanceChoice.light.rawValue
  /// Screenshots draw the setting without changing the app's own appearance.
  var applies = true

  var body: some View {
    // A group of its own with no header: "Appearance" over "Appearance" said it twice.
    Section {
      Picker("Appearance", selection: $choice) {
        ForEach(AppearanceChoice.allCases) { Text($0.title).tag($0.rawValue) }
      }
      .onChange(of: choice) { _, v in if applies { AppearanceChoice.apply(AppearanceChoice(rawValue: v) ?? .light) } }
    }
  }
}
