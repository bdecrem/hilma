import SwiftUI
import os

/// Calibration (Lesson/Calibration.swift, Menu/CalibrationScreen.swift): the click, every tap
/// raw and corrected, Use this; and a quiz's hold on the band.
extension Player {
    /// The band stops and steps out; a cross-stick clicks every beat at 90, beat 1 louder, until
    /// the screen is left. Afterwards the band comes back as it was.
    func startCalibration() {
        let s = audio.snapshot()
        if bandBeforeCalibration == nil { bandBeforeCalibration = (playing, tempo, s.muted) }
        calibrationEpoch = s.epoch + 1
        let c = Calibration(firstTick: Double(2 * audio.band.ticksPerBeat), ticksPerBeat: audio.band.ticksPerBeat,
                            base: Self.inputOffsetMs)
        audio.send(.stop)
        for ch in Channel.band { audio.send(.mute(ch, true)) }
        audio.send(.tempo(Double(Calibration.tempo)))
        audio.send(.play)
        calibration = c
        calibrationClick = nil
        clicksSent = 0
        sendClicks(through: 7)
        lessonLog.info("calibration started from \(String(format: "%+.1f ms", Self.inputOffsetMs), privacy: .public)")
    }

    func sendClicks(through k: Int) {
        guard let c = calibration else { return }
        while clicksSent <= k {
            audio.send(.click(tick: c.clickTick(clicksSent), velocity: clicksSent % 4 == 0 ? 1 : 0.7))
            clicksSent += 1
        }
    }

    /// Every counted tap, raw and corrected, to the log and to Documents/calibration-taps.csv, so a
    /// real session can be read back afterwards.
    func logTap(_ t: (click: Int, ms: Double), base: Double) {
        let line = String(format: "%@,%d,%.1f,%.1f,%.1f\n", ISO8601DateFormatter().string(from: Date()), t.click, t.ms + base, t.ms, base)
        lessonLog.notice("calibration tap: \(line, privacy: .public)")
        guard let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        let url = dir.appendingPathComponent("calibration-taps.csv")
        if !FileManager.default.fileExists(atPath: url.path) {
            try? "time,click,raw_ms,corrected_ms,base_ms\n".write(to: url, atomically: true, encoding: .utf8)
        }
        guard let h = try? FileHandle(forWritingTo: url) else { return }
        h.seekToEndOfFile()
        h.write(Data(line.utf8))
        try? h.close()
    }

    /// Use this: the steady lean goes into the saved correction, and the needle starts over from it.
    func useCalibration() {
        guard var c = calibration, let offset = c.proposed else { return }
        let taps = c.recent.map { String(format: "%+.1f", $0) }.joined(separator: " ")
        lessonLog.info("calibration: [\(taps, privacy: .public)] from \(String(format: "%+.1f", c.base), privacy: .public) → \(String(format: "%+.1f ms", offset), privacy: .public)")
        UserDefaults.standard.set(offset, forKey: "inputOffsetMs")
        UserDefaults.standard.set(true, forKey: "calibrated")
        c.rebase(offset)
        calibration = c
    }

    /// Leaves the calibration screen: the band as it was, and the first-lesson question answered.
    func endCalibration() {
        if calibration != nil { restoreBand() }
        UserDefaults.standard.set(true, forKey: "calibrated")
        calibration = nil
        calibrationClick = nil
    }

    private func restoreBand() {
        guard let b = bandBeforeCalibration else { return }
        bandBeforeCalibration = nil
        audio.send(.stop)
        for ch in Channel.band { audio.send(.mute(ch, b.muted & ch.bit != 0)) }
        audio.send(.tempo(Double(b.tempo)))
        if b.playing { audio.send(.play) }
    }

    /// A quiz needs quiet: the band pauses, and comes back as it was after.
    func holdBand() {
        guard bandWasPlaying == nil else { return }
        bandWasPlaying = playing
        if playing { audio.send(.pause) }
    }

    func releaseBand() {
        guard let was = bandWasPlaying else { return }
        bandWasPlaying = nil
        if was && !playing { audio.send(.play) }
    }

    /// A question's sound on the piano: a chord struck together, or notes one after another.
    func play(_ sound: Question.Sound) {
        let notes: [(note: Int, at: Double, length: Double)]
        switch sound {
        case .chord(let n): notes = n.map { ($0, 0, 1.8) }
        case .notes(let n): notes = n.enumerated().map { ($1, Double($0) * 0.75, 0.65) }
        }
        for n in notes {
            DispatchQueue.main.asyncAfter(deadline: .now() + n.at) { [audio] in
                audio.send(.noteOn(note: n.note, velocity: 0.7, hostTime: 0))
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + n.at + n.length) { [audio] in
                audio.send(.noteOff(note: n.note, hostTime: 0))
            }
        }
    }
}
