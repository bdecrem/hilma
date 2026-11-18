import AppKit

/// The signed download's update check (testflight/README.md, "The Mac app: a signed download").
/// `testflight/ship-via-mini.sh mac` publishes the notarized disk image and `latest.json` beside
/// it; this reads that file and, when its build is newer than this one, offers the download in
/// the browser. Settings, General, Check for Updates… asks now and always answers; at launch it asks at most
/// once a day and says something only when there is a newer build it has not offered before.
/// Nothing is installed by the app itself: the person opens the disk image and drags Ola over.
@MainActor
enum UpdateCheck {
  static let feed = URL(string: "https://ola.cx/ola-site/mac/latest.json")!
  private static let lastKey = "ola.update.lastCheck", offeredKey = "ola.update.offeredBuild"

  struct Latest: Decodable { let version: String; let build: String; let url: String; let notes: String? }

  static var thisBuild: Int { Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "") ?? 0 }
  static var thisVersion: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?" }

  static func atLaunch() {
    let d = UserDefaults.standard
    if let last = d.object(forKey: lastKey) as? Date, Date().timeIntervalSince(last) < 86_400 { return }
    d.set(Date(), forKey: lastKey)
    Task { await check(userAsked: false) }
  }

  static func check(userAsked: Bool) async {
    var req = URLRequest(url: feed, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    guard let (data, resp) = try? await URLSession.shared.data(for: req),
          (resp as? HTTPURLResponse)?.statusCode == 200,
          let latest = try? JSONDecoder().decode(Latest.self, from: data),
          let build = Int(latest.build), let url = URL(string: latest.url) else {
      if userAsked { tell("Couldn't check for updates", "Try again when this Mac is online.") }
      return
    }
    if build <= thisBuild {
      if userAsked { tell("Ola is up to date", "You have Ola \(thisVersion) (\(thisBuild)).") }
      return
    }
    if !userAsked, UserDefaults.standard.integer(forKey: offeredKey) >= build { return }
    UserDefaults.standard.set(build, forKey: offeredKey)
    let a = NSAlert()
    a.messageText = "Ola \(latest.version) (\(build)) is ready"
    a.informativeText = (latest.notes.map { $0 + "\n\n" } ?? "")
      + "You have \(thisVersion) (\(thisBuild)). Download it, quit Ola, and drag the new Ola into Applications."
    a.addButton(withTitle: "Download")
    a.addButton(withTitle: "Later")
    if a.runModal() == .alertFirstButtonReturn { NSWorkspace.shared.open(url) }
  }

  private static func tell(_ title: String, _ text: String) {
    let a = NSAlert()
    a.messageText = title
    a.informativeText = text
    a.runModal()
  }
}
