import SwiftUI

/// Placeholder — real track list + strips + "+ New track" ship in stage 2b
/// against the EngineAPI protocol. This exists so stage 1's build has a
/// signed-in destination to land on.
struct LibraryView: View {
    @Environment(Session.self) private var session

    var body: some View {
        VStack(spacing: 16) {
            HStack {
                Text("LIBRARY")
                    .font(JBTheme.panelFont(22, weight: .bold))
                    .foregroundStyle(JBTheme.ink)
                Spacer()
                Button("Sign out") {
                    Task { await session.logout() }
                }
                .font(JBTheme.bodyFont(13))
                .foregroundStyle(JBTheme.ink3)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)

            Text("Track list ships in stage 2b.")
                .font(JBTheme.bodyFont(14))
                .foregroundStyle(JBTheme.ink3)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(JBTheme.panel)
    }
}

#Preview {
    LibraryView().environment(Session())
}
