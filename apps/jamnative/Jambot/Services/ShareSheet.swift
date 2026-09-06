import SwiftUI
import UIKit

/// `UIActivityViewController` wrapped for SwiftUI `.sheet` — used for both
/// the public-link Share action (`StudioHeaderActions`) and the exported
/// audio file (`BounceSheet`). On iPad/Mac Catalyst this becomes a popover;
/// anchoring to the presenting view's bounds keeps it from crashing there.
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    var excludedActivityTypes: [UIActivity.ActivityType]? = nil

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let vc = UIActivityViewController(activityItems: items, applicationActivities: nil)
        vc.excludedActivityTypes = excludedActivityTypes
        if let popover = vc.popoverPresentationController {
            popover.sourceView = UIView()
            popover.permittedArrowDirections = []
        }
        return vc
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
