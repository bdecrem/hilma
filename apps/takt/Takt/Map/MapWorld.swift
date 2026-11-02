import Foundation

/// A map: a road of levels through real places, one venue per level, grouped in episodes.
/// Content, not code: `Content/map-<world>.json` holds the episodes, the venues (story, photo,
/// credit) and the level list that ties each level to a lesson. The photos are imagesets named
/// `<world>-<venue id>` in `Assets.xcassets/Venues/`. A second world (the Berlin techno map) is
/// a new JSON file, its photos, and its id in `all`; Settings picks it by `mapWorld`.
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
    }

    struct Episode: Decodable, Identifiable {
        let id: String
        let title: String
        let kicker: String
        let years: String
        let venues: [Venue]
    }

    struct Teaser: Decodable {
        let kicker: String
        let title: String
    }

    /// A level: its venue, and the lesson the venue's Lesson button starts.
    struct Level: Decodable {
        let venue: String
        /// A module's entry code ("A1", "S": the scales follow the taste setting).
        let module: String
        let lesson: Int
    }

    /// One stop on the road, in level order.
    struct Stop: Identifiable {
        /// 1-based.
        let level: Int
        let venue: Venue
        let episode: Int
        let lesson: Level
        /// The first stop of its episode (the sign goes above it).
        let opensEpisode: Bool
        /// 1-based place in its episode.
        let inEpisode: Int
        var id: Int { level }
    }

    enum StopState: Equatable { case done, here, next, ahead }

    let world: String
    let title: String
    /// Levels planned in all (the header's "7 / 50"); only `levels` exist so far.
    let total: Int
    let episodes: [Episode]
    let nextTeaser: Teaser?
    let levels: [Level]

    private enum CodingKeys: String, CodingKey {
        case world, title, total, episodes, levels
        case nextTeaser = "next_teaser"
    }

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

    /// Bad content traps at load: every level has a venue, every venue a level, the levels walk
    /// the episodes in order.
    func validate() {
        let byId = Dictionary(uniqueKeysWithValues: episodes.flatMap(\.venues).map { ($0.id, $0) })
        precondition(byId.count == episodes.flatMap(\.venues).count, "map \(world): a venue id twice")
        precondition(Set(levels.map(\.venue)) == Set(byId.keys) && levels.count == byId.count,
                     "map \(world): levels and venues don't match one to one")
        precondition(levels.map(\.venue) == episodes.flatMap(\.venues).map(\.id),
                     "map \(world): levels must walk the episodes in order")
        precondition(total >= levels.count, "map \(world): total under the levels")
        precondition(levels.allSatisfy { $0.lesson >= 1 }, "map \(world): lessons are 1-based")
    }

    var stops: [Stop] {
        var out: [Stop] = []
        for (e, episode) in episodes.enumerated() {
            for (i, v) in episode.venues.enumerated() {
                let n = out.count
                out.append(Stop(level: n + 1, venue: v, episode: e, lesson: levels[n], opensEpisode: i == 0, inEpisode: i + 1))
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

/// Where the player is on the map. A level clears when a lesson is finished and a Stage song
/// is played to the end: every such pair clears one. Counted from the practice log, each
/// lesson or song once a day.
struct MapProgress: Equatable {
    /// Lessons finished and songs played through, from the log.
    let lessons: Int
    let songs: Int
    /// Levels cleared: the pairs, or the stored count if that is higher (the log keeps the
    /// last 200 entries, so it can forget; a cleared level never comes back).
    let cleared: Int

    init(practice: [ProgressStore.PracticeEntry], stored: Int) {
        lessons = practice.filter { $0.kind == ProgressStore.PracticeKind.lesson.rawValue }.count
        songs = practice.filter { $0.kind == ProgressStore.PracticeKind.stage.rawValue }.count
        cleared = max(stored, min(lessons, songs))
    }

    /// The level you're on has its lesson done (a lesson is waiting for its song).
    var lessonInHand: Bool { lessons > cleared }
    /// The level you're on has its song done.
    var songInHand: Bool { songs > cleared }
}
