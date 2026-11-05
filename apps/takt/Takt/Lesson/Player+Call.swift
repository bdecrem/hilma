import Foundation
import os

/// Call on the Stage (Call.swift, CallVoice.swift): practice with the band held, the next note
/// of the part called out, finger then key, "tuck" or "over" after it when the hand crosses,
/// and the step waits for that key. Entered from the practice row's Call or a song card's; the
/// scrubber starts it again from the bar it lands on; Play from here, Play the run, Back and
/// Esc end it. A wrong key gets "no" and the call again; four seconds of silence after a call,
/// the call again; the last step gets "done" and practice holds where the call ended.
extension Player {
    static let callNagSeconds = 4.0

    /// Call from where practice sits; a run under way pauses into practice first.
    func startCall() {
        guard let game, gameResult == nil, call == nil else { return }
        if !practice {
            enterPractice()
        } else if playing {
            practiceSeek(bar: practiceBar)
        }
        if callVoice == nil { callVoice = CallVoice(on: audio) }
        lessonLog.info("call: on, \(game.song.meta.title, privacy: .public) · \(game.part.rawValue, privacy: .public) · level \(game.level(atBar: Int(self.practiceTick) / game.ticksPerBar)) from bar \(Int(self.practiceTick) / game.ticksPerBar + 1)")
        callFrom(tick: practiceTick)
        #if DEBUG
        runCallScriptIfRequested()
        #endif
    }

    func toggleCall() {
        if call == nil { startCall() } else { endCall() }
    }

    /// The call off: practice holds at the bar the call reached.
    func endCall() {
        guard let c = call, let game else { return }
        let bar = (c.current?.tick ?? c.steps.last?.tick ?? Int(practiceTick)) / game.ticksPerBar
        dropCall()
        if practice { practiceSeek(bar: bar) }
        lessonLog.info("call: off at bar \(bar + 1)")
    }

    /// The call gone without a word (leaving the song, the run from the top).
    func dropCall() {
        callNag?.cancel()
        callNag = nil
        callVoice?.stop()
        call = nil
        callWrong = nil
    }

    /// The line from `tick` on (where practice sits, a scrub): the first step called.
    func callFrom(tick: Double) {
        guard let game else { return }
        callNag?.cancel()
        let steps = Call.steps(game: game, from: tick)
        call = Call.Engine(steps: steps, right: game.part == .melody, spelling: .of(key: game.song.meta.key))
        callWrong = nil
        guard !steps.isEmpty else {
            lessonLog.info("call: nothing left from tick \(Int(tick))")
            callVoice?.say([.done]) { [weak self] in self?.endCall() }
            return
        }
        sayCall()
    }

    /// A key while calling: the right one marks the note played and calls the next; a wrong
    /// one gets "no" and the same call; the last one "done".
    func callPlayed(_ note: Int) {
        guard var c = call, let game, let step = c.current else { return }
        let verdict = c.played(key: note)
        call = c
        switch verdict {
        case .waiting:
            break
        case .advance:
            for i in step.indices { game.called(i) }
            callWrong = nil
            lessonLog.info("call: \(Call.phrase(Call.words(for: step, spelling: c.spelling)), privacy: .public) played · next \(c.phrase, privacy: .public)")
            sayCall()
        case .wrong(let k):
            callWrong = k
            lessonLog.info("call: wrong key \(k) · \(c.phrase, privacy: .public) again")
            sayCall(prefix: [.no])
        case .done:
            for i in step.indices { game.called(i) }
            callWrong = nil
            callNag?.cancel()
            lessonLog.info("call: done, \(c.steps.count) steps, \(c.wrong) wrong")
            callVoice?.say([.done]) { [weak self] in self?.endCall() }
        }
    }

    /// Says the current step (after `prefix`), then waits; `callNagSeconds` of silence says it
    /// again. Without a voice (a clip missing from the bundle) the screen alone shows the call.
    private func sayCall(prefix: [Call.Word] = []) {
        guard let c = call, c.current != nil else { return }
        callNag?.cancel()
        guard let voice = callVoice else { return }
        voice.say(prefix + c.words) { [weak self] in self?.scheduleCallNag() }
    }

    private func scheduleCallNag() {
        callNag?.cancel()
        let item = DispatchWorkItem { [weak self] in
            guard let self, let c = self.call, c.current != nil else { return }
            self.lessonLog.info("call: \(c.phrase, privacy: .public) again (no key for \(Int(Self.callNagSeconds)) s)")
            self.sayCall()
        }
        callNag = item
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.callNagSeconds, execute: item)
    }

    /// What the game screen shows while calling.
    func callState() -> GameState.CallState? {
        guard let c = call else { return nil }
        return GameState.CallState(phrase: c.phrase, step: min(c.index + 1, c.steps.count), count: c.steps.count,
                                   wrong: callWrong, done: c.finished)
    }

    /// The keyboard and the hand while calling: the step's keys now, the next step's after.
    func callCue(_ c: Call.Engine) -> (now: Set<Int>, next: Set<Int>, fingers: [Int: Int], nowFingers: Set<Int>, nextFingers: Set<Int>) {
        var fingers: [Int: Int] = [:]
        for n in c.next?.notes ?? [] { if let f = n.finger { fingers[n.key] = f } }
        for n in c.current?.notes ?? [] { if let f = n.finger { fingers[n.key] = f } }
        let now = c.current?.keys ?? []
        return (now, (c.next?.keys ?? []).subtracting(now), fingers, c.current?.fingers ?? [], c.next?.fingers ?? [])
    }

    #if DEBUG
    /// `-CallAuto "r,r,w,r"` with `-Call 1`: presses 0.7 s apart through the press path, `r` the
    /// step's keys, `w` a wrong key (the step's lowest a semitone up); `-CallSnapshotDir <dir>`
    /// renders the game screen after each, both themes (`call-<n>-<theme>.png`); `-CallExit 1`
    /// quits after the last.
    func runCallScriptIfRequested() {
        let d = UserDefaults.standard
        guard let script = d.string(forKey: "CallAuto") else { return }
        let actions = script.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        for (i, a) in actions.enumerated() {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2 + Double(i) * 0.7) { [weak self] in
                guard let self, let c = self.call, let step = c.current else { return }
                let keys = a == "w" ? [step.notes[0].key + 1] : step.notes.map(\.key)
                for k in keys { self.press(k) }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { for k in keys { self.release(k) } }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                    if let dir = d.string(forKey: "CallSnapshotDir") { DebugHooks.snapshot(self, name: "call-\(i + 1)", dir: dir) }
                    if i == actions.count - 1 {
                        self.lessonLog.info("call: script done")
                        if d.bool(forKey: "CallExit") { exit(0) }
                    }
                }
            }
        }
    }
    #endif
}
