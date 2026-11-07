import Foundation

/// Ask the teacher (0.1 (113)). Bart: "at all times in the app, give me a small UI widget to
/// pull up the agent and chat with them, including when i'm doing a task from the map… is
/// this song in A minor? why was the melody i played mostly a D (the 4) and the F (a 6)?
/// should i lean on those for my improv, and when we get to the IV chord, and the V, what's
/// typically advised". One small button on every screen (`AskButton`) opens a sheet
/// (`AskSheet`) over whatever is up; every question goes out with where the player is
/// (`chatContext`), and the server adds what they did in their last two sessions
/// (`src/lib/takt/memory.ts`: runs, jams and the reviews they got, Agent mode, earlier
/// questions), so "what did you say about my jam?" has an answer.
extension AppModel {
    /// The sheet. A run or a lesson under way holds while you ask: you can't play and type.
    func openAsk() {
        if let player, player.playing, [.game, .lesson].contains(route) { player.togglePlay() }
        chat.unread = false
        askOpen = true
    }

    /// A question from the sheet: once the account is known (a moment after launch), with
    /// where the player is right now.
    func ask(_ text: String) {
        Task { @MainActor in
            var waited = 0
            #if DEBUG
            let offline = UserDefaults.standard.string(forKey: "ChatReply") != nil
            #else
            let offline = false
            #endif
            while !offline && account.state == .unknown && waited < 40 {
                try? await Task.sleep(for: .milliseconds(250))
                waited += 1
            }
            chat.ask(text, context: chatContext(), where: chatWhere())
        }
    }

    /// The map's level the player is on: the one a goal opened, the one open over the map, or
    /// the one up next.
    private var chatLevel: LearningPlan.Level? {
        let n = fromLevel ?? openVenue ?? (goals.cleared + 1)
        return plan.levels.first { $0.n == n }
    }

    /// Where the player is, in one line: the sheet's header, the memory's label.
    func chatWhere() -> String {
        let level = fromLevel.map { " · Level \($0)" } ?? ""
        switch route {
        case .game:
            guard let player, let g = player.game else { return "Stage" }
            let s = player.gameState()
            return "\(g.song.meta.title) · \(g.song.part(g.part).title) · \(g.difficulty.title)\(level) · bar \(s.bar + 1)"
        case .lesson, .result:
            guard let player else { return "Learn" }
            return "\(player.content.module.title) · \(player.currentStep.title)\(level)"
        case .lessons: return "Learn"
        case .stage: return "Stage"
        case .map: return chatLevel.map { "Map · Level \($0.n), \($0.title)" } ?? "Map"
        case .module: return module(currentModule).module.title
        case .earModule: return LessonEntry.ear.title
        case .settings: return "Settings"
        case .calibrate: return "Timing"
        case .quiz: return "Quiz"
        case .earGame: return earKind.title
        }
    }

    /// Everything the teacher is told about where the player is, as the server reads it
    /// (`describe` in chat-agent.ts): the screen, the map's level with its goals, the song under
    /// way with its chords and its line at this level and the run so far, or the lesson step
    /// with its key, form, notes allowed and the take so far, and the progress.
    func chatContext() -> [String: Any] {
        let screens: [Route: String] = [.lessons: "learn", .map: "map", .module: "module", .earModule: "ear", .lesson: "lesson", .result: "result",
                                        .settings: "settings", .calibrate: "calibrate", .quiz: "quiz", .earGame: "eargame", .stage: "stage", .game: "game"]
        var c: [String: Any] = ["device": Self.device, "screen": screens[route] ?? "unknown", "where": chatWhere(), "timeZone": TimeZone.current.identifier]
        if let level = chatLevel {
            let g = goals
            c["level"] = ["n": level.n, "title": level.title, "text": level.text, "opened": fromLevel != nil,
                          "goals": level.items.map { ["title": $0.title, "detail": $0.detail, "status": g.status(level, $0), "done": g.done(level, $0)] as [String: Any] }]
        }
        if let player {
            if route == .game, let game = player.game {
                c["song"] = songContext(player, game)
            } else if route == .lesson || route == .result {
                c["lesson"] = lessonContext(player)
            }
        }
        c["progress"] = ["streak": progress.streak(), "xp": progress.xp, "levelsCleared": goals.cleared, "practicedToday": progress.practicedToday]
        return c
    }

