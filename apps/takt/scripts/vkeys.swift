// A virtual MIDI keyboard for headless input checks: publishes a CoreMIDI source named
// "Takt Test Keys", waits for apps to connect, plays notes, then exits.
//
//   swift apps/takt/scripts/vkeys.swift "<wait-seconds>" "<note>:<on-seconds>:<off-seconds>" ...
import CoreMIDI
import Foundation

let args = Array(CommandLine.arguments.dropFirst())
var client = MIDIClientRef()
MIDIClientCreateWithBlock("takt-vkeys" as CFString, &client, nil)
var source = MIDIEndpointRef()
let status = MIDISourceCreateWithProtocol(client, "Takt Test Keys" as CFString, ._1_0, &source)
guard status == noErr else { print("source create failed \(status)"); exit(1) }

func send(_ word: UInt32) {
    var list = MIDIEventList()
    var w = word
    let packet = MIDIEventListInit(&list, ._1_0)
    _ = MIDIEventListAdd(&list, MemoryLayout<MIDIEventList>.size, packet, 0, 1, &w)
    MIDIReceivedEventList(source, &list)
}

let start = Date()
Thread.sleep(forTimeInterval: Double(args[0])!)
var events: [(at: Double, word: UInt32, label: String)] = []
for spec in args.dropFirst() {
    let p = spec.split(separator: ":").map { Double($0)! }
    let note = UInt32(p[0])
    events.append((p[1], 0x2090_0000 | note << 8 | 100, "on \(Int(note))"))
    events.append((p[2], 0x2080_0000 | note << 8, "off \(Int(note))"))
}
let t0 = Date()
for e in events.sorted(by: { $0.at < $1.at }) {
    let wait = e.at - Date().timeIntervalSince(t0)
    if wait > 0 { Thread.sleep(forTimeInterval: wait) }
    send(e.word)
    print(String(format: "%.3f s after start: %@", Date().timeIntervalSince(start), e.label))
}
Thread.sleep(forTimeInterval: 0.5)
