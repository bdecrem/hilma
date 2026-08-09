import Foundation

// MARK: - Seeded RNG (SplitMix64 — charts must be reproducible from a seed)

struct SplitMix64: RandomNumberGenerator {
    private(set) var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state = state &+ 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
    mutating func chance(_ p: Double) -> Bool { Double.random(in: 0..<1, using: &self) < p }
    mutating func pick<T>(_ items: [T]) -> T { items[Int.random(in: 0..<items.count, using: &self)] }
}

/// Scrambles a small integer (e.g. yyyymmdd) into a well-mixed seed.
func scrambleSeed(_ raw: UInt64) -> UInt64 {
    var rng = SplitMix64(seed: raw)
    return rng.next()
}

// MARK: - Chart models

enum SectionKind: String, Codable {
    case intro, groove, build, breakdown, peak, outro
}

struct Section {
    let kind: SectionKind
    let bars: Range<Int>
}

/// One eighth-note motif over a single bar. Offsets are in eighths (0...7).
struct Pattern {
    let steps: [(offset: Int, lane: Int)]
    init(_ steps: [(Int, Int)]) { self.steps = steps.map { (offset: $0.0, lane: $0.1) } }
}

struct ChartNote {
    let beat: Double
    let lane: Int
    /// Index into the set's scale tones. nil for percussive (non-melodic) sets.
    let pitchIndex: Int?
}

// MARK: - Run config & results

struct RunConfig: Hashable {
    let trackId: String
    let seed: UInt64
    /// Today's shared-seed run. The first daily attempt is the scored one.
    var isDaily: Bool = false

    var deepLink: String { "taptapdodo://play?track=\(trackId)&seed=\(seed)" }
}

enum Judgment {
    case perfect, good, weak, miss
}

struct RunResult {
    let config: RunConfig
    let score: Int
    let maxCombo: Int
    let perfects: Int
    let goods: Int
    let misses: Int
    var isNewBest: Bool = false
    /// Set when THIS run's grade tipped the gabber unlock.
    var unlockedGabber: Bool = false

    var totalNotes: Int { perfects + goods + misses }
    var accuracy: Int {
        guard totalNotes > 0 else { return 0 }
        return Int((100.0 * (Double(perfects) + 0.5 * Double(goods)) / Double(totalNotes)).rounded())
    }
    var grade: String {
        switch accuracy {
        case 95...: return "S"
        case 85..<95: return "A"
        case 70..<85: return "B"
        case 50..<70: return "C"
        default: return "D"
        }
    }
}
