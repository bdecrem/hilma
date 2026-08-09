import Foundation

// ttd·05 "afters" — the second minimal set. Same genre, five more years in
// the booth. The upgrades over ttd·02's patches, per the recipe: a layered
// kick (click transient + pitch-swept body + saturation), a rumble bed that
// breathes BETWEEN kicks, sidechain pump on everything sustained, ghost
// 16ths, velocity-shaped hats, dub chords with darkening echo tails, and one
// resonant filter arc across the whole track.

/// Sidechain-pump model: sustained voices duck at each kick and recover
/// exponentially. `ranges` are the song-time spans where the kick is running
/// (pump off in breakdowns and ghost bars — silence there IS the point).
struct Pump {
    let ranges: [(Double, Double)]
    let spb: Double
    var depth: Double = 0.4
    var tau: Double = 0.11

    func gain(at t: Double) -> Double {
        for r in ranges where t >= r.0 && t < r.1 {
            let sinceBeat = ((t / spb).truncatingRemainder(dividingBy: 1)) * spb
            return 1 - depth * exp(-sinceBeat / tau)
        }
        return 1
    }
}

/// Layered kick: ~2ms noise click + sine body with a fast exponential pitch
/// envelope (165→49 Hz), gently saturated for harmonics. Tight and dry.
struct TightKickVoice: Voice {
    let startSongTime: Double
    let amp: Double

    private var phase = 0.0
    private var env: Double
    private var envFactor = 0.0
    private var noise: NoiseGen
    private var started = false
    private let duration = 0.22

    init(at t: Double, accent: Bool, seed: UInt64 = 5) {
        startSongTime = t
        amp = accent ? 1.0 : 0.93
        env = amp
        noise = NoiseGen(seed: seed)
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            envFactor = expDecayPerSample(start: amp, seconds: 0.19, sr: sr)
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < duration else { continue }
            let f = expSweep(f0: 165, f1: 49, t: t, sweep: 0.07)
            phase += f * dt
            var sample = sin(phase * 2 * .pi) * env
            sample = tanh(sample * 1.5) * 0.74
            if t < 0.0022 {
                sample += noise.next() * (1 - t / 0.0022) * 0.35
            }
            env *= envFactor
            out[i] += Float(sample)
        }
        return t < duration
    }
}

/// The rumble bed: a dark filtered tail that swells BETWEEN kicks and dies
/// before the next one — the classic ducked-reverb-on-the-kick trick,
/// synthesized directly. In the breakdown it runs alone at half gain: the
/// ghost of the kick.
struct RumbleVoice: Voice {
    let startSongTime: Double
    let dur: Double
    let gain: Double

    private var noise: NoiseGen
    private var lp = Biquad()
    private var phase = 0.0
    private var started = false

    init(at t: Double, beatLength: Double, gain: Double, seed: UInt64) {
        startSongTime = t
        dur = min(beatLength * 0.92, 0.42)
        self.gain = gain
        noise = NoiseGen(seed: seed)
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            lp = .lowpass(sr: sr, freq: 100, q: 2.28)
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < dur else { continue }
            // swell to a peak mid-beat, then away — breathing, not booming
            let shape = pow(sin(.pi * min(1, t / dur)), 1.5)
            let wobble = 52.0 + 2.0 * sin(2 * .pi * 1.3 * t)
            phase += wobble * dt
            let body = sin(phase * 2 * .pi) * 0.42
            let sample = lp.process(noise.next() * 0.6 + body) * shape * gain
            out[i] += Float(sample)
        }
        return t < dur
    }
}

/// Dub chord: a short Am9-fragment stab into a dotted-eighth echo chain with
/// a lowpass inside the loop — every echo darker than the last. The stab is
/// almost percussive; the echoes are the instrument.
struct DubChordVoice: Voice {
    let startSongTime: Double
    let freqs: [Double]
    let echoes: Int
    let gain: Double
    let echoInterval: Double
    let pump: Pump?

    private var phases: [Double]
    private var lp = Biquad()
    private var currentEcho = -1
    private var started = false
    private let stabLen = 0.085
    private var duration: Double { Double(echoes) * echoInterval + stabLen + 0.05 }

