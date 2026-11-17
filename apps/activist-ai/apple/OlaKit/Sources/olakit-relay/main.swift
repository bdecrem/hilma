// A headless Mac relay, for checks (the iPhone simulator against it): the same MacRelay the Mac
// app runs, on this Mac's Tailscale address, in front of a server.
//
//   OLA_SERVER=<url> OLA_PASSWORD_FILE=<file> OLA_PAIR_FILE=<file to write the pairing code to> \
//     [OLA_RELAY_PORT=4331] swift run olakit-relay
//
// The pairing code (it holds the secret) goes only into OLA_PAIR_FILE, mode 600; nothing secret is
// printed. Runs until stopped.
import Foundation
import OlaKit

let env = ProcessInfo.processInfo.environment
guard let server = env["OLA_SERVER"].flatMap(URL.init(string:)), let pwFile = env["OLA_PASSWORD_FILE"], let pairFile = env["OLA_PAIR_FILE"],
      let pw = try? String(contentsOfFile: pwFile, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines) else {
  print("set OLA_SERVER, OLA_PASSWORD_FILE and OLA_PAIR_FILE")
  exit(2)
}
guard let host = env["OLA_RELAY_HOST"] ?? Tailnet.address() else {
  print("Tailscale is off on this Mac: no tailnet address to listen on")
  exit(1)
}
let name = env["OLA_RELAY_NAME"] ?? Tailnet.dnsName() ?? host
let book = PairingBook(file: nil)
let secret = PairingCode.newSecret()
book.add(secret: secret, label: "check")
let relay = MacRelay(book: book, macName: "Relay check")
relay.setUpstream(ServerConfig(url: server, password: pw), mode: "machine")
let port = try await relay.start(host: host, port: UInt16(env["OLA_RELAY_PORT"] ?? "4331") ?? 4331)
let code = PairingCode(host: name, port: Int(port), secret: secret, name: "Relay check")
FileManager.default.createFile(atPath: pairFile, contents: Data(code.text.utf8), attributes: [.posixPermissions: 0o600])
print("relay listening on \(host):\(port) (\(name)), in front of \(server.host() ?? "")")
while true { try await Task.sleep(nanoseconds: 3_600_000_000_000) }
