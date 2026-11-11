import Foundation

/// Restlicht's console (a band's `electroRack`), 2026-11-10: a port of
/// `misc/restlicht_reference.py`'s `render`, per sample, at the reference's own signal levels
/// (`misc/RESTLICHT.md` is the brief, `DUB-TECHNO.md` §11 the write-up). What `Rack` does for the
/// dub techno records and `AcidRack` for the techno one, this does for the electro one; the
/// pieces they share (lanes, the state-variable filter, the Butterworths, the tape echo, the saw,
/// the gated pad's voices, the convolver) are theirs.
///
/// - **the bass voice** (the record's carrier, the horns channel and your keys on the melody
///   part): Gegenlicht's 303 control (`acid_ctrl`) under three saws at one pitch, a saw and the
///   difference of two more half a cycle apart (a square), through two state-variable lowpasses,
///   tanh and a 38 Hz highpass. It runs from the top of the song and never stops: the gate is
///   only the amp. A note slides when it starts while the gate is still open, accents on a hard
///   key;
/// - **the whistle** (the visitor, the bass channel): the same control with no slide and no
///   accent, its amp through two one-pole lowpasses (a breath), its pitch through one on the log
///   of the frequency (a glide), a vibrato that comes in while it sounds, a sine with a little
///   second and third harmonic, a 2.6 kHz lowpass;
/// - **one tape echo**, three sixteenths, fed by the rim bus, a lane's worth of the snare bus and
///   the whistle, its input side swapping every beat, its feedback on a lane;
/// - **the pad**: seven notes of four saws each, free-running from the reference's phases, each
///   behind a gate smoothed by two one-pole lowpasses (the band's notes open them, and so do your
///   keys on the chords part);
/// - **drum buses** with their sends (the kick's too: it has no filter here), **the noise bed**
///   looped, **the hall and the room** by convolution, **the master** (25 Hz highpass, the fade,
///   tanh, the limiter).
final class ElectroRack: Console {
    // MARK: Settings (the song file's `electroRack`)

    struct Settings: Decodable {
        struct Bass: Decodable {
            /// Hz the pitch sits at before the first note.
            let start: Double
            /// Seconds: the slide's time constant, the attack, the fall to `sustain`, the release.
            let glide: Double
            let attack: Double
            let decay: Double
            let sustain: Double
            let release: Double
            /// An accent: the amp × (1 + accentLevel), the filter envelope 1 + accentEnv.
            let accentLevel: Double
            let accentEnv: Double
            /// The oscillator: `saw` × a saw from phase `phases[0]`, `square` × the difference of
            /// two more from `phases[1]` and `phases[2]`.
            let saw: Double
            let square: Double
            let phases: [Double]
            let min: Double
            let max: Double
            /// The second filter: the first's cutoff × ratio2, at most max2, Q q2.
            let q2: Double
            let ratio2: Double
            let max2: Double
            let highpass: Double
            let gain: Float
            let duck: Float
            let hall: Float
            /// A key this hard or harder is an accent (a band note's velocity is 1 or under it).
            let accentVelocity: Float
        }

        struct Lead: Decodable {
            let start: Double
            let attack: Double
            let decay: Double
            let sustain: Double
            let release: Double
            /// Hz of each of the amp's two one-pole lowpasses.
            let breath: Double
            /// Seconds: the pitch's one-pole time constant, on the log of the frequency.
            let glide: Double
            /// The vibrato: Hz, depth as a share of the frequency, on while the smoothed amp is
            /// over `vibratoGate`, coming and going through a one-pole lowpass at `vibratoSmooth` Hz.
            let vibratoRate: Double
            let vibratoDepth: Double
            let vibratoGate: Double
            let vibratoSmooth: Double
            /// [harmonic, level, phase] triples.
            let harmonics: [[Double]]
            let lowpass: Double
            let gain: Float
            let pan: Double
            let hall: Float
            /// What of it goes into the echo, mono, before its pan.
            let echo: Float
        }

