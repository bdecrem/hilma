import SwiftUI

/// The jelly button: a pill with a deep edge, the skin's primary.
struct BigButton: View {
    let title: String
    var ghost = false
    var light = false
    var action: () -> Void

    var body: some View {
        let skin = Skin.current
        Button(action: action) {
            Text(title)
                .font(skin.display(19))
                .foregroundStyle(ghost ? skin.primary : skin.onPrimary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(
                    Group {
                        if ghost {
                            Capsule().fill(Color.white)
                        } else {
                            Capsule().fill(LinearGradient(colors: [skin.primaryHi, skin.primary], startPoint: .top, endPoint: .bottom))
                        }
                    }
                )
                .overlay(alignment: .top) {
                    if !ghost {
                        Capsule().fill(Color.white.opacity(0.45)).frame(height: 14).padding(.horizontal, 30).padding(.top, 5)
                    }
                }
                .background(Capsule().fill(ghost ? skin.trailNext : skin.primaryDeep).offset(y: 6))
                .shadow(color: ghost ? .clear : skin.primary.opacity(0.35), radius: 12, y: 10)
        }
        .buttonStyle(PressStyle())
    }
}

struct PressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .offset(y: configuration.isPressed ? 3 : 0)
            .animation(.spring(response: 0.25, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

/// A white card with the skin's soft shadow.
struct Card<Content: View>: View {
    var padding: CGFloat = 20
    @ViewBuilder var content: () -> Content

    var body: some View {
        let skin = Skin.current
        content()
            .padding(padding)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: skin.rCard, style: .continuous)
                    .fill(LinearGradient(colors: [skin.card, skin.cardTint], startPoint: .top, endPoint: .bottom))
            )
            .shadow(color: skin.shadow, radius: 14, y: 12)
    }
}

/// The little colored tag on a thing or a card.
struct Tag: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text.uppercased())
            .font(Skin.current.uiBold(11))
            .tracking(0.8)
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule().fill(color))
            .background(Capsule().fill(Color.black.opacity(0.12)).offset(y: 3))
    }
}

/// The streak pill: a flame and the number.
struct StreakPill: View {
    let streak: Int

    var body: some View {
        let skin = Skin.current
        HStack(spacing: 5) {
            Image(systemName: "flame.fill").font(.system(size: 14, weight: .bold))
            Text("\(streak)").font(skin.display(17))
        }
        .foregroundStyle(skin.onReward)
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(Capsule().fill(LinearGradient(colors: [Color(hex: 0xFFF2A8), skin.reward], startPoint: .top, endPoint: .bottom)))
        .background(Capsule().fill(skin.rewardDeep).offset(y: 4))
    }
}

/// A round × that leaves a screen.
struct CloseButton: View {
    var light = false
    var action: () -> Void

    var body: some View {
        let skin = Skin.current
        Button(action: action) {
            Image(systemName: "xmark")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(light ? .white : skin.ink2)
                .frame(width: 36, height: 36)
                .background(Circle().fill(light ? Color.white.opacity(0.22) : Color.white))
                .shadow(color: light ? .clear : skin.shadow, radius: 6, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Close")
    }
}

/// The row of segments under a section header: one per step, filled as it goes.
struct Segments: View {
    let states: [SegState]
    var wide = false

    enum SegState { case todo, cur, done, ok, miss }

    var body: some View {
        let skin = Skin.current
        HStack(spacing: 4) {
            ForEach(Array(states.enumerated()), id: \.offset) { _, s in
                Capsule()
                    .fill(color(s, skin))
                    .frame(width: wide ? nil : 22, height: 6)
                    .frame(maxWidth: wide ? .infinity : nil)
            }
        }
    }

    private func color(_ s: SegState, _ skin: Skin) -> Color {
        switch s {
        case .todo: return Color.white.opacity(0.7)
        case .cur: return skin.reward
        case .done, .ok: return skin.good
        case .miss: return skin.bad
        }
    }
}

/// A text field in the skin's input shape.
struct InputField: View {
    let placeholder: String
    @Binding var text: String
    var keyboard: UIKeyboardType = .default
    var content: UITextContentType? = nil
    var disabled = false
    var submit: (() -> Void)? = nil

    var body: some View {
        let skin = Skin.current
        TextField(placeholder, text: $text)
            .font(skin.uiBold(19))
            .foregroundStyle(skin.ink)
            .keyboardType(keyboard)
            .textContentType(content)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.go)
            .onSubmit { submit?() }
            .disabled(disabled)
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .background(RoundedRectangle(cornerRadius: skin.rInput, style: .continuous).fill(Color.white))
            .overlay(RoundedRectangle(cornerRadius: skin.rInput, style: .continuous).stroke(skin.line, lineWidth: 2))
    }
}

/// A little row of three "sound" bars, for the listening state.
struct Bars: View {
    var color: Color = .white

    var body: some View {
        TimelineView(.animation) { ctx in
            let t = ctx.date.timeIntervalSinceReferenceDate
            HStack(spacing: 4) {
                ForEach(0..<4, id: \.self) { i in
                    Capsule()
                        .fill(color)
                        .frame(width: 5, height: 10 + 14 * abs(sin(t * 6 + Double(i) * 0.9)))
                }
            }
            .frame(height: 28)
        }
    }
}

func mmss(_ seconds: Int) -> String {
    String(format: "%d:%02d", seconds / 60, seconds % 60)
}
