import SwiftUI

/// Which screen is up. The band plays under every one of them (principle 1: the band is
/// already playing); only the lesson screen scores what you play.
enum Route: Equatable {
    case lessons, map, module, earModule, lesson, result, settings, calibrate, quiz, earGame, stage, game
}

/// The app's screens and what they share: the player (band, monitor, lesson), the progress
/// store and the account. Screens switch at once, without animation (principle 5).
@Observable
final class AppModel {
    var route: Route = .lessons {
        didSet {
            player?.inLesson = route == .lesson
            player?.inGame = route == .game
            if route != .map { openVenue = nil }
            if ![.lesson, .result, .calibrate, .game].contains(route) { fromLevel = nil }
            // Off the lesson screen the teacher's idea goes and the module is as bundled again.
            if route != .lesson { player?.dropVersion() }
        }
    }

    // MARK: Map

    /// The map's world (Settings → Taste → Map when there is more than one).
    private(set) var mapWorld = MapWorld.bundled(MapWorld.selected)
    /// The venue open over the map, by level (1-based).
    var openVenue: Int?

    func mapWorldChanged() {
        if mapWorld.world != MapWorld.selected { mapWorld = .bundled(MapWorld.selected) }
    }

    // MARK: Goals

    /// The plan the player follows: the map's levels and what clears each (`LearningPlan`).
    /// Everyone is on the bundled default; a plan of the player's own plugs in by id.
    let plan = LearningPlan.active(for: nil)

    /// The plan against the player's records: levels cleared, each goal's state.
    var goals: GoalProgress {
        var override: Int?
        #if DEBUG
        // `-MapCleared n` shows the map as if n levels were cleared (screenshots).
        if UserDefaults.standard.object(forKey: "MapCleared") != nil { override = UserDefaults.standard.integer(forKey: "MapCleared") }
        #endif
        return GoalProgress(plan: plan, records: progress.snapshot.goals, clearedOverride: override)
    }

    /// A goal from the level's screen: its step from the intro, the knob on the ladder's next
    /// tempo, or its song on the Stage at the goal's part and level (held at bar 1 in practice
    /// with `practice`, as the set list's Practice opens it; 0.1 (113)); Back (and Esc) land on
    /// that level again, still on the map.
    func start(goal item: LearningPlan.Item, level: LearningPlan.Level, practice: Bool = false) {
        guard let player else { return }
        openVenue = nil
        if item.kind == .song {
            guard let name = item.song, let part = item.part.flatMap(Song.PartKey.init(rawValue:)),
                  let difficulty = item.difficulty.flatMap(GameEngine.Difficulty.init(rawValue:)) else { return }
            let song = Song.bundled(name)
            pick(song: song, part: part)
            pick(song: song, difficulty: difficulty)
            player.startGame(song: song, part: part, difficulty: difficulty, practice: practice)
            route = .game
        } else {
            guard let module = item.module, let step = item.step else { return }
            ensure(module: module)
            currentModule = module
            player.start(stepId: step, tempo: item.kind == .step ? goals.suggestedTempo(level, item) : nil)
            open(lesson: module)
        }
        fromLevel = level.n
    }

    /// The level whose goals opened the lesson or the song; nil when it came from the menu, a
    /// module or the Stage.
    private(set) var fromLevel: Int?

    /// Out of the lesson: back to the map's level it was started from, else `fallback` (the
    /// module screen; Esc and the result screen go to the menu).
    func leaveLesson(else fallback: Route = .module) {
        if let level = fromLevel {
            route = .map
            openVenue = level
        } else {
            route = fallback
        }
    }

    /// A scale goal's fingering as a line ("1-2-3, tuck, 1-2-3, tuck, 1-2-3-4-5, and
    /// reverse"), from its step's run; nil for a goal that isn't a run.
    func fingerLine(_ item: LearningPlan.Item) -> String? {
        guard item.kind == .step, let m = item.module, let step = item.step else { return nil }
        return module(m).fingerLine(step: step)
    }

    /// Every judged chorus (`Player.onGoalChorus`): the goals on that step score themselves. A
    /// step goal wants every expected note hit and nothing extra; a jam goal a chorus in the scale.
    func goalJudged(module code: String, verdict v: LessonEngine.Verdict) {
        guard !ProgressStore.readOnly else { return }
        for (level, item) in plan.items(step: v.stepId) where item.module.map({ module($0).code }) == code {
            let key = plan.key(level, item)
            switch item.kind {
            case .step:
                guard let r = v.result, r.hits == r.notes.count, r.extras.isEmpty, let target = item.tempo else { continue }
                progress.goalChorus(key, tempo: Int(v.tempo.rounded()), target: target)
            case .jam:
                guard v.free != nil, v.counted else { continue }
                progress.goalJam(key, needed: item.choruses ?? 1)
            case .song, .improv:
                continue
            }
        }
    }

    // MARK: Improv (IMPROV.md)

    /// The review sheet over an improv: the take sent, then the teacher's steps, the review, or
    /// what went wrong.
    struct ImprovReview: Equatable {
        enum Phase: Equatable {
            case listening([String])
            case reviewed(Improv.Review, id: String?)
            case failed(String)
        }
        var phase: Phase
        let take: Improv.Take
        let count: Improv.Count
        /// The plan's improv goals this take counts for (title, met), and the XP it earned.
        var goals: [(title: String, met: Bool)] = []
        var xp = 0
        let started: Date
        /// The Stage song the improv played over (`Lesson.Step.backing`), when it is one: the
        /// teacher writes the whole track on it after the review (`writeTrack`).
        var backingSong: String? = nil

