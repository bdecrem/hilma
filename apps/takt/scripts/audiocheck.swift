// Checks an offline render of the band: levels, and kick timing against the band data.
//
//   swiftc -O apps/takt/scripts/audiocheck.swift -o apps/takt/build/audiocheck
//   apps/takt/build/audiocheck <render.wav> <band.json> <tempo> [<request-seconds>:<new-tempo>]
//
// Kick onsets are found in the low band (one-pole lowpass at 120 Hz, rectified, fast-attack
// envelope; an onset is where the envelope more than doubles within 5 ms). Expected kick times
// come from the band's kick ticks and the tempo program: the tempo, then (optionally) a change
// requested at <request-seconds> that takes effect on the next downbeat, as the engine promises.
// Prints the detector's constant offset, the spread around it, and the drift (ms per minute).
import AVFoundation

let args = CommandLine.arguments
guard args.count >= 4 else {
    print("usage: audiocheck <render.wav> <band.json> <tempo> [<request-seconds>:<new-tempo>]")
    exit(2)
}
let file = try AVAudioFile(forReading: URL(fileURLWithPath: args[1]))
let format = file.processingFormat
let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(file.length))!
try file.read(into: buffer)
let n = Int(buffer.frameLength)
let sr = format.sampleRate
let left = buffer.floatChannelData![0], right = buffer.floatChannelData![1]

// Levels.
var peak: Float = 0
var energy = 0.0
for i in 0..<n {
    peak = max(peak, abs(left[i]), abs(right[i]))
    let m = Double(left[i] + right[i]) * 0.5
    energy += m * m
}
func db(_ x: Double) -> String { String(format: "%.1f dBFS", 20 * log10(max(x, 1e-9))) }
print("length \(String(format: "%.2f", Double(n) / sr)) s, peak \(db(Double(peak))), rms \(db(sqrt(energy / Double(n))))")

// Band data: kick ticks.
struct Band: Decodable {
    struct Hit: Decodable { let t: Int; let s: String }
    struct Channels: Decodable { let drums: [Hit] }
    let ticksPerBeat: Int
    let beatsPerBar: Int
    let bars: Int
    let channels: Channels
}
let band = try JSONDecoder().decode(Band.self, from: Data(contentsOf: URL(fileURLWithPath: args[2])))
let tpb = Double(band.ticksPerBeat)
let barTicks = band.ticksPerBeat * band.beatsPerBar
let loopTicks = barTicks * band.bars
let kickTicks = band.channels.drums.filter { $0.s == "kick" }.map(\.t)

// Tempo program → time of an absolute tick.
let tempo = Double(args[3])!
var changeTick = Int.max
var changeTime = 0.0
var newTempo = tempo
if args.count > 4, args[4].contains(":") {
    let p = args[4].split(separator: ":")
    let requestAt = Double(p[0])!
    newTempo = Double(p[1])!
    let secPerBar = 60 / tempo * Double(band.beatsPerBar)
    let bar = Int((requestAt / secPerBar).rounded(.up))
    changeTick = bar * barTicks
    changeTime = Double(bar) * secPerBar
}
func time(ofTick t: Int) -> Double {
    if t < changeTick { return Double(t) / tpb * 60 / tempo }
    return changeTime + Double(t - changeTick) / tpb * 60 / newTempo
}
var expected: [Double] = []
var position: [Int] = []
var loop = 0
while true {
    let times = kickTicks.map { time(ofTick: loop * loopTicks + $0) }
    if times.first! > Double(n) / sr - 0.05 { break }
    // The onset test looks 5 ms back, so a kick in the first 10 ms can't be measured.
    for (k, t) in times.enumerated() where t > 0.01 && t < Double(n) / sr - 0.05 {
        expected.append(t)
        position.append(k)
    }
    loop += 1
}

// Onsets in the low band.
let a = Float(1 - exp(-2 * Double.pi * 120 / sr))
let release = Float(exp(-1 / (0.02 * sr)))
var lp: Float = 0
var env = [Float](repeating: 0, count: n)
var e: Float = 0
for i in 0..<n {
    lp += a * ((left[i] + right[i]) * 0.5 - lp)
    e = max(abs(lp), e * release)
    env[i] = e
}
let maxEnv = env.max()!
let lag = Int(0.005 * sr)
let refractory = Int(0.15 * sr)
var onsets: [Double] = []
var i = lag
while i < n {
    if env[i] > 0.08 * maxEnv && env[i] > 2 * env[i - lag] {
        onsets.append(Double(i) / sr)
        i += refractory
    } else {
        i += 1
    }
}

// Match each expected kick to the nearest onset.
var errors: [(t: Double, ms: Double)] = []
var byPosition: [Int: [Double]] = [:]
var missing = 0
for (j, t) in expected.enumerated() {
    guard let o = onsets.min(by: { abs($0 - t) < abs($1 - t) }), abs(o - t) < 0.03 else { missing += 1; continue }
    errors.append((t, (o - t) * 1000))
    byPosition[position[j], default: []].append((o - t) * 1000)
}
let mean = errors.map(\.ms).reduce(0, +) / Double(max(1, errors.count))
let spread = errors.map { abs($0.ms - mean) }.max() ?? 0
// Least-squares slope of error vs time.
let mt = errors.map(\.t).reduce(0, +) / Double(max(1, errors.count))
let num = errors.map { ($0.t - mt) * ($0.ms - mean) }.reduce(0, +)
let den = errors.map { ($0.t - mt) * ($0.t - mt) }.reduce(0, +)
let slope = den > 0 ? num / den * 60 : 0
print("kicks: expected \(expected.count), matched \(errors.count), missing \(missing), onsets found \(onsets.count)")
print(String(format: "detector offset %.3f ms, max deviation %.3f ms, drift %.4f ms/min", mean, spread, slope))
// The detector is biased per kick (a kick on another's tail is found later), but the same kick
// in every chorus sounds identical, so its spread across choruses is the engine's own jitter.
let jitter = byPosition.values.filter { $0.count > 1 }.map { $0.max()! - $0.min()! }.max() ?? 0
print(String(format: "jitter: the same kick across %d choruses varies by at most %.3f ms (one frame = %.3f ms)",
             loop, jitter, 1000 / sr))
if changeTick != .max {
    let before = errors.filter { $0.t < changeTime }.map { abs($0.ms - mean) }.max() ?? 0
    let after = errors.filter { $0.t >= changeTime }.map { abs($0.ms - mean) }.max() ?? 0
    print(String(format: "tempo %.0f → %.0f requested at %@ s, applied on the downbeat at %.4f s: max deviation before %.3f ms, after %.3f ms",
                 tempo, newTempo, String(args[4].split(separator: ":")[0]), changeTime, before, after))
}
if CommandLine.arguments.contains("--verbose") {
    for (k, errs) in byPosition.sorted(by: { $0.key < $1.key }) where errs.max()! - errs.min()! > 0.05 {
        print("kick #\(k) (tick \(kickTicks[k])):", errs.map { String(format: "%.3f", $0) }.joined(separator: " "))
    }
}
