import AppKit
import OlaKit
import SwiftUI

/// New Session (OLA-143, meeting of 2026-11-18): Bart, "there will be a new session button in the
/// iPhone app and in the Mac app, and there'll be a nice UI where you get to pick if it's in the
/// cloud or if it's in the local runtime." ⌘N or the sidebar's New Session opens this sheet: the
/// two runtimes, one line each, the last choice highlighted, so Return (or one click) starts it.
@MainActor
@Observable
final class NewSessionChooser {
  static let shared = NewSessionChooser()
  var shown = false
}

/// The chooser as a sheet on the window: plain system type and controls, no decoration.
struct NewSessionSheet: View {
  var whereOla: WhereOlaWorks
  var done: () -> Void
  /// Screenshots: a fixed readiness per runtime, so drawing never reads the app's own setup.
  var preview: [Runtime: String?]? = nil
  @State private var picked: Runtime = .cloud
  @State private var connecting = false
  @Environment(\.openSettings) private var openSettings

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text("New Session").font(.system(size: 13, weight: .semibold))
      Text("Where should Ola work on this one?").font(.system(size: 13)).foregroundStyle(.secondary).padding(.top, 2)
      VStack(spacing: 0) {
        ForEach(Runtime.allCases) { r in
          RuntimeOptionRow(runtime: r, why: why(r), picked: picked == r, setUp: { setUp(r) }) { start(r) }
          if r == .cloud { Divider().padding(.leading, 44) }
        }
      }
      .background(RoundedRectangle(cornerRadius: 8).fill(Color(nsColor: .controlBackgroundColor)))
      .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5))
      .padding(.top, 14)
      HStack {
        Spacer()
        Button("Cancel", role: .cancel, action: done).keyboardShortcut(.cancelAction)
        Button("Start") { start(picked) }.keyboardShortcut(.defaultAction).disabled(why(picked) != nil)
      }
      .padding(.top, 16)
    }
    .padding(20)
    .frame(width: 440)
    .onAppear { picked = whereOla.defaultRuntime }
    .onKeyPress(.upArrow) { picked = .cloud; return .handled }
    .onKeyPress(.downArrow) { picked = .local; return .handled }
    .sheet(isPresented: $connecting) {
      ConnectForm(store: whereOla.store(.cloud)) {
        connecting = false
        Task { await whereOla.apply() }
      }
      .frame(width: 400)
    }
  }

  /// Why a runtime cannot start a session yet, or nil.
  func why(_ r: Runtime) -> String? {
    if let preview { return preview[r] ?? nil }
    return whereOla.readiness(r).why
  }

  func start(_ r: Runtime) {
    guard why(r) == nil else { picked = r; return }
    whereOla.startSession(in: r)
    done()
  }

  /// "Set Up…" on a runtime that is not ready: the machine's connect sheet, the folder, or Settings.
  func setUp(_ r: Runtime) {
    switch r {
    case .cloud:
      if whereOla.account?.signedIn == true, Credentials.savedAddress == nil { return }
      connecting = true
    case .local:
      if LocalSettings.folder == nil { whereOla.chooseFolder() } else { done(); openSettings() }
    }
  }
}

/// One runtime in the chooser: its symbol, "Cloud: on the Ola machine", one line under it. The
/// default is highlighted the way the system highlights a selected row.
struct RuntimeOptionRow: View {
  var runtime: Runtime
  var why: String?
  var picked: Bool
  var setUp: () -> Void
  var choose: () -> Void
  @State private var over = false

  var body: some View {
    Button(action: choose) {
      HStack(alignment: .center, spacing: 12) {
        Image(systemName: runtime.symbol).font(.system(size: 18)).frame(width: 22)
          .foregroundStyle(picked && why == nil ? Ola.onAction : Ola.action)
        VStack(alignment: .leading, spacing: 2) {
          Text("\(runtime.name): \(runtime.place(phone: false))").font(.system(size: 13, weight: .medium))
          Text(why ?? runtime.detail(phone: false)).font(.system(size: 11))
            .foregroundStyle(picked && why == nil ? Ola.onAction.opacity(0.85) : .secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
        Spacer(minLength: 8)
        if why != nil {
          Button("Set Up\u{2026}", action: setUp).controlSize(.small)
        }
      }
      .foregroundStyle(picked && why == nil ? Ola.onAction : Color.primary)
      .padding(.horizontal, 10).padding(.vertical, 9)
      .background(RoundedRectangle(cornerRadius: 6).fill(picked && why == nil ? Ola.action : over ? Color.primary.opacity(0.05) : .clear))
      .padding(4)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { over = $0 }
    .accessibilityAddTraits(picked ? [.isSelected] : [])
    .help(why == nil ? "Start a session \(runtime.place(phone: false))" : (why ?? ""))
  }
}
