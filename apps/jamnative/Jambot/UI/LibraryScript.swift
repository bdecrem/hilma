import Foundation
import os

/// DEBUG-only driver for the Library: `-libraryScript "<step>;<step>;…"`
/// runs after the track list has loaded, through the same `LibraryModel`
/// methods the taps call (no screen control — see PROGRESS.md). Lines go to
/// `-studioScriptLog <path>` (shared with the studio driver) and os_log.
///
/// Steps:
///   wait:<seconds>
///   list                    log the library (titles, public/remix tags)
///   catalog                 log the public catalog
///   duplicate:<title>       "…" → Duplicate on the first matching track (remembers it as "last")
///   delete:<title>          "…" → Delete (confirmed) on the first matching track
///   deleteLast              delete the track the last duplicate / remix created
///   openCatalog:<title>     open the public player for a catalog row; waits for it to render (≤ 40 s)
///   player:play|stop        the player's transport key
///   playerPos               log the player's state
///   remix                   the player's Remix key (lands in the library, opens Studio)
///   closePlayer / closeStudio / about / closeAbout
///   cache                   log the render cache's track ids
///   shot:<name>             screenshot handshake (see StudioScript.shot)
///   note:<text>
enum LibraryScript {
    static let log = Logger(subsystem: "com.bartdecrem.Jambot", category: "libscript")

    static var steps: [String]? {
        guard let s = StudioScript.argValue("-libraryScript") else { return nil }
        return s.split(separator: ";").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }

    @MainActor
    static func run(_ steps: [String], model: LibraryModel) async {
        var last: TrackMeta? = nil
        func emit(_ s: String) { StudioScript.emit("[library] \(s)") }
        func find(_ title: String) -> TrackMeta? { model.tracks?.first { $0.title.localizedCaseInsensitiveContains(title) } }
        func listing() -> String {
            (model.tracks ?? []).map { "\($0.title)\($0.publishedAt != nil ? " [PUBLIC]" : "")\($0.remixOf != nil ? " [REMIX]" : "")" }.joined(separator: " | ")
        }
        emit("script start: \(steps.count) steps; \(model.tracks?.count ?? 0) tracks")
        for (i, step) in steps.enumerated() {
            let t0 = Date()
            let c = step.firstIndex(of: ":")
            let name = c.map { String(step[..<$0]) } ?? step
            let arg = c.map { String(step[step.index(after: $0)...]) } ?? ""
            switch name {
            case "wait":
                try? await Task.sleep(nanoseconds: UInt64((Double(arg) ?? 1) * 1_000_000_000))
            case "list":
                emit("  list (\(model.tracks?.count ?? 0)): \(listing())")
            case "catalog":
                let cat = (try? await JamAPI.shared.catalog()) ?? []
                emit("  catalog (\(cat.count)): \(cat.map { "\($0.title) by \($0.username)" }.joined(separator: " | "))")
            case "duplicate":
                guard let t = find(arg) else { emit("  duplicate: no track matching '\(arg)'"); break }
                if let copy = await model.duplicate(t) {
                    last = copy
                    emit("  duplicate '\(t.title)' → '\(copy.title)' id=\(copy.id) error=\(model.error)")
                } else {
                    emit("  duplicate FAILED: \(model.error)")
                }
            case "delete":
                guard let t = find(arg) else { emit("  delete: no track matching '\(arg)'"); break }
                let ok = await model.delete(t)
                emit("  delete '\(t.title)' ok=\(ok) error=\(model.error) remaining=\(model.tracks?.count ?? 0)")
            case "deleteLast":
                guard let t = last else { emit("  deleteLast: nothing to delete"); break }
                let ok = await model.delete(t)
                emit("  deleteLast '\(t.title)' ok=\(ok) error=\(model.error) remaining=\(model.tracks?.count ?? 0) stillListed=\(model.tracks?.contains { $0.id == t.id } ?? false)")
                if ok { last = nil }
            case "openCatalog":
                guard let match = try? await JamAPI.shared.catalog().first(where: { $0.title.localizedCaseInsensitiveContains(arg) }) else {
                    emit("  openCatalog: no public track matching '\(arg)'"); break
                }
                model.openPublic(match)
                let deadline = Date().addingTimeInterval(40)
                while let pm = model.playerModel, pm.status == .loading || pm.status == .rendering, Date() < deadline {
                    try? await Task.sleep(nanoseconds: 200_000_000)
                }
                emit("  openCatalog '\(match.title)' by \(match.username): status=\(model.playerModel.map { "\($0.status)" } ?? "-") in \(String(format: "%.1f", Date().timeIntervalSince(t0)))s")
            case "player":
                guard let pm = model.playerModel else { emit("  player: not open"); break }
                if arg == "play", !pm.playing { pm.toggle() } else if arg == "stop", pm.playing { pm.toggle() }
                try? await Task.sleep(nanoseconds: 400_000_000)
                emit("  player \(arg): playing=\(pm.playing) status=\(pm.status)")
            case "playerPos":
                guard let pm = model.playerModel else { emit("  playerPos: not open"); break }
                emit("  playerPos: playing=\(pm.playing) pos=\(String(format: "%.3f", pm.player.position())) status=\(pm.status)")
            case "remix":
                guard let pm = model.playerModel else { emit("  remix: player not open"); break }
                if let track = await pm.remix() {
                    last = track
                    pm.stop()
                    model.remixed(track)
                    try? await Task.sleep(nanoseconds: 1_200_000_000)
                    emit("  remix → '\(track.title)' id=\(track.id) remixOf=\(track.remixOf ?? "-") studioOpen=\(model.openTrack?.id == track.id)")
                } else {
                    emit("  remix FAILED: \(pm.error ?? "?")")
                }
            case "closePlayer":
                model.closePublic()
                try? await Task.sleep(nanoseconds: 700_000_000)
            case "closeStudio":
                model.openTrack = nil
                try? await Task.sleep(nanoseconds: 1_200_000_000)
                await model.load(openLaunchTrack: false)
            case "about":
                model.showAbout = true
                try? await Task.sleep(nanoseconds: 900_000_000)
                emit("  about: build \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") ?? "?") (\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") ?? "?")) engine=\(EngineFactory.host?.engineVersion ?? "-")")
            case "closeAbout":
                model.showAbout = false
                try? await Task.sleep(nanoseconds: 700_000_000)
            case "cache":
                let ids = await RenderCache.shared.cachedTrackIds()
                emit("  cache: \(ids.count) tracks \(ids)")
            case "shot":
                await StudioScript.shot(arg)
            case "note":
                break
            default:
                emit("  unknown step '\(step)'")
            }
            emit("step \(i + 1)/\(steps.count) \(step) done (\(String(format: "%.1f", Date().timeIntervalSince(t0)))s)")
        }
        emit("script done")
    }
}
