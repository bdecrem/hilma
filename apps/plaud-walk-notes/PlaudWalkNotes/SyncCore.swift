import Foundation

struct SyncReport: Sendable {
    let added: Int
    let waiting: Int
    let days: Int
}

struct Recording: Sendable {
    let id: String
    let startedAt: Date
    let duration: TimeInterval

    var endedAt: Date { startedAt.addingTimeInterval(duration) }
}

struct SyncState: Codable {
    var processedIDs: Set<String> = []
    var lastStartByDay: [String: TimeInterval] = [:]
    var firstStartByDay: [String: TimeInterval] = [:]

    private enum CodingKeys: String, CodingKey {
        case processedIDs, lastStartByDay, firstStartByDay
    }

    init() { }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        processedIDs = try container.decodeIfPresent(Set<String>.self, forKey: .processedIDs) ?? []
        lastStartByDay = try container.decodeIfPresent([String: TimeInterval].self, forKey: .lastStartByDay) ?? [:]
        firstStartByDay = try container.decodeIfPresent([String: TimeInterval].self, forKey: .firstStartByDay) ?? [:]
    }
}

enum SyncError: LocalizedError {
    case cliMissing
    case commandFailed(String)
    case malformedRecording(String)

    var errorDescription: String? {
        switch self {
        case .cliMissing:
            return "The official PLAUD CLI isn’t installed. Install it with: npm install -g @plaud-ai/cli"
        case .commandFailed(let message):
            return message
        case .malformedRecording(let id):
            return "PLAUD returned incomplete timing information for recording \(id)."
        }
    }
}

