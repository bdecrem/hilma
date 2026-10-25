import CoreMIDI
import os

/// CoreMIDI input: connects to every source, follows hot-plug, and reports note on/off
/// with the packet's host-time stamp. `onNote` is called on CoreMIDI's thread.
final class MIDIInput {
    struct Note {
        let note: Int
        /// 0...1; 0 for note off.
        let velocity: Float
        let on: Bool
        let hostTime: UInt64
    }

    var onNote: ((Note) -> Void)?
    /// Called on the main thread with the names of the connected sources.
    var onSources: (([String]) -> Void)?

    private var client = MIDIClientRef()
    private var port = MIDIPortRef()
    private var connected = Set<MIDIUniqueID>()
    private let log = Logger(subsystem: "takt", category: "midi")

    init() {
        var status = MIDIClientCreateWithBlock("Takt" as CFString, &client) { [weak self] notification in
            if notification.pointee.messageID == .msgSetupChanged {
                DispatchQueue.main.async { self?.connectAll() }
            }
        }
        guard status == noErr else {
            log.error("MIDIClientCreate failed: \(status)")
            return
        }
        status = MIDIInputPortCreateWithProtocol(client, "Takt In" as CFString, ._1_0, &port) { [weak self] list, _ in
            self?.receive(list)
        }
        guard status == noErr else {
            log.error("MIDIInputPortCreate failed: \(status)")
            return
        }
        DispatchQueue.main.async { self.connectAll() }
    }

    /// Connects sources that appeared and forgets ones that left (a replugged device gets
    /// reconnected because its id was dropped when it went away).
    private func connectAll() {
        var present = Set<MIDIUniqueID>()
        var names: [String] = []
        for i in 0..<MIDIGetNumberOfSources() {
            let source = MIDIGetSource(i)
            var id: MIDIUniqueID = 0
            MIDIObjectGetIntegerProperty(source, kMIDIPropertyUniqueID, &id)
            present.insert(id)
            var name: Unmanaged<CFString>?
            MIDIObjectGetStringProperty(source, kMIDIPropertyDisplayName, &name)
            let display = (name?.takeRetainedValue() as String?) ?? "MIDI \(id)"
            names.append(display)
            if !connected.contains(id) {
                let status = MIDIPortConnectSource(port, source, nil)
                if status == noErr {
                    connected.insert(id)
                    log.info("connected \(display, privacy: .public)")
                } else {
                    log.error("connect \(display, privacy: .public) failed: \(status)")
                }
            }
        }
        connected.formIntersection(present)
        onSources?(names)
    }

    private func receive(_ list: UnsafePointer<MIDIEventList>) {
        for packet in list.unsafeSequence() {
            // Hardware stamps packets with the host time of the key press; 0 means "now"
            // (virtual sources often send it), so stamp those on arrival.
            let stamped = packet.pointee.timeStamp
            let host = stamped == 0 ? mach_absolute_time() : stamped
            for word in packet.words() {
                // MIDI 1.0 channel voice in a UMP word: 0x2G SS NN VV.
                guard word >> 28 == 0x2 else { continue }
                let status = (word >> 16) & 0xF0
                let note = Int((word >> 8) & 0x7F)
                let velocity = Int(word & 0x7F)
                switch status {
                case 0x90 where velocity > 0:
                    onNote?(Note(note: note, velocity: Float(velocity) / 127, on: true, hostTime: host))
                case 0x80, 0x90:
                    onNote?(Note(note: note, velocity: 0, on: false, hostTime: host))
                default:
                    break
                }
            }
        }
    }
}
