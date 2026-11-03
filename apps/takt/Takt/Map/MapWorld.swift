import Foundation

/// A map: a road of levels through real places, one venue per level, grouped in episodes.
/// Content, not code: `Content/map-<world>.json` holds the episodes and the venues (story,
/// photo, credit). The photos are imagesets named `<world>-<venue id>` in
/// `Assets.xcassets/Venues/`. What a level asks for, and when it clears, is the player's
/// `LearningPlan`: level n of the map is level n of the plan. A second world (the Berlin techno
/// map) is a new JSON file, its photos, and its id in `all`; Settings picks it by `mapWorld`.
struct MapWorld: Decodable {
    struct Photo: Decodable {
        let file: String
        let credit: String
        let license: String
        /// The page it came from; nil until recorded (Credits then says so).
        let source: String?
        /// What the photo shows when it isn't the venue itself (a marker, today's building).
        let note: String?
    }

    struct Venue: Decodable, Identifiable {
        let id: String
        let name: String
        let town: String
        let era: String
        let status: String
        let tag: String
        let story: String
        let photo: Photo?
        let sources: [String]
        /// A stop with no venue written yet: an empty box on the road.
        let placeholder: Bool?
        var isPlaceholder: Bool { placeholder ?? false }
    }

    struct Episode: Decodable, Identifiable {
        let id: String
        let title: String
        let kicker: String
        let years: String
        let venues: [Venue]
    }

    /// One stop on the road, in level order.
    struct Stop: Identifiable {
        /// 1-based.
        let level: Int
        let venue: Venue
        let episode: Int
        /// The first stop of its episode (the sign goes above it).
        let opensEpisode: Bool
        /// 1-based place in its episode.
        let inEpisode: Int
        var id: Int { level }
    }

    enum StopState: Equatable { case done, here, next, ahead }

    let world: String
    let title: String
    /// Levels in all (the header's "1 / 24").
    let total: Int
    let episodes: [Episode]

    /// The worlds that ship, in Settings order. The first is the default.
    static let all = ["blues"]
    static let defaultWorld = all[0]

    /// Settings → Taste → Map (`mapWorld`), falling back to the default for an unknown id.
    static var selected: String {
        let id = UserDefaults.standard.string(forKey: "mapWorld") ?? defaultWorld
        return all.contains(id) ? id : defaultWorld
    }

    static func bundled(_ world: String) -> MapWorld {
        guard let url = Bundle.main.url(forResource: "map-\(world)", withExtension: "json") else {
            fatalError("map-\(world).json is not in the bundle")
        }
        do {
            let m = try JSONDecoder().decode(MapWorld.self, from: Data(contentsOf: url))
            m.validate()
            return m
        } catch {
            fatalError("map-\(world).json: \(error)")
        }
    }

    /// Bad content traps at load: venue ids unique, a venue that isn't a placeholder has a name.
    func validate() {
        let venues = episodes.flatMap(\.venues)
        precondition(Set(venues.map(\.id)).count == venues.count, "map \(world): a venue id twice")
        precondition(venues.allSatisfy { $0.isPlaceholder || !$0.name.isEmpty }, "map \(world): a venue without a name")
        precondition(total >= venues.count, "map \(world): total under the venues")
    }

    var stops: [Stop] {
        var out: [Stop] = []
        for (e, episode) in episodes.enumerated() {
            for (i, v) in episode.venues.enumerated() {
                out.append(Stop(level: out.count + 1, venue: v, episode: e, opensEpisode: i == 0, inEpisode: i + 1))
            }
        }
        return out
    }

    /// The imageset of a venue's photo, nil without one.
    func imageName(_ v: Venue) -> String? { v.photo == nil ? nil : "\(world)-\(v.id)" }

    /// A level's state, from the levels cleared so far (0-based index).
    static func state(_ index: Int, cleared: Int) -> StopState {
        index < cleared ? .done : index == cleared ? .here : index == cleared + 1 ? .next : .ahead
    }
}