enum AppPaths {
    static func notesDirectory(fileManager: FileManager = .default) throws -> URL {
        let documents = try fileManager.url(
            for: .documentDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let directory = documents.appendingPathComponent("PLAUD Walk Notes", isDirectory: true)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    static func stateFile(fileManager: FileManager = .default) throws -> URL {
        let support = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let directory = support.appendingPathComponent("PLAUD Walk Notes", isDirectory: true)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent("sync-state.json")
    }
}

final class SyncService: @unchecked Sendable {
    private let fileManager: FileManager
    private let cli: PlaudCLI
    private let calendar: Calendar

    init(
        fileManager: FileManager = .default,
        cli: PlaudCLI? = nil,
        calendar: Calendar = .current
    ) {
        self.fileManager = fileManager
        self.cli = cli ?? PlaudCLI(fileManager: fileManager)
        self.calendar = calendar
    }

    func sync() throws -> SyncReport {
        try ensureAuthenticated()

        let stateURL = try AppPaths.stateFile(fileManager: fileManager)
        var state = loadState(from: stateURL)
        let ids = try cli.recentRecordingIDs(days: 7)
        var recordings: [Recording] = []

        // One-time migration for files created before daily headers existed.
        // The original processed IDs let us recover the first real NotePin
        // timestamp without inspecting or modifying the transcript text.
        if state.firstStartByDay.isEmpty && !state.processedIDs.isEmpty {
            for id in ids where state.processedIDs.contains(id) {
                guard let recording = try cli.recordingDetails(id: id) else { continue }
                let day = DailyNotes.dayKey(for: recording.startedAt, calendar: calendar)
                let knownFirst = state.firstStartByDay[day] ?? .greatestFiniteMagnitude
                state.firstStartByDay[day] = min(knownFirst, recording.startedAt.timeIntervalSince1970)
            }
        }

        for id in ids where !state.processedIDs.contains(id) {
            if let recording = try cli.recordingDetails(id: id) {
                recordings.append(recording)
            }
        }
        recordings.sort { $0.startedAt < $1.startedAt }

        let notesDirectory = try AppPaths.notesDirectory(fileManager: fileManager)
        for (day, timestamp) in state.firstStartByDay {
            let fileURL = notesDirectory.appendingPathComponent("\(day).md")
            try ensureTimestampFormatting(for: Date(timeIntervalSince1970: timestamp), at: fileURL)
        }
        try saveState(state, to: stateURL)

        var added = 0
        var waiting = 0
        var changedDays: Set<String> = []

        for recording in recordings {
            guard let transcript = try cli.originalTranscript(id: recording.id), !transcript.isEmpty else {
                waiting += 1
                continue
            }

            let day = DailyNotes.dayKey(for: recording.startedAt, calendar: calendar)
            let fileURL = notesDirectory.appendingPathComponent("\(day).md")
            let previousStart = state.lastStartByDay[day].map(Date.init(timeIntervalSince1970:))
            let fileHasContent = fileManager.fileExists(atPath: fileURL.path)
                && ((try? fileManager.attributesOfItem(atPath: fileURL.path)[.size] as? NSNumber)?.intValue ?? 0) > 0
            let prefix = fileHasContent ? DailyNotes.separator(
                previousStart: previousStart,
                nextStart: recording.startedAt,
                fileHasContent: true
            ) : DailyNotes.header(for: recording.startedAt, calendar: calendar)

            try append(prefix + transcript, to: fileURL)
            state.processedIDs.insert(recording.id)
            let knownStart = state.lastStartByDay[day] ?? 0
            state.lastStartByDay[day] = max(knownStart, recording.startedAt.timeIntervalSince1970)
            let knownFirst = state.firstStartByDay[day] ?? .greatestFiniteMagnitude
            state.firstStartByDay[day] = min(knownFirst, recording.startedAt.timeIntervalSince1970)
            try saveState(state, to: stateURL)
            changedDays.insert(day)
            added += 1
        }

        return SyncReport(added: added, waiting: waiting, days: changedDays.count)
    }

    private func ensureAuthenticated() throws {
        if try cli.isAuthenticated() { return }
        let result = try cli.run(["login"])
        guard result.status == 0, try cli.isAuthenticated() else {
            throw SyncError.commandFailed("PLAUD sign-in did not finish. Press Sync and complete the browser sign-in to continue.")
        }
    }

    private func loadState(from url: URL) -> SyncState {
        guard let data = try? Data(contentsOf: url) else { return SyncState() }
        return (try? JSONDecoder().decode(SyncState.self, from: data)) ?? SyncState()
    }

    private func saveState(_ state: SyncState, to url: URL) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(state).write(to: url, options: .atomic)
    }

    private func append(_ text: String, to url: URL) throws {
        let data = Data(text.utf8)
        if !fileManager.fileExists(atPath: url.path) {
            try data.write(to: url, options: .atomic)
            return
        }
        let handle = try FileHandle(forWritingTo: url)
        defer { try? handle.close() }
        try handle.seekToEnd()
        try handle.write(contentsOf: data)
    }

    private func ensureTimestampFormatting(for timestamp: Date, at url: URL) throws {
        guard fileManager.fileExists(atPath: url.path),
              let existing = try? String(contentsOf: url, encoding: .utf8),
              !existing.isEmpty else { return }
        let withHeader = DailyNotes.hasHeader(existing)
            ? existing
            : DailyNotes.header(for: timestamp, calendar: calendar) + existing
        let updated = DailyNotes.formatShortTimestamps(in: withHeader)
        guard updated != existing else { return }
        try Data(updated.utf8).write(to: url, options: .atomic)
    }
}

enum DailyNotes {
    static func header(for date: Date, calendar: Calendar = .current) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "EEE M/d/yy - h:mm a"
        let title = formatter.string(from: date)
        return "\n\(title)\n\(String(repeating: "=", count: title.count))\n\n"
    }

    static func hasHeader(_ text: String) -> Bool {
        let nonemptyLines = text
            .split(separator: "\n", omittingEmptySubsequences: true)
            .prefix(2)
            .map(String.init)
        guard nonemptyLines.count == 2 else { return false }
        return nonemptyLines[0].range(
            of: #"^[A-Z][a-z]{2} \d{1,2}/\d{1,2}/\d{2} - \d{1,2}:\d{2} (AM|PM)$"#,
            options: .regularExpression
        ) != nil && nonemptyLines[1].allSatisfy { $0 == "=" }
    }

