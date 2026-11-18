import OlaKit
import SwiftUI

/// "Where Ola works" on the phone (OlaKit/PhoneWhere.swift): through the Mac, or on the Ola machine
/// directly. Switching needs no pairing or sign-in again once both are set up; the session list
/// reloads from the new place.
@MainActor
@Observable
final class PhoneWhereState {
  static let shared = PhoneWhereState()
  private(set) var mode: PhoneMode? = PhoneWhere.mode
  private(set) var signedInName: String? = AccountKeeper.name
  /// A switch to a place that is not set up yet: the sheet that sets it up.
  var setup: PhoneMode?
  var problem: String?

  /// Screenshots: no network, nothing kept but the choice.
  var fixture: Bool { ProcessInfo.processInfo.arguments.contains("-OlaFixture") }
  var shownName: String { signedInName ?? (fixture ? "Bart" : "") }

  /// The Settings switch.
  func choose(_ m: PhoneMode, store: OlaStore) {
    guard m != mode else { return }
    if fixture { set(m); return }
    guard PhoneWhere.ready(m) else { setup = m; return }
    use(m, store: store)
  }

  func use(_ m: PhoneMode, store: OlaStore) {
    set(m)
    if fixture { return }
    store.attach(PhoneWhere.config(m), orSaved: false)
  }

  func set(_ m: PhoneMode?) {
    PhoneWhere.mode = m
    mode = PhoneWhere.mode
  }

  /// Paired with a Mac (the store connected and saved it): the phone now works through it.
  func paired() {
    set(.mac)
    setup = nil
  }

  func signIn(handle: String, password: String, store: OlaStore) async -> Bool {
    problem = nil
    do {
      let config = try await PhoneWhere.signIn(handle: handle, password: password)
      signedInName = AccountKeeper.name
      set(.machine)
      setup = nil
      store.attach(config, orSaved: false)
      return true
    } catch {
      problem = (error as? LocalizedError)?.errorDescription ?? PhoneWhere.words(error)
      return false
    }
  }

  /// Signs this phone out of the Ola machine. If it is paired with a Mac, it goes back to the Mac.
  func signOut(store: OlaStore) async {
    await PhoneWhere.signOut()
    signedInName = nil
    guard mode == .machine else { return }
    if PhoneWhere.paired { use(.mac, store: store) } else {
      set(nil)
      store.attach(nil, orSaved: false)
    }
  }

  /// "Forget This Mac": the phone keeps the Ola machine if it is signed in there.
  func forgetMac(store: OlaStore) {
    store.forget()
    if PhoneWhere.signedIn { use(.machine, store: store) } else { set(nil) }
  }
}

extension PhoneMode: Identifiable { public var id: String { rawValue } }

extension OlaStore {
  /// On the Ola machine directly (not through the Mac).
  var onMachine: Bool { config?.account == true || (config == nil && PhoneWhereState.shared.mode == .machine) || (ProcessInfo.processInfo.arguments.contains("-OlaFixture") && PhoneWhereState.shared.mode == .machine) }
}

// MARK: the first screen

/// Nothing set up yet: pair with the Mac, or sign in to the Ola machine.
struct PhoneStart: View {
  var store: OlaStore
  @Bindable private var place = PhoneWhereState.shared
  @State private var picked: PhoneMode?
  @State private var started = false

  var body: some View {
    Group {
      switch picked {
      case .mac?:
        PairScreen(store: store, other: { picked = .machine })
      case .machine?:
        MachineSignIn(store: store, other: { picked = .mac })
      case nil:
        choice
      }
    }
    .onAppear {
      guard !started else { return }
      started = true
      picked = place.mode
    }
  }

  var choice: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        Image("Mark").resizable().frame(width: 48, height: 48).clipShape(RoundedRectangle(cornerRadius: 11))
        Text("Ola").font(OlaFont.sans(26, .display)).foregroundStyle(Ola.ink)
        Text("Choose where Ola works for this phone. You can change it later in Settings.")
          .font(OlaFont.serif(Metrics.reading)).foregroundStyle(Ola.ink2).fixedSize(horizontal: false, vertical: true)
        StartChoice(title: "Pair with your Mac", detail: "Your phone shows what Ola on your Mac is doing, including work on the Mac itself.", symbol: "laptopcomputer") { picked = .mac }
        StartChoice(title: "Sign in to the Ola machine", detail: "Your phone works with the Ola machine directly, even when your Mac is off.", symbol: "server.rack") { picked = .machine }
      }
      .padding(24)
    }
    .background(Ola.paper)
  }
}

