import CoreGraphics
import Foundation
// Prints "<windowID> <w>x<h>" for each on-screen window owned by the process named in argv[1]
// (and, with argv[2], only that process ID: another copy of the app may be running).
let owner = CommandLine.arguments[1]
let pid = CommandLine.arguments.count > 2 ? Int(CommandLine.arguments[2]) : nil
let list = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as! [[String: Any]]
for w in list where (w[kCGWindowOwnerName as String] as? String) == owner && (w[kCGWindowLayer as String] as? Int) == 0
    && (pid == nil || (w[kCGWindowOwnerPID as String] as? Int) == pid) {
    let b = w[kCGWindowBounds as String] as! [String: Any]
    print(w[kCGWindowNumber as String]!, "\(b["Width"]!)x\(b["Height"]!)")
}
