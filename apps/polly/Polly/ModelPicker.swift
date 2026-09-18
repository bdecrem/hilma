import SwiftUI

/// Chat-model selection, shared by every chat surface (Chat tab, topic
/// chats). The selected key is sent with each /api/f2/messages call; the
/// backend registry (src/lib/f2/llm.ts) maps keys to providers. Keys must
/// match that registry exactly.
enum PollyChatModel: String, CaseIterable, Identifiable {
    // A stored legacy "opus-4-8" / "fable-5" selection fails rawValue init
    // and falls back to defaultModel, so old installs migrate automatically.
    case opus = "opus-5"
    case fable = "fable-5-1"
    case glm = "glm-5.2"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .opus: return "Opus 5"
        case .fable: return "Fable 5.1"
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
    static let defaultModel: PollyChatModel = .opus

    /// Current selection as stored on device — for call sites (PollyAPI senders)
    /// that live outside a SwiftUI view.
    static var current: PollyChatModel {
        guard let raw = UserDefaults.standard.string(forKey: storageKey),
              let model = PollyChatModel(rawValue: raw) else { return defaultModel }
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

    @AppStorage(PollyChatModel.storageKey) private var selectedRaw: String = PollyChatModel.defaultModel.rawValue

    private var selected: PollyChatModel {
        PollyChatModel(rawValue: selectedRaw) ?? PollyChatModel.defaultModel
    }

    var body: some View {
        #if targetEnvironment(macCatalyst)
        // Catalyst doesn't render Menu's custom label reliably — the badge
        // came out invisible. Use the native pull-down Picker: a real Mac
        // control that always draws.
        Picker("Model", selection: $selectedRaw) {
            ForEach(PollyChatModel.allCases) { model in
                Text(model.label).tag(model.rawValue)
            }
        }
        .pickerStyle(.menu)
        .fixedSize()
        .accessibilityLabel("Chat model: \(selected.label)")
        #else
        Menu {
            ForEach(PollyChatModel.allCases) { model in
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
                        .foregroundStyle(PollyTheme.text2)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(PollyTheme.text3)
                }
                .padding(.horizontal, 11)
                .padding(.vertical, 7)
                .background(PollyTheme.surface, in: Capsule())
                .overlay(Capsule().stroke(PollyTheme.border, lineWidth: 1))
            case .icon:
                // Model letter + a pinch of pixie dust so the badge reads
                // "magic" and tells you which model at a glance.
                ZStack {
                    Text(selected.letter)
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .foregroundStyle(PollyTheme.text2)
                    Image(systemName: "sparkles")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(PollyTheme.gold)
                        .offset(x: 9, y: -9)
                    Image(systemName: "sparkle")
                        .font(.system(size: 5, weight: .bold))
                        .foregroundStyle(PollyTheme.gold.opacity(0.7))
                        .offset(x: -10, y: 8)
                }
                .frame(width: 36, height: 36)
                .background(PollyTheme.surface, in: Circle())
                .overlay(Circle().stroke(PollyTheme.border, lineWidth: 1))
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Chat model: \(selected.label)")
        #endif
    }
}