        let lanes: [String: [[Double]]]
        let buses: [AcidRack.Settings.Bus]
        let bass: Bass
        let lead: Lead
        let echo: Rack.Settings.Echo
        /// The buses the echo takes its drums from: `echoBus` whole, `echoLaneBus` × the lane
        /// `snareSend`, each as the mean of its two sides.
        let echoBus: String
        let echoBusSend: Float
        let echoLaneBus: String
        /// The echo's input side: it swaps every `sideBars` bars, smoothed by a centred boxcar
        /// `sideWindow` seconds long.
        let sideBars: Double
        let sideWindow: Double
        let pad: AcidRack.Settings.Pad
        let hall: Rack.Settings.Reverb
        let room: Rack.Settings.Reverb
        let noise: Rack.Settings.Noise
        let master: Rack.Settings.Master
    }

    /// The 303's control, one voice: pitch, gate, amp, filter envelope (`acid_ctrl`).
    private struct Control {
        var cur = 0.0, tgt = 0.0
        var gate = false
        var gateEnd: Int64 = .max
        var lvl = 0.0
        var attacking = false
        var fe = 0.0
        var accent = 0.0
        var level: Float = 1
        var note = -1
        var live = false

        mutating func clear(start: Double) {
            self = Control()
            cur = start
            tgt = start
        }
    }

    // MARK: State

    let settings: Settings
    private let sr: Double
    private let maxChunk: Int
    let busNames: [String]
    private let auxL: UnsafeMutablePointer<Float>
    private let auxR: UnsafeMutablePointer<Float>
    private let busHall: [Float], busRoom: [Float], busDuck: [Float]
    private let echoBus: Int, echoLaneBus: Int

    private var bassTau: Rack.Lane, bassBase: Rack.Lane, bassAmount: Rack.Lane, bassQ: Rack.Lane, bassDrive: Rack.Lane
    private var leadLevel: Rack.Lane, echoFeedback: Rack.Lane, snareSend: Rack.Lane
    private var padCutoff: Rack.Lane, padLevel: Rack.Lane, noiseLevel: Rack.Lane, fade: Rack.Lane

    // The bass voice.
    private let bassPending = UnsafeMutableBufferPointer<AcidRack.Pending>.allocate(capacity: 32)
    private var bassCount = 0
    private var bass = Control()
    private var bassPhase: (Double, Double, Double) = (0, 0, 0)
    private var b1 = AcidRack.SVF(), b2 = AcidRack.SVF()
    private var bassHP: AcidRack.Biquad
    private let glideK: Double, attackStep: Double, decayK: Double, releaseK: Double

    // The whistle.
    private let leadPending = UnsafeMutableBufferPointer<AcidRack.Pending>.allocate(capacity: 32)
    private var leadCount = 0
    private var lead = Control()
    private var leadAmp1 = 0.0, leadAmp2 = 0.0
    private var leadLog = 0.0, leadLogTarget = 0.0
    private var leadVibrato = 0.0
    private var leadPhase = 0.0
    private var leadLP: Rack.Biquad
    private let leadAttack: Double, leadDecay: Double, leadRelease: Double
    private let breathK: Double, leadGlideK: Double, vibratoK: Double
    private let leadL: Float, leadR: Float

    private var echo: Rack.Tape

    // The pad.
    private let pads = UnsafeMutableBufferPointer<AcidRack.PadVoice>.allocate(capacity: 16)
    private let fixedPads: Int
    private var padFL = AcidRack.SVF(), padFR = AcidRack.SVF()
    private let padK: Double
    private var padHL: Rack.Biquad, padHR: Rack.Biquad
    private let padSmooth: Double
    private var age = 0

    private let noise: SampleBuffer
    private var noisePos = 0.0

    private let hallL: Convolver, hallR: Convolver, roomL: Convolver, roomR: Convolver
    private var masterL: Rack.Biquad, masterR: Rack.Biquad
    private var limiter: Float = 1
    private var frame: Int64 = 0

