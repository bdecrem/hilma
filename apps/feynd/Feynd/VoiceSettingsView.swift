import AVFoundation
import SwiftUI

// MARK: - DTOs (/api/f2/voice-prefs)

struct VoiceOption: Codable, Identifiable, Equatable {
    let id: String
    let label: String
    let blurb: String
}

struct VoicePrefs: Codable, Equatable {
    let voices: [VoiceOption]
    let defaultVoice: String
    let voice: String?
    let voiceStyle: String?
    let maxStyleChars: Int

    enum CodingKeys: String, CodingKey {
        case voices
        case defaultVoice = "default_voice"
        case voice
        case voiceStyle = "voice_style"
        case maxStyleChars = "max_style_chars"
    }
}

// MARK: - View

/// Pick the voice + delivery style for every voice session on this account —
/// flash rounds, Final Reviews, topic talks, and Loci/Peri walks. Stored
/// server-side on the user, so it follows the account across devices.
/// Preview clips ship in the bundle (VoicePreviews/voice-<id>.m4a; regenerate
/// with scripts/generate-voice-previews.mjs when the catalog changes).
struct VoiceSettingsView: View {
    /// UserDefaults key for hold-to-talk. Device-local on purpose: it's an
    /// input-hardware choice (noisy room, this phone), not an account trait.
    static let holdToTalkKey = "voiceHoldToTalk"

    @Environment(\.dismiss) private var dismiss
    @AppStorage(VoiceSettingsView.holdToTalkKey) private var holdToTalk = false

    @State private var prefs: VoicePrefs? = nil
    @State private var selected: String? = nil
    @State private var styleText = ""
    @State private var savedStyle = ""
    @State private var saveError: String? = nil
    @State private var playingVoice: String? = nil
    @State private var player: AVAudioPlayer? = nil
    private let playerDelegate = PreviewPlayerDelegate()

    private static let stylePresets: [(label: String, text: String)] = [
        ("Casual", "Keep it casual and conversational — plain words, contractions, no lecture voice."),
        ("Formal", "Keep it polished and precise — measured pace, no slang."),
        ("Brisk", "Be brisk: short sentences, quick pace, minimal filler."),
        ("Warm", "Warm and encouraging, but keep the flattery to a minimum."),
    ]

    var body: some View {
        VStack(spacing: 0) {
            grabber
            header
            ScrollView {
                if let prefs {
                    sections(prefs)
                } else {
                    ProgressView()
                        .tint(FeyndTheme.accent)
                        .padding(.top, 80)
                }
            }
            .scrollIndicators(.hidden)
        }
        .background(FeyndTheme.bgRaised.ignoresSafeArea())
        .alert("Couldn't save",
               isPresented: Binding(get: { saveError != nil }, set: { if !$0 { saveError = nil } })) {
            Button("OK") { saveError = nil }
        } message: { Text(saveError ?? "") }
        .task { await load() }
        .onDisappear { stopPreview() }
    }

    // MARK: Chrome

    private var grabber: some View {
        Capsule()
            .fill(FeyndTheme.surface3)
            .frame(width: 38, height: 4)
            .padding(.top, 8)
            .frame(maxWidth: .infinity)
    }