    static func formatShortTimestamps(in text: String) -> String {
        let timestampPattern = #"(?m)^(\d{1,2}:\d{2} (?:AM|PM))\n(?!={3,}(?:\n|$))"#
        guard let timestampExpression = try? NSRegularExpression(pattern: timestampPattern) else {
            return text
        }

        var result = text
        let matches = timestampExpression.matches(
            in: result,
            range: NSRange(result.startIndex..., in: result)
        )
        for match in matches.reversed() {
            guard let fullRange = Range(match.range(at: 0), in: result),
                  let timestampRange = Range(match.range(at: 1), in: result) else { continue }
            let timestamp = String(result[timestampRange])
            result.replaceSubrange(
                fullRange,
                with: "\(timestamp)\n\(String(repeating: "=", count: timestamp.count))\n"
            )
        }

        // Three newlines means two visually blank lines above each gap
        // timestamp—one existing separator plus the requested extra line.
        guard let spacingExpression = try? NSRegularExpression(
            pattern: #"\n+(?=\d{1,2}:\d{2} (?:AM|PM)\n={3,}(?:\n|$))"#
        ) else { return result }
        return spacingExpression.stringByReplacingMatches(
            in: result,
            range: NSRange(result.startIndex..., in: result),
            withTemplate: "\n\n\n"
        )
    }

    static func dayKey(for date: Date, calendar: Calendar = .current) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    static func separator(previousStart: Date?, nextStart: Date, fileHasContent: Bool) -> String {
        guard fileHasContent else { return "" }
        guard let previousStart else { return "\n\n" }
        let gap = nextStart.timeIntervalSince(previousStart)
        guard gap > 10 * 60 || gap < 0 else { return "\n\n" }

        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "h:mm a"
        let timestamp = formatter.string(from: nextStart)
        let underline = String(repeating: "=", count: timestamp.count)
        return "\n\n\n\(timestamp)\n\(underline)\n\n"
    }
}

struct CommandResult: Sendable {
    let status: Int32
    let output: String
}

final class PlaudCLI: @unchecked Sendable {
    private let executable: URL
    private let environment: [String: String]
    private let fileManager: FileManager

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
        self.executable = Self.findExecutable(fileManager: fileManager)
            ?? URL(fileURLWithPath: "/usr/local/bin/plaud")
        var env = ProcessInfo.processInfo.environment
        let cliBin = executable.deletingLastPathComponent().path
        let existingPath = env["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin"
        env["PATH"] = "\(cliBin):/opt/homebrew/bin:/usr/local/bin:\(existingPath)"
        env["NO_COLOR"] = "1"
        env["FORCE_COLOR"] = "0"
        self.environment = env
    }

    func isAuthenticated() throws -> Bool {
        let result = try run(["me"])
        return result.status == 0 && result.output.contains("User Info")
    }

    func recentRecordingIDs(days: Int) throws -> [String] {
        let result = try run(["recent", "--days", String(days)])
        try requireSuccess(result)
        let expression = try NSRegularExpression(pattern: #"(?m)^\s{2}([A-Za-z0-9_-]{20,})\s{2}"#)
        let range = NSRange(result.output.startIndex..., in: result.output)
        return expression.matches(in: result.output, range: range).compactMap { match in
            guard let range = Range(match.range(at: 1), in: result.output) else { return nil }
            return String(result.output[range])
        }
    }

    func recordingDetails(id: String) throws -> Recording? {
        let result = try run(["file", id])
        try requireSuccess(result)
        let fields = Self.detailFields(from: result.output)
        guard let serial = fields["serial_number"],
              serial != "-",
              !serial.hasPrefix("welcome_") else {
            return nil
        }
        guard let rawStart = fields["start_at"] ?? fields["created_at"],
              let start = Self.parseDate(rawStart) ?? fields["created_at"].flatMap(Self.parseDate) else {
            throw SyncError.malformedRecording(id)
        }
        let duration = fields["duration"].map(Self.parseDuration) ?? 0
        return Recording(id: id, startedAt: start, duration: duration)
    }

    func originalTranscript(id: String) throws -> String? {
        let temporary = fileManager.temporaryDirectory
            .appendingPathComponent("plaud-transcript-\(UUID().uuidString).txt")
        defer { try? fileManager.removeItem(at: temporary) }

        let result = try run(["transcript", id, "--block", "transaction", "--output", temporary.path])
        try requireSuccess(result)
        guard fileManager.fileExists(atPath: temporary.path) else { return nil }
        let raw = try String(contentsOf: temporary, encoding: .utf8)
        let cleaned = TranscriptCleaner.clean(raw)
        return cleaned.isEmpty ? nil : cleaned
    }

    @discardableResult
    func run(_ arguments: [String]) throws -> CommandResult {
        guard fileManager.isExecutableFile(atPath: executable.path) else {
            throw SyncError.cliMissing
        }

        let process = Process()
        let pipe = Pipe()
        process.executableURL = executable
        process.arguments = arguments
        process.environment = environment
        process.standardOutput = pipe
        process.standardError = pipe
        try process.run()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        return CommandResult(
            status: process.terminationStatus,
            output: Self.stripANSI(String(decoding: data, as: UTF8.self))
        )
    }

    private func requireSuccess(_ result: CommandResult) throws {
        guard result.status == 0 else {
            let useful = result.output
                .split(separator: "\n")
                .map(String.init)
                .filter { !$0.hasPrefix("-") }
                .joined(separator: " ")
            throw SyncError.commandFailed(useful.isEmpty ? "The PLAUD command failed." : useful)
        }
    }

    static func detailFields(from output: String) -> [String: String] {
        let keys = ["created_at", "start_at", "duration", "serial_number"]
        var fields: [String: String] = [:]
        for line in output.split(separator: "\n") {
            let text = line.trimmingCharacters(in: .whitespaces)
            for key in keys where text.hasPrefix("\(key):") {
                fields[key] = String(text.dropFirst(key.count + 1))
                    .trimmingCharacters(in: .whitespaces)
            }
        }
        return fields
    }

    static func parseDate(_ text: String) -> Date? {
        guard text != "-" else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: text) { return date }
        if let date = ISO8601DateFormatter().date(from: text) { return date }

        // PLAUD currently emits UTC timestamps without a trailing `Z`.
        // Parse those explicitly as UTC so the daily filename and separators
        // render correctly in the Mac's local timezone.
        for format in [
            "yyyy-MM-dd'T'HH:mm:ss.SSSSSS",
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
            "yyyy-MM-dd'T'HH:mm:ss"
        ] {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = format
            if let date = formatter.date(from: text) { return date }
        }
        return nil
    }

