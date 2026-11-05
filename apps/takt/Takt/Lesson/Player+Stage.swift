import SwiftUI
import os

/// The Stage (Game/): a song from the top with your keys on its part, the record filling what
/// the level leaves out, practice inside a run, and the game screen's frame.
extension Player {
    /// A song from the top: its band with your keys on the part's instrument, the part's
    /// channel out, the song's tempo (or the knob's, `keepSpeed`: Play again and Play the run
    /// keep what you turned it to), four clicks in. The lesson's band comes back with `endGame`.
    func startGame(song: Song, part: Song.PartKey, difficulty: GameEngine.Difficulty, practice startHeld: Bool = false,
                   keepSpeed: Bool = false) {
        if demo { endDemo(stop: false) }
        gameDifficulty = difficulty
        gameResult = nil
        lastRun = nil
        practice = false
        if !keepSpeed { gameSpeed = 1 }
        #if DEBUG
        // `-Speed <percent>`: the knob turned before the count-in.
        if !keepSpeed, UserDefaults.standard.integer(forKey: "Speed") > 0 {
            gameSpeed = Double(min(100, max(50, UserDefaults.standard.integer(forKey: "Speed")))) / 100
        }
        #endif
        practiceTick = 0
        practiceCountBase = 0
        let partChannel = song.channel(of: part)
        chorusBars = audio.load(song: song, part: part).chorusBars
        loadedBand = nil
        gameEpoch = audio.snapshot().epoch + 1
        game = GameEngine(song: song, part: part, difficulty: difficulty,
                          start: GameEngine.adaptiveStart(song: song.name, part: part, records: progress.scores(song: song.name), charting: song.charting))
        fillVelocity = [:]
        for e in partChannel == .horns ? song.band.channels.horns : song.band.channels.keys { fillVelocity[e.t * 128 + e.n] = Float(e.v) }
        fillThrough = -1
        applyInstrument()
        audio.send(.stop)
        audio.send(.transpose(0))
        audio.send(.silence(from: 0, to: 0))
        for ch in Channel.band { audio.send(.mute(ch, ch == partChannel)) }
        audio.send(.tempo((Double(song.meta.tempo) * gameSpeed).rounded()))
        pressed.removeAll()
        if startHeld {
            // Practice from the set list: held at bar 1, nothing scored; play counts in from there.
            practice = true
            game?.practice = true
            fillThrough = -1
            lessonLog.info("stage: \(song.meta.title, privacy: .public) · \(part.rawValue, privacy: .public) · \(difficulty.rawValue, privacy: .public) · practice")
            return
        }
        audio.send(.countIn(beats: 4))
        audio.send(.play)
        lessonLog.info("stage: \(song.meta.title, privacy: .public) · \(part.rawValue, privacy: .public) · \(difficulty.rawValue, privacy: .public)")
    }

    /// The same song, part and level again, at the knob's speed.
    func restartGame() {
        guard let g = game else { return }
        startGame(song: g.song, part: g.part, difficulty: gameDifficulty, keepSpeed: true)
    }

    /// Back to the lessons: the module's band, where the lesson was.
    func endGame() {
        guard game != nil else { return }
        game = nil
        gameResult = nil
        practice = false
        gameSpeed = 1
        practiceCountBase = 0
        // The module's band comes back with the lesson's step (`resume` → `restartLesson`).
        applyInstrument()
        resume()
    }

    // MARK: Practice

    /// Pause → Practice: the run becomes a practice session, held at the start of the bar
    /// being heard. Nothing from here on scores or goes on the board; "Play the run" starts the
    /// run over at the song's speed.
    func enterPractice() {
        guard let game, gameResult == nil, !practice else { return }
        if playing { audio.send(.pause) }
        practice = true
        game.practice = true
        let s = audio.snapshot()
        let clock = TransportClock(s)
        let tick = clock.valid && s.epoch == gameEpoch ? clock.position(atHost: mach_absolute_time()).tick : 0
        practiceSeek(bar: Int((max(0, tick) / Double(game.ticksPerBar)).rounded(.down)))
        lessonLog.info("practice: in at bar \(self.practiceBar + 1)")
    }

