import SwiftUI

/// The coach column on the Mac: the current line, then what went wrong last chorus.
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

            if let last = state.lastChorus {
                StaffLines()
                    .padding(.bottom, 6)
                Text("Last chorus")
                    .dataLabel(12)
                    .foregroundStyle(Palette.muted)
                Text(last)
                    .bodyText(15)
                    .foregroundStyle(Palette.text)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
