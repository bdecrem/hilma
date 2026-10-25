import Foundation

/// A band arrangement as authored by `scripts/band.py` (Takt/Content/*.json).
/// Ticks: `ticksPerBeat` per beat, `t` is the tick inside the whole loop (`bars` long).
struct BandData: Decodable {
    struct Sound: Decodable {
        let file: String
        let gainDb: Double
    }

    struct Sub: Decodable {
        let file: String
        let root: Int
    }

    struct Hit: Decodable {
        let t: Int
        let s: String
        let v: Double
    }

    struct Note: Decodable {
        let t: Int
        let n: Int
        let v: Double
        let len: Int
    }

    struct Channels: Decodable {
        let drums: [Hit]
        let bass: [Note]
        let keys: [Note]
        let horns: [Note]
    }

    let name: String
    let ticksPerBeat: Int
    let beatsPerBar: Int
    let bars: Int
    let form: [String]
    let sounds: [String: Sound]
    let subs: [Sub]
    let channels: Channels

    var ticksPerBar: Int { ticksPerBeat * beatsPerBar }
    var loopTicks: Int { ticksPerBar * bars }

    /// Loads a bundled arrangement. A missing or malformed file is a build error, so it traps.
    static func bundled(_ name: String) -> BandData {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json") else {
            fatalError("band \(name).json is not in the bundle")
        }
        do {
            return try JSONDecoder().decode(BandData.self, from: Data(contentsOf: url))
        } catch {
            fatalError("band \(name).json: \(error)")
        }
    }
}
