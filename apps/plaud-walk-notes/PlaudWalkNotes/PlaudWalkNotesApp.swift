import AppKit
import SwiftUI

@main
struct PlaudWalkNotesApp: App {
    @StateObject private var model = SyncViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView(model: model)
        }
        .windowResizability(.contentSize)
        .commands {
            CommandGroup(replacing: .newItem) { }
        }
    }
}

struct ContentView: View {
    @ObservedObject var model: SyncViewModel

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 12) {
                Image(systemName: "waveform.and.mic")
                    .font(.system(size: 34, weight: .medium))
                    .foregroundStyle(.blue)

                Text("PLAUD Walk Notes")
                    .font(.system(size: 25, weight: .semibold, design: .rounded))

                Text("Your spoken notes, collected into one Markdown file per day.")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
            }
            .padding(.top, 30)
            .padding(.bottom, 26)

            Button {
                model.sync()
            } label: {
                HStack(spacing: 10) {
                    if model.isSyncing {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .font(.system(size: 19, weight: .semibold))
                    }
                    Text(model.isSyncing ? "SYNCING…" : "SYNC")
                        .font(.system(size: 19, weight: .bold, design: .rounded))
                }
                .frame(maxWidth: .infinity)
                .frame(height: 66)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(model.isSyncing)
            .keyboardShortcut(.return, modifiers: [])

            VStack(spacing: 7) {
                Text(model.status)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(model.isError ? .red : .primary)
                    .multilineTextAlignment(.center)
                    .textSelection(.enabled)

                if let detail = model.detail {
                    Text(detail)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .textSelection(.enabled)
                }
            }
            .frame(minHeight: 54)
            .padding(.vertical, 17)

            Divider()

            HStack {
                Button {
                    model.openNotesFolder()
                } label: {
                    Label("Open Notes Folder", systemImage: "folder")
                }

                Spacer()

                Text("Files are never overwritten")
                    .font(.system(size: 11))
                    .foregroundStyle(.tertiary)
            }
            .buttonStyle(.borderless)
            .padding(.top, 15)
        }
        .padding(.horizontal, 28)
        .padding(.bottom, 24)
        .frame(width: 460)
        .background(Color(nsColor: .windowBackgroundColor))
    }
}

@MainActor
final class SyncViewModel: ObservableObject {
    @Published var isSyncing = false
    @Published var status = "Ready to sync"
    @Published var detail: String?
    @Published var isError = false

    private let service = SyncService()

    func sync() {
        guard !isSyncing else { return }
        isSyncing = true
        isError = false
        status = "Connecting to PLAUD…"
        detail = "If this is your first sync, finish signing in in the browser window."

        Task {
            do {
                let report = try await Task.detached(priority: .userInitiated) {
                    try self.service.sync()
                }.value

                if report.added == 0 {
                    status = "Everything is up to date"
                    detail = report.waiting == 0
                        ? "No new transcribed notes were found in the last 7 days."
                        : "\(report.waiting) new recording\(report.waiting == 1 ? " is" : "s are") still waiting for a PLAUD transcript."
                } else {
                    status = "Synced \(report.added) new note\(report.added == 1 ? "" : "s")"
                    let fileText = report.days == 1 ? "one daily file" : "\(report.days) daily files"
                    detail = "Added verbatim transcript text to \(fileText)."
                }
            } catch {
                isError = true
                status = "Sync couldn’t finish"
                detail = error.localizedDescription
            }
            isSyncing = false
        }
    }

    func openNotesFolder() {
        do {
            let folder = try AppPaths.notesDirectory()
            NSWorkspace.shared.open(folder)
        } catch {
            isError = true
            status = "Couldn’t open the notes folder"
            detail = error.localizedDescription
        }
    }
}

