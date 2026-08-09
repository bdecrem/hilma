import Foundation

/// Seeded procedural charts. A run is fully determined by (TrackDef, seed):
/// walk the sections, pick patterns weighted by the section, mutate with
/// seeded probability, then enforce the hard playability constraints.
enum ChartGenerator {

    static func generate(track: TrackDef, seed: UInt64) -> [ChartNote] {
        // minimal ii ships an authored chart — fixed, swung, velocity-accented.
        if track.backingStyle == "minimal2" { return MinimalII.chart() }
        // the sync tester: one note on every eighth, middle lane, no variation
        if track.backingStyle == "test" {
            return (0..<(track.bars * 8)).map {
                ChartNote(beat: Double($0) * 0.5, lane: 1, pitchIndex: nil)
            }
        }
        var rng = SplitMix64(seed: seed)
        var bars: [[(offset: Int, lane: Int)]] = []

        for bar in 0..<track.bars {
            let section = track.section(atBar: bar)
            let bank = track.patternBank[section.kind] ?? []
            guard !bank.isEmpty else { bars.append([]); continue }

            // First 2 bars always come from the sparsest pattern, unmutated.
            if bar < 2 {
                bars.append(bank[0].steps)
                continue
            }

            var steps = rng.pick(bank).steps

            // Mutation: lane rotation — the motif shifts one lane over.
            if rng.chance(0.18) {
                steps = steps.map { (offset: $0.offset, lane: ($0.lane + 1) % 3) }
            }

            // Mutation: echo — repeat the previous bar's last two notes.
            if rng.chance(0.15), let prev = bars.last, prev.count >= 2 {
                for step in prev.suffix(2) where !steps.contains(where: { $0.offset == step.offset }) {
                    steps.append(step)
                }
            }

            // Mutation: rest injection near breakdowns — thin the approach.
            let nearBreakdown = track.sections.contains {
                $0.kind == .breakdown && (bar >= $0.bars.lowerBound - 2 && bar < $0.bars.lowerBound)
            }
            if nearBreakdown {
                steps = steps.filter { $0.offset < 4 || !rng.chance(0.4) }
            }

            // Musicality: beat 1 of a bar prefers lane 0 (the anchor voice).
            if let first = steps.firstIndex(where: { $0.offset == 0 }),
               steps[first].lane != 0, rng.chance(0.6) {
                steps[first].lane = 0
            }

            steps.sort { $0.offset < $1.offset }
            bars.append(steps)
        }

        return constrain(bars: bars, track: track)
    }

    /// Hard playability constraints from the spec, applied as a post-pass.
    private static func constrain(bars: [[(offset: Int, lane: Int)]], track: TrackDef) -> [ChartNote] {
        // Min gaps are specified at <=130 BPM and scale up with tempo so the
        // wall-clock gap never shrinks below the playable floor.
        let bpmScale = max(1.0, track.bpm / 130.0)
        let minSame = 0.25 * bpmScale
        let minCross = 0.16 * bpmScale

        var placed: [(beat: Double, lane: Int, bar: Int)] = []
        for (bar, steps) in bars.enumerated() {
            for step in steps {
                let beat = Double(bar * 4) + Double(step.offset) * 0.5
                placed.append((beat: beat, lane: step.lane, bar: bar))
            }
        }
        placed.sort { $0.beat < $1.beat }

        // Enforce minimum gaps: the later offender is dropped.
        var kept: [(beat: Double, lane: Int, bar: Int)] = []
        var lastBeatByLane: [Double?] = [nil, nil, nil]
        var lastAny: Double? = nil
        for note in placed {
            if let prev = lastBeatByLane[note.lane], note.beat - prev < minSame { continue }
            if let prev = lastAny, note.beat - prev < minCross, prev != note.beat { continue }
            kept.append(note)
            lastBeatByLane[note.lane] = note.beat
            lastAny = note.beat
        }

        // No 3+ consecutive full-width jumps (0↔2) at speed: soften the third
        // note of any fast alternating triple into the middle lane.
        if kept.count >= 3 {
            for i in 2..<kept.count {
                let a = kept[i - 2], b = kept[i - 1], c = kept[i]
                let fast = (c.beat - a.beat) < 1.0 * bpmScale
                if fast, abs(a.lane - b.lane) == 2, abs(b.lane - c.lane) == 2 {
                    kept[i].lane = 1
                }
            }
        }

        // Melodic sets map pitch up the scale as the set builds.
        return kept.map { note in
            var pitch: Int? = nil
            if track.melodic, !track.scaleTones.isEmpty {
                let lift: Int
                switch track.section(atBar: note.bar).kind {
                case .build: lift = 1
                case .peak: lift = 2
                default: lift = 0
                }
                let base = [0, 2, 4][note.lane] + (note.bar % 4) + lift
                pitch = base % track.scaleTones.count
            }
            return ChartNote(beat: note.beat, lane: note.lane, pitchIndex: pitch)
        }
    }
}
