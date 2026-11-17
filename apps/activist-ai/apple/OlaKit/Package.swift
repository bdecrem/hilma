// swift-tools-version: 5.10
// OlaKit: the opencode 2.3.0 (V2) client shared by Bart's Mac and iPhone apps. The API, the event
// stream, the conversation folded from it, and the plain words for the agent's steps (ported from
// web/src/lib, so the web app and the apps say the same things).
import PackageDescription

let package = Package(
  name: "OlaKit",
  platforms: [.macOS(.v14), .iOS(.v17)],
  products: [
    .library(name: "OlaKit", targets: ["OlaKit"]),
    .executable(name: "olakit-selftest", targets: ["olakit-selftest"]),
  ],
  targets: [
    .target(name: "OlaKit"),
    .executableTarget(name: "olakit-selftest", dependencies: ["OlaKit"]),
    .testTarget(name: "OlaKitTests", dependencies: ["OlaKit"]),
  ]
)