        static func == (a: Self, b: Self) -> Bool {
            a.phase == b.phase && a.take == b.take && a.xp == b.xp && a.goals.map(\.title) == b.goals.map(\.title) && a.goals.map(\.met) == b.goals.map(\.met)
        }
    }
    var improvReview: ImprovReview?
    @ObservationIgnored private lazy var improvClient = ImprovClient()
    @ObservationIgnored private var improvTask: Task<Void, Never>?
    /// The last take sent, as sent: the whole track is written from it after the review.
    @ObservationIgnored private var lastImprovRequest: ImprovClient.Request?

    /// The teacher writing the whole track after a review (Bart, 2026-11-07: "have them produce
    /// a full version of the track that I can play… add that to the versions of the song in
    /// game mode"): the steps as they come, then the track landed as the song's Solo level, or
    /// what went wrong. It outlives the review sheet: closing the sheet does not stop it, and
    /// the Stage shows the Solo chip once it lands.
    struct TrackJob: Equatable {
        enum Phase: Equatable {
            case writing([String])
            /// The track landed: the teacher's title and line, the bundle's song name.
            case done(title: String, line: String, name: String)
            case failed(String)
        }
        var phase: Phase
        /// The backing song (bundled) the track is on, and its title.
        let base: String
        let baseTitle: String
        let started: Date
        /// The review it grows from (to write it again after a failure).
        let review: Improv.Review
        let reviewID: String?

        static func == (a: Self, b: Self) -> Bool { a.phase == b.phase && a.base == b.base && a.started == b.started }
    }
    var trackJob: TrackJob?
    @ObservationIgnored private var trackTask: Task<Void, Never>?

    /// "Send it": the band stops, the take goes to the teacher, the sheet shows it listening.
    func sendTake() {
        guard let player, let take = player.improvTake(), take.notes.count >= Player.takeMinimum else { return }
        player.pauseForReview()
        let content = player.content, step = player.currentStep
        let allowed = content.scale(of: step)
        let count = Improv.Count.of(take, formBars: content.form(of: step).count, allowed: allowed)
        let song = step.backing.map { Song.bundled($0) }
        let names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"]
        let root = content.chords(of: step)[content.form(of: step).first ?? ""]?.root ?? 0
        let backing: [String: Any] = [
            "title": song?.meta.title ?? "the \(content.module.title) band",
            "style": song?.meta.style ?? content.module.title,
            "key": song?.meta.key ?? step.key ?? content.key ?? names[root],
            "feel": step.straight ? "straight" : "shuffle",
            "form": content.form(of: step),
            "scale": step.scale == nil ? NSNull() : Array(allowed).sorted(),
            "scaleName": step.scale == nil ? "" : (0..<12).map { (root + $0) % 12 }.filter { allowed.contains($0) }.map { names[$0] }.joined(separator: " "),
        ]
        let jam = content.jams?.first { $0.step == step.id }
        let goals = plan.levels.flatMap { l in l.items.filter { $0.kind == .improv && $0.step == step.id && $0.module.map({ module($0).code }) == content.code }.map { (l, $0) } }
        let context: [String: Any] = [
            "where": goals.isEmpty ? "jam" : "level",
            "title": jam?.title ?? step.title,
            "about": step.about ?? "",
            "hand": step.hand ?? "right",
            "device": Self.device,
        ]
        var state = ImprovReview(phase: .listening([]), take: take, count: count, started: Date())
        state.goals = goals.map { (l, i) in
            ("Level \(l.n) · \(i.title)", count.choruses >= (i.choruses ?? 0) && count.notes >= (i.minNotes ?? 0) && count.inScale >= (i.inScale ?? 1) - 1e-9)
        }
        state.backingSong = step.backing
        improvReview = state
        let request = ImprovClient.Request(take: take, backing: backing, context: context)
        lastImprovRequest = request
        improvTask?.cancel()
        improvTask = Task { @MainActor [weak self] in
            guard let self else { return }
            #if DEBUG
            // `-ImprovReview <file>`: the review from a saved file (a `review` event's review), no network.
            if let path = UserDefaults.standard.string(forKey: "ImprovReview"),
               let review = try? JSONDecoder().decode(Improv.Review.self, from: Data(contentsOf: URL(fileURLWithPath: path))) {
                self.reviewed(review, id: "debug", goals: goals)
                return
            }
            #endif
            for await e in self.improvClient.review(request) {
                guard self.improvReview?.started == state.started else { return }
                switch e {
                case .status(let text):
                    if case .listening(let steps) = self.improvReview?.phase { self.improvReview?.phase = .listening(steps + [text]) }
                case .review(let review, let id):
                    self.reviewed(review, id: id, goals: goals)
                case .failed(let text):
                    self.improvReview?.phase = .failed(text)
                }
            }
        }
    }

