import SwiftUI

/// Chat-model selection, shared by every chat surface (Chat tab, topic
/// chats). The selected key is sent with each /api/f2/messages call; the
/// backend registry (src/lib/f2/llm.ts) maps keys to providers. Keys must
/// match that registry exactly.
enum F2ChatModel: String, CaseIterable, Identifiable {
    case opus = "opus-4-8"
    case fable = "fable-5"
    case glm = "glm-5.2"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .opus: return "Opus 4.8"
        case .fable: return "Fable 5"
        case .glm: return "GLM-5.2"
        }
    }

    static let storageKey = "f2ChatModel"
    static let defaultModel: F2ChatModel = .opus

    /// Current selection as stored on device — for call sites (F2API senders)
    /// that live outside a SwiftUI view.
    static var current: F2ChatModel {
        guard let raw = UserDefaults.standard.string(forKey: storageKey),
              let model = F2ChatModel(rawValue: raw) else { return defaultModel }
        return model
    }
}

/// Dropdown for swapping models. Two looks, one behavior:
///  - `.pill` (Chat tab top bar): capsule showing the current model's name.
///  - `.icon` (topic header): 36pt circle, so the centered title keeps its
///    footprint; the menu checkmark shows the current selection.
struct ModelPickerMenu: View {
    enum Style { case pill, icon }
    var style: Style = .pill

    @AppStorage(F2ChatModel.storageKey) private var selectedRaw: String = F2ChatModel.defaultModel.rawValue

    private var selected: F2ChatModel {
        F2ChatModel(rawValue: selectedRaw) ?? F2ChatModel.defaultModel
    }

    var body: some View {
        Menu {
            ForEach(F2ChatModel.allCases) { model in
                Button {
                    selectedRaw = model.rawValue
                } label: {
                    if model == selected {
                        Label(model.label, systemImage: "checkmark")
                    } else {
                        Text(model.label)
                    }
                }
            }
        } label: {
            switch style {
            case .pill:
                HStack(spacing: 5) {
                    Text(selected.label)
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text2)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text3)
                }
                .padding(.horizontal, 11)
                .padding(.vertical, 7)
                .background(FeyndTheme.surface, in: Capsule())
                .overlay(Capsule().stroke(FeyndTheme.border, lineWidth: 1))
            case .icon:
                Image(systemName: "sparkles")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(FeyndTheme.text2)
                    .frame(width: 36, height: 36)
                    .background(FeyndTheme.surface, in: Circle())
                    .overlay(Circle().stroke(FeyndTheme.border, lineWidth: 1))
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Chat model: \(selected.label)")
    }
}
