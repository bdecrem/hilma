import Foundation

/// The sampled instruments in Takt/Sounds, as cut by `scripts/sounds.py` (`instruments.json`):
/// per instrument a release time and zones, each a root note (0 for drums), a velocity ceiling
/// and its round-robin files. A zone may carry the files' sustain loop (`loop`: start and end
/// in frames, and `loopDecay`, the level of each pass over the one before, default 1: the
/// organ holds, the Rhodes fades as measured); an instrument may say how
/// much velocity moves its level (`touch`, 0...1, default 1: the organ has almost none).
struct InstrumentManifest: Decodable {
    struct Zone: Decodable {
        let root: Int
        let vel: Double
        let files: [String]
        let loop: [Int]?
        let loopDecay: Double?
    }

    struct Entry: Decodable {
        let release: Double
        let touch: Double?
        let zones: [Zone]
    }

    let instruments: [String: Entry]

    init(from decoder: Decoder) throws {
        instruments = try decoder.singleValueContainer().decode([String: Entry].self)
    }

    static let bundled: InstrumentManifest = {
        guard let url = Bundle.main.url(forResource: "instruments", withExtension: "json") else {
            fatalError("instruments.json is not in the bundle")
        }
        do {
            return try JSONDecoder().decode(InstrumentManifest.self, from: Data(contentsOf: url))
        } catch {
            fatalError("instruments.json: \(error)")
        }
    }()
}

/// One instrument, loaded: picks the sample for a note and a velocity on the render thread.
/// Zones sit in preallocated memory; the only state is the round-robin counter.
final class SampledInstrument {
    private struct Zone {
        var root: Int
        var vel: Float
        var first: Int
        var count: Int
    }

    let release: Double
    /// How much velocity moves the level and picks the layer (1: all of it; the organ 0.35).
    let touch: Float
    private let zones: UnsafeMutableBufferPointer<Zone>
    private let samples: UnsafeMutableBufferPointer<SampleBuffer>
    private var robin = 0

    /// One instance per name: bands share the piano and the kit, loaded once. Main thread.
    private static var cache: [String: SampledInstrument] = [:]
    static func shared(_ name: String) -> SampledInstrument {
        if let i = cache[name] { return i }
        let i = SampledInstrument(name)
        cache[name] = i
        return i
    }

    init(_ name: String, manifest: InstrumentManifest = .bundled) {
        guard let entry = manifest.instruments[name] else { fatalError("no instrument \(name) in instruments.json") }
        release = entry.release
        touch = Float(entry.touch ?? 1)
        let files = entry.zones.flatMap { z in z.files.map { ($0, z.loop, z.loopDecay) } }
        samples = .allocate(capacity: files.count)
        for (i, f) in files.enumerated() { samples.initializeElement(at: i, to: .bundled(f.0, loop: f.1, decay: f.2)) }
        zones = .allocate(capacity: entry.zones.count)
        var first = 0
        for (i, z) in entry.zones.enumerated() {
            zones.initializeElement(at: i, to: Zone(root: z.root, vel: Float(z.vel), first: first, count: z.files.count))
            first += z.files.count
        }
    }

    /// The sample for `note` at `velocity` (0...1) and its pitch ratio: the nearest root, then
    /// the softest layer whose ceiling covers the velocity, then the next round robin. The gain
    /// spreads the velocity inside the layer (half to full level), so layers join smoothly.
    /// `velocity` comes back as the instrument felt it (`touch`), for the caller's own level.
    func pick(note: Int, velocity: Float) -> (buffer: SampleBuffer, ratio: Double, gain: Float, velocity: Float) {
        let velocity = 1 - touch * (1 - velocity)
        var nearest = Int.max
        for z in zones where abs(z.root - note) < nearest { nearest = abs(z.root - note) }
        var chosen = -1
        var floor: Float = 0
        var lastAtRoot = -1
        for i in zones.indices where abs(zones[i].root - note) == nearest {
            if chosen < 0 && velocity <= zones[i].vel { chosen = i }
            if chosen < 0 { floor = zones[i].vel }
            lastAtRoot = i
        }
        if chosen < 0 { chosen = lastAtRoot; floor = 0 }
        let z = zones[chosen]
        robin &+= 1
        let buffer = samples[z.first + robin % z.count]
        let span = max(z.vel - floor, 0.001)
        let inLayer = min(max((velocity - floor) / span, 0), 1)
        return (buffer, pow(2, Double(note - z.root) / 12), 0.5 + 0.5 * inLayer, velocity)
    }
}
