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

  var body: some View {
    SettingsGroup(title: "Ola\u{2019}s skills") {
      LabeledContent("Version") {
        Text(info.version?.label ?? "None in this copy of Ola").foregroundStyle(.secondary).textSelection(.enabled).monospacedDigit()
      }
      StatusLine(kind: info.machine.hasPrefix("The same") ? .ok : info.machine.hasPrefix("Different") ? .problem : .off, text: info.machine)
      ForEach(info.states, id: \.skill.name) { s in
        StatusLine(kind: s.ready ? .ok : s.skill.notOnMac != nil || s.skill.hidden ? .off : .problem, text: s.line)
      }
      if let busy = info.busy {
        StatusLine(kind: .busy, text: busy)
      } else if info.needsPython {
        HStack {
          SettingNote("The Python libraries go in Ola\u{2019}s own folder (Application Support), about 150 MB.")
          Spacer()
          Button("Get Python Libraries") { Task { await info.setUpPython() } }
        }
      }
      if let r = info.result { SettingNote(r) }
    }
    .task { await info.refresh() }
  }
}
