import SwiftUI

struct PasteView: View {
    @State private var title = ""
    @State private var text = ""
    @State private var busy = false
    @State private var navigateToId: String? = nil
    @State private var errorMessage: String? = nil

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
        .navigationDestination(isPresented: Binding(
            get: { navigateToId != nil },
            set: { if !$0 { navigateToId = nil } }
        )) {
            if let id = navigateToId {
                TopicDetailView(topicId: id)
            }
        }
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
                title = ""
                text = ""
                navigateToId = id
            } catch {
                errorMessage = error.localizedDescription
            }
            busy = false
        }
    }
}
