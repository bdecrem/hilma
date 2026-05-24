import SwiftUI

struct PasteView: View {
    var onSaved: ((String) -> Void)? = nil

    @State private var title = ""
    @State private var text = ""
    @State private var busy = false
    @State private var errorMessage: String? = nil
    @State private var savedTitle: String? = nil

    var body: some View {
        Form {
            Section {
                TextField("Title (optional)", text: $title)
                    .textInputAutocapitalization(.sentences)
            } header: {
                Text("Title")
            } footer: {
                Text("Leave blank to use the first line.")
            }

            Section("Text") {
                TextEditor(text: $text)
                    .frame(minHeight: 280)
                    .font(.system(size: 14, design: .monospaced))
            }

            if let errorMessage {
                Section { Text(errorMessage).foregroundStyle(.red) }
            }

            if let savedTitle {
                Section { Text("Saved as “\(savedTitle)”.").foregroundStyle(.secondary) }
            }

            Section {
                Button {
                    save()
                } label: {
                    HStack {
                        Spacer()
                        Text(busy ? "Saving…" : "Save as topic")
                            .fontWeight(.medium)
                        Spacer()
                    }
                }
                .disabled(busy || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .navigationTitle("Paste text")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func save() {
        let body = text
        let titleVal = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        busy = true
        errorMessage = nil
        Task {
            do {
                let id = try await F2API.shared.ingestPaste(title: titleVal.isEmpty ? nil : titleVal, text: body)
                let displayTitle = titleVal.isEmpty ? body.split(separator: "\n").first.map(String.init) ?? "Untitled" : titleVal
                title = ""
                text = ""
                savedTitle = displayTitle
                onSaved?(id)
            } catch {
                errorMessage = error.localizedDescription
            }
            busy = false
        }
    }
}
