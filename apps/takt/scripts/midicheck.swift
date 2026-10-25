// Reads a .mid with Apple's MusicSequence (the parser GarageBand and Logic share) and prints
// what a DAW will see: tempo, time signature, track length in beats, the notes by bar.beat.
//   swiftc -O scripts/midicheck.swift -o build/midicheck && build/midicheck file.mid
import AudioToolbox
import Foundation

let url = URL(fileURLWithPath: CommandLine.arguments[1])
var seq: MusicSequence?
NewMusicSequence(&seq)
guard let seq, MusicSequenceFileLoad(seq, url as CFURL, .midiType, []) == noErr else { print("load failed"); exit(1) }
var tempoTrack: MusicTrack?
MusicSequenceGetTempoTrack(seq, &tempoTrack)
var count: UInt32 = 0
MusicSequenceGetTrackCount(seq, &count)

func events(_ track: MusicTrack, _ body: (MusicTimeStamp, MusicEventType, UnsafeRawPointer) -> Void) {
    var it: MusicEventIterator?
    NewMusicEventIterator(track, &it)
    guard let it else { return }
    var has: DarwinBoolean = false
    MusicEventIteratorHasCurrentEvent(it, &has)
    while has.boolValue {
        var t: MusicTimeStamp = 0, type: MusicEventType = 0, data: UnsafeRawPointer?, size: UInt32 = 0
        MusicEventIteratorGetEventInfo(it, &t, &type, &data, &size)
        if let data { body(t, type, data) }
        MusicEventIteratorNextEvent(it)
        MusicEventIteratorHasCurrentEvent(it, &has)
    }
}

events(tempoTrack!) { t, type, data in
    if type == kMusicEventType_ExtendedTempo {
        print(String(format: "tempo %.3f bpm at beat %.3f", data.load(as: ExtendedTempoEvent.self).bpm, t))
    } else if type == kMusicEventType_Meta {
        let m = data.load(as: MIDIMetaEvent.self)
        if m.metaEventType == 0x58 {
            let bytes = data.advanced(by: MemoryLayout<MIDIMetaEvent>.offset(of: \.data)!).assumingMemoryBound(to: UInt8.self)
            print("time signature \(bytes[0])/\(1 << bytes[1]) at beat \(t)")
        }
    }
}
print("tracks \(count)")
for i in 0..<count {
    var track: MusicTrack?
    MusicSequenceGetIndTrack(seq, i, &track)
    var length: MusicTimeStamp = 0
    var size = UInt32(MemoryLayout<MusicTimeStamp>.size)
    MusicTrackGetProperty(track!, kSequenceTrackProperty_TrackLength, &length, &size)
    var notes: [String] = []
    events(track!) { t, type, data in
        guard type == kMusicEventType_MIDINoteMessage else { return }
        let n = data.load(as: MIDINoteMessage.self)
        notes.append(String(format: "%d.%.2f n%d v%d %.2fb", Int(t / 4) + 1, t.truncatingRemainder(dividingBy: 4) + 1, n.note, n.velocity, n.duration))
    }
    print("track \(i): length \(length) beats (\(length / 4) bars), \(notes.count) notes")
    print(notes.joined(separator: "  "))
}
