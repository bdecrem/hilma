#if os(macOS)
import CryptoKit
import Foundation

/// opencode for "On this Mac", installed by the app itself on a Mac that has nothing else: the
/// pinned 2.3.0 build for this Mac's processor, from the npm registry, checked against the sha512
/// that `apps/activist-ai/package-lock.json` pins (the same bytes `npm ci` would accept), unpacked
/// user-level into Application Support/Ola/opencode/bin, then asked for its version. No Node, no
/// npm, no administrator password.
public enum OpencodeInstall {
  public static let version = "2.3.0"

  /// The registry tarball and its pinned integrity, per processor (package-lock.json; a test
  /// checks these against the file).
  public static let packages: [String: (url: String, integrity: String)] = [
    "arm64": ("https://registry.npmjs.org/@opencode/cli-darwin-arm64/-/cli-darwin-arm64-2.3.0.tgz",
              "sha512-ey2HOWX2DK2YJrKta5a+pcvIlkiCyJJsN7NjkJZPsVg9TDXpQWE1OJLWVFqjxZcWNtaMjvKYlrlCY6g8Z2Lb+A=="),
    "x86_64": ("https://registry.npmjs.org/@opencode/cli-darwin-x64/-/cli-darwin-x64-2.3.0.tgz",
               "sha512-OARYGefjQb1xClR9lX0bTl/unxaJ2H9kpyqYuEH+59YdgantqpMdPrXXnJgwiydk3WP94CxWLXFOxSYtCxoDQQ=="),
  ]

  public static var arch: String {
    #if arch(arm64)
    return "arm64"
    #else
    return "x86_64"
    #endif
  }

  /// Where the app installs it (also where `LocalServer.binary` looks first).
  public static var destination: URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Ola/opencode/bin/opencode")
  }

  public enum Failure: Error, LocalizedError, Equatable {
    case download, checksum, unpack, wrongVersion(String)
    public var errorDescription: String? {
      switch self {
      case .download: return "Ola couldn\u{2019}t download what it needs to work on this Mac. Check that this Mac is online, then try again."
      case .checksum: return "What Ola downloaded didn\u{2019}t match what it expected, so it wasn\u{2019}t used. Try again; if it happens again, tell Bart."
      case .unpack: return "Ola couldn\u{2019}t set itself up in your Library folder. Check there\u{2019}s free space, then try again."
      case .wrongVersion: return "Ola set itself up, but the result didn\u{2019}t start as expected. Try again."
      }
    }
  }

  /// "sha512-<base64>" for these bytes.
  public static func integrity(of data: Data) -> String { "sha512-" + Data(SHA512.hash(data: data)).base64EncodedString() }

  /// Downloads, checks, unpacks and tries it. `progress` gets a fraction from 0 to 1 while it
  /// downloads. Returns the installed binary.
  @discardableResult
  public static func install(to dest: URL = destination, session: URLSession = .shared, progress: @escaping @Sendable (Double) -> Void = { _ in }) async throws -> URL {
    guard let pkg = packages[arch], let url = URL(string: pkg.url) else { throw Failure.download }
    let file = try await download(url, session: session, progress: progress)
    defer { try? FileManager.default.removeItem(at: file) }
    guard integrity(ofFile: file) == pkg.integrity else { throw Failure.checksum }
    try unpack(file, to: dest)
    let v = try runVersion(dest)
    guard v == version else { try? FileManager.default.removeItem(at: dest); throw Failure.wrongVersion(v) }
    return dest
  }

  /// The same, read from a file in pieces (the package is tens of megabytes).
  public static func integrity(ofFile url: URL) -> String? {
    guard let h = try? FileHandle(forReadingFrom: url) else { return nil }
    defer { try? h.close() }
    var hasher = SHA512()
    while let chunk = try? h.read(upToCount: 1 << 20), !chunk.isEmpty { hasher.update(data: chunk) }
    return "sha512-" + Data(hasher.finalize()).base64EncodedString()
  }

  /// Downloads to a file of our own; returns it.
  static func download(_ url: URL, session: URLSession, progress: @escaping @Sendable (Double) -> Void) async throws -> URL {
    let d = Downloader(progress)
    let s = URLSession(configuration: session.configuration, delegate: d, delegateQueue: nil)
    defer { s.finishTasksAndInvalidate() }
    let task = s.downloadTask(with: url)
    return try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { (c: CheckedContinuation<URL, Error>) in
        d.done = c
        task.resume()
      }
    } onCancel: { task.cancel() }
  }

  /// Progress while it downloads, and the file kept when it is done.
  final class Downloader: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
    let report: @Sendable (Double) -> Void
    var done: CheckedContinuation<URL, Error>?
    var file: URL?
    init(_ r: @escaping @Sendable (Double) -> Void) { report = r }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
      if totalBytesExpectedToWrite > 0 { report(min(Double(totalBytesWritten) / Double(totalBytesExpectedToWrite), 1)) }
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
      guard (downloadTask.response as? HTTPURLResponse)?.statusCode == 200 else { return }
      let mine = FileManager.default.temporaryDirectory.appendingPathComponent("ola-opencode-\(UUID().uuidString).tgz")
      if (try? FileManager.default.moveItem(at: location, to: mine)) != nil { file = mine }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
      let c = done
      done = nil
      if let file, error == nil { report(1); c?.resume(returning: file) } else { c?.resume(throwing: Failure.download) }
    }
  }

  /// The tarball holds `package/bin/opencode`; it is moved into place only once it is whole.
  static func unpack(_ archive: URL, to dest: URL) throws {
    let fm = FileManager.default
    let work = fm.temporaryDirectory.appendingPathComponent("ola-opencode-\(UUID().uuidString)")
    defer { try? fm.removeItem(at: work) }
    do {
      try fm.createDirectory(at: work, withIntermediateDirectories: true)
      let p = Process()
      p.executableURL = URL(fileURLWithPath: "/usr/bin/tar")
      p.arguments = ["-xzf", archive.path, "-C", work.path, "package/bin/opencode"]
      p.standardOutput = FileHandle.nullDevice
      p.standardError = FileHandle.nullDevice
      try p.run()
      p.waitUntilExit()
      let bin = work.appendingPathComponent("package/bin/opencode")
      guard p.terminationStatus == 0, fm.fileExists(atPath: bin.path) else { throw Failure.unpack }
      try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: bin.path)
      try fm.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
      let staged = dest.deletingLastPathComponent().appendingPathComponent(".opencode-\(UUID().uuidString)")
      try fm.moveItem(at: bin, to: staged)
      if fm.fileExists(atPath: dest.path) { _ = try fm.replaceItemAt(dest, withItemAt: staged) } else { try fm.moveItem(at: staged, to: dest) }
    } catch let f as Failure { throw f } catch { throw Failure.unpack }
  }

  static func runVersion(_ bin: URL) throws -> String {
    let p = Process()
    p.executableURL = bin
    p.arguments = ["--version"]
    let out = Pipe()
    p.standardOutput = out
    p.standardError = FileHandle.nullDevice
    do { try p.run() } catch { throw Failure.wrongVersion("did not run") }
    let d = out.fileHandleForReading.readDataToEndOfFile()
    p.waitUntilExit()
    // It prints "opencode v2.3.0".
    let text = String(decoding: d, as: UTF8.self)
    return text.range(of: #"\d+\.\d+\.\d+"#, options: .regularExpression).map { String(text[$0]) } ?? text.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}
#endif
