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
    /// Engine routing for this set: master gain + compressor per family,
    /// plus delay/duck buses where the set uses them.
    var config = EngineConfig()
}

/// Translates each TrackDef into its arrangement. The origin and minimal plans
/// are direct ports of scheduleAudio() in the reference prototypes.
enum BackingComposer {

    static func plan(for track: TrackDef) -> BackingPlan {
        switch track.backingStyle {
        case "origin": return origin(track)
        case "minimal": return minimal(track)
        case "detroit": return detroit(track)
        case "afters": return afters(track)
        case "minimal2": return minimalII(track)
        default: return gabber(track)
        }
    }

    // ttd·08 — exact port of minimal-ii's scheduleAudio() + automation:
    // swung 128, F minor, duck bus on every kick, dub delay on dotted eighths
    // whose feedback blooms through breakdown 1, drone with an 8-bar breath.
    private static func minimalII(_ track: TrackDef) -> BackingPlan {
        let spb = track.secondsPerBeat
        let fm9: [Double] = [174.61, 207.65, 261.63, 392.0]     // F Ab C G
        let abM9: [Double] = [207.65, 261.63, 311.13, 466.16]   // Ab C Eb Bb
        func at(_ beat: Double) -> Double { MinimalII.swung(beat) * spb }
        func barT(_ bar: Double) -> Double { bar * 4 * spb }

        var events: [BackingEvent] = []
        var kicks: [Double] = []

        for step in 0..<(track.bars * 8) {
            let halfBeat = Double(step) * 0.5
            let bar = step / 8
            let inBar = halfBeat - Double(bar * 4)
            let isOn = inBar.truncatingRemainder(dividingBy: 1) == 0
            let s = MinimalII.sec(bar)
            let t = at(halfBeat)
            let peak = s == "peakA" || s == "peakB"

            // kick everywhere except breakdown 1
            if isOn && s != "break1" {
                let accent = inBar == 0
                events.append(BackingEvent(time: t) { KickIIVoice(at: t, accent: accent, seed: UInt64(step) &+ 3) })
                kicks.append(t)
            }
            // hats: swung offbeats; ghosted onbeats + open accents in peaks
            if s != "intro" && s != "break1" && s != "break2" && s != "strip" && s != "outro" {
                if !isOn {
                    let open = peak && inBar == 3.5 && bar % 2 == 1
                    events.append(BackingEvent(time: t) {
                        HatIIVoice(at: t, vol: 0.14, open: open, seed: UInt64(step) &+ 17)
                    })
                } else if peak && inBar != 0 {
                    events.append(BackingEvent(time: t) {
                        HatIIVoice(at: t, vol: 0.045, open: false, seed: UInt64(step) &+ 19)
                    })
                }
            }
            // soft clap on 2 & 4, from bar 12, not in breaks
            if isOn && (inBar == 1 || inBar == 3) && bar >= 12 && s != "break1" && s != "break2" {
                events.append(BackingEvent(time: t) { ClapSoftVoice(at: t, seed: UInt64(step) &+ 29) })
            }
            // polymeter rim: every 3 eighths from bar 8, absent only in outro
            if bar >= 8 && s != "outro" {
                let e = step
                if e % 3 == 0 {
                    let vol = e % 6 == 0 ? 0.085 : 0.05
                    events.append(BackingEvent(time: t) { RimIIVoice(at: t, vol: vol) })
                }
            }
            // dub chords
            var chord: (freqs: [Double], vel: Double)? = nil
            if s == "layered", bar % 2 == 0, inBar == 0.5 { chord = (fm9, 1) }
            if s == "roll", bar % 2 == 0, inBar == 0.5 { chord = (fm9, 1) }
            if s == "break1", inBar == 0 { chord = (fm9, bar == 19 ? 1.2 : 0.9) }
            if s == "peakA", bar % 2 == 1, inBar == 1.5 { chord = (fm9, 0.9) }
            if s == "peakB", inBar == 0.5, bar % 2 == 0 { chord = (bar % 4 < 2 ? fm9 : abM9, 1) }
            if bar == 46, inBar == 0 { chord = (fm9, 1.3) }   // final ring-out
            if let chord {
                events.append(BackingEvent(time: t) {
                    ChordIIVoice(at: t, freqs: chord.freqs, vel: chord.vel, seed: UInt64(step) &+ 41)
                })
            }
        }

        // drone: level follows the arrangement, filter breathes per 8 bars
        let gainArc: [(Double, Double)] = [
            (barT(0), 0), (barT(1), 0.12), (barT(27.5), 0.12), (barT(28), 0),
            (barT(31.5), 0), (barT(32), 0.12), (barT(46), 0.12), (barT(48), 0),
        ]
        var filterArc: [(Double, Double)] = []
        var b = 0.0
        while b < Double(track.bars) {
            filterArc.append((barT(b), 90))
            filterArc.append((barT(b + 4), 170))
            b += 8
        }
        filterArc.append((barT(Double(track.bars)), 90))
        let droneDur = Double(track.bars) * 4 * spb
        events.append(BackingEvent(time: 0) {
            DroneIIVoice(dur: droneDur, gainArc: gainArc, filterArc: filterArc)
        })

        // engine config: compressor -16/5, dotted-eighth delay whose feedback
        // blooms 0.42→0.62 through breakdown 1, duck on every kick
        let feedback: [(Double, Double)] = [
            (barT(0), 0.42), (barT(16), 0.42), (barT(19), 0.62), (barT(20.5), 0.42),
        ]
        let config = EngineConfig(
            masterGain: 0.85, compThreshold: -16, compRatio: 5,
            delay: (time: spb * 0.75, wet: 0.3, feedback: feedback),
            duck: (times: kicks, floor: 0.32, recover: spb * 0.44))

        return BackingPlan(events: events, kickTimes: kicks, dropTime: barT(20), config: config)
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
        return BackingPlan(events: events, kickTimes: kicks, dropTime: dropStart(track),
                           config: EngineConfig(masterGain: 0.8, compThreshold: -24, compRatio: 12))
    }

