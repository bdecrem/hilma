import Foundation
import os

/// What the player has done, on this device: per lesson how far they got, per skill the brief's
/// SkillModel record (§5.7: attempts, best clean tempo, timing bias, weak bars, last practiced).
/// v1 records and displays it; scheduling comes later. One JSON file in Application Support,
/// written after every change (it is small), so it is also what an account syncs.
@Observable
final class ProgressStore {
    struct LessonRecord: Codable, Equatable {
        /// Highest step reached, 1-based.
        var reachedStep = 1
        /// Lessons of the module finished, in order (0.1 (21); older records derive it from
        /// `reachedStep`, see `Lesson.lessonsDone(reachedStep:)`).
        var lessonsDone = 0
        var completed: Date?
        var bestTempo = 0
        /// Play mode: jams (step ids) played clean once.
        var jamsDone: [String] = []
        /// When the record was set by hand on the server (a correction): the place in the
        /// module (`reachedStep`, `lessonsDone`, `completed`) replaces copies from before it
        /// instead of merging by max (`AccountStore.merge`; the PUT route keeps it too).
        var setAt: Date?

        init() {}

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            reachedStep = try c.decodeIfPresent(Int.self, forKey: .reachedStep) ?? 1
            lessonsDone = try c.decodeIfPresent(Int.self, forKey: .lessonsDone) ?? 0
            completed = try c.decodeIfPresent(Date.self, forKey: .completed)
            bestTempo = try c.decodeIfPresent(Int.self, forKey: .bestTempo) ?? 0
            jamsDone = try c.decodeIfPresent([String].self, forKey: .jamsDone) ?? []
            setAt = try c.decodeIfPresent(Date.self, forKey: .setAt)
        }
    }

    struct SkillRecord: Codable, Equatable {
        /// Judged choruses.
        var attempts = 0
        var cleanChoruses = 0
        var bestCleanTempo = 0
        /// Running mean offset of the matched notes, ms (negative: rushes).
        var timingBiasMs = 0.0
        var timedNotes = 0
        /// 1-based bar → misses, wrong notes and notes outside the window there.
        var weakBars: [Int: Int] = [:]
        var lastPracticed: Date?
    }

    /// Quizzes: the placement's result and each question's Leitner box (0 = missed, comes back
    /// first; 3 = known).
    struct QuizRecord: Codable, Equatable {
        /// nil until the ear check is done.
        var level: QuizLevel?
        var placed: Date?
        var boxes: [String: Int] = [:]
        /// Local date ("2026-10-25") of the last finished daily challenge.
        var lastDaily: String?
        var answered = 0
        var correct = 0
    }

    /// The Ear Trainer: the highest level opened, the best score of a run, answers in all.
    struct EarRecord: Codable, Equatable {
        var level = 1
        var best = 0
        var answered = 0
    }

    /// Stage: one run of a song, for the leaderboard.
    struct ScoreRecord: Codable, Equatable, Identifiable {
        let id: String
        let song: String
        let part: String
        private(set) var difficulty: String
        let score: Int
        let accuracy: Double
        let maxCombo: Int
        let grade: String
        let level: Int
        let date: Date

        /// Blue Lantern II's Medium became its Easy+ in 0.1 (109) (2026-11-06, the riff alone;
        /// Medium took on the hand moves): runs of it from before wear the level they were
        /// played on, on this device and on the account alike (both decode through here).
        static let blueLanternRenamed = ISO8601DateFormatter().date(from: "2026-11-06T18:30:00Z")!
        static func relabeled(_ scores: [ScoreRecord]) -> [ScoreRecord] {
            scores.map { s in
                guard s.song == "song-blue-lantern-white", s.difficulty == "medium", s.date < blueLanternRenamed else { return s }
                var r = s
                r.difficulty = GameEngine.Difficulty.easyPlus.rawValue
                return r
            }
        }

        init(_ r: GameEngine.Result, date: Date = Date()) {
            id = UUID().uuidString
            song = r.song
            part = r.part
            difficulty = r.difficulty
            score = r.score
            accuracy = r.accuracy
            maxCombo = r.maxCombo
            grade = r.grade
            level = r.level
            self.date = date
        }

        /// Per song, the best runs stay (any part or difficulty), newest first among equals.
        static let kept = 50
        static func trimmed(_ scores: [ScoreRecord]) -> [ScoreRecord] {
            var out: [ScoreRecord] = []
            for song in Set(scores.map(\.song)).sorted() {
                out += scores.filter { $0.song == song }.sorted { ($0.score, $0.date) > ($1.score, $1.date) }.prefix(kept)
            }
            return out
        }
    }

    struct Snapshot: Codable, Equatable {
        var lessons: [String: LessonRecord] = [:]
        var skills: [String: SkillRecord] = [:]
        /// Local dates practiced, sorted: the streak. Since 0.1 (83) only a finished lesson or a
        /// Stage song played to the end counts (before it, a judged chorus, a quiz, ten ear answers).
        var days: [String] = []
        /// What made each day count, oldest first: traceable per account on the server.
        var practice: [PracticeEntry] = []
        var quiz = QuizRecord()
        /// The Ear Trainer (chords) and Intervals.
        var ear = EarRecord()
        var intervals = EarRecord()
        /// Stage runs, the best per song kept.
        var scores: [ScoreRecord] = []
        /// The plan's goals, by `LearningPlan.key`: see `GoalRecord`.
        var goals: [String: GoalRecord] = [:]
        /// XP earned, one entry per thing that earned it (`XPEntry`); a done goal earns its own
        /// from `goals` (`ProgressStore.xp`).
        var xp: [XPEntry] = []
        /// The Stage's pinned tracks (bundled song names), when the player has changed them:
        /// nil is the default set (`StageScreen.defaultPins`). The newer set wins a merge.
        var pins: Pins?

        init() {}

        // Files and accounts from before the streak and quizzes have neither.
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            lessons = try c.decodeIfPresent([String: LessonRecord].self, forKey: .lessons) ?? [:]
            skills = try c.decodeIfPresent([String: SkillRecord].self, forKey: .skills) ?? [:]
            days = try c.decodeIfPresent([String].self, forKey: .days) ?? []
            quiz = try c.decodeIfPresent(QuizRecord.self, forKey: .quiz) ?? QuizRecord()
            ear = try c.decodeIfPresent(EarRecord.self, forKey: .ear) ?? EarRecord()
            intervals = try c.decodeIfPresent(EarRecord.self, forKey: .intervals) ?? EarRecord()
            scores = ScoreRecord.relabeled(try c.decodeIfPresent([ScoreRecord].self, forKey: .scores) ?? [])
            practice = try c.decodeIfPresent([PracticeEntry].self, forKey: .practice) ?? []
            goals = LearningPlan.migrated(try c.decodeIfPresent([String: GoalRecord].self, forKey: .goals) ?? [:])
            xp = try c.decodeIfPresent([XPEntry].self, forKey: .xp) ?? []
            pins = try c.decodeIfPresent(Pins.self, forKey: .pins)
        }
    }

    /// The Stage's pinned tracks and when they were last set (Bart, 2026-11-07: pinned tracks
    /// show by default, the rest sit under All tracks).
    struct Pins: Codable, Equatable {
        var songs: [String]
        var at: Date

        /// Two devices' sets: the one set last.
        static func merge(_ a: Pins?, _ b: Pins?) -> Pins? {
            guard let a else { return b }
            guard let b else { return a }
            return b.at > a.at ? b : a
        }
    }

    /// Pins a bundled song to the Stage, or unpins it, from the set as it stands (`current`,
    /// the default until the player has changed it).
    func setPinned(_ song: String, _ on: Bool, current: [String], at date: Date = Date()) {
        var songs = current.filter { $0 != song }
        if on { songs.append(song) }
        snapshot.pins = Pins(songs: songs, at: date)
        save()
    }

    /// XP for one thing done (Improv.XP has the amounts): an id that says what and which
    /// ("improv·<review id>", "version·<take>", "lesson·S1m·3·2026-11-04", "stage·<run id>"), so the
    /// same thing never pays twice and two devices merge as a union.
    struct XPEntry: Codable, Equatable, Hashable {
        let id: String
        let day: String
        let kind: String
        let points: Int

        static func union(_ a: [XPEntry], _ b: [XPEntry]) -> [XPEntry] {
            var seen: Set<String> = []
            return (a + b).filter { seen.insert($0.id).inserted }.sorted { ($0.day, $0.id) < ($1.day, $1.id) }
        }
    }

    /// One thing that counted for a day: `kind` "lesson" (id "A1·3", a module's lesson number,
    /// or "A1·finish", the payoff) or "stage" (id the song). One entry per day, kind and id.
    struct PracticeEntry: Codable, Equatable, Hashable {
        let day: String
        let kind: String
        let id: String

        /// The last `kept` entries, each once, oldest first.
        static let kept = 200
        static func union(_ a: [PracticeEntry], _ b: [PracticeEntry]) -> [PracticeEntry] {
            var seen: Set<PracticeEntry> = []
            let all = (a + b).filter { seen.insert($0).inserted }
                .sorted { ($0.day, $0.kind, $0.id) < ($1.day, $1.kind, $1.id) }
            return Array(all.suffix(kept))
        }
    }

    // MARK: Stage

    /// A finished run goes on the board (a run counts as a day of practice too).
    @discardableResult
    func record(run: GameEngine.Result) -> ScoreRecord {
        let r = ScoreRecord(run)
        snapshot.scores = ScoreRecord.trimmed(snapshot.scores + [r])
        save()
        practiced(.stage, id: r.song)
        award("stage·\(r.id)", kind: "stage", points: Improv.XP.stage)
        return r
    }

    /// A song's board, best first.
    func scores(song: String) -> [ScoreRecord] {
        snapshot.scores.filter { $0.song == song }.sorted { ($0.score, $0.date) > ($1.score, $1.date) }
    }

    func best(song: String, part: String) -> ScoreRecord? {
        scores(song: song).first { $0.part == part }
    }

    private(set) var snapshot: Snapshot
    @ObservationIgnored private let url: URL?
    /// After every saved change (the account pushes it).
    @ObservationIgnored var onChange: (() -> Void)?
    @ObservationIgnored private let log = Logger(subsystem: "takt", category: "progress")

    /// `url: nil` keeps everything in memory (checks).
    init(url: URL? = ProgressStore.defaultURL) {
        self.url = url
        if let url, let data = try? Data(contentsOf: url) {
            do {
                snapshot = try JSONDecoder.takt.decode(Snapshot.self, from: data)
            } catch {
                // A file we can't read is a bug to see, not a reason to lose the next save.
                fatalError("progress \(url.path): \(error)")
            }
        } else {
            snapshot = Snapshot()
        }
    }

    #if DEBUG
    /// `-Silent` (headless) and `-Autoplay` runs keep progress in memory only.
    /// `-WriteProgress 1` lets an autoplay run write anyway (a throwaway simulator, to check what it records).
    static let readOnly = (UserDefaults.standard.bool(forKey: "Silent") || UserDefaults.standard.string(forKey: "Autoplay") != nil)
        && !UserDefaults.standard.bool(forKey: "WriteProgress")
    #else
    static let readOnly = false
    #endif

    static var defaultURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        #if DEBUG
        if let path = UserDefaults.standard.string(forKey: "ProgressFile") { return URL(fileURLWithPath: path) }
        #endif
        return dir.appendingPathComponent("progress.json")
    }

    func lesson(_ code: String) -> LessonRecord { snapshot.lessons[code] ?? LessonRecord() }

    func reached(step: Int, in code: String) {
        var r = lesson(code)
        guard step > r.reachedStep else { return }
        r.reachedStep = step
        snapshot.lessons[code] = r
        save()
    }

    /// Lesson `n` (1-based) of the module finished.
    func lessonDone(_ n: Int, in code: String) {
        var r = lesson(code)
        guard n > r.lessonsDone else { return }
        r.lessonsDone = n
        snapshot.lessons[code] = r
        save()
    }

    /// Play mode: a jam played clean.
    func jamDone(_ id: String, in code: String) {
        var r = lesson(code)
        guard !r.jamsDone.contains(id) else { return }
        r.jamsDone.append(id)
        snapshot.lessons[code] = r
        save()
    }

    func completed(_ code: String, tempo: Int, steps: Int, lessons: Int) {
        var r = lesson(code)
        r.reachedStep = steps
        r.lessonsDone = lessons
        r.completed = r.completed ?? Date()
        r.bestTempo = max(r.bestTempo, tempo)
        snapshot.lessons[code] = r
        save()
    }

    /// One judged chorus of a skill.
    func record(skill: String, result: ChorusResult, tempo: Double, counted: Bool) {
        var s = snapshot.skills[skill] ?? SkillRecord()
        s.attempts += 1
        if result.clean {
            s.cleanChoruses += 1
            s.bestCleanTempo = max(s.bestCleanTempo, Int(tempo.rounded()))
        }
        for o in result.offsets {
            s.timedNotes += 1
            s.timingBiasMs += (o - s.timingBiasMs) / Double(s.timedNotes)
        }
        for n in result.notes where n.mark != .hit { s.weakBars[n.expected.bar + 1, default: 0] += 1 }
        s.lastPracticed = Date()
        snapshot.skills[skill] = s
        save()
    }

    // MARK: Streak

    /// "2026-10-25" in the device's time zone.
    static func day(_ date: Date = Date(), calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    enum PracticeKind: String { case lesson, stage }

    /// Today counts as practiced: a lesson finished or a Stage song played to the end.
    func practiced(_ kind: PracticeKind, id: String, on date: Date = Date()) {
        let d = Self.day(date)
        let entry = PracticeEntry(day: d, kind: kind.rawValue, id: id)
        guard !snapshot.days.contains(d) || !snapshot.practice.contains(entry) else { return }
        if !snapshot.days.contains(d) { snapshot.days = (snapshot.days + [d]).sorted() }
        snapshot.practice = PracticeEntry.union(snapshot.practice, [entry])
        save()
        // A lesson finished pays once a day per lesson (a song's XP comes with its run).
        if kind == .lesson { award("lesson·\(id)·\(d)", kind: "lesson", points: Improv.XP.lesson, on: date) }
    }

    // MARK: XP

    /// XP: every entry, and a goal's worth for every plan goal done.
    var xp: Int { Self.xp(snapshot) }

    static func xp(_ s: Snapshot) -> Int {
        s.xp.reduce(0) { $0 + $1.points } + s.goals.values.filter { $0.done != nil }.count * Improv.XP.goal
    }

    /// Pays `points` once for `id`; false when it already has.
    @discardableResult
    func award(_ id: String, kind: String, points: Int, on date: Date = Date()) -> Bool {
        guard !snapshot.xp.contains(where: { $0.id == id }) else { return false }
        snapshot.xp.append(XPEntry(id: id, day: Self.day(date), kind: kind, points: points))
        save()
        return true
    }

    // MARK: Goals

    func goal(_ key: String) -> GoalRecord { snapshot.goals[key] ?? GoalRecord() }

    /// A step goal: a 100% chorus at `tempo`. The best tempo is kept; at `target` or faster it is done.
    func goalChorus(_ key: String, tempo: Int, target: Int, on date: Date = Date()) {
        var r = goal(key)
        r.best = max(r.best, tempo)
        if tempo >= target, r.done == nil { r.done = Self.day(date) }
        snapshot.goals[key] = r
        save()
    }

    /// A jam goal: a chorus in the scale. `needed` of them and it is done.
    func goalJam(_ key: String, needed: Int, on date: Date = Date()) {
        var r = goal(key)
        r.choruses += 1
        if r.choruses >= needed, r.done == nil { r.done = Self.day(date) }
        snapshot.goals[key] = r
        save()
    }

    /// A song goal: a run on its part and level played to the end, `accuracy` 0…1. The best is
    /// kept (percent); at `floor` or better it is done.
    func goalRun(_ key: String, accuracy: Double, floor: Double, on date: Date = Date()) {
        var r = goal(key)
        r.best = max(r.best, Int((accuracy * 100).rounded(.down)))
        if accuracy >= floor, r.done == nil { r.done = Self.day(date) }
        snapshot.goals[key] = r
        save()
    }

    /// An improv goal: a take that met it, reviewed. Done for good.
    func goalImprov(_ key: String, on date: Date = Date()) {
        var r = goal(key)
        guard r.done == nil else { return }
        r.done = Self.day(date)
        r.choruses = max(r.choruses, 1)
        snapshot.goals[key] = r
        save()
    }

    var practicedToday: Bool { snapshot.days.contains(Self.day()) }

    /// Days in a row ending today, or yesterday (today isn't over yet).
    func streak(today: Date = Date()) -> Int { Self.streak(days: snapshot.days, today: today) }

    static func streak(days: [String], today: Date = Date(), calendar: Calendar = .current) -> Int {
        let set = Set(days)
        var d = today
        if !set.contains(day(d, calendar: calendar)) { d = calendar.date(byAdding: .day, value: -1, to: d)! }
        var n = 0
        while set.contains(day(d, calendar: calendar)) {
            n += 1
            d = calendar.date(byAdding: .day, value: -1, to: d)!
        }
        return n
    }

    // MARK: Quizzes

    func answered(_ id: String, correct: Bool) {
        var q = snapshot.quiz
        q.boxes[id] = correct ? min(3, (q.boxes[id] ?? 0) + 1) : 0
        q.answered += 1
        if correct { q.correct += 1 }
        snapshot.quiz = q
        save()
    }

    func placed(_ level: QuizLevel) {
        snapshot.quiz.level = level
        snapshot.quiz.placed = Date()
        save()
    }

    func ear(_ kind: EarGame.Kind) -> EarRecord { kind == .chords ? snapshot.ear : snapshot.intervals }

    /// After each answer in an ear game: the level reached and the run's score so far.
    func earAnswered(_ kind: EarGame.Kind, level: Int, score: Int) {
        var e = ear(kind)
        e.level = max(e.level, level)
        e.best = max(e.best, score)
        e.answered += 1
        if kind == .chords { snapshot.ear = e } else { snapshot.intervals = e }
        save()
    }

    func finishedDaily() {
        snapshot.quiz.lastDaily = Self.day()
        save()
    }

    /// Replaces everything (an account's copy coming down).
    func replace(with new: Snapshot) {
        snapshot = new
        save()
    }

    /// Forgets everything (Settings → Reset progress).
    func reset() {
        snapshot = Snapshot()
        save()
    }

    private func save() {
        onChange?()
        guard let url else { return }
        #if DEBUG
        // Headless and autoplay runs (screenshots, recordings) change nothing on disk: a
        // `-Lesson 6` run used to leave "reached step 7" in Bart's own record.
        if Self.readOnly { return }
        #endif
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder.takt.encode(snapshot).write(to: url, options: .atomic)
        } catch {
            log.error("progress save failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}

extension JSONEncoder {
    static let takt: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.sortedKeys]
        return e
    }()
}

extension JSONDecoder {
    static let takt: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