struct StartChoice: View {
  var title: String
  var detail: String
  var symbol: String
  var go: () -> Void
  var body: some View {
    Button(action: go) {
      HStack(alignment: .top, spacing: 14) {
        Image(systemName: symbol).font(.system(size: 20)).foregroundStyle(Ola.blue).frame(width: 28).padding(.top, 2)
        VStack(alignment: .leading, spacing: 4) {
          Text(title).font(OlaFont.sans(Metrics.ui + 2, .semibold)).foregroundStyle(Ola.ink)
          Text(detail).font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink2).fixedSize(horizontal: false, vertical: true).multilineTextAlignment(.leading)
        }
        Spacer(minLength: 0)
        Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Ola.ink3).padding(.top, 4)
      }
      .padding(16)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Ola.field, in: RoundedRectangle(cornerRadius: 12))
      .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Ola.rule, lineWidth: 1))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}

// MARK: signing in to the Ola machine

/// A name and password, straight in the app (the Mac's way): this phone gets its own key, listed
/// under Your devices. No passkey step.
struct MachineSignIn: View {
  var store: OlaStore
  /// "Pair with your Mac instead", on the first screen.
  var other: (() -> Void)? = nil
  var onDone: () -> Void = {}
  /// Why the sign-in is asked for again (signed out by the server), or nil.
  var reason: String? = nil
  @Bindable private var place = PhoneWhereState.shared
  @State private var name = ""
  @State private var password = ""
  @State private var busy = false
  @FocusState private var field: Int?
  private let tailscaleOn = PhoneWhere.tailscaleOn

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        Image("Mark").resizable().frame(width: 48, height: 48).clipShape(RoundedRectangle(cornerRadius: 11))
        Text("Sign in to the Ola machine").font(OlaFont.sans(26, .display)).foregroundStyle(Ola.ink).fixedSize(horizontal: false, vertical: true)
        Text(reason ?? "Your phone works with Ola on the Ola machine directly, even when your Mac is off. Use your Ola name and password.")
          .font(OlaFont.serif(Metrics.reading)).foregroundStyle(Ola.ink2).fixedSize(horizontal: false, vertical: true)
        if !tailscaleOn && !place.fixture {
          Label("Turn on Tailscale on this phone.", systemImage: "exclamationmark.circle")
            .font(OlaFont.sans(Metrics.ui, .medium)).foregroundStyle(Ola.ink).fixedSize(horizontal: false, vertical: true)
        }
        VStack(spacing: 10) {
          TextField("Name", text: $name).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled()
            .font(OlaFont.sans(Metrics.ui + 1)).field().focused($field, equals: 0).submitLabel(.next).onSubmit { field = 1 }
          SecureField("Password", text: $password).textContentType(.password)
            .font(OlaFont.sans(Metrics.ui + 1)).field().focused($field, equals: 1).submitLabel(.go).onSubmit(go)
        }
        HStack {
          if busy { ProgressView() }
          Spacer()
          Button("Sign In", action: go).buttonStyle(OlaButton(kind: ready ? .primary : .ghost)).disabled(!ready || busy)
        }
        if let p = place.problem { Text(p).font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.vermilionText).fixedSize(horizontal: false, vertical: true) }
        if let other {
          Button("Pair with your Mac instead", action: other).font(OlaFont.sans(Metrics.ui, .medium)).foregroundStyle(Ola.blue).padding(.top, 8)
        }
      }
      .padding(24)
    }
    .background(Ola.paper)
    .scrollDismissesKeyboard(.interactively)
    .onAppear { place.problem = nil }
  }

  var ready: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty && !password.isEmpty }

  func go() {
    guard ready, !busy else { return }
    busy = true
    Task {
      let ok = await place.signIn(handle: name, password: password, store: store)
      busy = false
      password = ""
      if ok { onDone() }
    }
  }
}

/// Settings, the switch. Each choice is a short label with a line under it, as on the Mac.
struct WhereSection: View {
  @Bindable var store: OlaStore
  @Bindable private var place = PhoneWhereState.shared
  var body: some View {
    Section {
      row(.mac, "Through my Mac", "Your phone shows what Ola on your Mac is doing.")
      row(.machine, "On the Ola machine", "Your phone works with the Ola machine directly, even when your Mac is off.")
    } header: { Text("Where Ola works") }
  }

  func row(_ m: PhoneMode, _ title: String, _ detail: String) -> some View {
    Button { place.choose(m, store: store) } label: {
      HStack(alignment: .top, spacing: 12) {
        VStack(alignment: .leading, spacing: 2) {
          Text(title).foregroundStyle(Ola.ink)
          Text(detail).font(.footnote).foregroundStyle(Ola.ink2).fixedSize(horizontal: false, vertical: true)
        }
        Spacer(minLength: 8)
        if place.mode == m { Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(Ola.blue) }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(place.mode == m ? [.isSelected] : [])
  }
}

/// The sheet for a switch to a place that is not set up yet.
struct WhereSetupSheet: View {
  var mode: PhoneMode
  var store: OlaStore
  @Environment(\.dismiss) private var dismiss
  var body: some View {
    NavigationStack {
      Group {
        switch mode {
        case .mac: PairScreen(store: store) { dismiss() }
        case .machine: MachineSignIn(store: store) { dismiss() }
        }
      }
      .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
    }
  }
}
