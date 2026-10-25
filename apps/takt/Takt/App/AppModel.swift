import SwiftUI

/// Which screen is up. The band plays under every one of them (principle 1: the band is
/// already playing); only the lesson screen scores what you play.
enum Route: Equatable {
    case lessons, map, lesson, result, settings, calibrate, quiz, earGame
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
    /// Where calibration goes when it is done: the lesson (first time) or Settings.
    private var afterCalibration: Route = .lessons

    init(player: Player?, progress: ProgressStore, account: AccountStore) {
        self.player = player
        self.progress = progress
        self.account = account
        #if DEBUG
        if let r = UserDefaults.standard.string(forKey: "Route") {
            switch r {
            case "lessons": route = .lessons
            case "lesson": route = .lesson
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
        // `-Route eargame [-EarLevel n] [-EarAnswers r,r,w]` plays the Ear Trainer, answering
        // right (r) or wrong (w) in order without the pauses, the last answer left up.
        if UserDefaults.standard.string(forKey: "Route") == "eargame" {
            let d = UserDefaults.standard
            startEarGame(level: d.integer(forKey: "EarLevel") > 0 ? d.integer(forKey: "EarLevel") : nil)
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
        guard let player, player.content.code == code else { return }
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

    /// Today's challenge: the ear check, a daily five, or a clean chorus of A1.
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
    private(set) var earRound: EarGame.Round?
    /// The option picked this round (nil: waiting for an answer).
    private(set) var earPicked: Int?
    private(set) var earPoints = 0
    @ObservationIgnored private var earRNG = SystemRandomNumberGenerator()
    @ObservationIgnored private var earRoundID = 0
    @ObservationIgnored private var earPracticed = false

    /// At the highest level opened (or `level`).
    func startEarGame(level: Int? = nil) {
        ear = EarGame.Run(level: level ?? progress.snapshot.ear.level)
        earRound = nil
        earPracticed = false
        if route != .earGame { afterQuiz = route }
        player?.holdBand()
        route = .earGame
        nextEarRound()
    }

    func nextEarRound() {
        guard let run = ear else { return }
        earRound = EarGame.round(level: run.level, avoiding: earRound, using: &earRNG)
        earPicked = nil
        earRoundID += 1
        playEar()
    }

    func playEar() {
        if let r = earRound { player?.play(r.sound) }
    }

    /// An answer: points, the meter, maybe a new level; the next chord comes by itself (after a
    /// miss, a longer pause and the chord again, so you hear it with its name).
    func answerEar(_ option: Int, advance: Bool = true) {
        guard var run = ear, let round = earRound, earPicked == nil else { return }
        let right = option == round.answer
        earPicked = option
        earPoints = run.answer(right: right)
        ear = run
        progress.earAnswered(level: run.level, score: run.score)
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
        guard var run = ear, n <= progress.snapshot.ear.level else { return }
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

    func restart(lesson code: String) {
        guard let player, player.content.code == code else { return }
        player.restartLesson()
        route = .lesson
    }

    /// The lesson screen watches for the payoff finishing.
    func lessonFinished() { route = .result }
}

/// Where an entry stands, for the menu and the map.
enum EntryStatus: Equatable {
    case new
    case inProgress(step: Int, of: Int)
    case done(tempo: Int)
    /// A quiz before the ear check.
    case quizNew
    /// A quiz after it: today's five waiting, or done today.
    case quizToday(QuizLevel)
    case quizDone(QuizLevel)
    /// The Ear Trainer: the highest level opened.
    case game(level: Int)
    case locked(after: String)
    case soon

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
        if entry.kind == .game { return .game(level: progress.snapshot.ear.level) }
        if entry.kind == .quiz {
            let q = progress.snapshot.quiz
            guard let level = q.level else { return .quizNew }
            return q.lastDaily == ProgressStore.day() ? .quizDone(level) : .quizToday(level)
        }
        let record = progress.lesson(entry.code)
        if record.completed != nil { return .done(tempo: record.bestTempo) }
        let live = player?.lesson
        let step = max(record.reachedStep, live?.step ?? 1)
        return step > 1 ? .inProgress(step: step, of: live?.stepCount ?? 6) : .new
    }

    func start(_ entry: LessonEntry) {
        guard status(entry).open else { return }
        switch entry.kind {
        case .quiz: startQuiz()
        case .game: startEarGame()
        case .lesson: open(lesson: entry.code)
        }
    }
}

/// The catalog the menu shows. A1 is the lesson, Q1 the quiz (the ear check, then a daily five);
/// A2 is a stub until it exists (brief §5: "A2 stub screen only"), unlocked by finishing A1.
struct LessonEntry: Identifiable {
    enum Kind { case lesson, quiz, game }
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
        LessonEntry(kind: .lesson, code: "A1", title: "Play the Form", meta: "Left hand · 12-bar blues in C · 15 min",
                    after: nil, playable: true),
        LessonEntry(kind: .game, code: "E1", title: "Ear Trainer", meta: "Endless · name the chord by ear, seven levels",
                    after: nil, playable: true),
        LessonEntry(kind: .quiz, code: "Q1", title: "Ear and Form", meta: "Five questions: listening and theory · 2 min",
                    after: nil, playable: true),
        LessonEntry(kind: .lesson, code: "A2", title: "The Right Hand", meta: "Blues scale · call and response",
                    after: "A1", playable: false),
    ]

    /// Level 1 on the map, in order: the catalog and what comes after it.
    static let path = catalog + [
        LessonEntry(kind: .lesson, code: "A3", title: "Shuffle Comping", meta: "Both hands · the shuffle in chords",
                    after: "A2", playable: false),
        LessonEntry(kind: .quiz, code: "Q2", title: "Hear the Changes", meta: "Name the chord change by ear",
                    after: "A3", playable: false),
        LessonEntry(kind: .lesson, code: "A4", title: "The Turnaround", meta: "Bars 11 and 12 · the walk home",
                    after: "A3", playable: false),
    ]
}
