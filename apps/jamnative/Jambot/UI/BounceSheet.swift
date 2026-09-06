import SwiftUI

/// Export sheet: WAV / AAC keys, writes the last render to a temp file (via
/// `Exporter`) and hands it to the system share sheet. Port of `export.ts`'s
/// role in `Studio.tsx`'s Bounce button (MP3 there is a browser-only lamejs
/// encoder; AAC is the native equivalent given a real hardware encoder).
///
/// This view is stateless about the render itself — the caller passes the
/// last `RenderResult` (or nil, which shows "Nothing rendered yet."). See
/// the integration request in the stage-7 report for how `StudioModel`
/// should retain it.
struct BounceSheet: View {
    let render: RenderResult?
    let bpm: Int

    @Environment(\.dismiss) private var dismiss
    @State private var busy: ExportFormat?
    @State private var error: String?
    @State private var shareURL: URL?

    var body: some View {
        VStack(spacing: 0) {
            JBSheetHeader("Bounce", onDone: { dismiss() })
            VStack(alignment: .leading, spacing: 16) {
            if let render {
                Text("\(render.bars) \(render.bars == 1 ? "bar" : "bars") · \(bpm) BPM · \(render.channels == 2 ? "stereo" : "mono") \(render.sampleRate / 1000) kHz")
                    .font(JBTheme.monoFont(12))
                    .foregroundStyle(JBTheme.ink2)
            }
            if render == nil {
                Text("Nothing rendered yet.")
                    .font(JBTheme.bodyFont(14))
                    .foregroundStyle(JBTheme.ink3)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                HStack(spacing: 12) {
                    ForEach(ExportFormat.allCases) { format in
                        Button(busy == format ? "…" : format.label) {
                            Task { await export(format) }
                        }
                        .buttonStyle(JBKeyStyle(variant: format == .wav ? .ghost : .orange, wide: true))
                        .disabled(busy != nil)
                    }
                }
            }

            if let error {
                Text(error)
                    .font(JBTheme.monoFont(12))
                    .foregroundStyle(JBTheme.orange)
            }

            Spacer(minLength: 0)
            }
            .padding(16)
        }
        .presentationDetents([.height(240)])
        .background(JBTheme.panel)
        .presentationBackground(JBTheme.panel)
        .sheet(item: $shareURL) { url in
            ShareSheet(items: [url])
        }
    }

    private func export(_ format: ExportFormat) async {
        guard let render else { return }
        busy = format
        error = nil
        do {
            let url = try await Task.detached(priority: .userInitiated) {
                try Exporter.export(pcm: render.pcm, sampleRate: render.sampleRate, channels: render.channels, bpm: bpm, format: format)
            }.value
            busy = nil
            shareURL = url
        } catch {
            busy = nil
            self.error = error.localizedDescription
        }
    }
}

extension URL: @retroactive Identifiable {
    public var id: String { absoluteString }
}

#Preview {
    BounceSheet(render: RenderResult(bars: 16, bpm: 128, hasArrangement: true, message: "", sampleRate: 44100, channels: 2, length: 1000, pcm: []), bpm: 128)
}
