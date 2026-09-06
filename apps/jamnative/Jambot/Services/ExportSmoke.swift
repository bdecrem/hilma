import SwiftUI
import os

// Headless check of the WAV / AAC writers (no screen control — see
// PROGRESS.md):
//
//   xcrun simctl launch --console-pty "iPhone 16" com.bartdecrem.Jambot \
//     -exportSmoke -exportSmokeDir <dir>
//
// Writes a 2 s / 44.1 kHz / stereo 440 Hz sine as `smoke.wav` and
// `smoke.m4a` into `-exportSmokeDir` (default: the app's tmp dir) and
// logs sizes; the shell checks both with `afinfo`. Expected WAV size:
// 44 + 2 × 44100 × 2 ch × 2 bytes = 352,844 bytes.
struct ExportSmokeView: View {
    @State private var lines: [String] = []

    var body: some View {
        ZStack(alignment: .topLeading) {
            JBTheme.panel.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 6) {
                Text("EXPORT SMOKE").font(JBTheme.panelFont(14)).foregroundStyle(JBTheme.ink2)
                ForEach(Array(lines.enumerated()), id: \.offset) { _, l in
                    Text(l).font(JBTheme.monoFont(10)).foregroundStyle(l.contains("FAIL") ? JBTheme.orange : JBTheme.ink)
                }
            }
            .padding(16)
        }
        .task { await run() }
    }

    private func emit(_ s: String) {
        lines.append(s)
        Logger(subsystem: "com.bartdecrem.Jambot", category: "exportsmoke").notice("\(s, privacy: .public)")
        print("[export-smoke] \(s)"); fflush(stdout)
    }

    private func run() async {
        let dir: URL = {
            if let p = StudioScript.argValue("-exportSmokeDir") { return URL(fileURLWithPath: p, isDirectory: true) }
            return FileManager.default.temporaryDirectory
        }()
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let pcm = Exporter.syntheticSine()
        for format in ExportFormat.allCases {
            let url = dir.appendingPathComponent(format == .wav ? "smoke.wav" : "smoke.m4a")
            do {
                let started = Date()
                let bytes: Int
                switch format {
                case .wav: bytes = try Exporter.writeWav(pcm: pcm, sampleRate: 44100, channels: 2, to: url)
                case .aac: bytes = try Exporter.writeAac(pcm: pcm, sampleRate: 44100, channels: 2, to: url)
                }
                let ok = format == .wav ? bytes == 352_844 : bytes > 10_000
                emit("\(ok ? "PASS" : "FAIL"): \(format.rawValue) \(bytes) bytes → \(url.path) in \(String(format: "%.2f", Date().timeIntervalSince(started)))s")
            } catch {
                emit("FAIL: \(format.rawValue) \(error.localizedDescription)")
            }
        }
        emit("EXPORT SMOKE DONE")
    }
}
