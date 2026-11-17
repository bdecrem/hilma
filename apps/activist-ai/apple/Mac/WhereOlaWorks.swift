import AppKit
import OlaKit
import SwiftUI

/// "Where Ola works", one setting for the whole app:
/// - On the Ola machine (the default): the agent and the files are on the machine; the phone follows.
/// - On this Mac: the agent runs here in a folder Bart picks (the Claude Code arrangement); only
///   the model requests go to the machine. The app starts and stops that local server itself.
@MainActor
@Observable
final class WhereOlaWorks {
  let store: OlaStore
  private(set) var local: LocalServer?
  var problem: String?
  var starting = false

  init(store: OlaStore) { self.store = store }

  /// At launch and after every change of the setting.
  func apply() async {
    problem = nil
    guard LocalSettings.onThisMac else {
      local?.stop()
      local = nil
      if store.config?.url.host() == "127.0.0.1" { store.attach(nil) }
      return
    }
    guard let folder = LocalSettings.folder else { problem = "Choose the folder Ola should work in."; return }
    guard let token = LocalSettings.token, !token.isEmpty else { problem = "Add the model token (on the machine: ola-bart.sh model-token)."; return }
    starting = true
    defer { starting = false }
    let server = LocalServer(folder: folder)
    do {
      local?.stop()
      let config = try await server.start(modelToken: token)
      local = server
      store.attach(config)
    } catch {
      problem = error.localizedDescription
    }
  }

  func stop() { local?.stop() }
}

struct WhereSettings: View {
  var controller: WhereOlaWorks
  @AppStorage(LocalSettings.modeKey) private var mode = "machine"
  @AppStorage(LocalSettings.folderKey) private var folder = ""
  @State private var token = ""
  @State private var tokenSaved = LocalSettings.token != nil

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Picker("Where Ola works", selection: $mode) {
        Text("On the Ola machine: the agent and the files are there, and the phone can follow").tag("machine")
        Text("On this Mac: the agent works in a folder here; only the model is on the machine").tag("mac")
      }
      .pickerStyle(.radioGroup)
      .onChange(of: mode) { _, _ in Task { await controller.apply() } }
      if mode == "mac" {
        HStack {
          Text(folder.isEmpty ? "No folder chosen" : (folder as NSString).abbreviatingWithTildeInPath).foregroundStyle(folder.isEmpty ? .secondary : .primary)
          Spacer()
          Button("Choose Folder\u{2026}") { choose() }
        }
        HStack {
          SecureField(tokenSaved ? "Model token saved in the Keychain" : "Model token (ola-bart.sh model-token)", text: $token)
          Button("Save") {
            LocalSettings.saveToken(token.trimmingCharacters(in: .whitespacesAndNewlines))
            token = ""
            tokenSaved = true
            Task { await controller.apply() }
          }
          .disabled(token.isEmpty)
        }
        Text("Commands and file changes still ask first. The conversations stay on this Mac, so the phone does not see them.")
          .font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
      }
      if controller.starting { ProgressView().controlSize(.small) }
      if let p = controller.problem { Text(p).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true) }
    }
  }

  func choose() {
    let panel = NSOpenPanel()
    panel.canChooseDirectories = true
    panel.canChooseFiles = false
    panel.canCreateDirectories = true
    panel.prompt = "Work Here"
    if panel.runModal() == .OK, let url = panel.url {
      folder = url.path
      Task { await controller.apply() }
    }
  }
}