    private func reviewed(_ review: Improv.Review, id: String?, goals: [(LearningPlan.Level, LearningPlan.Item)]) {
        guard var state = improvReview else { return }
        #if DEBUG
        // `-ImprovVersion 1`: straight on to the idea once it's in (screenshots of the version).
        defer { if UserDefaults.standard.bool(forKey: "ImprovVersion") { DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { self.tryVersion() } } }
        #endif
        state.phase = .reviewed(review, id: id)
        if !ProgressStore.readOnly {
            if progress.award("improv·\(id ?? UUID().uuidString)", kind: "improv", points: Improv.XP.improv) { state.xp += Improv.XP.improv }
            for ((level, item), g) in zip(goals, state.goals) where g.met && progress.goal(plan.key(level, item)).done == nil {
                progress.goalImprov(plan.key(level, item))
                state.xp += Improv.XP.goal
            }
        }
        improvReview = state
        writeTrack(review: review, id: id)
    }

    // MARK: The whole track

    /// After a review over a Stage song: the teacher writes the whole track from the idea
    /// (`POST /api/takt/improv/track`, src/lib/takt/solo-agent.ts), and it lands as the song's
    /// Solo level (`ModStore.solo(of:)`). Runs on its own: the sheet may close meanwhile.
    func writeTrack(review: Improv.Review, id: String?) {
        guard let base = improvReview?.backingSong ?? trackJob?.base, let request = lastImprovRequest,
              let song = bundledSongs.first(where: { $0.name == base }) else { return }
        var job = TrackJob(phase: .writing([]), base: base, baseTitle: song.meta.title, started: Date(), review: review, reviewID: id)
        trackTask?.cancel()
        #if DEBUG
        // `-ImprovTrack <file>`: the track from a saved bundle (a `track` event's mod), no
        // network, a moment after the review; with `-ImprovReview` alone no track is written.
        if let path = UserDefaults.standard.string(forKey: "ImprovTrack") {
            trackJob = job
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
                guard let self, self.trackJob?.started == job.started else { return }
                do {
                    try self.mods.loadFile(path)
                    guard let solo = self.mods.solo(of: base), let bundle = self.mods.bundle(for: solo) else { throw ModStore.Failure(message: "-ImprovTrack: no solo of \(base) in the file") }
                    // The teacher's title leads its line in the thread ("Lantern climb: …").
                    let said = bundle.messages.last { $0.role == "agent" }?.text ?? ""
                    let title = said.split(separator: ":", maxSplits: 1).first.map(String.init) ?? "Your track"
                    self.trackJob?.phase = .done(title: title, line: solo.meta.line, name: solo.name)
                } catch {
                    fatalError("-ImprovTrack \(path): \(error)")
                }
            }
            return
        }
        if UserDefaults.standard.string(forKey: "ImprovReview") != nil { return }
        #endif
        guard let chartingURL = Foundation.Bundle.main.url(forResource: "charting", withExtension: "json"),
              let charting = try? JSONSerialization.jsonObject(with: Data(contentsOf: chartingURL)),
              let songURL = Foundation.Bundle.main.url(forResource: song.name, withExtension: "json"),
              let file = try? JSONSerialization.jsonObject(with: Data(contentsOf: songURL)) else { return }
        var body: [String: Any] = [
            "take": request.take.json, "backing": request.backing, "context": request.context,
            "review": [
                "headline": review.headline, "notes": review.notes,
                "idea": ["title": review.idea.title, "why": review.idea.why, "bars": review.idea.bars,
                         "notes": review.idea.notes.map { ["t": $0.t, "n": $0.n, "len": $0.len, "f": $0.f] }],
            ],
            "song": file, "base": song.name, "base_title": song.meta.title, "charting": charting,
        ]
        if let own = Charting.bundled.songs[song.name], let data = try? JSONEncoder().encode(own), let json = try? JSONSerialization.jsonObject(with: data) {
            body["song_charting"] = json
        }
        job.phase = .writing([])
        trackJob = job
        trackTask = Task { @MainActor [weak self] in
            guard let self else { return }
            for await e in self.improvClient.track(body) {
                guard self.trackJob?.started == job.started else { return }
                switch e {
                case .status(let text):
                    if case .writing(let steps) = self.trackJob?.phase { self.trackJob?.phase = .writing(steps + [text]) }
                case .track(let data, let title, let line):
                    do {
                        let bundle = try self.mods.receive(data)
                        self.trackJob?.phase = .done(title: title, line: line, name: bundle.name)
                    } catch {
                        self.trackJob?.phase = .failed("The track came back in a shape the app can't play: \((error as? Song.LoadError)?.message ?? error.localizedDescription)")
                    }
                case .failed(let text):
                    self.trackJob?.phase = .failed(text)
                }
            }
        }
    }

    /// The track card's "Write it again", after a failure.
    func retryTrack() {
        guard let job = trackJob, case .failed = job.phase else { return }
        writeTrack(review: job.review, id: job.reviewID)
    }

    /// The track card's "Play the whole track": the review closes and the Stage plays the
    /// backing song on its Solo level (the melody, the teacher's line).
    func playTrack() {
        guard let job = trackJob, case .done = job.phase, let base = bundledSongs.first(where: { $0.name == job.base }) else { return }
        closeReview()
        playSolo(of: base)
    }

    /// The sheet's "Try my version": the idea as a step over the same backing.
    func tryVersion() {
        guard let player, case .reviewed(let review, let id) = improvReview?.phase else { return }
        improvReview = nil
        player.startVersion(review.idea, take: String((id ?? UUID().uuidString).prefix(8)))
    }

    /// The sheet's "Improvise again": a new take from the top.
    func improviseAgain() {
        improvTask?.cancel()
        improvReview = nil
        player?.improviseAgain()
    }

    /// The sheet's "Send it again", after a failure: the same take.
    func resendTake() {
        guard improvReview != nil else { return }
        improvReview = nil
        sendTake()
    }

    func closeReview() {
        improvTask?.cancel()
        improvReview = nil
    }

    static var device: String {
        #if targetEnvironment(macCatalyst)
        return "mac"
        #else
        return "iphone"
        #endif
    }

    /// Every Stage run played to the end (`Player.onGameRun`): a song goal on that song, part and
    /// level keeps its best accuracy and is done at its grade or better.
    func goalRun(_ r: GameEngine.Result) {
        guard !ProgressStore.readOnly else { return }
        for (level, item) in plan.items(song: r.song) where item.part == r.part && item.difficulty == r.difficulty {
            guard let floor = item.grade.flatMap(GameEngine.Result.floor(of:)) else { continue }
            progress.goalRun(plan.key(level, item), accuracy: r.accuracy, floor: floor)
        }
    }

    let player: Player?
    let progress: ProgressStore
    let account: AccountStore
    /// The player's own versions of the Stage songs (Agent mode).
    let mods: ModStore
    /// The thread with the teacher (Ask, `AppModel+Chat.swift`), and whether its sheet is up.
    let chat: ChatStore
    var askOpen = false
    /// The Mac's save panel for the loop (Export MIDI, ⌘E).
    var exporting = false
    /// The module the module screen shows (an entry code: "A1", "S").
    var currentModule = "A1"
    @ObservationIgnored private var loadedModules: [String: Lesson] = [:]

    /// Settings → Taste. The scales come in A minor instead of C major.
    static var preferMinor: Bool { UserDefaults.standard.bool(forKey: "preferMinor") }

    /// A module's content by entry code. The scales pick their key from the taste setting.
    func module(_ code: String) -> Lesson {
        let file = code == "S" ? (Self.preferMinor ? "lesson-S1m" : "lesson-S1") : "lesson-\(code)"
        if let l = loadedModules[file] { return l }
        let l = Lesson.bundled(file)
        loadedModules[file] = l
        return l
    }

    /// Lessons of a module done: the record, or what the step reached says (older records).
    func lessonsDone(_ content: Lesson) -> Int {
        let r = progress.lesson(content.code)
        return max(r.lessonsDone, content.lessonsDone(reachedStep: r.reachedStep))
    }

    /// The player on this module's content.
    private func ensure(module code: String) {
        guard let player else { return }
        let content = module(code)
        if player.content.code != content.code { player.switchModule(to: content) }
    }

    /// The taste changed: a loaded scales module in the other key is dropped, and the player
    /// moves over if it was on it.
    func tasteChanged() {
        loadedModules = loadedModules.filter { !$0.key.hasPrefix("lesson-S1") }
        if let player, player.content.module.code == "scales" { ensure(module: "S") }
    }

    func openModule(_ code: String) {
        currentModule = code
        ensure(module: code)
        route = .module
    }

    /// Where calibration goes when it is done: the lesson (first time) or Settings.
    private var afterCalibration: Route = .lessons

    init(player: Player?, progress: ProgressStore, account: AccountStore, mods: ModStore = ModStore(), chat: ChatStore = ChatStore()) {
        self.player = player
        self.progress = progress
        self.account = account
        self.mods = mods
        self.chat = chat
        player?.onGoalChorus = { [weak self] code, v in self?.goalJudged(module: code, verdict: v) }
        player?.onGameRun = { [weak self] r in self?.goalRun(r) }
        #if DEBUG
        player?.onImprovDone = { [weak self] in self?.sendTake() }
        #endif
        #if DEBUG
        let d = UserDefaults.standard
        // `-LoadMod <file>` puts a saved bundle on the set list without an account.
        if let path = d.string(forKey: "LoadMod") {
            do { try mods.loadFile(path) } catch { fatalError("-LoadMod \(path): \(error)") }
        }
        if let m = d.string(forKey: "Module") { openModule(m) }
        if let player {
            if d.integer(forKey: "Step") > 1 { player.restartLesson(at: d.integer(forKey: "Step") - 1) }
            if d.integer(forKey: "Lesson") > 1 { player.restartLesson(at: player.content.firstStep(ofLesson: d.integer(forKey: "Lesson") - 1)) }
            if d.bool(forKey: "StepComplete") { player.debugComplete() }
        }
        if let r = UserDefaults.standard.string(forKey: "Route") {
            switch r {
            case "lessons": route = .lessons
            case "lesson": route = .lesson
            case "module": route = .module
            case "earmodule": route = .earModule
            case "settings": route = .settings
            case "calibrate": route = .calibrate
            case "map":
                route = .map
                // `-Venue n` opens level n's venue over it; `-Goal <id>` starts that level's goal as
                // its button does, and `-Back 1` then leaves the lesson (or the song) the way Back does.
                if d.integer(forKey: "Venue") > 0 { openVenue = d.integer(forKey: "Venue") }
                if let id = d.string(forKey: "Goal") {
                    guard let level = plan.levels.first(where: { $0.n == max(1, d.integer(forKey: "Venue")) }),
                          let item = level.items.first(where: { $0.id == id }) else { fatalError("-Goal: no goal \(id)") }
                    start(goal: item, level: level)
                    if d.bool(forKey: "Back") { item.kind == .song ? leaveGame() : leaveLesson() }
                }
            case "stage":
                route = .stage
                // `-Song <name> -Part melody -Difficulty solo` picks on that song's card (screenshots).
                if let name = d.string(forKey: "Song"), let song = songs.first(where: { $0.name == name }) {
                    if let p = d.string(forKey: "Part").flatMap(Song.PartKey.init(rawValue:)) { pick(song: song, part: p) }
                    if let dd = d.string(forKey: "Difficulty").flatMap(GameEngine.Difficulty.init(rawValue:)) { pick(song: song, difficulty: dd) }
                }
            case "game": break  // below
            case "eargame": break  // below
            case "quiz": break  // below, once everything is set
            default: fatalError("unknown -Route \(r)")
            }
        }
        #endif
        player?.inLesson = route == .lesson
        #if DEBUG
        // `-Route game -Song song-slow-burn -Part melody -Difficulty adaptive` starts a run;
        // with `-Practice 1` it opens held in practice at bar 1, as the set list's Practice does,
        // and with `-Call 1` calling from there (`-CallAuto`, `-CallSnapshotDir`: Player+Call).
        if UserDefaults.standard.string(forKey: "Route") == "game" {
            let d = UserDefaults.standard
            let song = songs.first { $0.name == (d.string(forKey: "Song") ?? Song.catalog[0]) } ?? songs[0]
            pick(song: song, part: Song.PartKey(rawValue: d.string(forKey: "Part") ?? "chords") ?? .chords)
            pick(song: song, difficulty: GameEngine.Difficulty(rawValue: d.string(forKey: "Difficulty") ?? "adaptive") ?? .adaptive)
            if d.bool(forKey: "Call") { call(song: song) } else if d.bool(forKey: "Practice") { practice(song: song) } else { play(song: song) }
        }
        // `-AgentSheet <song>` opens Agent mode on that song (over the stage, or over the run
        // `-Route game` started, with the position); `-AgentSay "<text>"` sends it at once.
        if let name = d.string(forKey: "AgentSheet") {
            guard let song = songs.first(where: { $0.name == name }) else { fatalError("-AgentSheet: no song \(name)") }
            if route == .game, let player { openAgent(fromGame: player) } else { openAgent(song: song) }
        }
        // `-Ask 1` opens the teacher's sheet over whatever route is up (`-AskSay "<text>"` sends
        // at once; `-ChatReply <file>` answers from a file, no network; `-ChatFile <path>` the thread).
        if d.bool(forKey: "Ask") { DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.openAsk() } }
        // `-Route quiz` starts today's quiz; `-QuizAnswers 1,0,1` answers in order (Next between),
        // leaving the last answer's explanation up, or the summary after a full five.
        // `-Route eargame [-EarKind intervals] [-EarLevel n] [-EarAnswers r,r,w]` plays an ear game, answering
        // right (r) or wrong (w) in order without the pauses, the last answer left up.
        if UserDefaults.standard.string(forKey: "Route") == "eargame" {
            let d = UserDefaults.standard
            startEarGame(EarGame.Kind(rawValue: d.string(forKey: "EarKind") ?? "chords")!,
                         level: d.integer(forKey: "EarLevel") > 0 ? d.integer(forKey: "EarLevel") : nil)
            let script = (d.string(forKey: "EarAnswers") ?? "").split(separator: ",")
            for (i, a) in script.enumerated() {
                guard let r = earRound else { break }
                answerEar(a == "r" ? r.answer : (r.answer + 1) % r.options.count, advance: false)
                if i < script.count - 1 { nextEarRound() }
            }
        }
        if UserDefaults.standard.string(forKey: "Route") == "quiz" {
            startQuiz()
            let answers = (UserDefaults.standard.string(forKey: "QuizAnswers") ?? "").split(separator: ",").compactMap { Int($0) }
            for (i, a) in answers.enumerated() {
                answer(a)
                if i < answers.count - 1 || answers.count == quiz?.questions.count { nextQuestion() }
            }
        }
        #endif
    }

    /// The lesson as it stands: a finished or fresh one starts from the top, one in progress
    /// picks up where it was.
    func open(lesson code: String) {
        ensure(module: code)
        guard let player else { return }
        if player.finish != nil { player.restartLesson() }
        guard Player.calibrated else { return calibrate(then: .lesson) }
        route = .lesson
    }

    func calibrate(then next: Route) {
        afterCalibration = next
        route = .calibrate
    }

    func leaveCalibration() { route = afterCalibration }

    // MARK: Quizzes

    /// The quiz under way.
    private(set) var quiz: QuizSession?
    /// Where the quiz left from (the menu or the map).
    private var afterQuiz: Route = .lessons

    var challenge: QuizBank.Challenge {
        QuizBank.challenge(placed: progress.snapshot.quiz.level != nil)
    }

    /// The ear check the first time; after it, today's five (a chorus day gets the chord five).
    func startQuiz() {
        let q = progress.snapshot.quiz
        if let level = q.level {
            let c = challenge == .chorus ? .chords : challenge
            quiz = QuizSession(mode: .daily, questions: QuizBank.daily(c, level: level, boxes: q.boxes, day: ProgressStore.day()))
        } else {
            quiz = QuizSession(mode: .placement, questions: QuizBank.placement)
        }
        if route != .quiz { afterQuiz = route }
        player?.holdBand()
        route = .quiz
        playCurrent()
    }

    func answer(_ option: Int) {
        guard var s = quiz, let q = s.current, let right = s.choose(option) else { return }
        quiz = s
        progress.answered(q.id, correct: right)
    }

    func nextQuestion() {
        guard var s = quiz else { return }
        s.next()
        quiz = s
        if s.finished {
            if s.mode == .placement { progress.placed(QuizBank.level(placement: s.results)) }
            progress.finishedDaily()
        } else {
            playCurrent()
        }
    }

    func playCurrent() {
        if let sound = quiz?.current?.sound { player?.play(sound) }
    }

    // MARK: Ear Trainer

    private(set) var ear: EarGame.Run?
    private(set) var earKind: EarGame.Kind = .chords
    private(set) var earRound: EarGame.Round?
    /// The option picked this round (nil: waiting for an answer).
    private(set) var earPicked: Int?
    private(set) var earPoints = 0
    @ObservationIgnored private var earRNG = SystemRandomNumberGenerator()
    @ObservationIgnored private var earRoundID = 0

    /// At the highest level opened (or `level`).
    func startEarGame(_ kind: EarGame.Kind, level: Int? = nil) {
        earKind = kind
        ear = EarGame.Run(level: level ?? progress.ear(kind).level, top: kind.levels.count)
        earRound = nil
        if route != .earGame { afterQuiz = route }
        player?.holdBand()
        route = .earGame
        nextEarRound()
    }

    func nextEarRound() {
        guard let run = ear else { return }
        earRound = earKind.round(level: run.level, avoiding: earRound, using: &earRNG)
        earPicked = nil
        earRoundID += 1
        playEar()
    }

    func playEar() {
        if let r = earRound { player?.play(r.sound) }
    }

    /// One interval going up from middle C, for the song list.
    func playInterval(_ interval: EarGame.Interval) {
        player?.play(.notes([60, 60 + interval.rawValue]))
    }

    /// An answer: points, the meter, maybe a new level; the next chord comes by itself (after a
    /// miss, a longer pause and the chord again, so you hear it with its name).
    func answerEar(_ option: Int, advance: Bool = true) {
        guard var run = ear, let round = earRound, earPicked == nil else { return }
        let right = option == round.answer
        earPicked = option
        earPoints = run.answer(right: right)
        ear = run
        progress.earAnswered(earKind, level: run.level, score: run.score)
        guard advance else { return }
        if !right { DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in self?.playEar() } }
        let id = earRoundID
        DispatchQueue.main.asyncAfter(deadline: .now() + (right ? (run.leveledUp ? 2.2 : 1.1) : 3.0)) { [weak self] in
            guard let self, self.earRoundID == id, self.route == .earGame else { return }
            self.nextEarRound()
        }
    }

    func goEar(level n: Int) {
        guard var run = ear, n <= progress.ear(earKind).level else { return }
        run.go(to: n)
        ear = run
        nextEarRound()
    }

    func leaveEarGame() {
        ear = nil
        earRound = nil
        earRoundID += 1
        player?.releaseBand()
        route = afterQuiz
    }

    func leaveQuiz() {
        quiz = nil
        player?.releaseBand()
        route = afterQuiz
    }

    /// From the top of a module (by entry code or content code: "A1", "S", "S1m").
    func restart(lesson code: String) {
        guard let player else { return }
        if player.content.code != code { ensure(module: code) }
        player.restartLesson()
        route = .lesson
    }

    /// An ear lesson is done at the game's top level, or once the quiz has placed you.
    func earLessonDone(_ entry: LessonEntry) -> Bool {
        switch entry.kind {
        case .game(let kind): return progress.ear(kind).level >= kind.levels.count
        case .quiz: return progress.snapshot.quiz.level != nil
        default: return false
        }
    }

    /// The ear module's next lesson: the first not done, else the first.
    var nextEarLesson: LessonEntry {
        LessonEntry.earLessons.first { !earLessonDone($0.entry) }?.entry ?? LessonEntry.earLessons[0].entry
    }

    /// From a module screen or card: lesson `n` of that module (the next one, or one done,
    /// again) from its intro.
    func start(module code: String, lesson n: Int) {
        ensure(module: code)
        guard let player else { return }
        currentModule = code
        player.start(lesson: n)
        open(lesson: code)
    }

    /// Play mode: the jam under a lesson, from its intro.
    func start(module code: String, jam j: Lesson.JamSpec) {
        ensure(module: code)
        guard let player else { return }
        currentModule = code
        player.start(jam: j)
        open(lesson: code)
    }

    func jamDone(_ content: Lesson, _ j: Lesson.JamSpec) -> Bool {
        progress.lesson(content.code).jamsDone.contains(j.step)
    }

    /// The lesson screen watches for the payoff finishing.
    func lessonFinished() { route = .result }

    // MARK: Stage

    /// The bundled set list, loaded once (songs not in the bundle yet are skipped).
    @ObservationIgnored private var loadedSongs: [Song]?
    var bundledSongs: [Song] {
        if let loadedSongs { return loadedSongs }
        let s = Song.catalog.compactMap { name in
            Bundle.main.url(forResource: name, withExtension: "json") == nil ? nil : Song.bundled(name)
        }
        loadedSongs = s
        return s
    }

    /// The set list: the bundled songs in catalog order, each followed by the player's mods of
    /// it (and theirs), oldest first; a mod whose base is gone comes last.
    var songs: [Song] {
        var out: [Song] = []
        var placed: Set<String> = []
        func place(_ s: Song) {
            guard !placed.contains(s.name) else { return }
            out.append(s)
            placed.insert(s.name)
            for m in mods.mods(of: s.name) { place(m) }
        }
        for s in bundledSongs { place(s) }
        for m in mods.songs { place(m) }
        return out
    }

    /// The bundled song a mod descends from (through mods of mods); a bundled song's own name.
    func rootName(_ song: Song) -> String {
        var s = song
        var hops = 0
        while let base = s.mod?.base, hops < 20 {
            guard let b = songs.first(where: { $0.name == base }) else { return base }
            s = b
            hops += 1
        }
        return s.name
    }

    /// The song a mod was cloned from, when it is on the set list.
    func baseSong(of song: Song) -> Song? {
        guard let base = song.mod?.base else { return nil }
        return songs.first { $0.name == base }
    }

    // MARK: Agent mode

    /// The sheet's target; set to open it, nil when it closes.
    var agentTarget: AgentTarget?

    /// From a song's card: the thread on it. A mod continues its own; a bundled song that
    /// already has your version continues that (one version per song, with its history — Bart,
    /// 2026-11-02), else its pending thread or a fresh one.
    func openAgent(song: Song) {
        agentTarget = AgentTarget(song: existingMod(of: song) ?? song, position: nil)
    }

    /// The player's latest version of a bundled song, when there is one.
    func existingMod(of song: Song) -> Song? {
        guard song.mod == nil else { return nil }
        return mods.mods(of: song.name).last
    }

    /// From the pause menu: the same, knowing where the run sits.
    func openAgent(fromGame player: Player) {
        guard let game = player.game else { return }
        if player.playing { player.togglePlay() }
        let s = player.gameState()
        let position = ModStore.Position(part: game.part.rawValue, difficulty: game.difficulty.rawValue, level: s.level, bar: s.bar + 1, section: s.section)
        agentTarget = AgentTarget(song: existingMod(of: game.song) ?? game.song, position: position)
    }

    /// A mod just landed (or moved on): it takes the part and level picked on the song it came
    /// from, so Play plays what the player was playing.
    func adopt(mod: Song, from origin: Song) {
        if stageParts[mod.name] == nil, let p = stageParts[origin.name] { stageParts[mod.name] = p }
        if stageDifficulties[mod.name] == nil, let d = stageDifficulties[origin.name] { stageDifficulties[mod.name] = d }
    }

    /// Remove a mod from the account and the set list; a run on it goes back to the stage.
    func remove(modID: String) async throws {
        if let game = player?.game, game.song.mod?.id == modID { leaveGame() }
        try await mods.delete(modID)
    }
    /// The part and level picked per song (chords and adaptive to start).
    private var stageParts: [String: Song.PartKey] = [:]
    private var stageDifficulties: [String: GameEngine.Difficulty] = [:]

    /// The part picked for the song, or its first when it has no such part (chords only).
    func stagePart(_ song: Song) -> Song.PartKey {
        let picked = stageParts[song.name] ?? .chords
        return song.partKeys.contains(picked) ? picked : song.partKeys[0]
    }
    /// The level picked for the song; Solo only while the song has a solo and the melody is
    /// the part (the teacher's track is a melody line).
    func stageDifficulty(_ song: Song) -> GameEngine.Difficulty {
        let d = stageDifficulties[song.name] ?? .adaptive
        if d == .solo, solo(of: song) == nil || stagePart(song) != .melody { return .adaptive }
        return d
    }
    func pick(song: Song, part: Song.PartKey) { stageParts[song.name] = part }
    func pick(song: Song, difficulty: GameEngine.Difficulty) { stageDifficulties[song.name] = difficulty }

    /// The teacher's whole track on a bundled song (its Solo level), when the player has one.
    func solo(of song: Song) -> Song? {
        guard song.mod == nil else { return nil }
        return mods.solo(of: song.name)
    }

    /// The levels a song's card offers: the ladder and Adaptive, then Solo once the player has
    /// the teacher's track on it and the melody is picked.
    func stageLevels(_ song: Song) -> [GameEngine.Difficulty] {
        GameEngine.Difficulty.ladder + (solo(of: song) != nil && stagePart(song) == .melody ? [.solo] : [])
    }

    /// What Play, Practice and Call open: the song at its part and level, or, on Solo, the
    /// teacher's track on the melody, every note of it.
    private func stageTarget(_ song: Song) -> (song: Song, part: Song.PartKey, difficulty: GameEngine.Difficulty) {
        let d = stageDifficulty(song)
        if d == .solo, let s = solo(of: song) { return (s, .melody, .solo) }
        return (song, stagePart(song), d)
    }

    /// Play: the song with the part and level picked for it.
    func play(song: Song) {
        guard let player else { return }
        let t = stageTarget(song)
        player.startGame(song: t.song, part: t.part, difficulty: t.difficulty)
        route = .game
    }

    /// The song's Solo level from the top: the teacher's whole track (the review sheet's
    /// "Play the whole track").
    func playSolo(of song: Song) {
        pick(song: song, part: .melody)
        pick(song: song, difficulty: .solo)
        play(song: song)
    }

    /// Practice: the same song, part and level, opened held at bar 1 in practice mode.
    func practice(song: Song) {
        guard let player else { return }
        let t = stageTarget(song)
        player.startGame(song: t.song, part: t.part, difficulty: t.difficulty, practice: true)
        route = .game
    }

    /// Call: the same, with the first note called out at once (Player+Call).
    func call(song: Song) {
        guard let player else { return }
        practice(song: song)
        player.startCall()
    }

    /// Back to the set list, or to the map's level when a goal started the song: the lesson's
    /// band comes back.
    func leaveGame() {
        player?.endGame()
        if let level = fromLevel {
            route = .map
            openVenue = level
        } else {
            route = .stage
        }
    }
}

