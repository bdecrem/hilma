import Foundation

/// One pre-planned backing event: a voice at an absolute song time.
struct BackingEvent {
    let time: Double
    let make: () -> any Voice
}

/// The full backing arrangement for one run, plus the beat markers the scene
/// and haptics need (kicks drive the strobe, the dodo's nod, and the drop thump).
struct BackingPlan {
    let events: [BackingEvent]
    /// Song times of kick hits (for strobe / nod / kick haptics).
    let kickTimes: [Double]
    /// Song time the peak section lands (the drop, for the haptic thump window).
    let dropTime: Double
}

/// Translates each TrackDef into its arrangement. The origin and minimal plans
/// are direct ports of scheduleAudio() in the reference prototypes.
enum BackingComposer {

    static func plan(for track: TrackDef) -> BackingPlan {
        switch track.id {
        case "ttd01": return origin(track)
        case "ttd02": return minimal(track)
        case "ttd03": return detroit(track)
        default: return gabber(track)
        }
    }

    private static func dropStart(_ track: TrackDef) -> Double {
        let peakBar = track.sections.first { $0.kind == .peak }?.bars.lowerBound ?? 0
        return Double(peakBar * 4) * track.secondsPerBeat
    }

    // ttd·01 — four-on-floor kick, closed eighth hats, one-note-per-beat bass
    // over A/F/C/G, pad swells every 2 bars.
    private static func origin(_ track: TrackDef) -> BackingPlan {
        let spb = track.secondsPerBeat
        var events: [BackingEvent] = []
        var kicks: [Double] = []
        let roots = [Tone.A2, Tone.F2, Tone.C3, Tone.G2]

        for half in 0..<(track.bars * 8) {
            let halfBeat = Double(half) * 0.5
            let t = halfBeat * spb
            let bar = half / 8
            let inBar = halfBeat - Double(bar * 4)
            let isWhole = inBar.truncatingRemainder(dividingBy: 1) == 0
            let root = roots[bar % 4]

            if isWhole {
                events.append(BackingEvent(time: t) { KickVoice.origin(at: t) })
                kicks.append(t)
                if inBar == 0 {
                    events.append(BackingEvent(time: t) { BassVoice(at: t, freq: root, spb: spb) })
                    if bar % 2 == 0 {
                        let low = Tone.A3 / 2 * (bar % 4 == 0 ? 1 : 0.89)
                        events.append(BackingEvent(time: t) {
                            PadVoice(at: t, freqs: [low, Tone.A3, Tone.C4], dur: spb * 4, seed: UInt64(bar) &+ 101)
                        })
                    }
                }
                if inBar == 2 {
                    events.append(BackingEvent(time: t) { BassVoice(at: t, freq: root * 1.5, spb: spb) })
                }
            }
            // Closed hats on every eighth, exactly like the prototype.
            events.append(BackingEvent(time: t) { HatVoice.origin(at: t, open: false, seed: UInt64(half) &+ 1) })
        }
        return BackingPlan(events: events, kickTimes: kicks, dropTime: dropStart(track))
    }

    // ttd·02 — kick 4/4 (out during breakdown bars 16–20), offbeat hats from
    // bar 4, claps on 2 & 4 from bar 12, 16-beat drone cycles throughout.
    private static func minimal(_ track: TrackDef) -> BackingPlan {
        let spb = track.secondsPerBeat
        var events: [BackingEvent] = []
        var kicks: [Double] = []

        for half in 0..<(track.bars * 8) {
            let halfBeat = Double(half) * 0.5
            let t = halfBeat * spb
            let bar = half / 8
            let inBar = halfBeat - Double(bar * 4)
            let isWhole = inBar.truncatingRemainder(dividingBy: 1) == 0
            let breakdown = bar >= 16 && bar < 20

            if isWhole && !breakdown {
                let accent = inBar == 0
                events.append(BackingEvent(time: t) { KickVoice.minimal(at: t, accent: accent, seed: UInt64(half) &+ 3) })
                kicks.append(t)
            }
            if !isWhole && bar >= 4 && !breakdown {
                let open = inBar == 3.5 && bar >= 12
                events.append(BackingEvent(time: t) { HatVoice.minimal(at: t, open: open, seed: UInt64(half) &+ 5) })
            }
            if isWhole && (inBar == 1 || inBar == 3) && bar >= 12 && !breakdown {
                events.append(BackingEvent(time: t) { ClapVoice(at: t, seed: UInt64(half) &+ 9) })
            }
            if inBar == 0 && isWhole && bar % 4 == 0 {
                events.append(BackingEvent(time: t) { DroneVoice(at: t, dur: spb * 16) })
            }
        }
        return BackingPlan(events: events, kickTimes: kicks, dropTime: dropStart(track))
    }

