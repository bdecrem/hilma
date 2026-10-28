import SwiftUI

/// Which screen is up. The band plays under every one of them (principle 1: the band is
/// already playing); only the lesson screen scores what you play.
enum Route: Equatable {
    case lessons, map, module, earModule, lesson, result, settings, calibrate, quiz, earGame
}

/// The app's screens and what they share: the player (band, monitor, lesson), the progress
/// store and the account. Screens switch at once, without animation (principle 5).
@Observable
final class AppModel {
    var route: Route = .lessons {
        didSet { player?.inLesson = route == .lesson }
    }
    let player: Player?
    let progress: ProgressStore
    let account: AccountStore
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

    init(player: Player?, progress: ProgressStore, account: AccountStore) {
        self.player = player
        self.progress = progress
        self.account = account
        #if DEBUG
        let d = UserDefaults.standard
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
            case "map": route = .map
            case "eargame": break  // below
            case "quiz": break  // below, once everything is set
            default: fatalError("unknown -Route \(r)")
            }
        }
        #endif
        player?.inLesson = route == .lesson
        #if DEBUG
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

    /// Today's challenge: the ear check, a daily five, or a clean chorus of the blues module.
    func startChallenge() {
        if challenge == .chorus { return open(lesson: "A1") }
        startQuiz()
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
            progress.practiced()
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
    @ObservationIgnored private var earPracticed = false

    /// At the highest level opened (or `level`).
    func startEarGame(_ kind: EarGame.Kind, level: Int? = nil) {
        earKind = kind
        ear = EarGame.Run(level: level ?? progress.ear(kind).level, top: kind.levels.count)
        earRound = nil
        earPracticed = false
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
        if run.answered >= 10 && !earPracticed {
            earPracticed = true
            progress.practiced()
        }
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

    static let scales = LessonEntry(kind: .lesson, code: "S", title: "Scales", meta: "Both hands · one and two octaves, the blues scale · 6 lessons",
                                    after: nil, playable: true)
    static let minor = LessonEntry(kind: .lesson, code: "M", title: "Minor Chords", meta: "Left hand · the minor blues in every key · 13 lessons",
                                   after: nil, playable: true)

    /// Level 1 on the map, in order: the modules and what comes after them.
    static let path = [catalog[0], ear, scales, minor,
        LessonEntry(kind: .lesson, code: "M2", title: "The Right Hand", meta: "Blues scale · call and response",
                    after: "A1", playable: false),
    ]

    var module: Bool { kind == .lesson || kind == .earModule }
}