/// Where an entry stands, for the menu and the map.
enum EntryStatus: Equatable {
    case new
    /// The next lesson to play, of the module's count.
    case inProgress(lesson: Int, of: Int)
    case done(tempo: Int)
    /// A quiz before the ear check.
    case quizNew
    /// A quiz after it: today's five waiting, or done today.
    case quizToday(QuizLevel)
    case quizDone(QuizLevel)
    /// An ear game: the highest level opened.
    case game(EarGame.Kind, level: Int)
    case locked(after: String)
    case soon
    /// The ear module: lessons done of its count.
    case module(done: Int, of: Int)

    var open: Bool {
        switch self {
        case .locked, .soon: false
        default: true
        }
    }
}

extension AppModel {
    func status(_ entry: LessonEntry) -> EntryStatus {
        if let after = entry.after, progress.lesson(after).completed == nil { return .locked(after: after) }
        guard entry.playable else { return .soon }
        if entry.kind == .earModule {
            return .module(done: LessonEntry.earLessons.filter { earLessonDone($0.entry) }.count, of: LessonEntry.earLessons.count)
        }
        if case .game(let kind) = entry.kind { return .game(kind, level: progress.ear(kind).level) }
        if entry.kind == .quiz {
            let q = progress.snapshot.quiz
            guard let level = q.level else { return .quizNew }
            return q.lastDaily == ProgressStore.day() ? .quizDone(level) : .quizToday(level)
        }
        let content = module(entry.code)
        let record = progress.lesson(content.code)
        let done = lessonsDone(content)
        if done >= content.lessons.count { return .done(tempo: record.bestTempo) }
        return done > 0 ? .inProgress(lesson: done + 1, of: content.lessons.count) : .new
    }

