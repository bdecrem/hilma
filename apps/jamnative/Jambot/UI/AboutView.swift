import SwiftUI

/// Settings/About screen, reached from the Library header. Build number
/// (what Bart checks after every install), engine bundle stamp, signed-in
/// user, backend URL, sign out. Port of the idea behind Dodo's About screen.
struct AboutView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    /// The engine bundle's version stamp (`EngineHost.version`, e.g.
    /// "2026-09-06+jambot@0821d34b7") once the integrator wires it through —
    /// see the integration request in the stage-7 report. Falls back to the
    /// bundle's `jambot-web.meta.json` (shipped as an app resource) when
    /// present, then to "unknown".
    var engineVersion: String? = nil

    var body: some View {
        VStack(spacing: 0) {
            JBSheetHeader("About", onDone: { dismiss() })
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        JBWordmark(size: 40)
                        Text("native")
                            .font(JBTheme.monoFont(12))
                            .foregroundStyle(JBTheme.ink3)
                    }
                    .padding(.top, 8)

                    VStack(alignment: .leading, spacing: 8) {
                        JBGroupRow("Build")
                        VStack(spacing: 0) {
                            row("Version", appVersion)
                            Divider().overlay(JBTheme.rule)
                            row("Build", appBuild)
                            Divider().overlay(JBTheme.rule)
                            row("Engine", engineVersion ?? Self.engineVersionFromBundle() ?? "unknown")
                        }
                        .padding(.horizontal, 12)
                        .jbCard()
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        JBGroupRow("Account")
                        VStack(spacing: 0) {
                            if case .signedIn(let user) = session.state {
                                row("Signed in as", user.username)
                                Divider().overlay(JBTheme.rule)
                            }
                            row("Backend", Secrets.backendBaseURL.host ?? Secrets.backendBaseURL.absoluteString)
                        }
                        .padding(.horizontal, 12)
                        .jbCard()
                    }

                    Button("Sign out") {
                        Task { await session.logout() }
                    }
                    .buttonStyle(JBKeyStyle(variant: .ghost, size: .small))
                }
                .padding(16)
                .padding(.bottom, 40)
            }
        }
        .background(JBTheme.panel)
        .columnWidth()
        .frame(maxWidth: .infinity)
        .background(JBTheme.panel)
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).font(JBTheme.bodyFont(14)).foregroundStyle(JBTheme.ink2)
            Spacer()
            Text(value).font(JBTheme.monoFont(12, weight: .medium)).foregroundStyle(JBTheme.ink)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .padding(.vertical, 12)
    }

    private var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
    }
    private var appBuild: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "?"
    }

    /// `public/jam/jambot-web.meta.json` is committed alongside the bundle
    /// in hilma and referenced the same way as `jambot-web.js` — if it's
    /// added as an app resource (project.yml change, outside this file's
    /// ownership) this picks up its `commit`/`builtAt` fields; otherwise nil.
    private static func engineVersionFromBundle() -> String? {
        guard let url = Bundle.main.url(forResource: "jambot-web.meta", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        let commit = json["commit"] as? String ?? json["jambotCommit"] as? String
        let builtAt = json["builtAt"] as? String ?? json["date"] as? String
        switch (builtAt, commit) {
        case let (b?, c?): return "\(b)+jambot@\(c)"
        case let (b?, nil): return b
        case let (nil, c?): return c
        default: return nil
        }
    }
}

#Preview {
    AboutView().environment(Session())
}
