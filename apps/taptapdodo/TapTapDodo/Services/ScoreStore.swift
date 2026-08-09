import Foundation

struct BestEntry: Codable, Equatable {
    var score: Int
    var grade: String
    var accuracy: Int
    var maxCombo: Int
    var seed: UInt64
}

struct DailyEntry: Codable, Equatable {
    var trackId: String
    var seed: UInt64
    var score: Int
    var grade: String
}

/// Local high scores + seeds, JSON in Application Support. Every run's seed is
/// persisted with its best so any run can be replayed exactly via deep link.
final class ScoreStore: ObservableObject {
    @Published private(set) var bests: [String: BestEntry] = [:]
    @Published private(set) var dailies: [String: DailyEntry] = [:]   // key: yyyymmdd

    private struct Blob: Codable {
        var bests: [String: BestEntry] = [:]
        var dailies: [String: DailyEntry] = [:]
    }

    private static var fileURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("taptapdodo", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("scores.json")
    }

    init() {
        if let data = try? Data(contentsOf: Self.fileURL),
           let blob = try? JSONDecoder().decode(Blob.self, from: data) {
            bests = blob.bests
            dailies = blob.dailies
        }
    }

    private func save() {
        let blob = Blob(bests: bests, dailies: dailies)
        if let data = try? JSONEncoder().encode(blob) {
            try? data.write(to: Self.fileURL, options: .atomic)
        }
    }

    /// Records the run. Returns true when it's a new personal best for the set.
    @discardableResult
    func record(_ result: RunResult) -> Bool {
        var isNewBest = false
        let entry = BestEntry(score: result.score, grade: result.grade,
                              accuracy: result.accuracy, maxCombo: result.maxCombo,
                              seed: result.config.seed)
        if let existing = bests[result.config.trackId] {
            if result.score > existing.score {
                bests[result.config.trackId] = entry
                isNewBest = true
            }
        } else {
            bests[result.config.trackId] = entry
            isNewBest = true
        }

        // The first attempt on today's daily is the scored one.
        if result.config.isDaily {
            let key = Self.todayKey()
            if dailies[key] == nil {
                dailies[key] = DailyEntry(trackId: result.config.trackId,
                                          seed: result.config.seed,
                                          score: result.score, grade: result.grade)
            }
        }
        save()
        return isNewBest
    }

    var hasSRank: Bool {
        bests.contains { $0.key != TrackDef.gabber.id && $0.value.grade == "S" }
    }

    func todaysDaily() -> DailyEntry? { dailies[Self.todayKey()] }

    static func todayKey(date: Date = Date()) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d%02d%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// hash(yyyymmdd) — the same chart for everyone that day.
    static func dailySeed(date: Date = Date()) -> UInt64 {
        scrambleSeed(UInt64(todayKey(date: date)) ?? 0)
    }

    /// The daily rotates through the non-gabber sets.
    static func dailyTrackId(date: Date = Date()) -> String {
        let ids = [TrackDef.origin.id, TrackDef.minimal.id, TrackDef.detroit.id]
        return ids[Int(dailySeed(date: date) % 3)]
    }
}