    // ttd·03 — kick 4/4 (out in breakdown), swung offbeat hats, claps from
    // bar 8, Am9 string swells every 2 bars, upper-structure stabs from bar 12.
    private static func detroit(_ track: TrackDef) -> BackingPlan {
        let spb = track.secondsPerBeat
        let swingDelay = (track.swing - 0.5) * spb
        var events: [BackingEvent] = []
        var kicks: [Double] = []
        let am9: [Double] = [Tone.A2, Tone.C3, Tone.E3, Tone.G3, Tone.B3]
        let stab: [Double] = [Tone.C4, Tone.E4, Tone.G4, Tone.B4]
        let roots = [Tone.A2, Tone.A2, Tone.F2, Tone.G2]

        for half in 0..<(track.bars * 8) {
            let halfBeat = Double(half) * 0.5
            let bar = half / 8
            let inBar = halfBeat - Double(bar * 4)
            let isWhole = inBar.truncatingRemainder(dividingBy: 1) == 0
            let breakdown = bar >= 16 && bar < 20
            let t = halfBeat * spb + (isWhole ? 0 : swingDelay)

            if isWhole && !breakdown {
                events.append(BackingEvent(time: t) { KickVoice.detroit(at: t) })
                kicks.append(t)
                if inBar == 0 {
                    events.append(BackingEvent(time: t) { BassVoice(at: t, freq: roots[bar % 4], spb: spb) })
                }
            }
            if !isWhole && bar >= 2 && !breakdown {
                let open = inBar == 3.5 && bar % 4 == 3
                events.append(BackingEvent(time: t) { HatVoice.origin(at: t, open: open, seed: UInt64(half) &+ 21) })
            }
            if isWhole && (inBar == 1 || inBar == 3) && bar >= 8 && !breakdown {
                events.append(BackingEvent(time: t) { ClapVoice(at: t, gain: 0.11, seed: UInt64(half) &+ 23) })
            }
            if inBar == 0 && isWhole && bar % 2 == 0 && bar >= 4 {
                // Strings swell right through the breakdown — that's the point.
                events.append(BackingEvent(time: t) {
                    StringsVoice(at: t, freqs: am9, dur: spb * 8, gain: breakdown ? 0.06 : 0.045, seed: UInt64(bar) &+ 31)
                })
            }
            if inBar == 3.5 && !isWhole && bar >= 12 && bar % 2 == 1 && !breakdown {
                events.append(BackingEvent(time: t) { ChordStabVoice(at: t, freqs: stab) })
            }
        }
        return BackingPlan(events: events, kickTimes: kicks, dropTime: dropStart(track))
    }

    // ttd·04 — distorted kick every beat, offbeat hats, claps at the peak.
    private static func gabber(_ track: TrackDef) -> BackingPlan {
        let spb = track.secondsPerBeat
        var events: [BackingEvent] = []
        var kicks: [Double] = []

        for half in 0..<(track.bars * 8) {
            let halfBeat = Double(half) * 0.5
            let t = halfBeat * spb
            let bar = half / 8
            let inBar = halfBeat - Double(bar * 4)
            let isWhole = inBar.truncatingRemainder(dividingBy: 1) == 0
            let breakdown = bar >= 16 && bar < 18
            let peak = bar >= 18 && bar < 28

            if isWhole && !breakdown {
                let accent = inBar == 0
                events.append(BackingEvent(time: t) { KickVoice.gabber(at: t, accent: accent) })
                kicks.append(t)
            }
            if !isWhole && bar >= 2 {
                events.append(BackingEvent(time: t) { HatVoice.minimal(at: t, open: false, seed: UInt64(half) &+ 41) })
            }
            if isWhole && (inBar == 1 || inBar == 3) && peak {
                events.append(BackingEvent(time: t) { ClapVoice(at: t, gain: 0.12, seed: UInt64(half) &+ 43) })
            }
            if breakdown && isWhole && (inBar == 0 || inBar == 2) {
                events.append(BackingEvent(time: t) { StabVoice(at: t, lane: 0, vol: 0.3) })
            }
        }
        return BackingPlan(events: events, kickTimes: kicks, dropTime: dropStart(track))
    }
}

/// Lookahead scheduler: a 25ms background timer pushes backing events into the
/// synth 300ms before they sound. Sample-accurate placement happens in the
/// render block; this just has to stay comfortably ahead of it.
final class BackingScheduler {
    private let plan: BackingPlan
    private let conductor: Conductor
    private let synth: SynthEngine
    private var nextIndex = 0
    private var timer: DispatchSourceTimer?
    private let queue = DispatchQueue(label: "ttd.scheduler", qos: .userInteractive)

    /// Called (on the scheduler queue) for kick times as they are scheduled —
    /// the haptics hook.
    var onKickScheduled: ((Double) -> Void)?
    private var nextKickIndex = 0

    init(plan: BackingPlan, conductor: Conductor, synth: SynthEngine) {
        self.plan = plan
        self.conductor = conductor
        self.synth = synth
    }

    func start() {
        let t = DispatchSource.makeTimerSource(queue: queue)
        t.schedule(deadline: .now(), repeating: .milliseconds(25))
        t.setEventHandler { [weak self] in self?.tick() }
        t.resume()
        timer = t
    }

    func stop() {
        timer?.cancel()
        timer = nil
    }

    private func tick() {
        guard conductor.running else { return }
        let ahead = conductor.songTime + 0.3
        while nextIndex < plan.events.count, plan.events[nextIndex].time < ahead {
            let event = plan.events[nextIndex]
            // Skip events that are already unrecoverably in the past
            // (e.g. after an interruption): >50ms late is a dropped hit.
            if event.time > conductor.songTime - 0.05 {
                synth.schedule(event.make())
            }
            nextIndex += 1
        }
        while nextKickIndex < plan.kickTimes.count, plan.kickTimes[nextKickIndex] < ahead {
            onKickScheduled?(plan.kickTimes[nextKickIndex])
            nextKickIndex += 1
        }
    }
}
