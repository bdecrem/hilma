import SwiftUI

// Small mascot views. The drawing is the jelly dodo (JellyDodo.swift); the
// bookworm bird these once drew lives in git history (before 2026-10-01).

// MARK: - Views

/// Mini dodo head — replaces the old line-and-nodes F2 mark next to agent
/// chat bubbles and anywhere the app signs a message as "the dodo".
struct DodoMiniMark: View {
    var size: CGFloat = 26

    var body: some View {
        Canvas { ctx, canvasSize in
            var g = ctx
            drawJellyDodo(&g, at: CGPoint(x: canvasSize.width / 2, y: canvasSize.height - 1),
                          height: canvasSize.height * 0.9, pose: DodoPose())
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// The full traveler — walks the Peck map trail beside the current level.
struct DodoTraveler: View {
    /// Height of the rendered figure in points.
    var size: CGFloat = 90

    var body: some View {
        Canvas { ctx, canvasSize in
            var g = ctx
            drawJellyDodo(&g, at: CGPoint(x: canvasSize.width / 2, y: canvasSize.height - 4),
                          height: canvasSize.height * 0.9, pose: DodoPose(), groundShadow: true)
        }
        .frame(width: size * 1.1, height: size)
        .accessibilityHidden(true)
    }
}

// (The voice screen's DodoVoiceOrb was replaced by the Dodo Radio — see
// DodoRadio in VoiceSessionView.swift.)
