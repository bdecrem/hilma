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

    /// Launch with the -omni-uitest flag: the app starts signed out (cookie
    /// cleared) and skips infinite animations that break synthesized taps.
    private func makeApp() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += ["-omni-uitest"]
        app.launch()
        return app
    }

    private func signInIfNeeded(_ app: XCUIApplication) {
        let email = app.textFields["Email"]
        XCTAssertTrue(email.waitForExistence(timeout: 10), "login screen")
        email.tap()
        email.typeText("omni-test@example.com")
        let password = app.secureTextFields["Password"]
        password.tap()
        password.typeText("omni-test-pass1\n")
        _ = tapAnything(app, label: "Sign in")
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
        let names = ["buttons", "staticTexts", "cells", "otherElements"]
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            for (i, element) in queries.enumerated() where element.exists && element.isHittable {
                print("OMNI_TAP '\(label)' via \(names[i]) frame=\(element.frame)")
                element.tap()
                return true
            }
            Thread.sleep(forTimeInterval: 0.5)
        }
        // iOS 26's floating tab bar (and other decorated containers) can
        // report hittable=false for perfectly tappable elements — fall back
        // to a raw coordinate tap on anything that at least exists.
        for (i, element) in queries.enumerated() where element.exists {
            print("OMNI_TAP '\(label)' FALLBACK via \(names[i]) frame=\(element.frame)")
            element.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            return true
        }
        print("OMNI_TREE (no hittable '\(label)')\n\(app.debugDescription)")
        return false
    }

    /// Bisect probe: identical to testZ plus a 3s wait before the tap —
    /// isolates whether time-on-Home is what breaks the tab bar.
    func testY_tabSwitchAfterWait() throws {
        let app = makeApp()
        signInIfNeeded(app)
        hold(3)
        XCTAssertTrue(tapAnything(app, label: "Library"), "Library tab")
        if !app.navigationBars["Library"].waitForExistence(timeout: 10) {
            print("OMNI_TREE_TABSWITCH_WAIT\n\(app.debugDescription)")
            XCTFail("Library screen after wait")
        }
    }

    /// Minimal bisect probe: sign in, switch to Library. Nothing else.
    func testZ_tabSwitch() throws {
        let app = makeApp()
        signInIfNeeded(app)
        XCTAssertTrue(tapAnything(app, label: "Library"), "Library tab")
        if !app.navigationBars["Library"].waitForExistence(timeout: 10) {
            print("OMNI_TREE_TABSWITCH\n\(app.debugDescription)")
            XCTFail("Library screen")
        }
    }

    func testA_tourCoreScreens() throws {
        let app = makeApp()

        // 1 — Home
        signInIfNeeded(app)
        hold()

        // 2 — Library. Assert on the nav title — Home also contains chapter
        // text, so a missed tab tap must not pass silently.
        XCTAssertTrue(tapAnything(app, label: "Library"), "Library tab")
        if !app.navigationBars["Library"].waitForExistence(timeout: 10) {
            print("OMNI_KEYBOARDS \(app.keyboards.count) windows-tree:\n\(app.debugDescription)")
            XCTFail("Library screen")
        }
        hold(2)

        // 3 — Chapter detail. Case-sensitive: the detail eyebrow is
        // "DIALOGUE"; Home's thread caption is "Dialogue".
        XCTAssertTrue(tapAnything(app, label: "Mucho gusto"), "first chapter row")
        let dialogueHeader = app.staticTexts
            .matching(NSPredicate(format: "label == 'DIALOGUE'")).firstMatch
        XCTAssertTrue(dialogueHeader.waitForExistence(timeout: 10), "chapter detail")
        hold()
        app.swipeUp()
        hold(2)

        // 4 — Flash cards: flip one, grade two, close. The dialogue section
        // is long — keep scrolling until the review button is on screen.
        var scrolls = 0
        while !app.buttons["Review cards"].exists && scrolls < 6 {
            app.swipeUp()
            scrolls += 1
            hold(1)
        }
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

    /// The signup path end to end: bad password caught on step 1, then a
    /// real account through language + level, landing on Home. Also visits
    /// Profile (and signs out first, since state persists across tests).
    func testC_signupFlow() throws {
        let app = makeApp()

        XCTAssertTrue(app.textFields["Email"].waitForExistence(timeout: 10))
        hold(2)
        XCTAssertTrue(tapAnything(app, label: "Create an account"), "create account link")

        // Step 1 with a too-short password must fail HERE, not at step 3.
        let email = app.textFields["Email"]
        email.tap()
        email.typeText("ui-\(UUID().uuidString.prefix(8).lowercased())@example.com")
        let password = app.secureTextFields["Password"]
        password.tap()
        password.typeText("short\n") // return dismisses the keyboard
        XCTAssertTrue(tapAnything(app, label: "Continue"), "continue #1")
        let lengthError = app.staticTexts
            .matching(NSPredicate(format: "label CONTAINS 'at least 8'")).firstMatch
        XCTAssertTrue(lengthError.waitForExistence(timeout: 5), "password length caught on step 1")
        hold(2)

        // Fix the password and proceed.
        password.tap()
        password.typeText("-now-long-enough\n")
        XCTAssertTrue(tapAnything(app, label: "Continue"), "continue #2")
        let languageStep = app.staticTexts["Which language?"]
        if !languageStep.waitForExistence(timeout: 10) {
            print("OMNI_TREE_SIGNUP\n\(app.debugDescription)")
            XCTFail("language step")
        }
        hold(2)
        XCTAssertTrue(tapAnything(app, label: "Français"), "language tile")
        app.buttons["Continue"].tap()
        XCTAssertTrue(app.staticTexts
            .matching(NSPredicate(format: "label CONTAINS 'studied'")).firstMatch
            .waitForExistence(timeout: 5), "level step")
        hold(2)
        XCTAssertTrue(tapAnything(app, label: "Some basics"), "level choice")
        XCTAssertTrue(
            app.staticTexts["Start conversation"].waitForExistence(timeout: 15),
            "Home after signup"
        )
        hold(2)

        // Library: the New topic sheet (bottom of the list — scroll to it).
        XCTAssertTrue(tapAnything(app, label: "Library"), "library tab")
        hold(2)
        app.swipeUp()
        app.swipeUp()
        hold(1)
        XCTAssertTrue(tapAnything(app, label: "New topic"), "new topic row")
        XCTAssertTrue(app.staticTexts
            .matching(NSPredicate(format: "label CONTAINS[c] 'new topic'")).firstMatch
            .waitForExistence(timeout: 5))
        hold(2)
        app.buttons["Cancel"].tap()

        // Profile.
        XCTAssertTrue(tapAnything(app, label: "Profile"), "profile tab")
        hold(3)
    }

    func testB_talkBooth() throws {
        let app = makeApp()
        signInIfNeeded(app)

        // Mic permission alert may appear on first talk.
        addUIInterruptionMonitor(withDescription: "Microphone") { alert in
            for label in ["Allow", "OK"] where alert.buttons[label].exists {
                alert.buttons[label].tap()
                return true
            }
            return false
        }

        // Button type specifically — the .any query can resolve to a wrapper
        // element with a larger frame, and its center-tap lands on the
        // chapter card below the hero.
        let hero = app.buttons.matching(identifier: "startConversation").firstMatch
        XCTAssertTrue(hero.waitForExistence(timeout: 5), "hero button")
        hero.tap()

        let end = app.buttons["End"]
        if !end.waitForExistence(timeout: 8) {
            // If a permission alert is blocking, tapping the app's TOP edge
            // nudges the interruption monitor without hitting Home content.
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.08)).tap()
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