    func start(_ entry: LessonEntry) {
        guard status(entry).open else { return }
        switch entry.kind {
        case .quiz: startQuiz()
        case .game(let kind): startEarGame(kind)
        case .lesson: openModule(entry.code)
        case .earModule: route = .earModule
        }
    }
}

/// The catalog the menu shows. A1 is the lesson, Q1 the quiz (the ear check, then a daily five);
/// A2 is a stub until it exists (brief §5: "A2 stub screen only"), unlocked by finishing A1.
struct LessonEntry: Identifiable {
    enum Kind: Equatable { case lesson, quiz, game(EarGame.Kind), earModule }
    let kind: Kind
    let code: String
    let title: String
    let meta: String
    /// Finishing this lesson unlocks the entry.
    let after: String?
    /// There is a lesson behind it.
    let playable: Bool

    var id: String { code }

    static let catalog = [
        LessonEntry(kind: .lesson, code: "A1", title: "Blues Progressions", meta: "Left hand · the 12-bar blues in C · 7 lessons",
                    after: nil, playable: true),
        LessonEntry(kind: .game(.chords), code: "E1", title: "Ear Trainer", meta: "Endless · name the chord by ear, seven levels",
                    after: nil, playable: true),
        LessonEntry(kind: .game(.intervals), code: "E2", title: "Intervals", meta: "Endless · name the distance between two notes",
                    after: nil, playable: true),
        LessonEntry(kind: .quiz, code: "Q1", title: "Ear and Form", meta: "Five questions: listening and theory · 2 min",
                    after: nil, playable: true),
    ]