    /// The bar practice sits at (held) or is passing (playing).
    var practiceBar: Int {
        guard let game else { return 0 }
        if !playing { return Int((practiceTick / Double(game.ticksPerBar)).rounded(.down)) }
        let s = audio.snapshot()
        let clock = TransportClock(s)
        guard clock.valid, s.epoch == gameEpoch else { return 0 }
        return max(0, Int((clock.position(atHost: mach_absolute_time()).tick / Double(game.ticksPerBar)).rounded(.down)))
    }

    /// The scrub: the band holds at the start of `bar`, the highway shows it, every note from
    /// there on is pending again, the fills are scheduled from there.
    func practiceSeek(bar: Int) {
        guard let game, practice else { return }
        let b = max(0, min(game.song.bars - 1, bar))
        let tick = Double(b * game.ticksPerBar)
        if !playing, practiceTick == tick { return }
        if playing { audio.send(.pause) }
        audio.send(.seek(tick: tick))
        game.seek(to: tick)
        fillThrough = b - 1
        practiceCountBase = tick
        practiceTick = tick
        pressed.removeAll()
    }

    /// Four bars back from where practice sits or is passing: the phrase again.
    func practiceBack(bars: Int = 4) {
        practiceSeek(bar: practiceBar - bars)
    }

    // MARK: The knob

    /// The knob's range on a song: half the song's tempo to the song's own, its full speed.
    var gameTempoRange: ClosedRange<Int> {
        let top = max(1, game?.song.meta.tempo ?? 1)
        return max(1, (top + 1) / 2)...top
    }

    /// The knob, in a run or in practice: the band to `bpm` (held to the range), on the next
    /// downbeat while it plays, at once while it holds. The song's tempo is full speed; under
    /// it the run is practice (`runGame` records nothing).
    func setGameTempo(_ bpm: Int) {
        guard let game else { return }
        let t = min(gameTempoRange.upperBound, max(gameTempoRange.lowerBound, bpm))
        gameSpeed = Double(t) / Double(game.song.meta.tempo)
        audio.send(.tempo(Double(t)))
        lessonLog.info("stage: knob \(t) (\(Int((self.gameSpeed * 100).rounded()))%)")
    }

    /// A step of the knob (± 5 from the lesson's keys and buttons) from where it was turned to.
    func nudgeGameTempo(_ delta: Int) {
        guard let game else { return }
        setGameTempo(Int((Double(game.song.meta.tempo) * gameSpeed).rounded()) + delta)
    }

    /// Play in practice: from the held bar, four clicks at the practice tempo, then the band;
    /// playing, it pauses, and the next play starts that bar over.
    func practicePlay() {
        guard practice else { return }
        if playing {
            audio.send(.pause)
            return
        }
        practiceSeek(bar: practiceBar)
        audio.send(.countIn(beats: 4))
        audio.send(.play)
    }

    /// Back to the game: the run from the top, at the knob's speed, a fresh score.
    func leavePractice() {
        guard let g = game, practice else { return }
        lessonLog.info("practice: out, the run from the top")
        startGame(song: g.song, part: g.part, difficulty: gameDifficulty, keepSpeed: true)
    }