    private let solo: Set<String>?
    private let raw: Bool
    func passes(_ name: String) -> Bool { solo?.contains(name) ?? true }
    private var busOn: [Bool] = []
    private var on = (bass: true, lead: true, echo: true, pad: true, noise: true, hall: true, room: true)

    init(_ s: Settings, sampleRate: Double, maxChunk: Int) {
        settings = s
        sr = sampleRate
        self.maxChunk = maxChunk
        busNames = s.buses.map(\.name)
        let n = max(1, s.buses.count) * maxChunk
        auxL = .allocate(capacity: n)
        auxR = .allocate(capacity: n)
        auxL.initialize(repeating: 0, count: n)
        auxR.initialize(repeating: 0, count: n)
        busHall = s.buses.map { $0.hall ?? 0 }
        busRoom = s.buses.map { $0.room ?? 0 }
        busDuck = s.buses.map { $0.duck ?? 0 }
        guard let e = busNames.firstIndex(of: s.echoBus), let l = busNames.firstIndex(of: s.echoLaneBus) else {
            fatalError("electro rack: the echo's buses are not among its buses")
        }
        echoBus = e
        echoLaneBus = l

        func lane(_ name: String) -> Rack.Lane {
            guard let points = s.lanes[name] else { fatalError("electro rack: no lane \(name)") }
            return Rack.Lane(points, default: 0)
        }
        bassTau = lane("bassTau"); bassBase = lane("bassBase"); bassAmount = lane("bassAmount"); bassQ = lane("bassQ")
        bassDrive = lane("bassDrive"); leadLevel = lane("leadLevel"); echoFeedback = lane("echoFeedback")
        snareSend = lane("snareSend"); padCutoff = lane("padCutoff"); padLevel = lane("padLevel")
        noiseLevel = lane("noise"); fade = lane("fade")

        bassPending.initialize(repeating: AcidRack.Pending())
        leadPending.initialize(repeating: AcidRack.Pending())
        let b = s.bass
        precondition(b.phases.count == 3, "electro rack: three bass saws")
        glideK = exp(-1 / (b.glide * sampleRate))
        attackStep = 1 / (b.attack * sampleRate)
        decayK = exp(-1 / (b.decay * sampleRate))
        releaseK = exp(-1 / (b.release * sampleRate))
        bassHP = AcidRack.Biquad(b.highpass, sr: sampleRate, high: true)

        let w = s.lead
        leadAttack = 1 / (w.attack * sampleRate)
        leadDecay = exp(-1 / (w.decay * sampleRate))
        leadRelease = exp(-1 / (w.release * sampleRate))
        breathK = 1 - exp(-2 * Double.pi * w.breath / sampleRate)
        leadGlideK = 1 - exp(-1 / (w.glide * sampleRate))
        vibratoK = 1 - exp(-2 * Double.pi * w.vibratoSmooth / sampleRate)
        leadLP = .lowpass(w.lowpass, sr: sampleRate)
        let angle = (w.pan + 1) * Double.pi / 4
        leadL = Float(cos(angle))
        leadR = Float(sin(angle))

        echo = Rack.Tape(s.echo, sampleRate: sampleRate)

        precondition(s.pad.phases.count == s.pad.notes.count * 4 && s.pad.left.count == 2 && s.pad.right.count == 2, "electro rack: four pad saws a note")
        precondition(s.pad.notes.count <= 8, "electro rack: eight record notes at most")
        fixedPads = s.pad.notes.count
        pads.initialize(repeating: AcidRack.PadVoice())
        padK = 1 / Double(s.pad.q)
        padHL = .highpass(s.pad.highpass, sr: sampleRate); padHR = .highpass(s.pad.highpass, sr: sampleRate)
        padSmooth = 1 - exp(-2 * Double.pi * s.pad.smooth / sampleRate)

        let kit = SampledInstrument.shared(SampledInstrument.rated(s.noise.kit, sampleRate: sampleRate))
        noise = kit.pick(note: 0, velocity: 1).buffer
        hallL = Convolver(.bundled(s.hall.ir, side: 0, sampleRate: sampleRate, block: s.hall.block))
        hallR = Convolver(.bundled(s.hall.ir, side: 1, sampleRate: sampleRate, block: s.hall.block))
        roomL = Convolver(.bundled(s.room.ir, side: 0, sampleRate: sampleRate, block: s.room.block))
        roomR = Convolver(.bundled(s.room.ir, side: 1, sampleRate: sampleRate, block: s.room.block))
        masterL = .highpass(s.master.highpass, sr: sampleRate); masterR = .highpass(s.master.highpass, sr: sampleRate)
        #if DEBUG
        let d = UserDefaults.standard
        solo = d.string(forKey: "RackSolo").map { Set($0.split(separator: ",").map(String.init)) }
        raw = d.bool(forKey: "RackRaw") || solo != nil
        #else
        solo = nil
        raw = false
        #endif
        busOn = busNames.map { passes($0) }
        on = (passes("bass"), passes("lead"), passes("echo"), passes("pad"), passes("noise"), passes("hall"), passes("room"))
        reset()
    }

