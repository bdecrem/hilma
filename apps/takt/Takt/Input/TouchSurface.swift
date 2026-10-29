import SwiftUI
import UIKit

/// Every finger on a view, each with its own id: SwiftUI's drag gesture follows one, and a chord
/// needs five. Down, moved and up (or cancelled) in the view's coordinates, the moment UIKit has
/// them.
struct TouchSurface: UIViewRepresentable {
    enum Phase { case down, moved, up }
    var onTouch: (_ phase: Phase, _ id: Int, _ point: CGPoint) -> Void

    func makeUIView(context: Context) -> SurfaceView {
        let v = SurfaceView()
        v.isMultipleTouchEnabled = true
        v.backgroundColor = .clear
        v.onTouch = onTouch
        return v
    }

    func updateUIView(_ v: SurfaceView, context: Context) {
        v.onTouch = onTouch
    }

    final class SurfaceView: UIView {
        var onTouch: ((Phase, Int, CGPoint) -> Void)?

        private func send(_ touches: Set<UITouch>, _ phase: Phase) {
            for t in touches { onTouch?(phase, ObjectIdentifier(t).hashValue, t.location(in: self)) }
        }

        override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) { send(touches, .down) }
        override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) { send(touches, .moved) }
        override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) { send(touches, .up) }
        override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) { send(touches, .up) }
    }
}