    /// Every frame of a run: the engine hears the tick; the end stops the band and puts the run
    /// on the board; Stop (a new epoch) starts the song over.
    func runGame(_ clock: TransportClock, heard: TransportClock.Position, epoch: Int) {
        guard let game else { return }
        if epoch > gameEpoch {
            // Your Stop starts the song over; the stop at the finish line leaves the result up.
            if gameResult == nil { restartGame() }
            return
        }
        guard epoch == gameEpoch else { return }
        game.heard(tick: heard.tick, msPerTick: heard.msPerTick)
        // The bar ahead's notes the level leaves out, on the part's instrument (its tier is
        // decided two bars before it starts).
        while fillThrough < min(game.heardBar + 1, game.song.bars - 1) {
            fillThrough += 1
            for n in game.fill(bar: fillThrough) {
                audio.send(.schedule(note: n.n, velocity: fillVelocity[n.t * 128 + n.n] ?? 0.6, tick: Double(n.t), lengthTicks: Double(n.len)))
            }
        }
        #if DEBUG
        runGameAutoplay(clock, heard: heard)
        runGameAutoTap(heard)
        runGameAutoKeys(heard)
        runPracticeHook(heard)
        #endif
        if practice {
            // The end of the song: hold there; the scrubber goes back.
            if playing, heard.tick >= Double(game.endTick) { audio.send(.pause) }
            return
        }
        if game.finished, gameResult == nil {
            let r = game.result()
            gameResult = r
            audio.send(.stop)
            if gameSpeed < 0.999 {
                // Under full speed the run was practice: the result shows, nothing is recorded.
                lessonLog.info("stage: \(r.grade, privacy: .public) \(r.score) at \(Int((self.gameSpeed * 100).rounded()))% speed · \(r.perfect)/\(r.good)/\(r.missed) · not recorded")
                return
            }
            if !ProgressStore.readOnly { lastRun = progress.record(run: r) }
            // The plan's song goals score themselves off the same run.
            onGameRun?(r)
            lessonLog.info("stage: \(r.grade, privacy: .public) \(r.score) · \(r.perfect)/\(r.good)/\(r.missed) · combo \(r.maxCombo)")
        }
    }

    /// What the game screen draws, this frame.
    func gameState() -> GameState {
        guard let game else { return GameState() }
        let s = audio.snapshot()
        let clock = TransportClock(s)
        let heard = clock.valid ? clock.position(atHost: mach_absolute_time()) : nil
        let tick = s.epoch == gameEpoch ? (heard?.tick ?? 0) : 0
        // The band's own pace while it rolls (a knob turn lands on a downbeat); the knob's while it holds.
        let rolling = s.epoch == gameEpoch && (heard?.msPerTick.isFinite ?? false)
        let msPerTick = rolling ? heard!.msPerTick : 60000 / (Double(game.song.meta.tempo) * gameSpeed * Double(game.ticksPerBeat))
        _ = practiceTick  // a scrub while held redraws the highway
        let lookahead = GameState.lookaheadSeconds * 1000 / msPerTick
        let cue = game.cue(at: tick, msPerTick: msPerTick)
        // During a practice count-in the bar is the one the clicks land on, not the one before.
        let bar = practice && countIn != nil ? Int(practiceCountBase / Double(game.ticksPerBar))
            : max(0, Int((tick / Double(game.ticksPerBar)).rounded(.down)))
        let song = game.song
        let visible = game.onHighway(from: tick - Double(game.ticksPerBeat), to: tick + lookahead).map {
            GameState.HighwayNote(id: $0.index, note: $0.note.n, tick: Double($0.note.t), length: Double($0.note.len),
                                  status: $0.status, finger: $0.note.f)
        }
        return GameState(
            title: song.meta.title, style: song.meta.style, part: game.part, partTitle: song.part(game.part).title,
            difficulty: game.difficulty, level: game.level, tiers: game.tiers, section: song.section(atBar: min(bar, song.bars - 1)),
            chord: song.chord(atBar: min(bar, song.bars - 1)),
            nextChord: bar + 1 < song.bars ? song.chord(atBar: bar + 1) : "",
            bar: min(bar, song.bars - 1), bars: song.bars, beat: beat,
            score: game.score, combo: game.combo, maxCombo: game.maxCombo, multiplier: game.multiplier,
            accuracy: game.accuracy, progress: min(1, max(0, tick / Double(song.bars * game.ticksPerBar))),
            countIn: countIn, playing: playing, pop: game.pop, practice: practice, speed: gameSpeed,
            tempo: tempo, pendingTempo: pendingTempo, songTempo: song.meta.tempo,
            heardTick: tick, lookaheadTicks: lookahead, ticksPerBeat: game.ticksPerBeat, ticksPerBar: game.ticksPerBar,
            notes: visible, keys: song.keyboard(game.part), nowNotes: cue.now, nextNotes: cue.next,
            pressedNotes: pressed, fingers: cue.fingers, nowFingers: cue.nowFingers, nextFinger: cue.nextFingers.min(),
            rightHand: game.part == .melody, result: gameResult, lastRun: lastRun,
            board: progress.scores(song: song.name), sections: song.meta.sections)
    }
}