    // MARK: From the renderer

    func bus(_ index: Int) -> (UnsafeMutablePointer<Float>, UnsafeMutablePointer<Float>) {
        (auxL + index * maxChunk, auxR + index * maxChunk)
    }

    func begin(_ n: Int) {
        for b in 0..<busNames.count {
            (auxL + b * maxChunk).update(repeating: 0, count: n)
            (auxR + b * maxChunk).update(repeating: 0, count: n)
        }
    }

    func reset() {
        bassCount = 0
        bass.clear(start: settings.bass.start)
        bassPhase = (settings.bass.phases[0], settings.bass.phases[1], settings.bass.phases[2])
        b1.clear(); b2.clear(); bassHP.clear()
        leadCount = 0
        lead.clear(start: settings.lead.start)
        leadAmp1 = 0; leadAmp2 = 0
        leadLogTarget = log(settings.lead.start)
        leadLog = leadLogTarget
        leadVibrato = 0
        leadPhase = 0
        leadLP.clear()
        echo.clear()
        let s = settings.pad
        for i in pads.indices { pads[i] = AcidRack.PadVoice() }
        for (i, note) in s.notes.enumerated() {
            let f = Rack.hz(Double(note))
            let d = (s.left + s.right).map { f * pow(2, $0 / 1200) / sr }
            let p = (s.phases[i * 4], s.phases[i * 4 + 1], s.phases[i * 4 + 2], s.phases[i * 4 + 3])
            pads[i] = AcidRack.PadVoice(note: note, ph: p, dt: (d[0], d[1], d[2], d[3]), start: p, fixed: true)
        }
        padFL.clear(); padFR.clear(); padHL.clear(); padHR.clear()
        noisePos = 0
        hallL.reset(); hallR.reset(); roomL.reset(); roomR.reset()
        masterL.clear(); masterR.clear()
        limiter = 1
    }

    func releaseBand() {
        for i in pads.indices { pads[i].band = AcidRack.Gate() }
        if !bass.live { bass.gateEnd = min(bass.gateEnd, frame) }
        if !lead.live { lead.gateEnd = min(lead.gateEnd, frame) }
        bassCount = 0
        leadCount = 0
    }

    private func queue(_ p: AcidRack.Pending, in list: UnsafeMutableBufferPointer<AcidRack.Pending>, count: inout Int) {
        guard count < list.count else { return }
        var i = count
        while i > 0 && list[i - 1].offset > p.offset {
            list[i] = list[i - 1]
            i -= 1
        }
        list[i] = p
        count += 1
    }

