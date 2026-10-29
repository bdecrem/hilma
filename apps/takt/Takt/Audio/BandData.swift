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
    /// Sidechain: every kick ducks each of these channels by its depth (0...1), back over
    /// `release` seconds. The pumping of the electronic songs.
    var duck: Duck?
    /// The dub send (`DubChamber`): what each channel sends and how the chamber is set.
    var dub: Dub?
    /// The live stab (`DubStab`), for a band whose instrument is `liveStab`.
    var stab: Stab?
    let channels: Channels

    struct Duck: Decodable {
        let release: Double
        /// Depth per channel (bass, keys, horns, monitor).
        var channels: [String: Double]
    }

    struct Dub: Decodable {
        /// Send level per channel (keys, horns, monitor; drums and bass stay dry).
        var sends: [String: Double]
        let level: Double
        let beats: Double
        let feedback: Double
        let highpass: Double
        let lowpass: Double
        let drive: Double
        let wobble: Double
        let wobbleRate: Double
        let sendHighpass: Double
        let sendLowpass: Double
        let cross: Double
        let echo: Double
        let reverb: Double
        let reverbDry: Double
        let reverbEcho: Double
        let decay: Double
        let damping: Double
        let bandwidth: Double
        let predelay: Double
        let reverbHighpass: Double
        let duck: Double
        let hiss: Double

        var settings: DubChamber.Settings {
            .init(level: Float(level), beats: beats, feedback: Float(min(0.95, feedback)), highpass: highpass, lowpass: lowpass,
                  drive: Float(drive), wobble: wobble, wobbleRate: wobbleRate, sendHighpass: sendHighpass, sendLowpass: sendLowpass,
                  cross: Float(cross), echo: Float(echo), reverb: Float(reverb), reverbDry: Float(reverbDry),
                  reverbEcho: Float(reverbEcho), decay: Float(min(0.95, decay)), damping: Float(damping), bandwidth: Float(bandwidth),
                  predelay: predelay, reverbHighpass: reverbHighpass, duck: Float(duck), hiss: Float(hiss))
        }
    }

    struct Stab: Decodable {
        let detune: [Double]
        let q: Double
        let env: Double
        let envTime: Double
        let attack: Double
        let decay: Double
        let release: Double
        let length: Double
        let low: Double
        let high: Double
        let sweepBars: Double

        var settings: DubStab.Settings {
            precondition(detune.count == 3, "stab: three saws")
            return .init(detune: (Float(detune[0]), Float(detune[1]), Float(detune[2])), q: Float(q), env: Float(env), envTime: envTime,
                         attack: attack, decay: decay, release: release, length: length, low: low, high: high, sweepBars: sweepBars)
        }
    }

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
