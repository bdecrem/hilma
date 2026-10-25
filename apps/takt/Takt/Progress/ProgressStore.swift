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
        var completed: Date?
        var bestTempo = 0
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

    struct Snapshot: Codable, Equatable {
        var lessons: [String: LessonRecord] = [:]
        var skills: [String: SkillRecord] = [:]
        /// Local dates practiced (a judged chorus or a finished quiz), sorted: the streak.
        var days: [String] = []
        var quiz = QuizRecord()

        init() {}

        // Files and accounts from before the streak and quizzes have neither.
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            lessons = try c.decodeIfPresent([String: LessonRecord].self, forKey: .lessons) ?? [:]
            skills = try c.decodeIfPresent([String: SkillRecord].self, forKey: .skills) ?? [:]
            days = try c.decodeIfPresent([String].self, forKey: .days) ?? []
            quiz = try c.decodeIfPresent(QuizRecord.self, forKey: .quiz) ?? QuizRecord()
        }
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

    func completed(_ code: String, tempo: Int, steps: Int) {
        var r = lesson(code)
        r.reachedStep = steps
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

    /// Today counts as practiced.
    func practiced(on date: Date = Date()) {
        let d = Self.day(date)
        guard !snapshot.days.contains(d) else { return }
        snapshot.days = (snapshot.days + [d]).sorted()
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
