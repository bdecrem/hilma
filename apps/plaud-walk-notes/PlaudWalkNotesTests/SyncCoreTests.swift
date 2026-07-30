import XCTest
@testable import PlaudWalkNotes

final class SyncCoreTests: XCTestCase {
    func testDailyHeaderUsesRequestedMarkdownFormat() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "America/Los_Angeles"))
        let date = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-07-30T16:52:00Z"))

        let header = DailyNotes.header(for: date, calendar: calendar)
        XCTAssertEqual(header, "\nThu 7/30/26 - 9:52 AM\n=====================\n\n")
        XCTAssertTrue(DailyNotes.hasHeader(header + "Spoken note."))
    }

    func testOldSyncStateDecodesWithEmptyHeaderMigrationData() throws {
        let data = Data(#"{"processedIDs":["abc"],"lastStartByDay":{"2026-07-30":1}}"#.utf8)
        let state = try JSONDecoder().decode(SyncState.self, from: data)
        XCTAssertEqual(state.processedIDs, ["abc"])
        XCTAssertTrue(state.firstStartByDay.isEmpty)
    }

    func testCleanerRemovesPlaudSegmentTimesButKeepsSpokenBookPrefix() {
        let raw = """
        [00:00 - 00:03] Book: The Beginning of Infinity.
        [00:03 - 00:07] Speaker 1: This is the first thought.
        """

        XCTAssertEqual(
            TranscriptCleaner.clean(raw),
            "Book: The Beginning of Infinity. This is the first thought."
        )
    }

    func testNotesTenMinutesApartUseOnlyParagraphBreak() {
        let start = Date(timeIntervalSince1970: 10_000)
        let separator = DailyNotes.separator(
            previousStart: start.addingTimeInterval(-600),
            nextStart: start,
            fileHasContent: true
        )
        XCTAssertEqual(separator, "\n\n")
    }

    func testNotesMoreThanTenMinutesApartIncludePlainTimestamp() {
        let start = Date(timeIntervalSince1970: 10_000)
        let separator = DailyNotes.separator(
            previousStart: start.addingTimeInterval(-601),
            nextStart: start,
            fileHasContent: true
        )
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "h:mm a"
        let timestamp = formatter.string(from: start)
        XCTAssertEqual(
            separator,
            "\n\n\n\(timestamp)\n\(String(repeating: "=", count: timestamp.count))\n\n"
        )
    }

    func testExistingShortTimestampsGainHeadingAndExtraBlankLine() {
        let existing = "First note.\n\n7:45 AM\n\nSecond note."
        XCTAssertEqual(
            DailyNotes.formatShortTimestamps(in: existing),
            "First note.\n\n\n7:45 AM\n=======\n\nSecond note."
        )
    }

    func testFormattedShortTimestampIsIdempotent() {
        let formatted = "First note.\n\n\n7:45 AM\n=======\n\nSecond note."
        XCTAssertEqual(DailyNotes.formatShortTimestamps(in: formatted), formatted)
    }

    func testDurationParsing() {
        XCTAssertEqual(PlaudCLI.parseDuration("1h02m"), 3_720)
        XCTAssertEqual(PlaudCLI.parseDuration("4m05s"), 245)
        XCTAssertEqual(PlaudCLI.parseDuration("17s"), 17)
    }

    func testDetailParsing() {
        let output = """
          created_at:   2026-07-30T15:00:00.000Z
          start_at:     2026-07-30T14:58:00.000Z
          duration:     2m05s
          serial_number: 8800050199828858
        """
        let fields = PlaudCLI.detailFields(from: output)
        XCTAssertEqual(fields["start_at"], "2026-07-30T14:58:00.000Z")
        XCTAssertEqual(fields["duration"], "2m05s")
        XCTAssertEqual(fields["serial_number"], "8800050199828858")
    }

    func testPlaudUTCDateWithoutZoneIsParsedAsUTC() {
        let parsed = PlaudCLI.parseDate("2026-07-30T17:12:44")
        XCTAssertNotNil(parsed)

        let formatter = ISO8601DateFormatter()
        XCTAssertEqual(formatter.string(from: parsed!), "2026-07-30T17:12:44Z")
    }

    func testPlaudMicrosecondUTCDateWithoutZoneIsParsedAsUTC() {
        let parsed = PlaudCLI.parseDate("2026-07-30T06:36:56.350000")
        XCTAssertNotNil(parsed)
    }
}
