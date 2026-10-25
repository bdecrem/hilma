import SwiftUI
import UIKit

/// The computer keyboard as a piano (brief §5): the home row is the white keys from C,
/// W E T Y U O P the black keys, Z / X shift an octave. Space plays/pauses, ↑ / ↓ change tempo, Esc leaves the lesson.
/// Physical key codes, so it works on any layout. Keys held with ⌘, ⌃ or ⌥ are left to menus.
struct KeyCatcher: UIViewRepresentable {
    var onNote: (_ semitone: Int, _ down: Bool) -> Void
    var onOctave: (_ delta: Int) -> Void
    var onSpace: () -> Void
    var onTempo: (_ delta: Int) -> Void
    var onEscape: () -> Void = {}

    func makeUIView(context: Context) -> CatcherView {
        let v = CatcherView()
        v.catcher = self
        return v
    }

    func updateUIView(_ v: CatcherView, context: Context) {
        v.catcher = self
    }

    static let semitones: [UIKeyboardHIDUsage: Int] = [
        .keyboardA: 0, .keyboardW: 1, .keyboardS: 2, .keyboardE: 3, .keyboardD: 4,
        .keyboardF: 5, .keyboardT: 6, .keyboardG: 7, .keyboardY: 8, .keyboardH: 9,
        .keyboardU: 10, .keyboardJ: 11, .keyboardK: 12, .keyboardO: 13, .keyboardL: 14,
        .keyboardP: 15, .keyboardSemicolon: 16,
    ]

    final class CatcherView: UIView {
        var catcher: KeyCatcher?
        private var held: [UIKeyboardHIDUsage: Int] = [:]

        override var canBecomeFirstResponder: Bool { true }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            if window != nil { becomeFirstResponder() }
        }

        override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
            var unhandled = Set<UIPress>()
            for press in presses {
                guard let key = press.key, let catcher,
                      key.modifierFlags.isDisjoint(with: [.command, .control, .alternate]) else {
                    unhandled.insert(press)
                    continue
                }
                if let s = KeyCatcher.semitones[key.keyCode] {
                    if held[key.keyCode] == nil {
                        held[key.keyCode] = s
                        catcher.onNote(s, true)
                    }
                } else {
                    switch key.keyCode {
                    case .keyboardZ: catcher.onOctave(-1)
                    case .keyboardX: catcher.onOctave(1)
                    case .keyboardSpacebar: catcher.onSpace()
                    case .keyboardUpArrow: catcher.onTempo(5)
                    case .keyboardDownArrow: catcher.onTempo(-5)
                    case .keyboardEscape: catcher.onEscape()
                    default: unhandled.insert(press)
                    }
                }
            }
            if !unhandled.isEmpty { super.pressesBegan(unhandled, with: event) }
        }

        override func pressesEnded(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
            release(presses)
            super.pressesEnded(presses, with: event)
        }

        override func pressesCancelled(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
            release(presses)
            super.pressesCancelled(presses, with: event)
        }

        private func release(_ presses: Set<UIPress>) {
            for press in presses {
                guard let code = press.key?.keyCode, let s = held.removeValue(forKey: code) else { continue }
                catcher?.onNote(s, false)
            }
        }
    }
}
