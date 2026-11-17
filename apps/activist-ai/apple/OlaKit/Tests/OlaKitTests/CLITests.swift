import Foundation
import XCTest
@testable import OlaKit

final class CLITests: XCTestCase {
  func testArguments() {
    XCTAssertEqual(OlaCLI.parse([]), .talk(continueLast: false))
    XCTAssertEqual(OlaCLI.parse(["-c"]), .talk(continueLast: true))
    XCTAssertEqual(OlaCLI.parse(["--continue"]), .talk(continueLast: true))
    XCTAssertEqual(OlaCLI.parse(["Make a list of the files here"]), .run("Make a list of the files here"))
    XCTAssertEqual(OlaCLI.parse(["make", "a", "list"]), .run("make a list"), "unquoted words are one request")
    XCTAssertEqual(OlaCLI.parse(["run", "Say", "hello"]), .run("Say hello"))
    XCTAssertEqual(OlaCLI.parse(["login"]), .login)
    XCTAssertEqual(OlaCLI.parse(["logout"]), .logout)
    XCTAssertEqual(OlaCLI.parse(["whoami"]), .whoami)
    XCTAssertEqual(OlaCLI.parse(["status"]), .status)
    for h in ["--help", "-h", "help"] { XCTAssertEqual(OlaCLI.parse([h]), .help) }
    XCTAssertEqual(OlaCLI.parse(["--version"]), .version)
    if case .bad(let s) = OlaCLI.parse(["run"]) { XCTAssertTrue(s.contains("ola run")) } else { XCTFail("empty run accepted") }
    if case .bad(let s) = OlaCLI.parse(["--frobnicate"]) { XCTAssertTrue(s.contains("--help")) } else { XCTFail("unknown flag accepted") }
    if case .bad = OlaCLI.parse(["login", "extra"]) {} else { XCTFail("login with extra words accepted") }
    // The help is plain words: no ports, addresses, tokens or developer words.
    for w in ["port", "127.0.0.1", "localhost", "token", "gateway", "device", "opencode"] {
      XCTAssertFalse(OlaCLI.help.lowercased().contains(w), "help mentions \(w)")
    }
  }

  func testInstallsIntoTheFirstWritableFolderOnThePath() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent("ola-cli-install-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: root) }
    let a = root.appendingPathComponent("a").path, b = root.appendingPathComponent("b").path, c = root.appendingPathComponent("c").path
    try FileManager.default.createDirectory(atPath: b, withIntermediateDirectories: true)
    try FileManager.default.createDirectory(atPath: c, withIntermediateDirectories: true)
    let app = URL(fileURLWithPath: "/Applications/Ola.app/Contents/MacOS/Ola")
    // a is not on the PATH: skipped; b is: used.
    var r = CLIInstall.install(appExecutable: app, dirs: [a, b, c], path: [b, c])
    XCTAssertEqual(r.path, b + "/ola")
    XCTAssertFalse(r.message.contains("/"), "Settings' words carry no path")
    let text = try String(contentsOfFile: b + "/ola", encoding: .utf8)
    XCTAssertTrue(text.hasPrefix("#!/bin/sh") && text.contains("exec \"/Applications/Ola.app/Contents/MacOS/Ola\" --cli \"$@\""))
    XCTAssertTrue(FileManager.default.isExecutableFile(atPath: b + "/ola"))
    XCTAssertEqual(CLIInstall.installedPath(in: [a, b, c]), b + "/ola")
    // Installing again replaces our own launcher.
    r = CLIInstall.install(appExecutable: app, dirs: [a, b, c], path: [b, c])
    XCTAssertEqual(r.path, b + "/ola")
    // Someone else's `ola` is left alone; the next folder is used.
    try "#!/bin/sh\necho other\n".write(toFile: b + "/ola", atomically: true, encoding: .utf8)
    r = CLIInstall.install(appExecutable: app, dirs: [a, b, c], path: [b, c])
    XCTAssertEqual(r.path, c + "/ola")
    XCTAssertEqual(try String(contentsOfFile: b + "/ola", encoding: .utf8), "#!/bin/sh\necho other\n")
    // Nowhere on the PATH: said plainly, nothing written.
    r = CLIInstall.install(appExecutable: app, dirs: [a], path: [])
    XCTAssertNil(r.path)
    XCTAssertFalse(FileManager.default.fileExists(atPath: a + "/ola"))
  }

  func testTheLauncherRunsTheAppExecutableWithItsArguments() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent("ola-cli-launch-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: root) }
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    // A stand-in for the app's executable that prints what it was given.
    let fake = root.appendingPathComponent("Fake App/Ola")
    try FileManager.default.createDirectory(at: fake.deletingLastPathComponent(), withIntermediateDirectories: true)
    try "#!/bin/sh\nprintf '%s|' \"$@\"\n".write(to: fake, atomically: true, encoding: .utf8)
    try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: fake.path)
    let r = CLIInstall.install(appExecutable: fake, dirs: [root.path], path: [root.path])
    let p = Process()
    p.executableURL = URL(fileURLWithPath: try XCTUnwrap(r.path))
    p.arguments = ["run", "a request with spaces"]
    let out = Pipe()
    p.standardOutput = out
    try p.run()
    p.waitUntilExit()
    XCTAssertEqual(String(decoding: out.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self), "--cli|run|a request with spaces|")
  }
}