    init(at t: Double, spb: Double, gain: Double = 0.15, echoes: Int = 5, pump: Pump? = nil) {
        startSongTime = t
        // A2 C3 E3 B3 — minor with the 9 on top, no fifth mud
        freqs = [110.0, 130.81, 164.81, 246.94]
        self.gain = gain
        self.echoes = echoes
        echoInterval = spb * 0.75
        self.pump = pump
        phases = [0.13, 0.41, 0.72, 0.05]
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started { started = true }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < duration else { continue }
            let echoIndex = Int(t / echoInterval)
            let local = t - Double(echoIndex) * echoInterval
            guard echoIndex <= echoes, local < stabLen + 0.03 else { continue }
            if echoIndex != currentEcho {
                currentEcho = echoIndex
                // the lowpass in the feedback loop: darker every pass
                let cutoff = 1600.0 * pow(0.72, Double(echoIndex))
                lp = .lowpass(sr: sr, freq: cutoff, q: -0.92)
            }
            let echoGain = gain * pow(0.62, Double(echoIndex))
            // fast-attack, short-decay stab envelope
            let env: Double
            if local < 0.004 { env = local / 0.004 }
            else { env = exp(-(local - 0.004) / 0.03) }
            var mix = 0.0
            for v in 0..<freqs.count {
                let dp = freqs[v] * dt
                phases[v] += dp
                if phases[v] >= 1 { phases[v] -= 1 }
                mix += blSaw(phases[v], dp)
            }
            var sample = lp.process(mix / 4) * env * echoGain
            if let pump { sample *= pump.gain(at: bufferStart + Double(i) * dt) }
            out[i] += Float(sample)
        }
        return t < duration
    }
}

/// Offbeat sub pulse — the bounce between kicks. A1, soft attack so it pumps
/// instead of clicking.
struct SubPulseVoice: Voice {
    let startSongTime: Double
    let gain: Double
    let pump: Pump?

    private var phase = 0.0
    private var started = false
    private let duration = 0.14

    init(at t: Double, gain: Double, pump: Pump?) {
        startSongTime = t
        self.gain = gain
        self.pump = pump
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started { started = true }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < duration else { continue }
            let env: Double
            if t < 0.006 { env = t / 0.006 }
            else { env = exp(-(t - 0.006) / 0.055) }
            phase += 55.0 * dt
            var sample = sin(phase * 2 * .pi) * env * gain
            if let pump { sample *= pump.gain(at: bufferStart + Double(i) * dt) }
            out[i] += Float(sample)
        }
        return t < duration
    }
}

/// Ghost 16th tick — the soul of the minimal groove. Barely there.
struct GhostTickVoice: Voice {
    let startSongTime: Double
    let gain: Double

    private var noise: NoiseGen
    private var bp = Biquad()
    private var started = false
    private let duration = 0.018

    init(at t: Double, gain: Double = 0.055, seed: UInt64) {
        startSongTime = t
        self.gain = gain
        noise = NoiseGen(seed: seed)
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            bp = .bandpass(sr: sr, freq: 3200, q: 4)
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < duration else { continue }
            out[i] += Float(bp.process(noise.next()) * (1 - t / duration) * gain)
        }
        return t < duration
    }
}

/// Dry rimshot on the and-of-2/4 — wood body via two parallel bandpasses.
struct RimVoice: Voice {
    let startSongTime: Double
    let gain: Double

    private var phase = 0.0
    private var bp1 = Biquad()
    private var bp2 = Biquad()
    private var started = false
    private let duration = 0.05

    init(at t: Double, gain: Double = 0.3) {
        startSongTime = t
        self.gain = gain
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            bp1 = .bandpass(sr: sr, freq: 1750, q: 6)
            bp2 = .bandpass(sr: sr, freq: 950, q: 2.5)
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < duration else { continue }
            let dp = 810 * dt
            phase += dp
            if phase >= 1 { phase -= 1 }
            let square = blSquare(phase, dp)
            let env = exp(-t / 0.014)
            out[i] += Float((bp1.process(square) * 0.7 + bp2.process(square) * 0.3) * env * gain)
        }
        return t < duration
    }
}

/// Layered clap: three bursts through two parallel bandpasses plus a small
/// dark room tail. Sits on 2 & 4 without ever getting big.
struct ClapPlusVoice: Voice {
    let startSongTime: Double
    let gain: Double

