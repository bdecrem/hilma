import Foundation

/// A band arrangement as authored by `scripts/band.py` (Takt/Content/*.json).
/// Ticks: `ticksPerBeat` per beat, `t` is the tick inside the whole loop (`bars` long, a whole
/// number of choruses of the `form`, so the band can vary from chorus to chorus).
struct BandData: Decodable {
    /// A drum sound: an instrument of Takt/Sounds/instruments.json and its level in the kit.
    struct Sound: Decodable {
        let kit: String
        let gainDb: Double
        /// A bus of the band's `rack` this sound plays into (its sends are the bus's); absent:
        /// the drums channel.
        var bus: String? = nil
    }

    struct Hit: Decodable {
        let t: Int
        let s: String
        let v: Double
        /// Later than `t` by this many ticks (a fraction: the swing, a humanized hit).
        var late: Double? = nil
        /// A linear gain on top of the velocity's (a level the velocity curve can't reach).
        var g: Double? = nil
        /// A pan of the hit's own, −1…1, on a mono file (cos/sin of (p + 1)·π/4 a side, the
        /// reference's law): Gegenlicht's toms and pings. Absent: the file as it is.
        var p: Double? = nil
    }

    struct Note: Decodable {
        let t: Int
        let n: Int
        let v: Double
        let len: Int
        /// The instrument, when not the channel's own (the horns' held notes).
        let i: String?
        /// As a hit's: later than `t` by this many ticks, and a linear gain.
        var late: Double? = nil
        var g: Double? = nil
        /// How long the gate holds, in ticks, when a whole number of them is not it (an acid
        /// note of 1.5 steps is 4.5 ticks): absent, `len`.
        var hold: Double? = nil
    }

    struct Channels: Decodable {
        let drums: [Hit]
        let bass: [Note]
        let keys: [Note]
        let horns: [Note]
    }

    var name: String
    let ticksPerBeat: Int
    let beatsPerBar: Int
    var bars: Int
    var form: [String]
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
    /// The master's soft knee, scaled: the knee sits at `knee` × 0.8 of full scale (absent: 1).
    /// A band mixed to a reference renders the reference's clipping at its own lower level.
    var knee: Double?
    /// A guitar amp per channel (keys, horns): the electric's grit (`GuitarAmp`).
    var amp: [String: GuitarAmp.Settings]?
    /// The console of a song mixed to a reference (`Rack`): lanes, the stab bus, echoes, the
    /// pad, the lead, the kit's buses, the hall and the room, the master.
    var rack: Rack.Settings?
    /// Gegenlicht's console (`AcidRack`): the kick bus and its rumble, the acid voice and its
    /// echo, the ping, the gated pad, the kit's buses, the hall, the room, the master.
    var acidRack: AcidRack.Settings?
    var channels: Channels

    struct Duck: Decodable {
        let release: Double
        /// A shaped envelope instead of the plain one (1 at the kick, falling by `release`):
        /// 0 → 1 over `attack` seconds, held until `hold` seconds after the kick, then e^(−t/release),
        /// cut `length` seconds after the kick.
        var attack: Double? = nil
        var hold: Double? = nil
        var length: Double? = nil
        /// Depth per channel (bass, keys, horns, monitor).
        var channels: [String: Double]
        /// A second envelope from the same kicks, in its own shape (Gegenlicht's rumble ducks
        /// longer than the rest): the console reads it.
        var second: Shape? = nil

        struct Shape: Decodable {
            let attack: Double
            let hold: Double
            let release: Double
            let length: Double
        }
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
        do {
            return try decode(Data(contentsOf: url), name: name)
        } catch {
            fatalError("band \(name).json: \(error)")
        }
    }

    /// An arrangement from its bytes (a mod's song file comes from the account, not the bundle).
    static func decode(_ data: Data, name: String) throws -> BandData {
        let band = try JSONDecoder().decode(BandData.self, from: data)
        guard band.bars % band.chorusBars == 0 else {
            throw Song.LoadError(message: "band \(name): \(band.bars) bars is not a whole number of \(band.chorusBars)-bar choruses")
        }
        return band
    }
}

extension BandData {
    /// The shuffle's late eighth, two thirds through the beat (tick 8 of 12), moved to the
    /// straight eighth halfway through (tick 6); every other tick stays. A scale step in
    /// straight eighths (`Lesson.Step.straight`) plays over the band on this grid, so the hat
    /// lands with the notes instead of between them.
    static func straightTick(_ t: Int, ticksPerBeat: Int) -> Int {
        let late = ticksPerBeat * 2 / 3, straight = ticksPerBeat / 2
        return t % ticksPerBeat == late ? t - (late - straight) : t
    }

    /// This band with every hit and note on the straight grid (`straightTick`).
    /// A Stage song as a backing track that loops by `form` (an improv over one of our songs):
    /// the whole choruses of that form it holds, the tail bar the game ends in cut off.
    func looped(by form: [String]) -> BandData {
        var b = self
        b.name = name + " (loop)"
        b.bars = bars / form.count * form.count
        b.form = form
        let end = b.bars * beatsPerBar * ticksPerBeat
        b.channels = Channels(drums: channels.drums.filter { $0.t < end }, bass: channels.bass.filter { $0.t < end },
                              keys: channels.keys.filter { $0.t < end }, horns: channels.horns.filter { $0.t < end })
        return b
    }

    func straightened() -> BandData {
        let tpb = ticksPerBeat
        func move(_ n: Note) -> Note { Note(t: Self.straightTick(n.t, ticksPerBeat: tpb), n: n.n, v: n.v, len: n.len, i: n.i) }
        var b = self
        b.name = name + " (straight)"
        b.channels = Channels(drums: channels.drums.map { Hit(t: Self.straightTick($0.t, ticksPerBeat: tpb), s: $0.s, v: $0.v) },
                              bass: channels.bass.map(move), keys: channels.keys.map(move), horns: channels.horns.map(move))
        return b
    }
}