    /// A bass note (the renderer's `rackAcid`).
    func acid(_ note: Int, velocity: Float, gain: Float, held: Int, offset: Int, live: Bool) {
        queue(AcidRack.Pending(offset: offset, note: note, accent: velocity >= settings.bass.accentVelocity, held: held, gain: gain, live: live),
              in: bassPending, count: &bassCount)
    }

    /// A whistle note (the renderer's `rackLead`).
    func pluck(_ note: Int, velocity: Float, gain: Float, held: Int, offset: Int, live: Bool) {
        queue(AcidRack.Pending(offset: offset, note: note, accent: false, held: held, gain: gain, live: live), in: leadPending, count: &leadCount)
    }

    func pad(_ note: Int, velocity: Float, gain: Float, held: Int, offset: Int, live: Bool) {
        // The record's note when it is one of them, else a voice of its own.
        var slot = -1
        for i in 0..<fixedPads where pads[i].note == note { slot = i }
        if slot < 0 {
            for i in fixedPads..<pads.count where pads[i].note == note { slot = i }
        }
        if slot < 0 {
            // A free voice (its gate shut and settled), or the oldest.
            slot = fixedPads
            for i in fixedPads..<pads.count {
                if pads[i].note < 0 || (!pads[i].band.on && !pads[i].key.on && pads[i].key.wait < 0 && pads[i].g2 < 1e-5) { slot = i; break }
                if pads[i].age < pads[slot].age { slot = i }
            }
            let f = Rack.hz(Double(note))
            let d = (settings.pad.left + settings.pad.right).map { f * pow(2, $0 / 1200) / sr }
            var seed = UInt32(truncatingIfNeeded: note &* 2654435761) | 1
            func next() -> Double {
                seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5
                return Double(seed) / 4294967296
            }
            let ph = (next(), next(), next(), next())
            pads[slot] = AcidRack.PadVoice(note: note, ph: ph, dt: (d[0], d[1], d[2], d[3]), start: ph, fixed: false)
        }
        age += 1
        pads[slot].age = age
        pads[slot].gain = gain
        if live { pads[slot].key.set(offset: offset, held: held) } else { pads[slot].band.set(offset: offset, held: held) }
    }

    func release(_ note: Int, offset: Int) {
        if bass.live && bass.note == note { bass.gateEnd = min(bass.gateEnd, frame + Int64(offset)) }
        if lead.live && lead.note == note { lead.gateEnd = min(lead.gateEnd, frame + Int64(offset)) }
        for i in pads.indices where pads[i].note == note && pads[i].key.left == .max {
            pads[i].key.on = false
            pads[i].key.wait = -1
        }
    }

    // MARK: Render

