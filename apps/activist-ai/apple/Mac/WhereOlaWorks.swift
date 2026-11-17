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

  /// The folder and token the running local server was started with.
  private var localKey: String?
  /// Each apply gets a number; only the newest may attach a server (2026-11-16: two applies at
  /// once started two servers, the second ended the first as an orphan, and the store kept the
  /// dead one's address).
  private var generation = 0

  /// At launch and after every change of the setting. Safe to call any number of times, at once.
  func apply() async {
    generation += 1
    let mine = generation
    problem = nil
    guard LocalSettings.onThisMac else {
      local?.stop()
      local = nil
      localKey = nil
      if store.config?.url.host() == "127.0.0.1" || store.config == nil { store.attach(nil) }
      return
    }
    guard let folder = LocalSettings.folder else { problem = "Choose the folder Ola should work in."; return }
    guard let token = LocalSettings.token, !token.isEmpty else { problem = "Add the model token (on the machine: ola-bart.sh model-token)."; return }
    if let p = Self.touch(folder) { problem = p; return }
    let key = "\(folder.path)\n\(token)"
    // Already running for this folder and token, and the app is using it: nothing to do.
    if let local, local.isRunning, localKey == key, store.config?.url.port == local.port, store.config?.url.host() == "127.0.0.1" { return }
    starting = true
    defer { if mine == generation { starting = false } }
    local?.stop()
    local = nil
    localKey = nil
    let server = LocalServer(folder: folder)
    do {
      let config = try await server.start(modelToken: token, timeout: 45)
      guard mine == generation else {
        // A newer apply took over while this one started: this server is not wanted.
        server.stop()
        return
      }
      local = server
      localKey = key
      store.attach(config)
    } catch {
      guard mine == generation else { return }
      problem = error.localizedDescription
      store.problem = Problem(text: "The agent on this Mac did not start. Settings has the details and Try again.", detail: error.localizedDescription)
    }
  }

  /// Stops the local agent and starts it again.
  func restart() async {
    local?.stop()
    local = nil
    localKey = nil
    await apply()
  }

  /// For Settings: "Agent on this Mac: running", never an address.
  var localState: String {
    if starting { return "Starting" }
    if let local, local.isRunning, store.config?.url.port == local.port { return store.connection == .open ? "Running" : "Running, connecting" }
    return problem == nil ? "Not running" : "Did not start"
  }

  /// Right after the folder is picked, the app itself reads it, so that if macOS asks whether Ola
  /// may use that folder (Documents, Desktop, iCloud Drive), it asks now, while Bart is looking,
  /// not later in the background where the agent would wait on it.
  static func touch(_ folder: URL) -> String? {
    do {
      _ = try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
      return nil
    } catch {
      return "Ola cannot read \((folder.path as NSString).abbreviatingWithTildeInPath). Allow it in System Settings, Privacy and Security, Files and Folders, then Try again."
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
      if controller.starting {
        HStack(spacing: 8) {
          ProgressView().controlSize(.small)
          Text("Starting the agent on this Mac\u{2026} This can take up to 45 seconds.").foregroundStyle(.secondary)
        }
      } else if let p = controller.problem {
        VStack(alignment: .leading, spacing: 6) {
          Text(p).foregroundStyle(.red).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
          Button("Try Again") { Task { await controller.apply() } }
        }
      }
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
      if let p = WhereOlaWorks.touch(url) {
        controller.problem = p
        return
      }
      Task { await controller.apply() }
    }
  }
}
