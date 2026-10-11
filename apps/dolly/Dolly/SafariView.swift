import SafariServices
import SwiftUI

/// A web page inside the app (the public curriculum at ola.cx/dolly/levels).
struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let config = SFSafariViewController.Configuration()
        config.entersReaderIfAvailable = false
        let vc = SFSafariViewController(url: url, configuration: config)
        vc.preferredControlTintColor = UIColor(Skin.current.primary)
        return vc
    }

    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}

/// ola.cx/dolly/levels, for a language, at a level.
func levelsURL(language: String?, level: Int? = nil) -> URL {
    var s = "https://ola.cx/dolly/levels?lang=\(language == "zh" ? "zh" : "es")"
    if let level { s += "#level-\(level)" }
    return URL(string: s)!
}

/// A quiet text link that opens the curriculum page in a sheet.
struct LevelsLink: View {
    var title = "Every level, every objective"
    var level: Int? = nil
    @Environment(AppState.self) private var state
    @State private var open = false
    private let skin = Skin.current

    var body: some View {
        Button { open = true } label: {
            HStack(spacing: 6) {
                Image(systemName: "map").font(.system(size: 12, weight: .bold))
                Text(title).font(skin.uiBold(14))
                Image(systemName: "arrow.up.right").font(.system(size: 10, weight: .bold))
            }
            .foregroundStyle(skin.primary)
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $open) {
            SafariView(url: levelsURL(language: state.user?.language, level: level)).ignoresSafeArea()
        }
    }
}
