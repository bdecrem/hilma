import UIKit

/// UIApplication subclass, wired up via NSPrincipalClass in project.yml.
///
/// Gives Escape a reliable "close the current modal" meaning. SwiftUI's
/// `.keyboardShortcut(.cancelAction)` never fires inside presented sheets on
/// Mac Catalyst (the hosting controller's key-command bridge doesn't reach
/// them), so modals were closable only by their buttons. UIApplication sits
/// at the end of the responder chain, so a key command here catches Escape
/// wherever focus is — on the Mac and on iPads with hardware keyboards.
///
/// It only acts when something is actually presented, and it respects
/// `interactiveDismissDisabled` (`isModalInPresentation`), so states like
/// mid-grading stay protected.
final class FeyndApplication: UIApplication {
    override var keyCommands: [UIKeyCommand]? {
        var commands = super.keyCommands ?? []
        commands.append(UIKeyCommand(
            input: UIKeyCommand.inputEscape,
            modifierFlags: [],
            action: #selector(closeTopmostModal)
        ))
        return commands
    }

    @objc private func closeTopmostModal() {
        dismissTopmostPresentedModal(respectingModalLock: true)
    }
}
