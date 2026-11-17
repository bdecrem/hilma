import OlaKit
import SwiftUI

/// Ola's skills in Settings: the version this app carries, whether the Ola machine's is the same,
/// and what each skill needs here, with one button for the Python libraries.
@MainActor
@Observable
final class SkillsInfo {
  var version: OlaSkills.Version?
  var states: [OlaSkills.State] = []
  var machine = "Checking the Ola machine\u{2026}"
  var busy: String?
  var result: String?
  private let preview: Bool

  init() { preview = false }

  /// Screenshots: made-up states, no files, no network.
  init(preview version: OlaSkills.Version?, states: [OlaSkills.State], machine: String) {
    preview = true
    self.version = version
    self.states = states
    self.machine = machine
  }

  var needsPython: Bool { states.contains { s in s.skill.notOnMac == nil && s.missing.contains { if case .python = $0 { return true } else { return false } } } }

  func refresh() async {
    guard !preview else { return }
    let (v, s) = await Task.detached { OlaSkills.current() }.value
    version = v
    states = s
    let m = await OlaSkills.machineVersion(token: AccountKeeper.session?.token)
    machine = OlaSkills.compare(v, m)
  }

  func setUpPython() async {
    busy = "Getting the Python libraries\u{2026}"
    result = nil
    do {
      let line = try await OlaSkills.setUpPython(progress: { s in Task { @MainActor in self.busy = s } })
      result = line + " Ola uses them from its next start."
    } catch {
      result = (error as? LocalizedError)?.errorDescription ?? "The Python libraries didn\u{2019}t install."
    }
    busy = nil
    await refresh()
  }
}

struct SkillsSettings: View {
  var info: SkillsInfo

  /// A placeholder the model must not load is not a skill to show.
  var shown: [OlaSkills.State] { info.states.filter { !$0.skill.hidden } }

  var body: some View {
    SettingsGroup(title: "Ola\u{2019}s skills") {
      LabeledContent("Version") {
        Text(info.version?.label ?? "None in this copy of Ola").foregroundStyle(.secondary).textSelection(.enabled).monospacedDigit()
      }
      LabeledContent("Ola machine") {
        StatusLine(kind: info.machine.hasPrefix("The same") ? .ok : info.machine.hasPrefix("Different") ? .problem : .off, text: Self.short(info.machine))
          .help(info.machine)
      }
    }
    SettingsGroup(title: "On this Mac") {
      ForEach(shown, id: \.skill.name) { s in
        LabeledContent(s.skill.name) { StatusLine(kind: Self.kind(s), text: Self.state(s)).help(s.line) }
      }
      if let busy = info.busy {
        StatusLine(kind: .busy, text: busy)
      } else if info.needsPython {
        HStack {
          SettingNote("About 150 MB, in Ola\u{2019}s own folder.")
          Spacer()
          Button("Get Python Libraries") { Task { await info.setUpPython() } }
        }
      }
      if let r = info.result { SettingNote(r) }
    }
    .task { await info.refresh() }
  }

  static func kind(_ s: OlaSkills.State) -> StatusLine.Kind { s.ready ? .ok : s.skill.notOnMac != nil ? .off : .problem }

  /// Two or three words: Ready, Needs Python libraries, Needs poppler, Not on a Mac.
  static func state(_ s: OlaSkills.State) -> String {
    if s.skill.notOnMac != nil { return "Not on a Mac" }
    if s.missing.isEmpty { return "Ready" }
    var parts: [String] = []
    if s.missing.contains(where: { $0.package != nil }) { parts.append("Python libraries") }
    for m in s.missing where m.package == nil {
      let w: String
      switch m {
      case .command("pdfinfo"), .command("pdftotext"): w = "poppler"
      case .command("ola-page"): w = "the Ola app open"
      case .command(let c): w = c
      default: continue
      }
      if !parts.contains(w) { parts.append(w) }
    }
    return "Needs " + parts.joined(separator: " and ")
  }

  /// The machine's comparison in a few words (the whole sentence is the tooltip).
  static func short(_ s: String) -> String {
    if s.hasPrefix("The same") { return "The same version" }
    if s.hasPrefix("Different") { return "A different version" }
    if s.hasPrefix("Checking") { return "Checking" }
    return "Not known"
  }
}