    private var header: some View {
        ZStack {
            Text("Voice")
                .font(.system(size: 16, weight: .semibold))
                .tracking(-0.2)
                .foregroundStyle(FeyndTheme.text)
            HStack {
                Spacer()
                Button { closeModal(dismiss) } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text2)
                        .frame(width: 36, height: 36)
                        .background(FeyndTheme.surface2, in: Circle())
                        .overlay(Circle().stroke(FeyndTheme.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.cancelAction)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 14)
        .padding(.bottom, 4)
    }

    // MARK: Sections

    private func sections(_ prefs: VoicePrefs) -> some View {
        VStack(spacing: 18) {
            SettingsSection(label: "Voice") {
                SettingsCard {
                    ForEach(Array(prefs.voices.enumerated()), id: \.element.id) { idx, v in
                        voiceRow(v)
                        if idx < prefs.voices.count - 1 { SettingsDivider() }
                    }
                }
            }

            SettingsSection(label: "How it talks") {
                SettingsCard {
                    VStack(alignment: .leading, spacing: 10) {
                        TextField(
                            "Optional — e.g. \"Skip the pep talk. Short answers, dry humor, never call me 'my friend'.\"",
                            text: $styleText,
                            axis: .vertical
                        )
                        .font(.system(size: 15))
                        .foregroundStyle(FeyndTheme.text)
                        .tint(FeyndTheme.accent)
                        .lineLimit(3...6)
                        .textInputAutocapitalization(.sentences)
                        .onChange(of: styleText) { _, new in
                            if new.count > prefs.maxStyleChars {
                                styleText = String(new.prefix(prefs.maxStyleChars))
                            }
                        }

                        HStack(spacing: 8) {
                            ForEach(Self.stylePresets, id: \.label) { preset in
                                Button {
                                    styleText = preset.text
                                } label: {
                                    Text(preset.label)
                                        .font(.system(size: 12.5, weight: .semibold))
                                        .foregroundStyle(FeyndTheme.text2)
                                        .padding(.horizontal, 11)
                                        .padding(.vertical, 6)
                                        .background(FeyndTheme.surface2, in: Capsule())
                                        .overlay(Capsule().stroke(FeyndTheme.border, lineWidth: 1))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 13)

                    if styleText.trimmingCharacters(in: .whitespacesAndNewlines) != savedStyle {
                        SettingsDivider()
                        SettingsRow(label: "Save style", labelColor: FeyndTheme.accent) {
                            Task { await save() }
                        }
                    }
                }
            }

            Text("Applies to every voice session on your account — flash rounds, final reviews, topic talks, and walks — on all your devices.")
                .font(.system(size: 12.5))
                .lineSpacing(2)
                .foregroundStyle(FeyndTheme.text3)
                .padding(.horizontal, 6)

            SettingsSection(label: "Talking") {
                SettingsCard {
                    Toggle(isOn: $holdToTalk) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Hold to talk")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(FeyndTheme.text)
                            Text("Press and hold a button while you speak. Dodo never gets cut off by background noise.")
                                .font(.system(size: 12.5))
                                .foregroundStyle(FeyndTheme.text3)
                        }
                    }
                    .tint(FeyndTheme.accent)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                }
            }

            Text("Hold to talk is for noisy places — a café, a train. Off, Dodo listens hands-free and you can talk over it. This setting stays on this device.")
                .font(.system(size: 12.5))
                .lineSpacing(2)
                .foregroundStyle(FeyndTheme.text3)
                .padding(.horizontal, 6)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 44)
    }

    private func voiceRow(_ v: VoiceOption) -> some View {
        let isSelected = v.id == (selected ?? prefs?.defaultVoice)
        return HStack(spacing: 12) {
            Button {
                togglePreview(v.id)
            } label: {
                Image(systemName: playingVoice == v.id ? "stop.circle.fill" : "play.circle.fill")
                    .font(.system(size: 26))
                    .foregroundStyle(playingVoice == v.id ? FeyndTheme.accent : FeyndTheme.slate)
            }
            .buttonStyle(.plain)

            Button {
                guard selected != v.id else { return }
                selected = v.id
                Task { await save() }
            } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(v.label)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(FeyndTheme.text)
                        Text(v.blurb)
                            .font(.system(size: 12.5))
                            .foregroundStyle(FeyndTheme.text3)
                    }
                    Spacer()
                    if isSelected {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 18))
                            .foregroundStyle(FeyndTheme.accent)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
    }

    // MARK: Data

    private func load() async {
        do {
            let p = try await F2API.shared.voicePrefs()
            prefs = p
            selected = p.voice ?? p.defaultVoice
            savedStyle = p.voiceStyle ?? ""
            styleText = savedStyle
        } catch {
            saveError = error.localizedDescription
        }
    }

    /// Saves both fields as shown — the picked voice and the style text.
    private func save() async {
        let voice = selected ?? ""
        let style = styleText.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let p = try await F2API.shared.saveVoicePrefs(voice: voice, style: style)
            prefs = p
            selected = p.voice ?? p.defaultVoice
            savedStyle = p.voiceStyle ?? ""
        } catch {
            saveError = error.localizedDescription
            await load()   // resync with the server's actual state
        }
    }

    // MARK: Preview playback

    private func togglePreview(_ voiceId: String) {
        if playingVoice == voiceId {
            stopPreview()
            return
        }
        stopPreview()
        guard let url = Bundle.main.url(forResource: "voice-\(voiceId)", withExtension: "m4a") else {
            saveError = "Preview clip missing for \(voiceId)."
            return
        }
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback)
            try AVAudioSession.sharedInstance().setActive(true)
            let p = try AVAudioPlayer(contentsOf: url)
            playerDelegate.onFinish = { playingVoice = nil }
            p.delegate = playerDelegate
            p.play()
            player = p
            playingVoice = voiceId
        } catch {
            saveError = "Couldn't play the preview."
        }
    }

    private func stopPreview() {
        player?.stop()
        player = nil
        playingVoice = nil
    }
}

private final class PreviewPlayerDelegate: NSObject, AVAudioPlayerDelegate {
    var onFinish: (() -> Void)? = nil
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        DispatchQueue.main.async { self.onFinish?() }
    }
}