    /// The ear module: three lessons over the drills, each with a title and a goal of its own.
    static let ear = LessonEntry(kind: .earModule, code: "E", title: "Ear Training", meta: "Hear the chords and the distances · 3 lessons",
                                 after: nil, playable: true)
    static let earLessons: [(entry: LessonEntry, title: String, goal: String)] = [
        (catalog[1], "Chords", "Seven levels, from major or minor up to sevenths"),
        (catalog[2], "Intervals", "Seven levels, from fourth or fifth up to both notes at once"),
        (catalog[3], "Ear and form", "Find your level, then five questions a day"),
    ]

    static let scales = LessonEntry(kind: .lesson, code: "S", title: "Scales", meta: "Both hands · octaves, pentatonics, new keys, modes · 13 lessons",
                                    after: nil, playable: true)
    static let minor = LessonEntry(kind: .lesson, code: "M", title: "Minor Chords", meta: "Left hand · the minor blues in every key · 13 lessons",
                                   after: nil, playable: true)
    static let shapes = LessonEntry(kind: .lesson, code: "H", title: "Chord Shapes", meta: "Left hand · sevenths, inversions, voice leading, the club voicings · 8 lessons",
                                    after: nil, playable: true)

    /// Level 1 on the map, in order: the modules and what comes after them.
    static let path = [scales, ear, shapes, minor, catalog[0]]

    var module: Bool { kind == .lesson || kind == .earModule }
}
