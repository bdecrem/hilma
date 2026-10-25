import SwiftUI

/// Which screen is up. The band plays under every one of them (principle 1: the band is
/// already playing); only the lesson screen scores what you play.
enum Route: Equatable {
    case lessons, map, lesson, result, settings, calibrate, quiz
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
            case "quiz": break  // below, once everything is set
            default: fatalError("unknown -Route \(r)")
            }
        }
        #endif
        player?.inLesson = route == .lesson
        #if DEBUG
        // `-Route quiz` starts today's quiz; `-QuizAnswers 1,0,1` answers in order (Next between),
        // leaving the last answer's explanation up, or the summary after a full five.
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
        entry.kind == .quiz ? startQuiz() : open(lesson: entry.code)
    }
}

/// The catalog the menu shows. A1 is the lesson, Q1 the quiz (the ear check, then a daily five);
/// A2 is a stub until it exists (brief §5: "A2 stub screen only"), unlocked by finishing A1.
struct LessonEntry: Identifiable {
    enum Kind { case lesson, quiz }
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
