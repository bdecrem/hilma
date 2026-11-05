import SwiftUI
import os

/// Show me (Lesson/Demo.swift): the step played for you on the monitor, the keys following;
/// and Play it back: the payoff chorus again with your notes as you played them.
extension Player {
    /// The step can be played for you: a play step (an intro's too), not a card, not Lesson
    /// complete, not the result.
    var canDemo: Bool {
        engine.step.kind != .card && !engine.expected.isEmpty && finish == nil && lesson.complete == nil
    }

    /// Show me: the step from the top at the knob's tempo, every note on the monitor, the keys
    /// and the hand following; again while it plays stops it (your turn).
    func toggleDemo() {
        if demo { endDemo(stop: true) } else { startDemo() }
    }

    private func startDemo() {
        guard canDemo else { return }
        let plan = Demo.plan(expected: engine.expected, loopTicks: engine.loopTicks,
                             ticksPerBar: 4 * audio.band.ticksPerBeat, cycle: engine.step.cycle, chorusTicks: engine.chorusTicks)
        demoEpoch = audio.snapshot().epoch + 1
        demoEnd = plan.endTicks
        demoQueue = PressQueue()
        demoQueue.add(plan.presses)
        demo = true
        demoEnded = false
        demoTrim(on: true)
        fromTheTop()
        for p in plan.presses {
            audio.send(.schedule(note: p.note, velocity: p.velocity, tick: p.tick, lengthTicks: p.lengthTicks))
        }
        lessonLog.info("show me: \(plan.presses.count) notes over \(Int(plan.endTicks)) ticks")
    }

    /// `stop`: the band stops here (the demo ran out, or was clicked off); stopped by you, it
    /// already has.
    func endDemo(stop: Bool) {
        guard demo else { return }
        demo = false
        demoEnded = true
        demoTrim(on: false)
        for n in demoQueue.clear() { pressed.remove(n) }
        if stop { audio.send(.stop) }
        lessonLog.info("show me: over")
    }

    /// Show me is heard: a piano level turned down (Settings → Sound, for a player who hears
    /// their own instrument) comes up to full while it plays, and goes back after.
    private func demoTrim(on: Bool) {
        let d = UserDefaults.standard
        let band = d.object(forKey: "bandLevel") == nil ? 1.0 : d.double(forKey: "bandLevel")
        let piano = d.object(forKey: "pianoLevel") == nil ? 1.0 : d.double(forKey: "pianoLevel")
        guard piano < 1 else { return }
        audio.send(.trim(band: Float(band), monitor: Float(on ? 1 : piano)))
    }

    /// Lights each key as its note is heard, lets go at its length, and ends at the last bar.
    func runDemo(heard: TransportClock.Position, epoch: Int) {
        if epoch > demoEpoch {
            // Stop (yours) dropped the scheduled notes.
            endDemo(stop: false)
            return
        }
        guard epoch == demoEpoch else { return }
        if heard.tick >= demoEnd {
            endDemo(stop: true)
            return
        }
        let (down, up) = demoQueue.advance(to: heard.tick)
        for p in down { pressed.insert(p.note) }
        for r in up { pressed.remove(r.note) }
    }

    /// The payoff chorus again, from the top, with the band (out for the same bars) and your
    /// notes on the monitor as you played them.
    func playBack(_ f: LessonEngine.Finish) {
        let tpb = Double(audio.band.ticksPerBeat)
        playbackEpoch = audio.snapshot().epoch + 1
        audio.send(.stop)
        audio.send(.tempo(Double(f.tempo)))
        audio.send(.play)
        if let first = f.aloneBars.min(), let last = f.aloneBars.max() {
            audio.send(.silence(from: Double(first * 4) * tpb, to: Double((last + 1) * 4) * tpb))
        }
        for p in f.presses {
            audio.send(.schedule(note: p.note, velocity: p.velocity, tick: max(0, p.tick), lengthTicks: p.lengthTicks))
        }
        lessonLog.info("play it back: \(f.presses.count) notes at \(f.tempo)")
    }

    /// The transport tick heard now, while the recorded chorus plays back.
    func playbackTick() -> Double? {
        let s = audio.snapshot()
        guard s.epoch == playbackEpoch else { return nil }
        let clock = TransportClock(s)
        guard clock.valid else { return nil }
        return clock.position(atHost: mach_absolute_time()).tick
    }
}
