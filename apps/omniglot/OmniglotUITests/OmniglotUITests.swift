import XCTest

/// A screenshot tour of the real app against the local backend: sign in,
/// Home, Library, chapter detail, flash cards, and the talk booth. Each
/// milestone holds for a beat so host-side `simctl io screenshot` frames
/// can capture it. Requires the dev server on 127.0.0.1:3000 and the
/// omni-test account (created by the API verification pass).
final class OmniglotUITests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func hold(_ seconds: TimeInterval = 3) {
        Thread.sleep(forTimeInterval: seconds)
    }

    private func signInIfNeeded(_ app: XCUIApplication) {
        let email = app.textFields["Email"]
        if email.waitForExistence(timeout: 5) {
            email.tap()
            email.typeText("omni-test@example.com")
            let password = app.secureTextFields["Password"]
            password.tap()
            password.typeText("omni-test-pass1")
            app.buttons["Sign in"].tap()
        }
        XCTAssertTrue(
            app.staticTexts["Start conversation"].waitForExistence(timeout: 15),
            "Home should appear after sign-in"
        )
    }

    /// Tap an element found by label across common element types — SwiftUI's
    /// exposure differs between plain buttons, list rows, and tab bars.
    @discardableResult
    private func tapAnything(_ app: XCUIApplication, label: String, timeout: TimeInterval = 10) -> Bool {
        let predicate = NSPredicate(format: "label CONTAINS %@", label)
        let queries = [
            app.buttons.matching(predicate).firstMatch,
            app.staticTexts.matching(predicate).firstMatch,
            app.cells.matching(predicate).firstMatch,
            app.otherElements.matching(predicate).firstMatch,
        ]
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            for element in queries where element.exists && element.isHittable {
                element.tap()
                return true
            }
            Thread.sleep(forTimeInterval: 0.5)
        }
        print("OMNI_TREE (no hittable '\(label)')\n\(app.debugDescription)")
        return false
    }

    func testA_tourCoreScreens() throws {
        let app = XCUIApplication()
        app.launch()

        // 1 — Home
        signInIfNeeded(app)
        hold()

        // 2 — Library
        XCTAssertTrue(tapAnything(app, label: "Library"), "Library tab")
        hold(2)

        // 3 — Chapter detail
        XCTAssertTrue(tapAnything(app, label: "Mucho gusto"), "first chapter row")
        // Section eyebrows render uppercased ("DIALOGUE").
        let dialogueHeader = app.staticTexts
            .matching(NSPredicate(format: "label ==[c] 'Dialogue'")).firstMatch
        XCTAssertTrue(dialogueHeader.waitForExistence(timeout: 10), "chapter detail")
        hold()
        app.swipeUp()
        hold(2)

        // 4 — Flash cards: flip one, grade two, close
        if !app.buttons["Review cards"].isHittable { app.swipeUp() }
        XCTAssertTrue(tapAnything(app, label: "Review cards"), "review button")
        XCTAssertTrue(app.staticTexts["Tap to flip"].waitForExistence(timeout: 5))
        hold(2)
        app.staticTexts["Tap to flip"].tap() // flip
        hold(2)
        app.buttons["Got it"].tap()
        hold(1)
        app.staticTexts["Tap to flip"].firstMatch.tap()
        hold(1)
        app.buttons["Again"].tap()
        hold(1)
        XCTAssertTrue(tapAnything(app, label: "Close review"), "close review")
        hold(2)
    }

    func testB_talkBooth() throws {
        let app = XCUIApplication()
        app.launch()
        signInIfNeeded(app)

        // Mic permission alert may appear on first talk.
        addUIInterruptionMonitor(withDescription: "Microphone") { alert in
            for label in ["Allow", "OK"] where alert.buttons[label].exists {
                alert.buttons[label].tap()
                return true
            }
            return false
        }

        let hero = app.descendants(matching: .any)
            .matching(identifier: "startConversation").firstMatch
        XCTAssertTrue(hero.waitForExistence(timeout: 5), "hero button")
        hero.tap()

        let end = app.buttons["End"]
        if !end.waitForExistence(timeout: 8) {
            app.tap() // nudge the interruption monitor
        }
        if !end.waitForExistence(timeout: 15) {
            print("OMNI_TREE_BOOTH\n\(app.debugDescription)")
            XCTFail("The booth should open")
        }
        // Let the tutor connect and speak; host frames catch the lamp.
        hold(18)
        end.tap()
        // Wrap-up → notes (or dismissal if nothing was said).
        hold(10)
    }
}
