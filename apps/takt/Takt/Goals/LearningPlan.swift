import Foundation

/// A learning plan: the levels of the map, each a few goals the app can score. Content, not
/// code: `Content/plan-<id>.json`. One plan ships for everyone (Bart's year, from
/// `misc/takt-12-month-plan.md`); a plan written for one player (the agent's, later) is another
/// document with its own id, picked in `active(for:)`, and nothing else changes.
///
/// A goal (`Item`) is one of two kinds, both scored by the lesson engine:
/// - `step`: a step of a module, passed by one chorus with every expected note hit and nothing
///   extra (100%, stricter than the lesson's own "clean") at the item's tempo or faster. The best
///   tempo of such a chorus is kept, so the tempo ladder (start at 60, up 4 when a pass is clean)
///   can suggest the next number.
/// - `jam`: a free step (`Lesson.Kind.free`): choruses played entirely inside the step's scale,
///   `choruses` of them.
/// A level clears when every one of its items is done; a level with no items yet can't.
struct LearningPlan: Decodable {
    enum Kind: String, Decodable { case step, jam }

    struct Item: Decodable, Identifiable {
        let id: String
        let kind: Kind
        let title: String
        let detail: String
        /// The module by entry code ("S1m", "M": `AppModel.module(_:)`) and the step's id in it.
        let module: String
        let step: String
        /// `step`: counts at this tempo or faster (the lesson step's own tempo, as a rule).
        let tempo: Int?
        /// `step`: where the tempo ladder starts; nil = the target.
        let start: Int?
        /// `jam`: choruses in the scale to finish.
        let choruses: Int?
    }

    struct Level: Decodable, Identifiable {
        /// 1-based: the map's stop.
        let n: Int
        let quarter: String?
        let title: String
        /// The plan's own line for the level, verbatim.
        let text: String
        let items: [Item]
        var id: Int { n }
    }

    let id: String
    let title: String
    let source: String?
    let about: String?
    let levels: [Level]

    static let defaultId = "blues-year-1"

    /// The plan a player follows. Everyone is on the default for now; a plan of their own
    /// (`takt_plans`, written by the agent) plugs in here by id.
    static func active(for userId: String?) -> LearningPlan { bundled(defaultId) }

    static func bundled(_ id: String) -> LearningPlan {
        guard let url = Bundle.main.url(forResource: "plan-\(id)", withExtension: "json") else {
            fatalError("plan-\(id).json is not in the bundle")
        }
        do {
            let p = try JSONDecoder().decode(LearningPlan.self, from: Data(contentsOf: url))
            p.validate()
            return p
        } catch {
            fatalError("plan-\(id).json: \(error)")
        }
    }

    /// Bad content traps at load: levels numbered 1…n in order, item ids unique in a level, a
    /// step item has a tempo, a jam item its choruses.
    func validate() {
        precondition(levels.map(\.n) == Array(1...max(1, levels.count)), "plan \(id): levels must run 1…n")
        for l in levels {
            precondition(Set(l.items.map(\.id)).count == l.items.count, "plan \(id) level \(l.n): an item id twice")
            for i in l.items {
                switch i.kind {
                case .step: precondition(i.tempo != nil, "plan \(id) level \(l.n) \(i.id): a step item needs a tempo")
                case .jam: precondition((i.choruses ?? 0) > 0, "plan \(id) level \(l.n) \(i.id): a jam item needs choruses")
                }
            }
        }
    }

    /// The progress record's key for an item.
    func key(_ level: Level, _ item: Item) -> String { "\(id)·\(level.n)·\(item.id)" }

    /// Every item on a step, with its level (the same step can serve two levels).
    func items(step: String) -> [(level: Level, item: Item)] {
        levels.flatMap { l in l.items.filter { $0.step == step }.map { (l, $0) } }
    }
}

/// What a player has done on one goal. Merged across devices: done keeps the earliest day,
/// the numbers the max.
struct GoalRecord: Codable, Equatable {
    /// The local day it was done ("2026-11-03"); nil until then.
    var done: String?
    /// `step`: the highest tempo of a 100% chorus so far (at any tempo).
    var best = 0
    /// `jam`: choruses in the scale so far.
    var choruses = 0

    static func merge(_ a: GoalRecord, _ b: GoalRecord) -> GoalRecord {
        GoalRecord(done: [a.done, b.done].compactMap { $0 }.min(), best: max(a.best, b.best), choruses: max(a.choruses, b.choruses))
    }
}

/// A plan against a player's records: levels cleared (for the map), and each item's state
/// (for the level's goals screen).
struct GoalProgress {
    let plan: LearningPlan
    let records: [String: GoalRecord]

    /// A step's tempo ladder: up by this after a 100% pass.
    static let rung = 4

    init(plan: LearningPlan, records: [String: GoalRecord], clearedOverride: Int? = nil) {
        self.plan = plan
        self.records = records
        self.clearedOverride = clearedOverride
    }
    private let clearedOverride: Int?

    func record(_ level: LearningPlan.Level, _ item: LearningPlan.Item) -> GoalRecord {
        records[plan.key(level, item)] ?? GoalRecord()
    }

    func done(_ level: LearningPlan.Level, _ item: LearningPlan.Item) -> Bool { record(level, item).done != nil }

    /// A level is cleared when every item is done (and it has some).
    func cleared(_ level: LearningPlan.Level) -> Bool {
        !level.items.isEmpty && level.items.allSatisfy { done(level, $0) }
    }

    /// Levels cleared from the first, in a row: the map's count.
    var cleared: Int {
        if let clearedOverride { return min(clearedOverride, plan.levels.count) }
        return plan.levels.prefix { cleared($0) }.count
    }

    /// `step`: the tempo to set the knob to next: the start, then a rung above the best 100%
    /// pass, never past the target.
    func suggestedTempo(_ level: LearningPlan.Level, _ item: LearningPlan.Item) -> Int {
        let target = item.tempo ?? 0
        let best = record(level, item).best
        if best == 0 { return min(item.start ?? target, target) }
        return min(target, best + Self.rung)
    }

    /// One line on where the item stands.
    func status(_ level: LearningPlan.Level, _ item: LearningPlan.Item) -> String {
        let r = record(level, item)
        switch item.kind {
        case .step:
            if r.done != nil { return "Done · 100% at \(max(r.best, item.tempo ?? 0))" }
            if r.best > 0 { return "Best 100% pass \(r.best) · counts at \(item.tempo ?? 0)" }
            return "Not yet · counts at \(item.tempo ?? 0)"
        case .jam:
            let n = item.choruses ?? 0
            if r.done != nil { return "Done · \(n) choruses in the scale" }
            return "\(min(r.choruses, n)) of \(n) choruses in the scale"
        }
    }

    /// The button on the item's row.
    func action(_ level: LearningPlan.Level, _ item: LearningPlan.Item) -> String {
        switch item.kind {
        case .step: return done(level, item) ? "Play again" : "Play at \(suggestedTempo(level, item))"
        case .jam: return done(level, item) ? "Jam again" : "Jam"
        }
    }
}