    private func songContext(_ player: Player, _ game: GameEngine) -> [String: Any] {
        let song = game.song
        let s = player.gameState()
        // The line as the highway shows it: every note on at its bar's tier.
        let active = game.notes.indices.filter { game.active($0) }.map { game.notes[$0] }
        var d: [String: Any] = [
            "title": song.meta.title, "style": song.meta.style, "key": song.meta.key, "keyName": ChatContext.keyName(song.meta.key),
            "tempo": song.meta.tempo, "bars": song.bars, "length": song.length,
            "sections": song.meta.sections.map { ["bar": $0.bar + 1, "name": $0.name] as [String: Any] },
            "form": Array(song.band.form.prefix(song.bars)),
            "part": game.part.rawValue, "partTitle": song.part(game.part).title, "difficulty": game.difficulty.title,
            "level": s.level, "tiers": s.tiers, "opened": fromLevel != nil,
            "bar": s.bar + 1, "section": s.section, "chord": s.chord, "playing": s.playing, "practice": s.practice, "speedPercent": s.speedPercent,
            "run": ["score": game.score, "combo": game.combo, "maxCombo": game.maxCombo, "accuracy": game.accuracy, "perfect": game.perfect, "good": game.good,
                    "early": game.early, "late": game.late, "missed": game.missed, "wrong": game.wrong] as [String: Any],
            "keys": ChatContext.keys(active.map(\.n)), "range": ChatContext.range(active.map(\.n)),
            "chart": ChatContext.transcript(notes: active.map { ($0.t, $0.n, $0.len) }, chords: song.band.form,
                                            sections: song.meta.sections.map { ($0.bar, $0.name) }, bars: song.bars,
                                            ticksPerBeat: game.ticksPerBeat, ticksPerBar: game.ticksPerBar),
        ]
        if let r = player.gameResult {
            d["result"] = ["grade": r.grade, "accuracy": r.accuracy, "timing": r.timing, "leanMs": r.leanMs,
                           "verdict": "\(r.verdict.title). \(r.verdict.line)", "recorded": !s.slowed] as [String: Any]
        }
        d["board"] = progress.scores(song: song.name).prefix(3).map {
            ["grade": $0.grade, "accuracy": $0.accuracy, "part": $0.part, "difficulty": $0.difficulty, "when": $0.date.formatted(.dateTime.day().month(.abbreviated))] as [String: Any]
        }
        return d
    }

    private func lessonContext(_ player: Player) -> [String: Any] {
        let content = player.content
        let step = player.currentStep
        let ls = player.lessonState()
        let chords = content.chords(of: step)
        let form = content.form(of: step)
        let backing = step.backing.map { Song.bundled($0) }
        let key = backing?.meta.key ?? step.key ?? content.key ?? ""
        var st: [String: Any] = [
            "id": step.id, "title": step.title, "kind": step.kind.rawValue, "hand": step.hand ?? "left",
            "feel": step.straight ? "straight" : "shuffle", "form": form,
            "chords": Dictionary(uniqueKeysWithValues: chords.map { ($0.key, ["numeral": $0.value.numeral, "root": ChatContext.names[$0.value.root]]) }),
        ]
        if let about = step.about { st["about"] = about }
        if !key.isEmpty {
            st["key"] = key
            st["keyName"] = ChatContext.keyName(key)
        }
        if let t = step.tempo { st["tempo"] = t }
        if let b = backing { st["backing"] = "\(b.meta.title) (\(b.meta.style), \(ChatContext.keyName(b.meta.key)), \(b.meta.tempo) bpm)" }
        if step.scale != nil, let first = form.first, let root = chords[first]?.root {
            st["scale"] = ChatContext.scaleLine(allowed: content.scale(of: step), root: root)
        }
        if step.kind != .free, step.kind != .card, let pattern = step.pattern, !pattern.isEmpty {
            let one = content.expected(step, ticksPerBeat: player.audio.band.ticksPerBeat).prefix(pattern.count)
            st["notes"] = one.map { "\(ChatContext.name($0.display))\($0.finger.map { " (\($0))" } ?? "")" }.joined(separator: " ")
        }
        var l: [String: Any] = [
            "module": content.module.title, "code": content.code, "lesson": ls.lesson, "lessonCount": ls.lessonCount,
            "lessonTitle": ls.lessonTitle, "goal": ls.goal, "step": st, "opened": fromLevel != nil,
            "phase": ls.intro != nil ? "intro" : ls.complete != nil ? "complete" : ls.card != nil ? "card" : "playing",
            "tempoNow": player.tempo, "playing": player.playing, "bar": ls.bar + 1, "chorus": ls.chorus,
            "cleanChoruses": ls.cleanChoruses, "gate": ls.gate, "coach": ls.coach,
        ]
        if let c = ls.stepTempo { l["countsAt"] = c }
        if let lc = ls.lastChorus { l["lastChorus"] = lc }
        if let d = ls.lastChorusDetail { l["lastChorusDetail"] = d }
        if let t = ls.theme { l["theme"] = "\(t.title): \(t.line)" }
        if step.kind == .free {
            var imp: [String: Any] = ["notes": player.takeNotes]
            if let take = player.improvTake() {
                imp["choruses"] = take.bars / max(1, form.count)
                imp["take"] = ChatContext.transcript(take: take, form: form, ticksPerBeat: player.audio.band.ticksPerBeat)
            }
            l["improv"] = imp
        }
        if route == .result, let f = player.finish { l["finish"] = f.detail ?? f.summary }
        return l
    }
}
