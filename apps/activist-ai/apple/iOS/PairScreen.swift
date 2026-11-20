import OlaKit
import SwiftUI
import VisionKit

/// First run on the phone: pair with the Mac app. The phone then shows whatever the Mac app shows,
/// through the Mac, and holds only the pairing secret.
struct PairScreen: View {
  var store: OlaStore
  /// "Sign in to the Ola machine instead", on the first screen.
  var other: (() -> Void)? = nil
  var onDone: () -> Void = {}
  @State private var typed = ""
  @State private var scanning = false
  @State private var busy = false
  @State private var problem: String?

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        Image("Mark").resizable().frame(width: 48, height: 48).clipShape(RoundedRectangle(cornerRadius: 11))
        Text("Pair with your Mac").font(OlaFont.sans(26, .display)).foregroundStyle(Ola.ink)
        Text("Ola on your phone works through Ola on your Mac. On the Mac, open Ola, Settings, Phone, and choose Pair a Phone.")
          .font(OlaFont.serif(Metrics.reading)).foregroundStyle(Ola.ink2).fixedSize(horizontal: false, vertical: true)
        Text("Your phone needs Tailscale, signed in to the same account as the Mac.")
          .font(OlaFont.sans(Metrics.ui, .medium)).foregroundStyle(Ola.ink).fixedSize(horizontal: false, vertical: true)
        if DataScannerViewController.isSupported {
          Button { scanning = true } label: { Label("Scan the Code", systemImage: "qrcode.viewfinder").frame(maxWidth: .infinity) }
            .buttonStyle(OlaButton(kind: .primary))
        }
        Text("Or type the code").font(OlaFont.sans(Metrics.meta, .semibold)).foregroundStyle(Ola.ink2).padding(.top, 4)
        TextField("imac-m1.tail1234.ts.net:4330  ABCD-EFGH-\u{2026}", text: $typed, axis: .vertical)
          .font(OlaFont.mono(Metrics.ui)).lineLimit(2...4).field()
          .textInputAutocapitalization(.characters).autocorrectionDisabled()
        HStack {
          if busy { ProgressView() }
          Spacer()
          Button("Pair") { pair(typed) }.buttonStyle(OlaButton(kind: typed.isEmpty ? .ghost : .primary)).disabled(typed.isEmpty || busy)
        }
        if let problem { Text(problem).font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.vermilionText).fixedSize(horizontal: false, vertical: true) }
        if let other {
          Button("Sign in to Ola instead", action: other).font(OlaFont.sans(Metrics.ui, .medium)).foregroundStyle(Ola.blue).padding(.top, 8)
        }
      }
      .padding(24)
    }
    .background(Ola.paper)
    .scrollDismissesKeyboard(.interactively)
    .sheet(isPresented: $scanning) {
      QRScanner { text in
        scanning = false
        pair(text)
      }
      .ignoresSafeArea()
    }
  }

  func pair(_ text: String) {
    guard let code = PairingCode.parse(text) else {
      problem = "That is not a pairing code. It starts with the Mac's name, like imac-m1.tail1234.ts.net."
      return
    }
    busy = true
    problem = nil
    Task {
      do {
        try await store.connect(code.config)
        PhoneWhereState.shared.paired()
        onDone()
      } catch OlaError.unauthorized {
        problem = "Your Mac did not accept this code. Pair again on the Mac."
      } catch {
        problem = "Your Mac is not reachable. Ola on your phone works through the Mac app: is Ola open on the Mac, with Let my phone connect on, and is Tailscale on here?"
      }
      busy = false
    }
  }
}

/// The camera, looking for a QR code.
struct QRScanner: UIViewControllerRepresentable {
  var found: (String) -> Void

  func makeUIViewController(context: Context) -> DataScannerViewController {
    let vc = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])], qualityLevel: .balanced, isHighlightingEnabled: true)
    vc.delegate = context.coordinator
    try? vc.startScanning()
    return vc
  }

  func updateUIViewController(_ vc: DataScannerViewController, context: Context) {}
  func makeCoordinator() -> Coordinator { Coordinator(found: found) }

  final class Coordinator: NSObject, DataScannerViewControllerDelegate {
    let found: (String) -> Void
    var done = false
    init(found: @escaping (String) -> Void) { self.found = found }
    func dataScanner(_ s: DataScannerViewController, didAdd items: [RecognizedItem], allItems: [RecognizedItem]) {
      for case .barcode(let b) in items {
        if let text = b.payloadStringValue, !done, PairingCode.parse(text) != nil {
          done = true
          s.stopScanning()
          found(text)
        }
      }
    }
  }
}
