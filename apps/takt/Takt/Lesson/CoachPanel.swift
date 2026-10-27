import SwiftUI

/// The coach column on the Mac: the current line, the last note's needle, then what went wrong
/// last chorus.
struct CoachPanel: View {
    let state: LessonState

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Coach")
                .dataLabel(12)
                .foregroundStyle(Palette.muted)
            Text(state.coach)
                .bodyText(24, weight: .semibold, relativeTo: .title2)
                .foregroundStyle(Palette.text)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 24)

            StaffLines()
                .padding(.bottom, 6)
            if state.run != nil {
                // A scale lesson: the last note is one small dot, not the meter.
                HStack(spacing: 10) {
                    NoteDot(mark: state.lastNote)
                    Text("Last note")
                        .dataLabel(11)
                        .foregroundStyle(Palette.muted)
                }
                .padding(.bottom, 10)
            } else {
                NoteNeedle(mark: state.lastNote)
                    .padding(.bottom, 10)
            }

            if let last = state.lastChorus {
                StaffLines()
                    .padding(.bottom, 6)
                Text("Last chorus")
                    .dataLabel(12)
                    .foregroundStyle(Palette.muted)
                Text(last)
                    .bodyText(15)
                    .foregroundStyle(Palette.text)
                    .fixedSize(horizontal: false, vertical: true)
                if let detail = state.lastChorusDetail {
                    // Break only between items: "2 rushed" stays whole.
                    Text(detail.components(separatedBy: " · ")
                        .map { $0.replacingOccurrences(of: " ", with: "\u{00A0}") }
                        .joined(separator: " · "))
                        .dataLabel(11)
                        .foregroundStyle(Palette.muted)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
