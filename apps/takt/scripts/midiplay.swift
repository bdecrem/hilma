// A left hand over CoreMIDI, in time with the app: reads the app's `-ClockTo` file (the host
// time tick 0 is heard, and the tempo), then plays A1 step 1 (the root of each bar on the 1)
// from the next chorus that starts at least 1.5 s from now, one chorus per offset given.
// Publishes a source named "Takt Test Keys", like scripts/vkeys.swift.
//
//   swiftc -O apps/takt/scripts/midiplay.swift -o apps/takt/build/midiplay
//   apps/takt/build/midiplay <clock-file> <ms per chorus, e.g. -70,-50,30> [arrival]
//   apps/takt/build/midiplay <clock-file> taps:<ms,...>     # calibration: one tap per click
//
// `taps:` plays C4 at the calibration's twelve clicks (one a beat from tick 24), each at its
// offset (the last one repeats), skipping clicks already past.
//
// Each packet is stamped with the host time the note was meant for, as a hardware keyboard
// stamps its key presses; with `arrival` it is stamped 0 and the app stamps it on arrival.
import CoreMIDI
import Foundation

setlinebuf(stdout)  // the log is read while it runs
let args = Array(CommandLine.arguments.dropFirst())
guard args.count >= 2 else { print("usage: midiplay <clock-file> <ms,ms,...> [arrival]"); exit(2) }
let taps = args[1].hasPrefix("taps:")
let offsets = args[1].replacingOccurrences(of: "taps:", with: "").split(separator: ",").map { Double($0)! }
let arrival = args.count > 2 && args[2] == "arrival"
let roots = [48, 48, 48, 48, 53, 53, 48, 48, 55, 53, 48, 55]  // C3 F3 G3 over the 12-bar form

var timebase = mach_timebase_info_data_t()
mach_timebase_info(&timebase)
let hostPerSecond = 1e9 * Double(timebase.denom) / Double(timebase.numer)

var client = MIDIClientRef()
MIDIClientCreateWithBlock("takt-midiplay" as CFString, &client, nil)
var source = MIDIEndpointRef()
guard MIDISourceCreateWithProtocol(client, "Takt Test Keys" as CFString, ._1_0, &source) == noErr else {
    print("source create failed"); exit(1)
}

// The app writes the clock once the band rolls.
var clock: [String] = []
for _ in 0..<300 {
    if let text = try? String(contentsOfFile: args[0], encoding: .utf8) {
        clock = text.split(whereSeparator: \.isWhitespace).map(String.init)
        if clock.count == 3 { break }
    }
    Thread.sleep(forTimeInterval: 0.1)
}
guard clock.count == 3, let h0 = Double(clock[0]), let bpm = Double(clock[2]) else { print("no clock in \(args[0])"); exit(1) }
let secondsPerTick = 60 / (bpm * 12)
let chorusSeconds = 576 * secondsPerTick
let now = Double(mach_absolute_time())
var first = 0
while h0 + Double(first) * chorusSeconds * hostPerSecond < now + 1.5 * hostPerSecond { first += 1 }
print("tick 0 heard at \(clock[1]) s, \(bpm) bpm; playing choruses \(first + 1)...\(first + offsets.count)")

var events: [(host: Double, word: UInt32, label: String)] = []
if taps {
    for k in 0..<12 {
        let ms = offsets[min(k, offsets.count - 1)]
        let on = h0 + (Double(24 + 12 * k) * secondsPerTick + ms / 1000) * hostPerSecond
        guard on > now + 0.05 * hostPerSecond else { continue }
        events.append((on, 0x2090_0000 | UInt32(60) << 8 | 100, "click \(k + 1) tap \(ms) ms"))
        events.append((on + 6 * secondsPerTick * hostPerSecond, 0x2080_0000 | UInt32(60) << 8, ""))
    }
}
for (i, ms) in (taps ? [] : offsets).enumerated() {
    for (bar, note) in roots.enumerated() {
        let tick = Double((first + i) * 576 + bar * 48)
        let on = h0 + (tick * secondsPerTick + ms / 1000) * hostPerSecond
        let off = on + 18 * secondsPerTick * hostPerSecond
        events.append((on, 0x2090_0000 | UInt32(note) << 8 | 100, "chorus \(first + i + 1) bar \(bar + 1) on \(note) \(ms) ms"))
        events.append((off, 0x2080_0000 | UInt32(note) << 8, ""))
    }
}
for e in events.sorted(by: { $0.host < $1.host }) {
    mach_wait_until(UInt64(e.host))
    var list = MIDIEventList()
    var w = e.word
    let packet = MIDIEventListInit(&list, ._1_0)
    _ = MIDIEventListAdd(&list, MemoryLayout<MIDIEventList>.size, packet, arrival ? 0 : UInt64(e.host), 1, &w)
    MIDIReceivedEventList(source, &list)
    if !e.label.isEmpty { print(e.label) }
}
Thread.sleep(forTimeInterval: 0.5)
