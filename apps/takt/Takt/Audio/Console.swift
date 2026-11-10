import Foundation

/// A song's console mixed to a reference render, as the renderer drives it: `Rack` (the dub
/// techno system: Halbschatten, Gezeiten) or `AcidRack` (Gegenlicht). The renderer routes the
/// kit's sounds into its buses, hands it the band's and your keys' voices, and lets it add its
/// buses and run its own master after the channels are mixed.
protocol Console: AnyObject {
    /// The kit's buses, by index (a drum sound's `bus`).
    var busNames: [String] { get }
    /// Debug (`-RackSolo`): whether a stem is heard.
    func passes(_ name: String) -> Bool
    func bus(_ index: Int) -> (UnsafeMutablePointer<Float>, UnsafeMutablePointer<Float>)
    /// The top of a chunk: the kit's buses empty.
    func begin(_ n: Int)
    /// The song from its top (a stop, a seek).
    func reset()
    /// The band stops (a pause): what it was playing dies away; the echoes and the hall ring on.
    func releaseBand()
    /// One of the reference's raw stab buffers (`Rack`).
    func hit(_ buffer: SampleBuffer, gain: Float, offset: Int)
    /// A synthesized stab note (`Rack`).
    func note(_ note: Int, velocity: Float, gain: Float, offset: Int, live: Bool)
    /// A lead note (`Rack`'s FM voice).
    func pluck(_ note: Int, velocity: Float, gain: Float, held: Int, offset: Int, live: Bool)
    /// An acid note (`AcidRack`): the gate holds `held` frames (Int.max: a key holds it).
    func acid(_ note: Int, velocity: Float, gain: Float, held: Int, offset: Int, live: Bool)
    /// A pad note (`AcidRack`): its gate opens, and closes after `held` frames. `live`: your
    /// side (a key, or a note the level leaves out played for you), not the keys channel's.
    func pad(_ note: Int, velocity: Float, gain: Float, held: Int, offset: Int, live: Bool)
    /// A key comes up, `offset` frames into the chunk.
    func release(_ note: Int, offset: Int)
    /// Adds every bus to `outL` / `outR` and runs the master. `kick` is the duck envelope,
    /// `kick2` the band's second one (`Duck.second`; the first again when it has none), `drums`
    /// and `keys` those channels' faders (1, or gliding to 0 when muted).
    func process(_ n: Int, tick: Double, ticksPerFrame: Double, ticksPerBar: Int, samplesPerBeat: Double, kick: UnsafePointer<Float>,
                 kick2: UnsafePointer<Float>, drums: Float, keys: Float, trim: Float,
                 outL: UnsafeMutablePointer<Float>, outR: UnsafeMutablePointer<Float>)
}

extension Console {
    func hit(_ buffer: SampleBuffer, gain: Float, offset: Int) {}
    func note(_ note: Int, velocity: Float, gain: Float, offset: Int, live: Bool) {}
    func pluck(_ note: Int, velocity: Float, gain: Float, held: Int, offset: Int, live: Bool) {}
    func acid(_ note: Int, velocity: Float, gain: Float, held: Int, offset: Int, live: Bool) {}
    func pad(_ note: Int, velocity: Float, gain: Float, held: Int, offset: Int, live: Bool) {}
}

extension Rack: Console {
    func release(_ note: Int, offset: Int) { release(note) }

    func process(_ n: Int, tick: Double, ticksPerFrame: Double, ticksPerBar: Int, samplesPerBeat: Double, kick: UnsafePointer<Float>,
                 kick2: UnsafePointer<Float>, drums: Float, keys: Float, trim: Float,
                 outL: UnsafeMutablePointer<Float>, outR: UnsafeMutablePointer<Float>) {
        process(n, tick: tick, ticksPerFrame: ticksPerFrame, ticksPerBar: ticksPerBar, samplesPerBeat: samplesPerBeat, kick: kick,
                drums: drums, trim: trim, outL: outL, outR: outR)
    }
}
