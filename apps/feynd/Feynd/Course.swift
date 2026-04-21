import Foundation
import Observation

// MARK: - Course data model (mirrors frontier-ai-2026.json)

struct Course: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let subtitle: String
    let description: String
    let estimatedHours: Int
    let accentHex: String
    let concepts: [Concept]
    let videos: [CourseVideo]
}

struct Concept: Codable, Identifiable, Hashable {
    let id: String
    let group: String
    let label: String
}

struct CourseVideo: Codable, Identifiable, Hashable {
    let id: String
    let order: Int
    let title: String
    let author: String
    let host: String
    let publishedOn: String
    let durationMin: Int
    let youtubeId: String
    let url: String
    let blurb: String
    let concepts: [String]      // Concept.id values
    let transcript: Transcript

    struct Transcript: Codable, Hashable {
        let status: String
        let language: String?
        let text: String
    }
}

// MARK: - Loader

enum CourseStore {
    /// Load a course by id from the app bundle. xcodegen groups flatten
    /// resources to the bundle root — the JSON lives at `<id>.json`.
    static func load(_ id: String) -> Course? {
        guard let url = Bundle.main.url(forResource: id, withExtension: "json") else {
            NSLog("FEYND_COURSE_LOAD missing \(id).json in bundle")
            return nil
        }
        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode(Course.self, from: data)
        } catch {
            NSLog("FEYND_COURSE_LOAD decode error: \(error)")
            return nil
        }
    }

    /// Hard-coded list of available courses (extend as we ship more).
    static let available: [String] = ["frontier-ai-2026"]

    static func loadAll() -> [Course] {
        available.compactMap { load($0) }
    }
}

// MARK: - Progress (per-course, user-default backed)

@MainActor
@Observable
final class CourseProgress {
    private let key: String
    private(set) var watched: Set<String>   // CourseVideo.id values

    init(courseId: String) {
        self.key = "feynd.progress.\(courseId)"
        let stored = UserDefaults.standard.stringArray(forKey: key) ?? []
        self.watched = Set(stored)
    }

    func isWatched(_ videoId: String) -> Bool {
        watched.contains(videoId)
    }

    func toggle(_ videoId: String) {
        if watched.contains(videoId) { watched.remove(videoId) }
        else { watched.insert(videoId) }
        persist()
    }

    func markWatched(_ videoId: String) {
        guard !watched.contains(videoId) else { return }
        watched.insert(videoId)
        persist()
    }

    /// Set of concept ids that are "lit" — a concept lights as soon as any
    /// watched video covers it.
    func litConcepts(in course: Course) -> Set<String> {
        var out: Set<String> = []
        for v in course.videos where watched.contains(v.id) {
            for c in v.concepts { out.insert(c) }
        }
        return out
    }

    var percent: Double {
        // Callers pass total via a computed property elsewhere.
        0
    }

    func percent(of total: Int) -> Double {
        guard total > 0 else { return 0 }
        return Double(watched.count) / Double(total)
    }

    private func persist() {
        UserDefaults.standard.set(Array(watched), forKey: key)
    }
}

// MARK: - Hex color helper

import SwiftUI

extension Color {
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        var n: UInt64 = 0
        Scanner(string: s).scanHexInt64(&n)
        let r = Double((n & 0xFF0000) >> 16) / 255.0
        let g = Double((n & 0x00FF00) >> 8) / 255.0
        let b = Double(n & 0x0000FF) / 255.0
        self = Color(red: r, green: g, blue: b)
    }
}
