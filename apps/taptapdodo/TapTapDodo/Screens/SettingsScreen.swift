import SwiftUI
import SpriteKit

/// Calibration, note speed, haptics. The audio-offset tuner plays a kick
/// metronome; the player taps along; the median offset (clamped ±120ms) is
/// applied in JudgmentEngine only — never to audio.
struct SettingsScreen: View {
    @EnvironmentObject private var app: AppState
    @Environment(\.dismiss) private var dismiss

    private let skin = Skin.origin

    var body: some View {
        ZStack {
            skin.background.ui.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    HStack {
                        Text("settings")
                            .font(.custom(Fonts.mono, size: 12))
                            .tracking(4)
                            .foregroundStyle(skin.dim.ui)
                        Spacer()
                        Button {
                            dismiss()
                        } label: {
                            Text("done")
                                .font(.custom(Fonts.mono, size: 13))
                                .foregroundStyle(skin.laneColors[2].ui)
                                .padding(8)
                        }
                    }

                    CalibrationSection(skin: skin)

                    VStack(alignment: .leading, spacing: 10) {
                        sectionTitle("note speed")
                        Text("how long notes stay on screen")
                            .font(.custom(Fonts.mono, size: 11))
                            .foregroundStyle(skin.dim.ui)
                        HStack {
                            Text("slower")
                                .font(.custom(Fonts.mono, size: 10))
                                .foregroundStyle(skin.dim.ui)
                            Slider(value: $app.noteSpeed, in: 0.85...1.15)
                                .tint(skin.laneColors[0].ui)
                            Text("faster")
                                .font(.custom(Fonts.mono, size: 10))
                                .foregroundStyle(skin.dim.ui)
                        }
                    }

                    VStack(alignment: .leading, spacing: 14) {
                        sectionTitle("feel")
                        Toggle(isOn: $app.hapticsOn) {
                            Text("hit haptics")
                                .font(.custom(Fonts.mono, size: 13))
                                .foregroundStyle(skin.foreground.ui)
                        }
                        .tint(skin.laneColors[0].ui)
                        Toggle(isOn: $app.kickHapticsOn) {
                            Text("kick haptics — the phone thumps with the drop")
                                .font(.custom(Fonts.mono, size: 13))
                                .foregroundStyle(skin.foreground.ui)
                        }
                        .tint(skin.laneColors[0].ui)
                    }

                    Text("reduce motion in system settings disables strobe, shake and pulse. note movement stays — it's information.")
                        .font(.custom(Fonts.mono, size: 10))
                        .foregroundStyle(skin.dim.ui)
                        .padding(.top, 10)
                }
                .padding(24)
            }
        }
        .preferredColorScheme(.dark)
    }

    private func sectionTitle(_ s: String) -> some View {
        Text(s)
            .font(.custom(Fonts.mono, size: 11))
            .tracking(3)
            .foregroundStyle(skin.laneColors[1].ui)
    }
}

// MARK: - Calibration

private struct CalibrationSection: View {
    let skin: Skin
    @EnvironmentObject private var app: AppState
    @State private var running = false
    @State private var taps: [Double] = []
    @State private var conductor: Conductor?
    @State private var scheduler: BackingScheduler?

    private let calBPM = 120.0

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("calibration")
                .font(.custom(Fonts.mono, size: 11))
                .tracking(3)
                .foregroundStyle(skin.laneColors[1].ui)

            Text(String(format: "audio offset: %+.0f ms", app.calibration * 1000))
                .font(.custom(Fonts.mono, size: 13))
                .foregroundStyle(skin.foreground.ui)

            if running {
                CalibrationPad { touchUptime in
                    recordTap(touchUptime)
                }
                .frame(height: 130)
                .background(RoundedRectangle(cornerRadius: 14).fill(skin.backgroundAlt.ui))
                .overlay(
                    Text(taps.count < 4
                         ? "tap with the kick (\(taps.count)/8)"
                         : String(format: "tap with the kick (%d/8) · %+.0f ms", taps.count, medianOffset() * 1000))
                        .font(.custom(Fonts.mono, size: 12))
                        .foregroundStyle(skin.dim.ui)
                        .allowsHitTesting(false)
                )
                Button {
                    stop(save: taps.count >= 4)
                } label: {
                    Text(taps.count >= 4 ? "save offset" : "cancel")
                        .font(.custom(Fonts.mono, size: 13))
                        .foregroundStyle(skin.background.ui)
                        .padding(.vertical, 10)
                        .padding(.horizontal, 22)
                        .background(Capsule().fill(skin.laneColors[2].ui))
                }
            } else {
                Button {
                    start()
                } label: {
                    Text("calibrate — tap along to a metronome")
                        .font(.custom(Fonts.mono, size: 13))
                        .foregroundStyle(skin.background.ui)
                        .padding(.vertical, 12)
                        .padding(.horizontal, 22)
                        .background(Capsule().fill(skin.foreground.ui))
                }
            }
        }
        .onDisappear { stop(save: false) }
    }

    private func start() {
        taps = []
        let cond = Conductor(bpm: calBPM, leadIn: 0.5)
        let spb = 60.0 / calBPM
        var events: [BackingEvent] = []
        for beat in 0..<240 {
            let t = Double(beat) * spb
            events.append(BackingEvent(time: t) { KickVoice.origin(at: t) })
        }
        let plan = BackingPlan(events: events, kickTimes: [], dropTime: .infinity)
        let synth = SynthEngine.shared
        synth.stopAllVoices()
        synth.conductor = cond
        synth.apply(EngineConfig())   // plain routing for the metronome
        synth.start()
        let sched = BackingScheduler(plan: plan, conductor: cond, synth: synth)
        conductor = cond
        scheduler = sched
        cond.start()
        sched.start()
        running = true
    }

    private func recordTap(_ uptime: TimeInterval) {
        guard let conductor else { return }
        let t = conductor.songTime(atTouchTimestamp: uptime)
        guard t > 0 else { return }
        let spb = conductor.secondsPerBeat
        // Offset from the nearest beat, in [-spb/2, spb/2).
        let offset = t.remainder(dividingBy: spb)
        taps.append(offset)
        if taps.count >= 8 { stop(save: true) }
    }

    private func medianOffset() -> Double {
        guard !taps.isEmpty else { return 0 }
        let sorted = taps.sorted()
        return sorted[sorted.count / 2]
    }

    private func stop(save: Bool) {
        if save, taps.count >= 4 {
            app.calibration = max(-0.12, min(0.12, medianOffset()))
        }
        scheduler?.stop()
        conductor?.pause()
        SynthEngine.shared.stopAllVoices()
        scheduler = nil
        conductor = nil
        running = false
        taps = []
    }
}

/// UIKit pad that hands back UITouch.timestamp — SwiftUI gestures don't
/// expose the hardware timestamp, and calibration is pointless without it.
private struct CalibrationPad: UIViewRepresentable {
    let onTap: (TimeInterval) -> Void

    func makeUIView(context: Context) -> PadView {
        let view = PadView()
        view.onTap = onTap
        view.backgroundColor = .clear
        view.isMultipleTouchEnabled = true
        return view
    }

    func updateUIView(_ view: PadView, context: Context) {
        view.onTap = onTap
    }

    final class PadView: UIView {
        var onTap: ((TimeInterval) -> Void)?
        override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
            for touch in touches { onTap?(touch.timestamp) }
        }
    }
}
