import CoreGraphics
import Foundation
// Prints "<windowID> <w>x<h>" for each on-screen window owned by the process named in argv[1].
let owner = CommandLine.arguments[1]
let list = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as! [[String: Any]]
for w in list where (w[kCGWindowOwnerName as String] as? String) == owner && (w[kCGWindowLayer as String] as? Int) == 0 {
    let b = w[kCGWindowBounds as String] as! [String: Any]
    print(w[kCGWindowNumber as String]!, "\(b["Width"]!)x\(b["Height"]!)")
}
