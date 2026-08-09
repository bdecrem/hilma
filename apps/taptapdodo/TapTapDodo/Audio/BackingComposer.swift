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
        case "ttd05": return afters(track)
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

    // ttd·05 — the 4am minimal cut. Layered kick + breathing rumble bed,
    // ghost 16ths, velocity-shaped swung hats, offbeat sub bounce, dub chords
    // with darkening echoes, one resonant filter arc, sidechain pump, ghost
    // bars at 13 and 27 (kick out for one bar — the Hawtin trick), and a
    // rumble-only heartbeat through the breakdown.
    private static func afters(_ track: TrackDef) -> BackingPlan {
        let spb = track.secondsPerBeat
        func at(_ beat: Double) -> Double { beat * spb }
        var events: [BackingEvent] = []
        var kicks: [Double] = []

        let ghostBars: Set<Int> = [13, 27]
        func isBreakdown(_ bar: Int) -> Bool { bar >= 16 && bar < 20 }
        func hasKick(_ bar: Int) -> Bool { !isBreakdown(bar) && !ghostBars.contains(bar) }

        // Sidechain pump runs wherever the kick runs.
        let pump = Pump(ranges: [
            (at(0), at(52)), (at(56), at(64)), (at(80), at(108)), (at(112), at(128)),
        ], spb: spb)

        // The drone spans the whole track; its filter arc is the narrative:
        // slow rises, a swell through the breakdown, a hard snap at the drop.
        let arc: [(Double, Double)] = [
            (at(0), 95), (at(32), 115), (at(48), 175), (at(63.9), 250),
            (at(64), 330), (at(79.9), 430),
            (at(80), 165), (at(104), 200), (at(112), 150), (at(126), 95),
        ]
        events.append(BackingEvent(time: 0) {
            AftersDroneVoice(at: 0, dur: at(128), arc: arc, pump: pump)
        })

        for bar in 0..<track.bars {
            let barStart = Double(bar * 4)
            var micro = SplitMix64(seed: UInt64(bar) &* 0x9E37 &+ 5)

            // kick + rumble bed
            if hasKick(bar) {
                for k in 0..<4 {
                    let t = at(barStart + Double(k))
                    let accent = k == 0
                    events.append(BackingEvent(time: t) { TightKickVoice(at: t, accent: accent, seed: UInt64(bar * 4 + k) &+ 3) })
                    kicks.append(t)
                    let rt = t + 0.018
                    events.append(BackingEvent(time: rt) { RumbleVoice(at: rt, beatLength: spb, gain: 0.3, seed: UInt64(bar * 4 + k) &+ 91) })
                }
            } else if isBreakdown(bar) {
                // the ghost of the kick: rumble alone, half gain, beats 1 & 3
                for k in [0, 2] {
                    let rt = at(barStart + Double(k)) + 0.018
                    events.append(BackingEvent(time: rt) { RumbleVoice(at: rt, beatLength: spb * 2, gain: 0.15, seed: UInt64(bar * 4 + k) &+ 91) })
                }
            }

            // offbeat hats: enter quiet at bar 2, creep up; micro-late swing;
            // velocity pattern rotates every 8 bars (the 1% rule)
            if bar >= 2 && !isBreakdown(bar) {
                let ramp = min(1.0, 0.4 + 0.15 * Double(max(0, (bar - 2) / 2)))
                let basePattern = [1.0, 0.72, 0.88, 0.72]
                let rotation = (bar / 8) % 4
                for k in 0..<4 {
                    let vel = basePattern[(k + rotation) % 4] * ramp
                    let open = bar >= 6 && bar % 2 == 0 && k == 3
                    let jitter = (Double.random(in: -1...1, using: &micro)) * 0.003
                    let t = at(barStart + Double(k) + 0.5) + 0.012 + jitter
                    events.append(BackingEvent(time: t) {
                        HatVoice.afters(at: t, open: open, velocity: open ? 0.85 : vel, seed: UInt64(bar * 8 + k) &+ 17)
                    })
                }
            }

            // ghost 16ths on the "e"s — two per bar, positions drift by bar
            if bar >= 1 && !isBreakdown(bar) {
                let positions = [0.25, 1.25, 2.25, 3.25]
                let first = Int.random(in: 0..<4, using: &micro)
                let second = (first + 1 + Int.random(in: 0..<2, using: &micro)) % 4
                for p in Set([first, second]) {
                    let t = at(barStart + positions[p])
                    events.append(BackingEvent(time: t) { GhostTickVoice(at: t, seed: UInt64(bar * 16 + p) &+ 41) })
                }
                if bar >= 12 && bar < 16 {
                    let t = at(barStart + 3.75)
                    events.append(BackingEvent(time: t) { GhostTickVoice(at: t, gain: 0.05, seed: UInt64(bar) &+ 43) })
                }
            }

            // rimshot on the and-of-4 (odd bars — even bars give it to the
            // open hat), plus the and-of-2 during the build
            if bar >= 4 && !isBreakdown(bar) && bar % 2 == 1 && bar % 4 != 3 {
                let t = at(barStart + 3.5) + 0.012
                events.append(BackingEvent(time: t) { RimVoice(at: t) })
            }
            if bar >= 12 && bar < 16 && !ghostBars.contains(bar) {
                let t = at(barStart + 1.5) + 0.012
                events.append(BackingEvent(time: t) { RimVoice(at: t, gain: 0.26) })
            }

            // claps on 2 & 4 from bar 8, resting through breakdown and outro
            if bar >= 8 && bar < 28 && !isBreakdown(bar) {
                for k in [1, 3] {
                    let t = at(barStart + Double(k))
                    events.append(BackingEvent(time: t) { ClapPlusVoice(at: t, seed: UInt64(bar * 4 + k) &+ 57) })
                }
                if bar % 4 == 2 {
                    let t = at(barStart + 3.25)
                    events.append(BackingEvent(time: t) { ClapPlusVoice(at: t, gain: 0.05, seed: UInt64(bar) &+ 59) })
                }
            }

            // offbeat sub bounce — carries the pulse, including the breakdown
            if bar >= 6 && bar < 30 {
                for k in 0..<4 {
                    let t = at(barStart + Double(k) + 0.5)
                    let gain = isBreakdown(bar) ? 0.17 : 0.21
                    events.append(BackingEvent(time: t) { SubPulseVoice(at: t, gain: gain, pump: pump) })
                }
            }

            // dub chords on the and-of-1
            let chordSpec: (gain: Double, echoes: Int)? = {
                switch bar {
                case 3, 7, 11, 12, 14, 21, 23, 25: return (0.15, 5)
                case 16, 17, 18, 19: return (0.19, 7)
                case 29: return (0.13, 7)
                default: return nil
                }
            }()
            if let chordSpec {
                let t = at(barStart + 0.5)
                events.append(BackingEvent(time: t) {
                    DubChordVoice(at: t, spb: spb, gain: chordSpec.gain, echoes: chordSpec.echoes, pump: pump)
                })
            }

            // shaker 16ths through the peak (minus the ghost bar)
            if bar >= 20 && bar < 27 {
                let wave = [0.3, 0.5, 1.0, 0.5]
                for s in 0..<16 {
                    let t = at(barStart + Double(s) * 0.25)
                    let gain = 0.05 * wave[s % 4]
                    events.append(BackingEvent(time: t) { ShakerVoice(at: t, gain: gain, seed: UInt64(bar * 16 + s) &+ 71) })
                }
            }

            // the signature zap — once every 8 bars, answered in the ghost bar
            switch bar {
            case 7, 15, 23:
                let t = at(barStart + 3.5)
                events.append(BackingEvent(time: t) { ZapVoice(at: t, gain: 0.14, echoes: 2, spb: spb) })
            case 27:
                let t = at(barStart + 1.5)
                events.append(BackingEvent(time: t) { ZapVoice(at: t, gain: 0.16, echoes: 3, spb: spb) })
            case 31:
                let t = at(barStart + 2)
                events.append(BackingEvent(time: t) { ZapVoice(at: t, gain: 0.15, echoes: 4, spb: spb) })
            default: break
            }

            // riser out of the breakdown, landing exactly on the drop
            if bar == 19 {
                let t = at(barStart + 0.5)
                events.append(BackingEvent(time: t) { RiserVoice(at: t, dur: at(3.5)) })
            }
        }

        return BackingPlan(events: events, kickTimes: kicks, dropTime: at(80))
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
