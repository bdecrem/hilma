#if DEBUG
import Foundation

/// Launch-argument hooks for headless checks. Compiled out of Release.
///
/// `-RenderTo <wav> [-RenderSeconds 30] [-Tempo 70] [-RenderScript "0:play,10:tempo=90"]`
///   renders the band offline (no device, faster than realtime) and exits. Script items are
///   `<seconds>:<command>`: play, pause, stop, tempo=N, mute=<channel>, unmute=<channel>,
///   on=<note>@<velocity>, off=<note>. Channels: drums, bass, keys, horns.
///
/// `-RecordTo <wav> [-RecordSeconds 10]` records the live render (use with `-Silent 1`) and exits.
///
/// `-TestPress <note>` holds that key down a second after launch, through the same path as a touch.
enum DebugHooks {
    static func pressIfRequested(_ player: Player) {
        let note = UserDefaults.standard.integer(forKey: "TestPress")
        guard note > 0 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { player.press(note) }
    }

    static func renderIfRequested() {
        let d = UserDefaults.standard
        guard let path = d.string(forKey: "RenderTo") else { return }
        let seconds = d.double(forKey: "RenderSeconds") > 0 ? d.double(forKey: "RenderSeconds") : 30
        let tempo = d.double(forKey: "Tempo") > 0 ? d.double(forKey: "Tempo") : 70
        let script = parse(d.string(forKey: "RenderScript") ?? "0:play")
        let audio = AudioEngine(band: .bundled("band-blues-C"), tempo: tempo)
        do {
            try audio.renderOffline(seconds: seconds, script: script, to: URL(fileURLWithPath: path))
            print("TAKT rendered \(seconds)s at \(audio.sampleRate) Hz to \(path)")
            exit(0)
        } catch {
            print("TAKT render failed: \(error)")
            exit(1)
        }
    }

    static func recordIfRequested(_ audio: AudioEngine) {
        let d = UserDefaults.standard
        guard let path = d.string(forKey: "RecordTo") else { return }
        let seconds = d.double(forKey: "RecordSeconds") > 0 ? d.double(forKey: "RecordSeconds") : 10
        do {
            try audio.record(seconds: seconds, to: URL(fileURLWithPath: path)) {
                print("TAKT recorded \(seconds)s to \(path)")
                exit(0)
            }
        } catch {
            print("TAKT record failed: \(error)")
            exit(1)
        }
    }

    static func parse(_ script: String) -> [(at: Double, command: EngineCommand)] {
        let channels: [String: Channel] = ["drums": .drums, "bass": .bass, "keys": .keys, "horns": .horns]
        return script.split(separator: ",").map { item in
            let parts = item.split(separator: ":", maxSplits: 1).map(String.init)
            guard parts.count == 2, let at = Double(parts[0]) else { fatalError("RenderScript item \(item)") }
            let kv = parts[1].split(separator: "=", maxSplits: 1).map(String.init)
            let command: EngineCommand
            switch (kv[0], kv.count > 1 ? kv[1] : nil) {
            case ("play", nil): command = .play
            case ("pause", nil): command = .pause
            case ("stop", nil): command = .stop
            case ("tempo", let v?): command = .tempo(Double(v)!)
            case ("mute", let v?): command = .mute(channels[v]!, true)
            case ("unmute", let v?): command = .mute(channels[v]!, false)
            case ("on", let v?):
                let nv = v.split(separator: "@")
                command = .noteOn(note: Int(nv[0])!, velocity: nv.count > 1 ? Float(nv[1])! : 0.8)
            case ("off", let v?): command = .noteOff(note: Int(v)!)
            default: fatalError("RenderScript command \(parts[1])")
            }
            return (at, command)
        }
    }
}
#endif