    private var noise: NoiseGen
    private var bpA = Biquad()
    private var bpB = Biquad()
    private var room = Biquad()
    private var started = false
    private let duration = 0.30

    init(at t: Double, gain: Double = 0.13, seed: UInt64) {
        startSongTime = t
        self.gain = gain
        noise = NoiseGen(seed: seed)
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            bpA = .bandpass(sr: sr, freq: 1150, q: 1.1)
            bpB = .bandpass(sr: sr, freq: 1900, q: 2.0)
            room = .lowpass(sr: sr, freq: 1600)
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < duration else { continue }
            var burst = 0.0
            for (j, offset) in [0.0, 0.009, 0.019].enumerated() {
                let tb = t - offset
                let len = 0.055
                if tb >= 0, tb < len {
                    burst += pow(1 - tb / len, 1.5) * (j == 2 ? 1.0 : 0.8)
                }
            }
            let n = noise.next()
            var sample = (bpA.process(n * burst) * 0.6 + bpB.process(n * burst) * 0.4)
            // room: quiet dark tail after the bursts
            if t > 0.02 {
                sample += room.process(n * exp(-(t - 0.02) / 0.07)) * 0.22
            }
            out[i] += Float(sample * gain)
        }
        return t < duration
    }
}

/// 16th-note shaker for the peak — filtered noise with a velocity wave.
struct ShakerVoice: Voice {
    let startSongTime: Double
    let gain: Double

    private var noise: NoiseGen
    private var bp = Biquad()
    private var started = false
    private let duration = 0.028

    init(at t: Double, gain: Double, seed: UInt64) {
        startSongTime = t
        self.gain = gain
        noise = NoiseGen(seed: seed)
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            bp = .bandpass(sr: sr, freq: 5000, q: 0.9)
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < duration else { continue }
            out[i] += Float(bp.process(noise.next()) * pow(1 - t / duration, 2) * gain)
        }
        return t < duration
    }
}

/// The signature zap: a fast pitch drop through a resonant bandpass, with
/// optional darkening echoes. Appears once every 8 bars — the call the ticks
/// answer. Also the lane-2 tap voice (no echoes there).
struct ZapVoice: Voice {
    let startSongTime: Double
    let gain: Double
    let echoes: Int
    let echoInterval: Double

    private var phase = 0.0
    private var bp = Biquad()
    private var started = false
    private let hitLen = 0.11
    private var duration: Double { Double(echoes) * echoInterval + hitLen + 0.02 }

    init(at t: Double, gain: Double, echoes: Int = 0, spb: Double = 0.465) {
        startSongTime = t
        self.gain = gain
        self.echoes = echoes
        echoInterval = spb * 0.75
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            bp = .bandpass(sr: sr, freq: 640, q: 7)
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < duration else { continue }
            let echoIndex = echoes > 0 ? Int(t / echoInterval) : 0
            let local = t - Double(echoIndex) * echoInterval
            guard echoIndex <= echoes, local < hitLen else { continue }
            let f = expSweep(f0: 880, f1: 235, t: local, sweep: 0.04)
            phase += f * dt
            let env = exp(-local / 0.032)
            let echoGain = pow(0.55, Double(echoIndex))
            out[i] += Float(bp.process(sin(phase * 2 * .pi)) * env * gain * echoGain)
        }
        return t < duration
    }
}

/// Breakdown riser: filtered noise sweeping up into the drop.
struct RiserVoice: Voice {
    let startSongTime: Double
    let dur: Double

    private var noise: NoiseGen
    private var hp = Biquad()
    private var started = false
    private var sinceRetune = 0

    init(at t: Double, dur: Double, seed: UInt64 = 77) {
        startSongTime = t
        self.dur = dur
        noise = NoiseGen(seed: seed)
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            hp = .highpass(sr: sr, freq: 250, q: -0.92)
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < dur else { continue }
            sinceRetune += 1
            if sinceRetune >= 64 {
                sinceRetune = 0
                let f = expSweep(f0: 250, f1: 6500, t: t, sweep: dur)
                hp.retune(.highpass(sr: sr, freq: f, q: -0.92))
            }
            let env = pow(t / dur, 1.6) * 0.11
            out[i] += Float(hp.process(noise.next()) * env)
        }
        return t < dur
    }
}

