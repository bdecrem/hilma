import Foundation

/// Set-select audio previews: land on a card, hear two bars of that set's
/// peak groove, quietly. Uses the same composer/synth as the game — the
/// preview IS the track. Debounced so fast swipes don't stutter.
@MainActor
final class PreviewPlayer {
    static let shared = PreviewPlayer()

    private var conductor: Conductor?
    private var scheduler: BackingScheduler?
    private var stopWork: DispatchWorkItem?
    private var pendingWork: DispatchWorkItem?
    private var currentId: String?

    private init() {}

    func preview(_ track: TrackDef?) {
        pendingWork?.cancel()
        guard let track else { stop(); return }
        if track.id == currentId { return }
        let work = DispatchWorkItem { [weak self] in self?.playNow(track) }
        pendingWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: work)
    }

    private func playNow(_ track: TrackDef) {
        stopEngineSide()
        currentId = track.id

        let synth = SynthEngine.shared
        let cond = Conductor(bpm: track.bpm, leadIn: 0)
        let plan = BackingComposer.plan(for: track)

        synth.stopAllVoices()
        synth.conductor = cond
        var config = plan.config
        config.masterGain *= 0.6   // previews stay polite
        synth.apply(config)
        synth.start()

        let sched = BackingScheduler(plan: plan, conductor: cond, synth: synth)
        conductor = cond
        scheduler = sched

        // Two bars from the top of the peak — the fullest groove the set has.
        // The scheduler naturally skips everything already in the past.
        let startBeat = Double(track.sectionRange(.peak).lowerBound * 4)
        cond.start(atSongTime: startBeat * track.secondsPerBeat)
        sched.start()

        let length = 8 * track.secondsPerBeat + 0.4
        let stop = DispatchWorkItem { [weak self] in self?.stop() }
        stopWork = stop
        DispatchQueue.main.asyncAfter(deadline: .now() + length, execute: stop)
    }

    func stop() {
        pendingWork?.cancel()
        pendingWork = nil
        currentId = nil
        stopEngineSide()
    }

    private func stopEngineSide() {
        stopWork?.cancel()
        stopWork = nil
        scheduler?.stop()
        scheduler = nil
        if let conductor {
            SynthEngine.shared.stopAllVoices()
            conductor.pause()
        }
        conductor = nil
    }
}