    // ttd·02 — kick 4/4 (out during the breakdown), offbeat hats from the
    // groove, claps on 2 & 4 from the build, 16-beat drone cycles throughout.
    // All boundaries derive from track.sections so downloaded skeletons work.
    private static func minimal(_ track: TrackDef) -> BackingPlan {
        let spb = track.secondsPerBeat
        var events: [BackingEvent] = []
        var kicks: [Double] = []

        let breakdownRange = track.sectionRange(.breakdown)
        let hatsFrom = track.sectionRange(.groove).lowerBound          // ttd02: 4
        let clapsFrom = track.sectionRange(.groove).upperBound         // build start; ttd02: 12

        for half in 0..<(track.bars * 8) {
            let halfBeat = Double(half) * 0.5
            let t = halfBeat * spb
            let bar = half / 8
            let inBar = halfBeat - Double(bar * 4)
            let isWhole = inBar.truncatingRemainder(dividingBy: 1) == 0
            let breakdown = breakdownRange.contains(bar)

            if isWhole && !breakdown {
                let accent = inBar == 0
                events.append(BackingEvent(time: t) { KickVoice.minimal(at: t, accent: accent, seed: UInt64(half) &+ 3) })
                kicks.append(t)
            }
            if !isWhole && bar >= hatsFrom && !breakdown {
                let open = inBar == 3.5 && bar >= clapsFrom
                events.append(BackingEvent(time: t) { HatVoice.minimal(at: t, open: open, seed: UInt64(half) &+ 5) })
            }
            if isWhole && (inBar == 1 || inBar == 3) && bar >= clapsFrom && !breakdown {
                events.append(BackingEvent(time: t) { ClapVoice(at: t, seed: UInt64(half) &+ 9) })
            }
            if inBar == 0 && isWhole && bar % 4 == 0 {
                events.append(BackingEvent(time: t) { DroneVoice(at: t, dur: spb * 16) })
            }
        }
        return BackingPlan(events: events, kickTimes: kicks, dropTime: dropStart(track),
                           config: EngineConfig(masterGain: 0.85, compThreshold: -18, compRatio: 6))
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

        let intro = track.sectionRange(.intro)
        let groove = track.sectionRange(.groove)
        let breakdownRange = track.sectionRange(.breakdown)
        let hatsFrom = intro.lowerBound + intro.count / 2              // ttd03: 2
        let clapsFrom = groove.lowerBound + groove.count / 2           // groove midpoint; ttd03: 8
        let stringsFrom = groove.lowerBound                            // ttd03: 4
        let stabsFrom = groove.upperBound                              // build start; ttd03: 12

        for half in 0..<(track.bars * 8) {
            let halfBeat = Double(half) * 0.5
            let bar = half / 8
            let inBar = halfBeat - Double(bar * 4)
            let isWhole = inBar.truncatingRemainder(dividingBy: 1) == 0
            let breakdown = breakdownRange.contains(bar)
            let t = halfBeat * spb + (isWhole ? 0 : swingDelay)

            if isWhole && !breakdown {
                events.append(BackingEvent(time: t) { KickVoice.detroit(at: t) })
                kicks.append(t)
                if inBar == 0 {
                    events.append(BackingEvent(time: t) { BassVoice(at: t, freq: roots[bar % 4], spb: spb) })
                }
            }
            if !isWhole && bar >= hatsFrom && !breakdown {
                let open = inBar == 3.5 && bar % 4 == 3
                events.append(BackingEvent(time: t) { HatVoice.origin(at: t, open: open, seed: UInt64(half) &+ 21) })
            }
            if isWhole && (inBar == 1 || inBar == 3) && bar >= clapsFrom && !breakdown {
                events.append(BackingEvent(time: t) { ClapVoice(at: t, gain: 0.11, seed: UInt64(half) &+ 23) })
            }
            if inBar == 0 && isWhole && bar % 2 == 0 && bar >= stringsFrom {
                // Strings swell right through the breakdown — that's the point.
                events.append(BackingEvent(time: t) {
                    StringsVoice(at: t, freqs: am9, dur: spb * 8, gain: breakdown ? 0.06 : 0.045, seed: UInt64(bar) &+ 31)
                })
            }
            if inBar == 3.5 && !isWhole && bar >= stabsFrom && bar % 2 == 1 && !breakdown {
                events.append(BackingEvent(time: t) { ChordStabVoice(at: t, freqs: stab) })
            }
        }
        return BackingPlan(events: events, kickTimes: kicks, dropTime: dropStart(track),
                           config: EngineConfig(masterGain: 0.8, compThreshold: -24, compRatio: 12))
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

        // Section-derived skeleton (ttd05 values in comments).
        let intro = track.sectionRange(.intro)                     // 0..<4
        let groove = track.sectionRange(.groove)                   // 4..<12
        let build = track.sectionRange(.build)                     // 12..<16
        let breakdownRange = track.sectionRange(.breakdown)        // 16..<20
        let peak = track.sectionRange(.peak)                       // 20..<28
        let outro = track.sectionRange(.outro)                     // 28..<32
        let totalBeats = Double(track.bars * 4)                    // 128

        // Ghost bars (kick out for one bar — the Hawtin trick): second bar of
        // the build and last bar of the peak. ttd05: 13 and 27.
        let ghostBars: Set<Int> = [build.lowerBound + 1, peak.upperBound - 1]
        func isBreakdown(_ bar: Int) -> Bool { breakdownRange.contains(bar) }
        func hasKick(_ bar: Int) -> Bool { !isBreakdown(bar) && !ghostBars.contains(bar) }

        let hatsFrom = intro.lowerBound + intro.count / 2          // 2
        let openHatsFrom = groove.lowerBound + 2                   // 6
        let ghostTicksFrom = intro.lowerBound + 1                  // 1
        let rimsFrom = groove.lowerBound                           // 4
        let clapsFrom = groove.lowerBound + groove.count / 2       // groove midpoint; 8
        let clapsTo = outro.lowerBound                             // 28
        let subFrom = groove.lowerBound + 2                        // 6
        let subTo = outro.lowerBound + 2                           // 30

        // Sidechain pump runs wherever the kick runs: one range per
        // contiguous run of kick bars. ttd05: 0–52, 56–64, 80–108, 112–128.
        var pumpRanges: [(Double, Double)] = []
        var runStart: Int? = nil
        for bar in 0...track.bars {
            if bar < track.bars, hasKick(bar) {
                if runStart == nil { runStart = bar }
            } else if let s = runStart {
                pumpRanges.append((at(Double(s * 4)), at(Double(bar * 4))))
                runStart = nil
            }
        }
        let pump = Pump(ranges: pumpRanges, spb: spb)

        // The drone spans the whole track; its filter arc is the narrative:
        // slow rises, a swell through the breakdown, a hard snap at the drop.
        // Anchors are section boundaries (in beats). ttd05: 0/32/48/63.9/64/
        // 79.9/80/104/112/126.
        let grooveMidBeat = Double((groove.lowerBound + groove.count / 2) * 4)
        let buildBeat = Double(build.lowerBound * 4)
        let breakdownBeat = Double(breakdownRange.lowerBound * 4)
        let dropBeat = Double(peak.lowerBound * 4)
        let peakLateBeat = Double((peak.upperBound - 2) * 4)
        let outroBeat = Double(outro.lowerBound * 4)
        let arc: [(Double, Double)] = [
            (at(0), 95), (at(grooveMidBeat), 115), (at(buildBeat), 175), (at(breakdownBeat - 0.1), 250),
            (at(breakdownBeat), 330), (at(dropBeat - 0.1), 430),
            (at(dropBeat), 165), (at(peakLateBeat), 200), (at(outroBeat), 150), (at(totalBeats - 2), 95),
        ]
        events.append(BackingEvent(time: 0) {
            AftersDroneVoice(at: 0, dur: at(totalBeats), arc: arc, pump: pump)
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

            // offbeat hats: enter quiet mid-intro, creep up; micro-late swing;
            // velocity pattern rotates every 8 bars (the 1% rule)
            if bar >= hatsFrom && !isBreakdown(bar) {
                let ramp = min(1.0, 0.4 + 0.15 * Double(max(0, (bar - hatsFrom) / 2)))
                let basePattern = [1.0, 0.72, 0.88, 0.72]
                let rotation = (bar / 8) % 4
                for k in 0..<4 {
                    let vel = basePattern[(k + rotation) % 4] * ramp
                    let open = bar >= openHatsFrom && bar % 2 == 0 && k == 3
                    let jitter = (Double.random(in: -1...1, using: &micro)) * 0.003
                    let t = at(barStart + Double(k) + 0.5) + 0.012 + jitter
                    events.append(BackingEvent(time: t) {
                        HatVoice.afters(at: t, open: open, velocity: open ? 0.85 : vel, seed: UInt64(bar * 8 + k) &+ 17)
                    })
                }
            }

            // ghost 16ths on the "e"s — two per bar, positions drift by bar
            if bar >= ghostTicksFrom && !isBreakdown(bar) {
                let positions = [0.25, 1.25, 2.25, 3.25]
                let first = Int.random(in: 0..<4, using: &micro)
                let second = (first + 1 + Int.random(in: 0..<2, using: &micro)) % 4
                for p in Set([first, second]) {
                    let t = at(barStart + positions[p])
                    events.append(BackingEvent(time: t) { GhostTickVoice(at: t, seed: UInt64(bar * 16 + p) &+ 41) })
                }
                if build.contains(bar) {
                    let t = at(barStart + 3.75)
                    events.append(BackingEvent(time: t) { GhostTickVoice(at: t, gain: 0.05, seed: UInt64(bar) &+ 43) })
                }
            }

            // rimshot on the and-of-4 (odd bars — even bars give it to the
            // open hat), plus the and-of-2 during the build
            if bar >= rimsFrom && !isBreakdown(bar) && bar % 2 == 1 && bar % 4 != 3 {
                let t = at(barStart + 3.5) + 0.012
                events.append(BackingEvent(time: t) { RimVoice(at: t) })
            }
            if build.contains(bar) && !ghostBars.contains(bar) {
                let t = at(barStart + 1.5) + 0.012
                events.append(BackingEvent(time: t) { RimVoice(at: t, gain: 0.26) })
            }

            // claps on 2 & 4 from the groove midpoint, resting through
            // breakdown and outro
            if bar >= clapsFrom && bar < clapsTo && !isBreakdown(bar) {
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
            if bar >= subFrom && bar < subTo {
                for k in 0..<4 {
                    let t = at(barStart + Double(k) + 0.5)
                    let gain = isBreakdown(bar) ? 0.17 : 0.21
                    events.append(BackingEvent(time: t) { SubPulseVoice(at: t, gain: gain, pump: pump) })
                }
            }

            // dub chords on the and-of-1. Standard hits: last intro bar, every
            // 4th groove bar (offset 3), every other build bar, odd peak bars
            // minus the ghost bar. Louder through the breakdown; one dark echo
            // in the second outro bar. Reproduces ttd05's 3/7/11/12/14/21/23/
            // 25 + 16–19 + 29 exactly.
            let chordSpec: (gain: Double, echoes: Int)? = {
                if isBreakdown(bar) { return (0.19, 7) }
                if bar == outro.lowerBound + 1 { return (0.13, 7) }
                if bar == intro.upperBound - 1 { return (0.15, 5) }
                if groove.contains(bar), (bar - groove.lowerBound) % 4 == 3 { return (0.15, 5) }
                if build.contains(bar), (bar - build.lowerBound) % 2 == 0 { return (0.15, 5) }
                if peak.contains(bar), (bar - peak.lowerBound) % 2 == 1, !ghostBars.contains(bar) { return (0.15, 5) }
                return nil
            }()
            if let chordSpec {
                let t = at(barStart + 0.5)
                events.append(BackingEvent(time: t) {
                    DubChordVoice(at: t, spb: spb, gain: chordSpec.gain, echoes: chordSpec.echoes, pump: pump)
                })
            }

            // shaker 16ths through the peak (minus the ghost bar)
            if peak.contains(bar) && !ghostBars.contains(bar) {
                let wave = [0.3, 0.5, 1.0, 0.5]
                for s in 0..<16 {
                    let t = at(barStart + Double(s) * 0.25)
                    let gain = 0.05 * wave[s % 4]
                    events.append(BackingEvent(time: t) { ShakerVoice(at: t, gain: gain, seed: UInt64(bar * 16 + s) &+ 71) })
                }
            }

            // the signature zap — every 8th bar at beat 3.5, answered in the
            // peak's ghost bar, one long tail in the final bar
            if bar == peak.upperBound - 1 {
                let t = at(barStart + 1.5)
                events.append(BackingEvent(time: t) { ZapVoice(at: t, gain: 0.16, echoes: 3, spb: spb) })
            } else if bar == track.bars - 1 {
                let t = at(barStart + 2)
                events.append(BackingEvent(time: t) { ZapVoice(at: t, gain: 0.15, echoes: 4, spb: spb) })
            } else if bar % 8 == 7 {
                let t = at(barStart + 3.5)
                events.append(BackingEvent(time: t) { ZapVoice(at: t, gain: 0.14, echoes: 2, spb: spb) })
            }

            // riser out of the last breakdown bar, landing exactly on the drop
            if bar == breakdownRange.upperBound - 1 {
                let t = at(barStart + 0.5)
                events.append(BackingEvent(time: t) { RiserVoice(at: t, dur: at(3.5)) })
            }
        }

        return BackingPlan(events: events, kickTimes: kicks, dropTime: at(dropBeat),
                           config: EngineConfig(masterGain: 0.85, compThreshold: -18, compRatio: 6))
    }

    // ttd·04 — distorted kick every beat, offbeat hats, claps at the peak.
    private static func gabber(_ track: TrackDef) -> BackingPlan {
        let spb = track.secondsPerBeat
        var events: [BackingEvent] = []
        var kicks: [Double] = []

        let intro = track.sectionRange(.intro)
        let breakdownRange = track.sectionRange(.breakdown)        // ttd04: 16..<18
        let peakRange = track.sectionRange(.peak)                  // ttd04: 18..<28
        let hatsFrom = intro.lowerBound + intro.count / 2          // 2

        for half in 0..<(track.bars * 8) {
            let halfBeat = Double(half) * 0.5
            let t = halfBeat * spb
            let bar = half / 8
            let inBar = halfBeat - Double(bar * 4)
            let isWhole = inBar.truncatingRemainder(dividingBy: 1) == 0
            let breakdown = breakdownRange.contains(bar)
            let peak = peakRange.contains(bar)

            if isWhole && !breakdown {
                let accent = inBar == 0
                events.append(BackingEvent(time: t) { KickVoice.gabber(at: t, accent: accent) })
                kicks.append(t)
            }
            if !isWhole && bar >= hatsFrom {
                events.append(BackingEvent(time: t) { HatVoice.minimal(at: t, open: false, seed: UInt64(half) &+ 41) })
            }
            if isWhole && (inBar == 1 || inBar == 3) && peak {
                events.append(BackingEvent(time: t) { ClapVoice(at: t, gain: 0.12, seed: UInt64(half) &+ 43) })
            }
            if breakdown && isWhole && (inBar == 0 || inBar == 2) {
                events.append(BackingEvent(time: t) { StabVoice(at: t, lane: 0, vol: 0.3) })
            }
        }
        return BackingPlan(events: events, kickTimes: kicks, dropTime: dropStart(track),
                           config: EngineConfig(masterGain: 0.8, compThreshold: -18, compRatio: 6))
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
