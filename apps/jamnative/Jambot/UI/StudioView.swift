import SwiftUI

/// Placeholder — chat feed, transport, and Controls sheet ship in stage 2b
/// (screens) wired to a real EngineHost in stage 3 (integration). Present
/// so the EngineAPI protocol has a caller to compile against.
struct StudioView: View {
    let trackId: String
    let engine: EngineAPI

    var body: some View {
        VStack {
            Text("STUDIO")
                .font(JBTheme.panelFont(20, weight: .bold))
                .foregroundStyle(JBTheme.ink)
            Text(trackId)
                .font(JBTheme.monoFont(12))
                .foregroundStyle(JBTheme.ink3)
            Spacer()
        }
        .padding(.top, 20)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(JBTheme.panel)
    }
}

#Preview {
    StudioView(trackId: "preview", engine: MockEngine())
}