/// One drone for the whole track: dual detuned saws through a resonant
/// lowpass whose cutoff follows a breakpoint arc — long rises, hard snaps at
/// the section boundaries. The filter is the narrative.
struct AftersDroneVoice: Voice {
    let startSongTime: Double
    let dur: Double
    /// (song seconds, cutoff Hz) breakpoints, sorted. Steps between pairs are
    /// linear; a repeated time makes a snap.
    let arc: [(Double, Double)]
    let pump: Pump?

    private var phaseA = 0.0
    private var phaseB = 0.0
    private var lp = Biquad()
    private var started = false
    private var sinceRetune = 0

    init(at t: Double, dur: Double, arc: [(Double, Double)], pump: Pump?) {
        startSongTime = t
        self.dur = dur
        self.arc = arc
        self.pump = pump
    }

    private func cutoff(at songTime: Double) -> Double {
        guard let first = arc.first else { return 120 }
        if songTime <= first.0 { return first.1 }
        for k in 1..<arc.count {
            let (t1, c1) = arc[k]
            let (t0, c0) = arc[k - 1]
            if songTime <= t1 {
                let span = t1 - t0
                if span <= 0 { return c1 }
                return c0 + (c1 - c0) * (songTime - t0) / span
            }
        }
        return arc[arc.count - 1].1
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            lp = .lowpass(sr: sr, freq: cutoff(at: bufferStart), q: 6.85)
            started = true
        }
        let fA = 55.0
        let fB = 55.0 * pow(2, 6.0 / 1200.0)
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < dur else { continue }
            sinceRetune += 1
            if sinceRetune >= 48 {
                sinceRetune = 0
                lp.retune(.lowpass(sr: sr, freq: cutoff(at: startSongTime + t), q: 6.85))
            }
            let env: Double
            if t < 2 { env = 0.1 * (t / 2) }
            else if t > dur - 2 { env = 0.1 * ((dur - t) / 2) }
            else { env = 0.1 }
            let dpA = fA * dt, dpB = fB * dt
            phaseA += dpA
            if phaseA >= 1 { phaseA -= 1 }
            phaseB += dpB
            if phaseB >= 1 { phaseB -= 1 }
            let saws = blSaw(phaseA, dpA) + blSaw(phaseB, dpB)
            var sample = lp.process(saws * 0.5) * env
            if let pump { sample *= pump.gain(at: startSongTime + t) }
            out[i] += Float(sample)
        }
        return t < dur
    }
}

/// Lane tap voices for afters — same three roles as ttd·02, better sounds:
/// deep sub thump / wood rim / resonant zap.
struct AftersTapVoice: Voice {
    let startSongTime: Double
    let lane: Int
    let vol: Double

    private var phase = 0.0
    private var bp1 = Biquad()
    private var bp2 = Biquad()
    private var started = false
    private let duration: Double

    init(at t: Double, lane: Int, vol: Double) {
        startSongTime = t
        self.lane = lane
        self.vol = vol
        duration = lane == 0 ? 0.15 : (lane == 1 ? 0.05 : 0.11)
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            switch lane {
            case 1:
                bp1 = .bandpass(sr: sr, freq: 1750, q: 6)
                bp2 = .bandpass(sr: sr, freq: 950, q: 2.5)
            case 2:
                bp1 = .bandpass(sr: sr, freq: 640, q: 7)
            default: break
            }
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < duration else { continue }
            var sample = 0.0
            switch lane {
            case 0:
                let f = expSweep(f0: 170, f1: 62, t: t, sweep: 0.06)
                phase += f * dt
                let env: Double = t < 0.004 ? t / 0.004 : exp(-(t - 0.004) / 0.06)
                sample = sin(phase * 2 * .pi) * env * vol
            case 1:
                let dp = 810 * dt
                phase += dp
                if phase >= 1 { phase -= 1 }
                let square = blSquare(phase, dp)
                let env = exp(-t / 0.014)
                sample = (bp1.process(square) * 0.7 + bp2.process(square) * 0.3) * env * vol
            default:
                let f = expSweep(f0: 880, f1: 235, t: t, sweep: 0.04)
                phase += f * dt
                sample = bp1.process(sin(phase * 2 * .pi)) * exp(-t / 0.032) * vol
            }
            out[i] += Float(sample)
        }
        return t < duration
    }
}
