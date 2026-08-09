import Foundation

/// Track pack format v1 — the JSON a downloadable track ships as. A pack
/// reuses one of the built-in synthesis families (`backingStyle`) and one of
/// the built-in skins (`skinRef`) but carries its own musical skeleton:
/// bpm, bars, sections and pattern bank.
///
/// {
///   "id": "ttd06", "name": "warehouse", "genreLine": "...", "bpm": 127,
///   "bars": 36, "travel": 1.7, "swing": 0.5, "melodic": false,
///   "scaleTones": [], "backingStyle": "afters", "skinRef": "ttd02",
///   "sections": [{"kind": "intro", "start": 0, "end": 4}, ...],
///   "patternBank": {"intro": [[[1,1],[3,1],[5,1],[7,1]]], ...}
/// }
struct TrackPack: Codable {
    struct PackSection: Codable {
        let kind: String
        let start: Int
        let end: Int
    }

    let id: String
    let name: String
    let genreLine: String
    let bpm: Double
    let bars: Int
    let travel: Double
    let swing: Double
    let melodic: Bool
    let scaleTones: [Double]
    let backingStyle: String
    let skinRef: String
    let sections: [PackSection]
    /// Section kind → array of patterns; a pattern is an array of
    /// [offsetEighth, lane] pairs.
    let patternBank: [String: [[[Int]]]]

    static let validStyles: Set<String> = ["origin", "minimal", "detroit", "afters", "gabber"]
    static let validSkinRefs: Set<String> = ["ttd01", "ttd02", "ttd03", "ttd04", "ttd05"]

    enum PackError: Error, CustomStringConvertible {
        case invalid(String)
        var description: String {
            if case .invalid(let why) = self { return "invalid track pack: \(why)" }
            return "invalid track pack"
        }
    }

    /// Validate and convert to a playable TrackDef. Fails loudly on anything
    /// the composers or generator couldn't digest.
    func toTrackDef() throws -> TrackDef {
        guard TrackPack.validStyles.contains(backingStyle) else {
            throw PackError.invalid("unknown backingStyle \(backingStyle)")
        }
        guard TrackPack.validSkinRefs.contains(skinRef) else {
            throw PackError.invalid("unknown skinRef \(skinRef)")
        }
        guard bpm > 40, bpm < 300, bars > 0, bars <= 128, travel > 0.5, travel < 4 else {
            throw PackError.invalid("bpm/bars/travel out of range")
        }
        guard melodic == false || !scaleTones.isEmpty else {
            throw PackError.invalid("melodic pack needs scaleTones")
        }

        var defSections: [Section] = []
        for s in sections {
            guard let kind = SectionKind(rawValue: s.kind) else {
                throw PackError.invalid("unknown section kind \(s.kind)")
            }
            guard s.start >= 0, s.end <= bars, s.start < s.end else {
                throw PackError.invalid("bad section range \(s.kind) \(s.start)-\(s.end)")
            }
            defSections.append(Section(kind: kind, bars: s.start..<s.end))
        }
        guard !defSections.isEmpty else { throw PackError.invalid("no sections") }

        var defBank: [SectionKind: [Pattern]] = [:]
        for (kindRaw, patterns) in patternBank {
            guard let kind = SectionKind(rawValue: kindRaw) else {
                throw PackError.invalid("patternBank kind \(kindRaw)")
            }
            var out: [Pattern] = []
            for pattern in patterns {
                var steps: [(Int, Int)] = []
                for pair in pattern {
                    guard pair.count == 2, (0...7).contains(pair[0]), (0...2).contains(pair[1]) else {
                        throw PackError.invalid("bad step \(pair) in \(kindRaw)")
                    }
                    steps.append((pair[0], pair[1]))
                }
                out.append(Pattern(steps))
            }
            defBank[kind] = out
        }

        return TrackDef(
            id: id,
            index: TrackPack.index(fromId: id),
            name: name,
            genreLine: genreLine,
            bpm: bpm,
            bars: bars,
            travel: travel,
            swing: swing,
            melodic: melodic,
            sections: defSections,
            patternBank: defBank,
            scaleTones: scaleTones,
            backingStyle: backingStyle,
            skinRef: skinRef)
    }

    /// "ttd06" → 6, for the "ttd·06" label. Non-numeric ids get 0.
    static func index(fromId id: String) -> Int {
        Int(id.drop { !$0.isNumber }) ?? 0
    }
}
