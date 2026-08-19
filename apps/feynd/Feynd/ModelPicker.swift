import SwiftUI

/// Chat-model selection, shared by every chat surface (Chat tab, topic
/// chats). The selected key is sent with each /api/f2/messages call; the
/// backend registry (src/lib/f2/llm.ts) maps keys to providers. Keys must
/// match that registry exactly.
enum F2ChatModel: String, CaseIterable, Identifiable {
    // A stored legacy "opus-4-8" selection fails rawValue init and falls back
    // to defaultModel, so old installs migrate to Opus 5 automatically.
    case opus = "opus-5"
    case fable = "fable-5"
    case glm = "glm-5.2"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .opus: return "Opus 5"
        case .fable: return "Fable 5"
        case .glm: return "GLM-5.2"
        }
    }

    /// Single-letter badge for the compact icon picker.
    var letter: String {
        switch self {
        case .opus: return "O"
        case .fable: return "F"
        case .glm: return "G"
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
        #if targetEnvironment(macCatalyst)
        // Catalyst doesn't render Menu's custom label reliably — the badge
        // came out invisible. Use the native pull-down Picker: a real Mac
        // control that always draws.
        Picker("Model", selection: $selectedRaw) {
            ForEach(F2ChatModel.allCases) { model in
                Text(model.label).tag(model.rawValue)
            }
        }
        .pickerStyle(.menu)
        .fixedSize()
        .accessibilityLabel("Chat model: \(selected.label)")
        #else
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
                // Model letter + a pinch of pixie dust so the badge reads
                // "magic" and tells you which model at a glance.
                ZStack {
                    Text(selected.letter)
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .foregroundStyle(FeyndTheme.text2)
                    Image(systemName: "sparkles")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(FeyndTheme.gold)
                        .offset(x: 9, y: -9)
                    Image(systemName: "sparkle")
                        .font(.system(size: 5, weight: .bold))
                        .foregroundStyle(FeyndTheme.gold.opacity(0.7))
                        .offset(x: -10, y: 8)
                }
                .frame(width: 36, height: 36)
                .background(FeyndTheme.surface, in: Circle())
                .overlay(Circle().stroke(FeyndTheme.border, lineWidth: 1))
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Chat model: \(selected.label)")
        #endif
    }
}
