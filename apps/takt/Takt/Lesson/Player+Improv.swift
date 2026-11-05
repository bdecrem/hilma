import SwiftUI
import os

/// The improv (IMPROV.md): the take for the teacher, the review's pause, and the teacher's
/// idea ("your version") as the game draws it.
extension Player {
    /// The step the engine is on (an improv's backing, scale and form for the teacher).
    var currentStep: Lesson.Step { engine.step }
    var chorusTicks: Int { engine.chorusTicks }

    /// The take so far, to the end of the chorus being played.
    func improvTake() -> Improv.Take? {
        recorder.take(chorusTicks: engine.chorusTicks, ticksPerBeat: audio.band.ticksPerBeat, formBars: content.form(of: engine.step).count,
                      tempo: tempo, now: heardTick)
    }

    /// Sent: the band stops where it is; the take stays until you improvise again.
    func pauseForReview() {
        if demo { endDemo(stop: false) }
        if playing { audio.send(.pause) }
    }

    /// Improvise again: a new take from the top.
    func improviseAgain() {
        recorder.reset()
        takeNotes = 0
        demoEnded = false
        fromTheTop()
    }

    /// Notes a take needs before it can go to the teacher.
    static let takeMinimum = 8

    /// The teacher's version as the game draws it, this frame: the step's notes coming down onto
    /// `keys` (`Improv.highwayNotes`), hit by your presses this transport epoch inside the
    /// lessons' timing window, the chord of the bar, the keys and the hand as the lesson has them.
    func versionHighway(keys: ClosedRange<Int>) -> GameState {
        let step = engine.step
        guard step.id.hasPrefix(Improv.versionPrefix) else { return GameState() }
        let tpb = audio.band.ticksPerBeat
        let msPerTick = 60000 / (Double(max(1, tempo)) * Double(tpb))
        let lookahead = GameState.lookaheadSeconds * 1000 / msPerTick
        let now = heardTick
        let notes = Improv.highwayNotes(expected: content.expected(step, ticksPerBeat: tpb), loopTicks: Double(engine.loopTicks),
                                        ticksPerBeat: tpb, now: now, lookahead: lookahead,
                                        window: ScoringRules().windowMs(tempo: Double(tempo)) / msPerTick,
                                        presses: audio.snapshot().epoch == versionEpoch ? versionPresses : [], demo: demo)
        let count = max(1, form.count)
        return GameState(
            chord: form.isEmpty ? "" : form[bar % count].chord,
            nextChord: form.isEmpty ? "" : form[(bar + 1) % count].chord,
            playing: playing, heardTick: now, lookaheadTicks: lookahead, ticksPerBeat: tpb, ticksPerBar: 4 * tpb,
            notes: notes, keys: keys, nowNotes: lesson.nowNotes, nextNotes: lesson.nextNotes,
            pressedNotes: pressed, fingers: lesson.fingers, nowFingers: lesson.handFingers, nextFinger: nil,
            rightHand: lesson.rightHand)
    }
}