    static func parseDuration(_ text: String) -> TimeInterval {
        let expression = try? NSRegularExpression(pattern: #"(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?"#)
        guard let match = expression?.firstMatch(
            in: text,
            range: NSRange(text.startIndex..., in: text)
        ) else { return 0 }

        func value(at index: Int) -> Double {
            guard let range = Range(match.range(at: index), in: text) else { return 0 }
            return Double(text[range]) ?? 0
        }
        return value(at: 1) * 3600 + value(at: 2) * 60 + value(at: 3)
    }

    static func stripANSI(_ text: String) -> String {
        guard let expression = try? NSRegularExpression(pattern: #"\u{001B}\[[0-?]*[ -/]*[@-~]"#) else {
            return text
        }
        let range = NSRange(text.startIndex..., in: text)
        return expression.stringByReplacingMatches(in: text, range: range, withTemplate: "")
    }

    static func findExecutable(fileManager: FileManager) -> URL? {
        let home = fileManager.homeDirectoryForCurrentUser
        var candidates = [
            URL(fileURLWithPath: "/opt/homebrew/bin/plaud"),
            URL(fileURLWithPath: "/usr/local/bin/plaud")
        ]

        let versions = home.appendingPathComponent(".nvm/versions/node", isDirectory: true)
        if let children = try? fileManager.contentsOfDirectory(
            at: versions,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) {
            candidates.append(contentsOf: children
                .sorted { $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedDescending }
                .map { $0.appendingPathComponent("bin/plaud") })
        }
        return candidates.first { fileManager.isExecutableFile(atPath: $0.path) }
    }
}

enum TranscriptCleaner {
    static func clean(_ raw: String) -> String {
        let timing = try? NSRegularExpression(pattern: #"^\[[0-9:]+\s*-\s*[0-9:]+\]\s*"#)
        let genericSpeaker = try? NSRegularExpression(
            pattern: #"^(?:Speaker\s*\d+|SPEAKER_\d+|Speaker_[A-Za-z0-9]+):\s*"#,
            options: [.caseInsensitive]
        )

        let pieces = raw.split(separator: "\n", omittingEmptySubsequences: true).map { line -> String in
            var text = String(line).trimmingCharacters(in: .whitespacesAndNewlines)
            if let timing {
                let range = NSRange(text.startIndex..., in: text)
                text = timing.stringByReplacingMatches(in: text, range: range, withTemplate: "")
            }
            if let genericSpeaker {
                let range = NSRange(text.startIndex..., in: text)
                text = genericSpeaker.stringByReplacingMatches(in: text, range: range, withTemplate: "")
            }
            return text
        }

        return pieces
            .joined(separator: " ")
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
