// Finds note onsets in a recording and estimates each note's pitch (autocorrelation over
// 40 ms starting 30 ms after the onset). For checking the monitor with the band stopped.
//
//   swiftc -O apps/takt/scripts/notecheck.swift -o apps/takt/build/notecheck
//   apps/takt/build/notecheck <recording.wav>
import AVFoundation

let file = try AVAudioFile(forReading: URL(fileURLWithPath: CommandLine.arguments[1]))
let format = file.processingFormat
let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(file.length))!
try file.read(into: buffer)
let n = Int(buffer.frameLength)
let sr = format.sampleRate
let l = buffer.floatChannelData![0], r = buffer.floatChannelData![1]
var mono = [Float](repeating: 0, count: n)
for i in 0..<n { mono[i] = (l[i] + r[i]) * 0.5 }

let release = Float(exp(-1 / (0.03 * sr)))
var env = [Float](repeating: 0, count: n)
var e: Float = 0
for i in 0..<n {
    e = max(abs(mono[i]), e * release)
    env[i] = e
}
let floor = (env.max() ?? 0) * 0.05
let lag = Int(0.005 * sr)
var i = lag
let names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
while i < n - Int(0.08 * sr) {
    if env[i] > floor && env[i] > 2 * env[i - lag] {
        let start = i + Int(0.03 * sr), len = Int(0.04 * sr)
        // Autocorrelation peak between 60 Hz and 1.2 kHz.
        // Multiples of the period score as well as the period itself, so take the shortest
        // period within 85% of the best score.
        let periods = Array(Int(sr / 1200)...Int(sr / 60))
        let scores = periods.map { period -> Float in
            var s: Float = 0
            for k in 0..<len { s += mono[start + k] * mono[start + k + period] }
            return s
        }
        let top = scores.max() ?? 0
        var best = periods.last!
        for (j, s) in scores.enumerated() where s >= 0.85 * top {
            // Walk to the local peak from the first period that qualifies.
            var k = j
            while k + 1 < scores.count && scores[k + 1] > scores[k] { k += 1 }
            best = periods[k]
            break
        }
        let hz = sr / Double(best)
        let midi = 69 + 12 * log2(hz / 440)
        let note = Int(midi.rounded())
        print(String(format: "onset %.3f s  %.1f Hz  ≈ %@%d (%+.0f cents)", Double(i) / sr, hz,
                     names[(note % 12 + 12) % 12], note / 12 - 1, (midi - Double(note)) * 100))
        i += Int(0.15 * sr)
    } else {
        i += 1
    }
}
