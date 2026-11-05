#if DEBUG
import SwiftUI
import os

/// DEBUG hooks on the Player, every one a launch argument (CLAUDE.md "Checking the lesson"):
/// `-Autoplay` on a lesson or a song, `-ImprovPlay` on an improv, `-AutoTap`, `-AutoKeys`,
/// `-PracticeAt` and `-CalibrateTapsEarly`, each through the same path as a key press.
extension Player {
    /// `-Autoplay perfect|loose|sloppy|rush` on a song: the chart's notes a bar ahead on the
    /// monitor, scored through the press path as they are heard (the checks and the
    /// screenshots). Sloppy skips every eighth note, plays every ninth a semitone off, and is
    /// up to 260 ms out on the rest.
    func runGameAutoplay(_ clock: TransportClock, heard: TransportClock.Position) {
        guard let game, let mode = autoplayMode, heard.rolling else { return }
        if gameAutoEpoch != gameEpoch {
            gameAutoEpoch = gameEpoch
            gamePlanned = -1
            _ = gameQueue.clear()
        }
        let horizon = Int(heard.tick) + 4 * audio.band.ticksPerBeat
        if horizon > gamePlanned {
            for (i, n, _) in game.notes(from: Double(gamePlanned + 1), to: Double(horizon)) {
                if mode == .sloppy, i % 8 == 3 { continue }
                let offset: Double = mode == .rush ? -140 : mode == .loose ? Double((n.t * 7919) % 81) - 40
                    : mode == .sloppy ? Double((n.t * 7919) % 521) - 260 : 0
                let key = mode == .sloppy && i % 9 == 5 ? n.n + 1 : n.n
                let p = Autoplay.Press(note: key, velocity: 0.75, tick: Double(n.t) + offset / heard.msPerTick,
                                       lengthTicks: Double(n.len) * 0.9)
                audio.send(.schedule(note: p.note, velocity: p.velocity, tick: p.tick, lengthTicks: p.lengthTicks))
                gameQueue.add([p])
            }
            gamePlanned = horizon
        }
        let (down, up) = gameQueue.advance(to: heard.tick)
        for p in down {
            pressed.insert(p.note)
            if let host = clock.hostTime(atTick: p.tick) { score(p.note, hostTime: host, velocity: p.velocity, calibrated: false) }
        }
        for r in up { pressed.remove(r.note) }
    }

    /// `-PracticeAt <tick> -PracticeBar <bar> -PracticeSpeed <percent>` on a song: when the run
    /// reaches the tick, pause → practice, scrub to the bar, set the speed and play (the
    /// snapshots and the tempo check).
    func runPracticeHook(_ heard: TransportClock.Position) {
        let d = UserDefaults.standard
        guard !practiceHookDone, d.object(forKey: "PracticeAt") != nil, heard.tick >= d.double(forKey: "PracticeAt") else { return }
        practiceHookDone = true
        enterPractice()
        practiceSeek(bar: d.integer(forKey: "PracticeBar"))
        if d.object(forKey: "PracticeSpeed") != nil { practiceSpeed(delta: d.integer(forKey: "PracticeSpeed") - 100) }
        audio.send(.countIn(beats: 4))
        audio.send(.play)
    }

    /// `-AutoTap 1` on a song: one finger taps each chord the frame it is heard, through the
    /// tap path (the tap-mode check).
    func runGameAutoTap(_ heard: TransportClock.Position) {
        guard let game, UserDefaults.standard.bool(forKey: "AutoTap"), heard.rolling else { return }
        if autoTapDown {
            tapUp(0)
            autoTapDown = false
            return
        }
        let reach = GameEngine.goodMs / heard.msPerTick
        if game.notes(from: heard.tick - reach, to: heard.tick).contains(where: { $0.status == .pending }) {
            tapDown(0)
            autoTapDown = true
        }
    }

    /// `-AutoKeys 1` on a song: presses each note due by its name only (the semitone above C3,
    /// octave 0), through the computer-keyboard path, the frame it is heard; the octave snap
    /// has to put it where it is charted.
    func runGameAutoKeys(_ heard: TransportClock.Position) {
        guard let game, UserDefaults.standard.bool(forKey: "AutoKeys"), heard.rolling else { return }
        if !autoKeysDown.isEmpty {
            for k in autoKeysDown { key(k, down: false) }
            autoKeysDown = []
            return
        }
        let reach = GameEngine.goodMs / heard.msPerTick
        let pending = game.notes(from: heard.tick - reach, to: heard.tick).filter { $0.status == .pending }
        let names = Set(pending.map { (($0.note.n % 12) + 12) % 12 })
        for k in names.sorted() { key(k, down: true) }
        autoKeysDown = names.sorted()
    }

