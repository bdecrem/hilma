import Foundation

/// A band arrangement as authored by `scripts/band.py` (Takt/Content/*.json).
/// Ticks: `ticksPerBeat` per beat, `t` is the tick inside the whole loop (`bars` long, a whole
/// number of choruses of the `form`, so the band can vary from chorus to chorus).
struct BandData: Decodable {
    /// A drum sound: an instrument of Takt/Sounds/instruments.json and its level in the kit.
    struct Sound: Decodable {
        let kit: String
        let gainDb: Double
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
        /// The instrument, when not the channel's own (the horns' held notes).
        let i: String?
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
    /// The instrument each pitched channel plays (bass, keys, horns, monitor). A song's monitor
    /// is set per part (the record's synth for the part you take).
    var instruments: [String: String]
    /// A pitched channel's level in dB (bass, keys, horns; 0 when absent): a song's synths are
    /// balanced here, the way drum sounds carry `gainDb`.
    var levels: [String: Double]?
    let channels: Channels

    var ticksPerBar: Int { ticksPerBeat * beatsPerBar }
    var loopTicks: Int { ticksPerBar * bars }
    /// Bars per chorus: the form. The lesson, the pads and the beat snapshot count in choruses.
    var chorusBars: Int { form.count }

    /// Loads a bundled arrangement. A missing or malformed file is a build error, so it traps.
    static func bundled(_ name: String) -> BandData {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json") else {
            fatalError("band \(name).json is not in the bundle")
        }
        let band: BandData
        do {
            band = try JSONDecoder().decode(BandData.self, from: Data(contentsOf: url))
        } catch {
            fatalError("band \(name).json: \(error)")
        }
        guard band.bars % band.chorusBars == 0 else {
            fatalError("band \(name).json: \(band.bars) bars is not a whole number of \(band.chorusBars)-bar choruses")
        }
        return band
    }
}