    func process(_ n: Int, tick: Double, ticksPerFrame: Double, ticksPerBar: Int, samplesPerBeat: Double, kick: UnsafePointer<Float>,
                 kick2: UnsafePointer<Float>, drums: Float, keys: Float, trim: Float,
                 outL: UnsafeMutablePointer<Float>, outR: UnsafeMutablePointer<Float>) {
        let s = settings
        let playing = ticksPerFrame > 0
        let barsPerFrame = ticksPerFrame / Double(ticksPerBar)
        let bar0 = tick / Double(ticksPerBar)
        // Restlicht is in four.
        let samplesPerBar = samplesPerBeat * 4
        let invSr = 1 / sr
        let centre = Float(0.5.squareRoot())
        let b = s.bass, w = s.lead
        let tapeGlide = 1 - exp(-1 / (0.05 * sr))
        let echoTarget = s.echo.beats * samplesPerBeat
        let lfoPad = 2 * Double.pi / s.pad.lfoBars
        let vibrato = 2 * Double.pi * w.vibratoRate * samplesPerBar * invSr
        let half = s.sideWindow * sr / 2, sideSpan = s.sideBars * samplesPerBar
        let noiseStep = noise.rate / sr
        let hallG = s.hall.level, roomG = s.room.level, hallDuck = s.hall.duck ?? 0
        let m = s.master
        let out = m.scale * m.level * trim
        let limit = m.limit ?? .infinity
        let limitRelease = Float(1 - exp(-1 / ((m.limitRelease ?? 0.12) * sr)))
        let bandPads = keys > 0.5
        let twoPi = 2 * Double.pi
        var nextBass = 0, nextLead = 0
        for i in 0..<n {
            let bar = bar0 + barsPerFrame * Double(i)
            let live = playing && bar >= 0
            let k = kick[i]
            let now = frame + Int64(i)
            var sumL: Float = 0, sumR: Float = 0
            var hallIn: (Float, Float) = (0, 0), roomIn: (Float, Float) = (0, 0)

            // The bass: the notes due now (a note slides when the gate is still open at its
            // frame; one that starts on the frame the gate ends does not), the control signals,
            // the three saws, the two filters, the saturator.
            while nextBass < bassCount && bassPending[nextBass].offset <= i {
                let p = bassPending[nextBass]
                nextBass += 1
                bass.tgt = Rack.hz(Double(p.note))
                if !(bass.gate && now < bass.gateEnd) {
                    bass.cur = bass.tgt
                    bass.attacking = true
                    bass.fe = 1 + b.accentEnv * (p.accent ? 1 : 0)
                }
                bass.accent = p.accent ? 1 : 0
                bass.level = p.gain
                bass.note = p.note
                bass.live = p.live
                bass.gate = true
                bass.gateEnd = p.live || p.held == .max ? .max : now + Int64(p.held)
            }
            if bass.gate && now >= bass.gateEnd { bass.gate = false }
            bass.cur = bass.tgt + (bass.cur - bass.tgt) * glideK
            if bass.gate {
                if bass.attacking {
                    bass.lvl += attackStep
                    if bass.lvl >= 1 { bass.lvl = 1; bass.attacking = false }
                } else {
                    bass.lvl = b.sustain + (bass.lvl - b.sustain) * decayK
                }
            } else {
                bass.lvl *= releaseK
                bass.attacking = false
            }
            let amp = bass.lvl * (1 + b.accentLevel * bass.accent) * Double(bass.level)
            let env = bass.fe
            bass.fe *= exp(-1 / (Double(bassTau.value(bar)) * sr))
            let dt = bass.cur * invSr
            let s0 = Double(Rack.saw(&bassPhase.0, dt)), s1 = Double(Rack.saw(&bassPhase.1, dt)), s2 = Double(Rack.saw(&bassPhase.2, dt))
            let osc = b.saw * s0 + b.square * (s1 - s2)
            let fc = Swift.min(Swift.max(exp(Double(bassBase.value(bar))) * pow(2, Double(bassAmount.value(bar)) * env), b.min), b.max)
            let y1 = b1.low(osc, g: tan(Double.pi * fc * invSr), k: 1 / Double(bassQ.value(bar)))
            let y2 = b2.low(y1, g: tan(Double.pi * Swift.min(fc * b.ratio2, b.max2) * invSr), k: 1 / b.q2)
            let drive = Double(bassDrive.value(bar))
            let bassOut = Float(bassHP.run(tanh(drive * y2 * amp) / drive)) * b.gain * (1 - b.duck * k) * centre
            if on.bass { sumL += bassOut; sumR += bassOut }
            hallIn.0 += bassOut * b.hall; hallIn.1 += bassOut * b.hall

            // The whistle: every note jumps and re-attacks; the breath, the glide, the vibrato,
            // the tone.
            while nextLead < leadCount && leadPending[nextLead].offset <= i {
                let p = leadPending[nextLead]
                nextLead += 1
                lead.tgt = Rack.hz(Double(p.note))
                lead.cur = lead.tgt
                leadLogTarget = log(lead.tgt)
                lead.attacking = true
                lead.level = p.gain
                lead.note = p.note
                lead.live = p.live
                lead.gate = true
                lead.gateEnd = p.live || p.held == .max ? .max : now + Int64(p.held)
            }
            if lead.gate && now >= lead.gateEnd { lead.gate = false }
            if lead.gate {
                if lead.attacking {
                    lead.lvl += leadAttack
                    if lead.lvl >= 1 { lead.lvl = 1; lead.attacking = false }
                } else {
                    lead.lvl = w.sustain + (lead.lvl - w.sustain) * leadDecay
                }
            } else {
                lead.lvl *= leadRelease
                lead.attacking = false
            }
            leadAmp1 += breathK * (lead.lvl - leadAmp1)
            leadAmp2 += breathK * (leadAmp1 - leadAmp2)
            leadLog += leadGlideK * (leadLogTarget - leadLog)
            leadVibrato += vibratoK * ((leadAmp2 > w.vibratoGate ? 1 : 0) - leadVibrato)
            let wf = exp(leadLog) * (1 + w.vibratoDepth * sin(vibrato * bar) * Swift.min(Swift.max(leadVibrato, 0), 1))
            leadPhase += wf * invSr
            if leadPhase >= 1 { leadPhase -= 1 }
            var tone = 0.0
            for h in w.harmonics { tone += h[1] * sin(twoPi * h[0] * leadPhase + h[2]) }
            let leadMono = leadLP.run(Float(tone * leadAmp2 * Double(lead.level))) * leadLevel.value(bar) * w.gain
            let leadOutL = leadMono * leadL, leadOutR = leadMono * leadR
            if on.lead { sumL += leadOutL; sumR += leadOutR }
            hallIn.0 += leadOutL * w.hall; hallIn.1 += leadOutR * w.hall

            // The echo: the rim, a lane's worth of the snare and the whistle, on one side, then
            // the other, every beat.
            let rimIn = (auxL[echoBus * maxChunk + i] + auxR[echoBus * maxChunk + i]) * 0.5 * drums * (1 - busDuck[echoBus] * k)
            let snareIn = (auxL[echoLaneBus * maxChunk + i] + auxR[echoLaneBus * maxChunk + i]) * 0.5 * drums * (1 - busDuck[echoLaneBus] * k)
            let echoIn = rimIn * s.echoBusSend + snareIn * snareSend.value(bar) + leadMono * w.echo
            let at = bar * samplesPerBar
            let edge = (at / sideSpan).rounded()
            let boundary = (edge * sideSpan).rounded(.up)
            let before: Float = edge > 0 ? Float(Int(edge - 1) & 1) : 0, after: Float = Float(Int(edge) & 1)
            let share = Float(Swift.min(Swift.max(at.rounded() + half - boundary, 0), 2 * half) / (2 * half))
            let side = before + (after - before) * share
            let (eL, eR) = echo.run(echoIn * (1 - side), echoIn * side, feedback: echoFeedback.value(bar), target: echoTarget,
                                    glide: tapeGlide, advance: live)
            let eg = s.echo.level * (1 - s.echo.duck * k)
            let echoL = eL * eg, echoR = eR * eg
            if on.echo { sumL += echoL; sumR += echoR }
            hallIn.0 += echoL * s.echo.hall; hallIn.1 += echoR * s.echo.hall

            // The pad: every gate through its two lowpasses, the saws free-running from the top.
            var padL = 0.0, padR = 0.0
            for v in pads.indices where pads[v].note >= 0 {
                var p = pads[v]
                p.band.tick()
                p.key.tick()
                let open = (p.band.on && bandPads) || p.key.on
                p.g1 += padSmooth * ((open ? 1 : 0) - p.g1)
                p.g2 += padSmooth * (p.g1 - p.g2)
                if p.fixed ? live : (p.g2 > 1e-7 || open) {
                    let g = p.g2 * Double(p.gain)
                    padL += g * Double(Rack.saw(&p.ph.0, p.dt.0) + Rack.saw(&p.ph.1, p.dt.1))
                    padR += g * Double(Rack.saw(&p.ph.2, p.dt.2) + Rack.saw(&p.ph.3, p.dt.3))
                }
                pads[v] = p
            }
            let pfc = Double(padCutoff.value(bar)) * (1 + s.pad.lfoDepth * sin(lfoPad * bar + s.pad.lfoPhase))
            let plvl = padLevel.value(bar)
            let fL = Float(padFL.low(padL, g: tan(Double.pi * pfc * invSr), k: padK))
            let fR = Float(padFR.low(padR, g: tan(Double.pi * Swift.min(pfc * Double(s.pad.rightScale), sr * 0.45) * invSr), k: padK))
            let pd = s.pad.gain * (1 - s.pad.duck * k)
            let padOutL = padHL.run(fL * plvl) * pd, padOutR = padHR.run(fR * plvl) * pd
            if on.pad { sumL += padOutL; sumR += padOutR }
            hallIn.0 += padOutL * s.pad.hall; hallIn.1 += padOutR * s.pad.hall

            // The kit's buses, each with its duck and its sends.
            for bus in 0..<busNames.count {
                let d = drums * (1 - busDuck[bus] * k)
                let l = auxL[bus * maxChunk + i] * d, r = auxR[bus * maxChunk + i] * d
                if busOn[bus] { sumL += l; sumR += r }
                let h = busHall[bus], rm = busRoom[bus]
                if h != 0 { hallIn.0 += l * h; hallIn.1 += r * h }
                if rm != 0 { roomIn.0 += l * rm; roomIn.1 += r * rm }
            }

            // The noise bed, looped, under its lane.
            if live {
                let ip = Int(noisePos)
                let fr = Float(noisePos - Double(ip))
                let ng = s.noise.gain * noiseLevel.value(bar) * (1 - s.noise.duck * k) / 32768
                let nL = (Float(noise.left[ip]) + (Float(noise.left[ip + 1]) - Float(noise.left[ip])) * fr) * ng
                let nR = (Float(noise.right[ip]) + (Float(noise.right[ip + 1]) - Float(noise.right[ip])) * fr) * ng
                noisePos += noiseStep
                if noisePos >= Double(noise.count - 1) { noisePos -= Double(noise.count - 1) }
                if on.noise { sumL += nL; sumR += nR }
            }

            // The hall and the room.
            let hg = hallG * (1 - hallDuck * k)
            let hL = hallL.tick(hallIn.0) * hg, hR = hallR.tick(hallIn.1) * hg
            let rL = roomL.tick(roomIn.0) * roomG, rR = roomR.tick(roomIn.1) * roomG
            if on.hall { sumL += hL; sumR += hR }
            if on.room { sumL += rL; sumR += rR }

            let xL = outL[i] + sumL, xR = outR[i] + sumR
            if raw {
                outL[i] = xL
                outR[i] = xR
            } else {
                let fd = fade.value(bar)
                let yL = tanhf(masterL.run(xL) * fd * m.drive) * m.post
                let yR = tanhf(masterR.run(xR) * fd * m.drive) * m.post
                let peak = Swift.max(abs(yL), abs(yR))
                let want: Float = peak > limit ? limit / peak : 1
                limiter = want < limiter ? want : limiter + (want - limiter) * limitRelease
                outL[i] = yL * limiter * out
                outR[i] = yR * limiter * out
            }
        }
        // The notes still waiting move into the next chunk.
        bassCount = carry(bassPending, from: nextBass, count: bassCount, by: n)
        leadCount = carry(leadPending, from: nextLead, count: leadCount, by: n)
        frame += Int64(n)
    }

    private func carry(_ list: UnsafeMutableBufferPointer<AcidRack.Pending>, from next: Int, count: Int, by n: Int) -> Int {
        var kept = 0
        for j in next..<count {
            var p = list[j]
            p.offset -= n
            list[kept] = p
            kept += 1
        }
        return kept
    }
}