    /// `-ImprovPlay <choruses>` on an improv: starts it, plays a made-up solo on the step's notes
    /// (a phrase climbing on beats 1, 2, 3 and the "and" of 3, then two notes and room) through
    /// the press path, and after that many choruses calls `onImprovDone` (AppModel sends the take).
    func runImprovPlay(_ clock: TransportClock, heard: TransportClock.Position, epoch: Int) {
        let want = UserDefaults.standard.integer(forKey: "ImprovPlay")
        guard want > 0, inLesson, engine.step.kind == .free, !improvSent else { return }
        if lesson.intro != nil {
            if !improvBegun { improvBegun = true; beginStep() }
            return
        }
        guard heard.rolling, heard.tick >= 0 else { return }
        let bar = 4 * audio.band.ticksPerBeat
        let allowed = content.scale(of: engine.step)
        let keys = (57...79).filter { allowed.contains($0 % 12) }
        while improvPlannedBar < Int(heard.tick) / bar + 1 {
            improvPlannedBar += 1
            let b = improvPlannedBar
            let start = (b * 3) % max(1, keys.count - 4)
            let shape: [(Double, Int, Double)] = b % 2 == 0 ? [(0, 0, 12), (12, 1, 12), (24, 2, 6), (30, 3, 18)] : [(0, 3, 12), (12, 1, 24)]
            for (t, step, len) in shape where start + step < keys.count {
                improvPlayed.append((keys[start + step], Double(b * bar) + t, len))
            }
        }
        while let p = improvPlayed.first, p.tick <= heard.tick {
            improvPlayed.removeFirst()
            guard let host = clock.hostTime(atTick: p.tick) else { continue }
            audio.send(.schedule(note: p.note, velocity: 0.7, tick: p.tick, lengthTicks: p.len))
            score(p.note, hostTime: host, velocity: 0.7, calibrated: false)
            if let end = clock.hostTime(atTick: p.tick + p.len) { scoreRelease(p.note, hostTime: end, calibrated: false) }
        }
        if heard.tick >= Double(want * engine.chorusTicks) + 6 {
            improvSent = true
            onImprovDone?()
        }
    }

    /// Plans a bar ahead, schedules the presses on the monitor, and hands each one to the
    /// lesson when it is heard, at the host time it is heard (the same path as a key press).
    func runAutoplay(_ clock: TransportClock, heard: TransportClock.Position, epoch: Int) {
        if epoch != autoEpoch {
            // Stopped: the renderer dropped what was scheduled; start over from here.
            autoEpoch = epoch
            for n in autoQueue.clear() { pressed.remove(n) }
            autoplay?.plannedThrough = heard.tick - 0.01
        }
        if var plan = autoplay, heard.rolling, inLesson, !engine.expected.isEmpty, !lesson.passed, !lesson.finished {
            let ahead = plan.plan(through: heard.tick + Double(4 * audio.band.ticksPerBeat), expected: engine.expected,
                                  loopTicks: engine.loopTicks, msPerTick: heard.msPerTick)
            autoplay = plan
            for p in ahead {
                audio.send(.schedule(note: p.note, velocity: p.velocity, tick: p.tick, lengthTicks: p.lengthTicks))
            }
            autoQueue.add(ahead)
        }
        let (down, up) = autoQueue.advance(to: heard.tick)
        for p in down {
            pressed.insert(p.note)
            if let host = clock.hostTime(atTick: p.tick) { score(p.note, hostTime: host, velocity: p.velocity, calibrated: false) }
        }
        for r in up {
            pressed.remove(r.note)
            if let host = clock.hostTime(atTick: r.tick) { scoreRelease(r.note, hostTime: host, calibrated: false) }
        }
    }

    /// `-CalibrateTapsEarly <ms>`: a tap that early (raw) at each click, through the press path
    /// (a launch argument can't start with a minus).
    func runCalibrationHook(_ c: Calibration, click k: Int?, _ clock: TransportClock, heard: TransportClock.Position) {
        guard UserDefaults.standard.object(forKey: "CalibrateTapsEarly") != nil, let k, k + 1 >= Calibration.listen else { return }
        let ms = -UserDefaults.standard.double(forKey: "CalibrateTapsEarly")
        for j in max(Calibration.listen, k - 1)...(k + 1) where c.taps.last.map({ $0.click < j }) ?? true {
            let at = c.clickTick(j) + ms / heard.msPerTick
            if at <= heard.tick, at > heard.tick - 6, let host = clock.hostTime(atTick: at) { score(60, hostTime: host, calibrated: false) }
        }
    }
}
#endif
