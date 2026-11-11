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
        /// The source's CoreMIDI name (`InputDevice`).
        let device: String
    }

    var onNote: ((Note) -> Void)?
    /// Called on the main thread with the names of the connected sources.
    var onSources: (([String]) -> Void)?

    private var client = MIDIClientRef()
    private var port = MIDIPortRef()
    private var connected = Set<MIDIUniqueID>()
    /// Each connected source's name by id, read on CoreMIDI's thread.
    private var names: [MIDIUniqueID: String] = [:]
    private let namesLock = NSLock()
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
        status = MIDIInputPortCreateWithProtocol(client, "Takt In" as CFString, ._1_0, &port) { [weak self] list, refCon in
            self?.receive(list, from: refCon)
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
        var byId: [MIDIUniqueID: String] = [:]
        for i in 0..<MIDIGetNumberOfSources() {
            let source = MIDIGetSource(i)
            var id: MIDIUniqueID = 0
            MIDIObjectGetIntegerProperty(source, kMIDIPropertyUniqueID, &id)
            present.insert(id)
            var name: Unmanaged<CFString>?
            MIDIObjectGetStringProperty(source, kMIDIPropertyDisplayName, &name)
            let display = (name?.takeRetainedValue() as String?) ?? "MIDI \(id)"
            names.append(display)
            byId[id] = display
            if !connected.contains(id) {
                let status = MIDIPortConnectSource(port, source, Self.refCon(id))
                if status == noErr {
                    connected.insert(id)
                    log.info("connected \(display, privacy: .public)")
                } else {
                    log.error("connect \(display, privacy: .public) failed: \(status)")
                }
            }
        }
        connected.formIntersection(present)
        namesLock.lock()
        self.names = byId
        namesLock.unlock()
        onSources?(names)
    }

    /// Settings → Input → "White keys play A minor": each white key plays the white key two
    /// below it (C→A, D→B, E→C … B→G), so C–C on the keyboard is A–A, and a 25- or 32-key
    /// board that starts on C covers two octaves of A minor. Black keys move down three
    /// semitones (C♯→A♯ …). Applied here, before the monitor, the keys on screen and scoring.
    static let whiteKeyMinorKey = "whiteKeysAMinor"
    private static let whiteIndex = [0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6]
    private static let whitePC = [0, 2, 4, 5, 7, 9, 11]
    static func remap(_ note: Int, on: Bool = UserDefaults.standard.bool(forKey: whiteKeyMinorKey)) -> Int {
        guard on else { return note }
        guard let w = whiteIndex[note % 12] else { return max(0, note - 3) }
        let d = note / 12 * 7 + w - 2
        return max(0, (d / 7) * 12 + whitePC[d % 7])
    }

    /// A source's id as the connection's refCon (never nil: the high bit is set).
    private static func refCon(_ id: MIDIUniqueID) -> UnsafeMutableRawPointer? {
        UnsafeMutableRawPointer(bitPattern: UInt(UInt32(bitPattern: id)) | (1 << 40))
    }

    private func receive(_ list: UnsafePointer<MIDIEventList>, from refCon: UnsafeMutableRawPointer?) {
        let id = MIDIUniqueID(truncatingIfNeeded: UInt(bitPattern: refCon) & 0xFFFF_FFFF)
        namesLock.lock()
        let device = names[id] ?? InputDevice.local
        namesLock.unlock()
        let shift = InputDevice.transpose(device)
        for packet in list.unsafeSequence() {
            // Hardware stamps packets with the host time of the key press; 0 means "now"
            // (virtual sources often send it), so stamp those on arrival.
            let stamped = packet.pointee.timeStamp
            let host = stamped == 0 ? mach_absolute_time() : stamped
            for word in packet.words() {
                // MIDI 1.0 channel voice in a UMP word: 0x2G SS NN VV.
                guard word >> 28 == 0x2 else { continue }
                let status = (word >> 16) & 0xF0
                let note = MIDIInput.remap(InputDevice.shifted(Int((word >> 8) & 0x7F), by: shift))
                let velocity = Int(word & 0x7F)
                switch status {
                case 0x90 where velocity > 0:
                    onNote?(Note(note: note, velocity: Float(velocity) / 127, on: true, hostTime: host, device: device))
                case 0x80, 0x90:
                    onNote?(Note(note: note, velocity: 0, on: false, hostTime: host, device: device))
                default:
                    break
                }
            }
        }
    }
}
