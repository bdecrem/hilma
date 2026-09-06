import SwiftUI

// Shared "desk instrument" controls — ports of the component classes in
// src/app/jam/jam.css. Raw tokens live in Theme.swift; this file holds the
// views every screen reuses: rubber keys, the wordmark, sheet headers, the
// screen-printed group row, faders, M/S keys, tags.

// MARK: - Rubber keys (`.jb-key`)

enum JBKeyVariant { case orange, ghost, panel, green, ink }

/// `.jb-key` (48), `--sm` (34), `--xs` (28).
enum JBKeySize {
    case regular, small, xs

    var height: CGFloat { switch self { case .regular: 48; case .small: 34; case .xs: 28 } }
    var font: CGFloat { switch self { case .regular: 15; case .small: 12; case .xs: 11 } }
    var radius: CGFloat { switch self { case .regular: 11; case .small: 9; case .xs: 8 } }
    var hPad: CGFloat { switch self { case .regular: 18; case .small: 12; case .xs: 10 } }
    /// letter-spacing 0.12em (0.10em for xs)
    var tracking: CGFloat { switch self { case .regular: 1.8; case .small: 1.44; case .xs: 1.1 } }
    /// `--square`: 56 for the regular key, 34 for the small one.
    var square: CGFloat { switch self { case .regular: 56; case .small: 34; case .xs: 28 } }
    var squareRadius: CGFloat { switch self { case .regular: 14; case .small: 9; case .xs: 8 } }
}

/// A rubber key: face + 2 pt lip below (`box-shadow: 0 2px 0`), a faint
/// top highlight, uppercase tracked label. Pressing sinks the face onto the
/// lip. Labels render in the body face like the web (its `.jb button`
/// rule wins over `.jb-key`'s condensed stack), so keys read wide and
/// even while the silkscreen labels stay condensed.
struct JBKeyStyle: ButtonStyle {
    var variant: JBKeyVariant = .panel
    var size: JBKeySize = .regular
    var square: Bool = false
    /// Stretch to the available width (`--wide`).
    var wide: Bool = false

    @Environment(\.isEnabled) private var isEnabled

    init(variant: JBKeyVariant = .panel, size: JBKeySize = .regular, square: Bool = false, wide: Bool = false) {
        self.variant = variant; self.size = size; self.square = square; self.wide = wide
    }

    /// Back-compat spelling used across the app: `small: true` == `.small`.
    init(variant: JBKeyVariant = .panel, small: Bool, square: Bool = false, wide: Bool = false) {
        self.init(variant: variant, size: small ? .small : .regular, square: square, wide: wide)
    }

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        let radius = square ? size.squareRadius : size.radius
        configuration.label
            .font(.system(size: size.font, weight: .semibold))
            .tracking(square ? 0 : size.tracking)
            .textCase(.uppercase)
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .padding(.horizontal, square ? 0 : size.hPad)
            .frame(width: square ? size.square : nil, height: square ? size.square : size.height)
            .frame(maxWidth: wide ? .infinity : nil)
            .background { JBRubber(variant: variant, radius: radius, pressed: pressed) }
            .foregroundStyle(foreground)
            .offset(y: pressed && variant != .ghost ? 2 : 0)
            .opacity(isEnabled ? 1 : 0.35)
            .animation(.easeOut(duration: 0.05), value: pressed)
            .contentShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }

    private var foreground: Color {
        switch variant {
        case .orange: return JBTheme.onOrange
        case .ghost, .panel: return JBTheme.ink
        case .green: return .white
        case .ink: return JBTheme.keyLabel
        }
    }
}

/// Face + lip for a rubber key.
struct JBRubber: View {
    let variant: JBKeyVariant
    let radius: CGFloat
    var pressed: Bool = false

    private var face: Color {
        switch variant {
        case .orange: return JBTheme.orange
        case .ghost: return .clear
        case .panel: return JBTheme.panel4
        case .green: return JBTheme.green
        case .ink: return JBTheme.keyFill
        }
    }
    private var lip: Color {
        switch variant {
        case .orange: return Color(hex: 0xA8300F)
        case .ghost: return .clear
        case .panel: return JBTheme.panelKeyLip
        case .green: return Color(hex: 0x0A6A49)
        case .ink: return JBTheme.keyLip
        }
    }
    /// The `inset 0 1px 0` top highlight. Paper keys use the theme's
    /// highlight token (white by day, a faint sheen at night); the coloured
    /// keys keep a fixed white at the CSS opacity.
    private var highlight: Color {
        switch variant {
        case .orange: return Color.white.opacity(0.35)
        case .ghost: return .clear
        case .panel: return JBTheme.highlight
        case .green: return Color.white.opacity(0.25)
        case .ink: return Color.white.opacity(0.12)
        }
    }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        ZStack {
            if variant == .ghost {
                shape.strokeBorder(JBTheme.ink, lineWidth: 1.5)
            } else {
                shape.fill(lip).offset(y: pressed ? 0 : 2)
                shape.fill(face)
                    .overlay(
                        shape.stroke(highlight, lineWidth: 1)
                            .padding(0.5)
                            .mask(LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .init(x: 0.5, y: 0.3)))
                    )
            }
        }
    }
}

// MARK: - Fields (`.jb-field`)

struct JBFieldStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(JBTheme.bodyFont(16))
            .padding(.vertical, 12)
            .padding(.horizontal, 14)
            .background(JBTheme.panel4)
            .foregroundStyle(JBTheme.ink)
            .tint(JBTheme.cobalt)
            .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(JBTheme.rule, lineWidth: 1.5))
    }
}

/// `.jb-field::placeholder { color: var(--ink-3) }` — the system placeholder
/// colour flips to light grey under iOS dark mode and vanishes on the
/// paper field, so every field passes its prompt through this.
func jbPrompt(_ text: String) -> Text {
    Text(text).foregroundColor(JBTheme.ink3)
}

extension View {
    func jbField() -> some View { modifier(JBFieldStyle()) }
}

// MARK: - Wordmark (`.jb-wordmark`)

/// "JAMBOT" with the raised orange LED after the T — never a period. The
/// LED is 0.2em wide, 0.1em after the word, its bottom 0.62em above the
/// baseline (cap height), with the CSS glow.
struct JBWordmark: View {
    var size: CGFloat = 22
    var color: Color = JBTheme.ink

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: size * 0.1) {
            Text("JAMBOT")
                .font(JBTheme.panelFont(size, weight: .bold))
                .tracking(size * 0.06)
                .foregroundStyle(color)
            Circle()
                .fill(JBTheme.orange)
                .frame(width: size * 0.2, height: size * 0.2)
                .shadow(color: JBTheme.orange, radius: size * 0.06)
                .shadow(color: JBTheme.orange.opacity(0.55), radius: size * 0.17)
                // measured against the web: the LED's bottom edge sits a hair
                // under the cap line (SF's baseline guide lands 0.2em higher
                // than the CSS `vertical-align: 0.62em`, so 0.42 here)
                .alignmentGuide(.firstTextBaseline) { d in d[.bottom] + size * 0.42 }
        }
        .accessibilityLabel("Jambot")
    }
}

// MARK: - Screen-printed group row (`.jb-group` + `.jb-eyebrow`)

/// `.jb-eyebrow`: 12 pt condensed semibold uppercase, 0.18em tracking, ink-3.
struct JBEyebrow: View {
    let text: String
    var body: some View {
        Text(text)
            .font(JBTheme.panelFont(12, weight: .semibold))
            .tracking(2.1)
            .textCase(.uppercase)
            .foregroundStyle(JBTheme.ink3)
    }
}

/// Eyebrow label, optional mono subtitle, an etched rule filling the rest,
/// then whatever sits at the end of the line (a key, M/S keys).
struct JBGroupRow<Trailing: View>: View {
    let label: String
    var subtitle: String? = nil
    var dimmed: Bool = false
    @ViewBuilder var trailing: () -> Trailing

    init(_ label: String, subtitle: String? = nil, dimmed: Bool = false, @ViewBuilder trailing: @escaping () -> Trailing = { EmptyView() }) {
        self.label = label; self.subtitle = subtitle; self.dimmed = dimmed; self.trailing = trailing
    }

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            JBEyebrow(text: label)
                .layoutPriority(1)
            if let subtitle {
                Text(subtitle)
                    .font(JBTheme.monoFont(11))
                    .foregroundStyle(JBTheme.ink3)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
                    .layoutPriority(0.5)
            }
            Rectangle().fill(JBTheme.rule).frame(height: 1).frame(minWidth: 12, maxWidth: .infinity)
            trailing()
        }
        .opacity(dimmed ? 0.45 : 1)
    }
}

// MARK: - Segmented function keys (`.jb-seg--wide`)

/// Full-width pill row in a recessed well: the picked segment is a solid
/// ink key (dark-on-light by day, light-on-dark at night), the rest are
/// ink-2 labels. Used for Faders · Panels · Seq and System · Light · Dark.
struct JBSegmented<T: Hashable & Identifiable>: View {
    let options: [T]
    @Binding var selection: T
    let label: (T) -> String

    init(_ options: [T], selection: Binding<T>, label: @escaping (T) -> String) {
        self.options = options; self._selection = selection; self.label = label
    }

    var body: some View {
        HStack(spacing: 2) {
            ForEach(options) { m in
                let on = selection == m
                Button {
                    selection = m
                } label: {
                    Text(label(m))
                        .font(JBTheme.panelFont(13, weight: .semibold))
                        .tracking(1.3)
                        .textCase(.uppercase)
                        .frame(maxWidth: .infinity)
                        .frame(height: 32)
                        .background(on ? JBTheme.keyFill : .clear)
                        .foregroundStyle(on ? JBTheme.keyLabel : JBTheme.ink2)
                        .clipShape(Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(3)
        .background(
            Capsule().fill(JBTheme.panel3)
                .overlay(Capsule().stroke(Color.black.opacity(0.12), lineWidth: 1.5).blur(radius: 1.5).mask(Capsule()))
        )
    }
}

// MARK: - Sheet header (`.jb-sheet-head`)

/// Raised (panel-2) header with a bottom rule: title at the left in the
/// `jb-title` face, an optional LED + mono status beside it, an orange
/// DONE key at the right, and an optional second line (the function-key
/// row on the Controls sheet).
struct JBSheetHeader<Below: View>: View {
    let title: String
    var status: (lit: Bool, text: String)? = nil
    var doneLabel: String = "Done"
    var onDone: () -> Void
    @ViewBuilder var below: () -> Below

    init(_ title: String, status: (lit: Bool, text: String)? = nil, doneLabel: String = "Done",
         onDone: @escaping () -> Void, @ViewBuilder below: @escaping () -> Below = { EmptyView() }) {
        self.title = title; self.status = status; self.doneLabel = doneLabel; self.onDone = onDone; self.below = below
    }

    var body: some View {
        VStack(spacing: 10) {
            HStack(alignment: .center, spacing: 10) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(title)
                        .font(JBTheme.panelFont(22, weight: .semibold))
                        .tracking(0.4)
                        .textCase(.uppercase)
                        .foregroundStyle(JBTheme.ink)
                    if let status {
                        HStack(spacing: 6) {
                            JBLed(on: status.lit, color: status.lit ? JBTheme.orange : JBTheme.green, alwaysLit: true)
                            Text(status.text)
                                .font(JBTheme.monoFont(12))
                                .foregroundStyle(JBTheme.ink2)
                        }
                    }
                }
                Spacer(minLength: 8)
                Button(doneLabel, action: onDone)
                    .buttonStyle(JBKeyStyle(variant: .orange, size: .small))
                    .accessibilityIdentifier("sheetDone")
                    // Escape and ⌘W close the sheet too (Catalyst form sheets
                    // have no close box of their own).
                    .keyboardShortcut(.cancelAction)
                    .background { Button("", action: onDone).keyboardShortcut("w", modifiers: .command).opacity(0).accessibilityHidden(true) }
            }
            below()
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 12)
        .background(JBTheme.panel2)
        .overlay(alignment: .bottom) { Rectangle().fill(JBTheme.rule).frame(height: 1) }
    }
}

// MARK: - LED (`.jb-led`)

/// 8 pt LED: putty with an inset shadow when off; orange (or the given
/// colour) with the glow when on.
struct JBLed: View {
    var on: Bool
    var color: Color = JBTheme.orange
    var size: CGFloat = 8
    /// Paint `color` even when `on` is false (a green "live" status LED).
    var alwaysLit: Bool = false

    var body: some View {
        let lit = on || alwaysLit
        Circle()
            .fill(lit ? color : JBTheme.ledOff)
            .overlay(Circle().stroke(Color.black.opacity(lit ? 0 : 0.18), lineWidth: 0.5))
            .shadow(color: lit ? color.opacity(0.9) : .clear, radius: 3)
            .shadow(color: lit ? color.opacity(0.5) : .clear, radius: 7)
            .frame(width: size, height: size)
    }
}

// MARK: - Fader (`.jb-fader`)

/// Cobalt-cap fader: 5 pt ink-3 track with an inset shadow, 26 pt square
/// cap with a 2 pt paper border. 30 pt tall hit area, drag anywhere.
/// `t` is 0…1; `onInput` fires continuously while dragging.
struct JBFader: View {
    let t: Double
    let onInput: (Double) -> Void

    private static let cap: CGFloat = 26
    @State private var dragging = false

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let travel = max(1, w - Self.cap)
            let x = Self.cap / 2 + travel * CGFloat(max(0, min(1, t)))
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .fill(JBTheme.faderTrack)
                    .overlay(
                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                            .stroke(Color.black.opacity(0.3), lineWidth: 1)
                            .blur(radius: 1)
                            .mask(RoundedRectangle(cornerRadius: 3, style: .continuous))
                    )
                    .frame(height: 5)
                    .frame(maxHeight: .infinity)
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(LinearGradient(colors: [Color(hex: 0x4E78FF), JBTheme.cobalt], startPoint: .top, endPoint: .bottom))
                    .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(JBTheme.panel4, lineWidth: 2))
                    .shadow(color: .black.opacity(0.35), radius: 1.5, y: 2)
                    .frame(width: Self.cap, height: Self.cap)
                    .position(x: x, y: geo.size.height / 2)
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { g in
                        dragging = true
                        let nt = Double((g.location.x - Self.cap / 2) / travel)
                        onInput(max(0, min(1, nt)))
                    }
                    .onEnded { _ in dragging = false }
            )
        }
        .frame(height: 30)
        .accessibilityElement()
        .accessibilityValue("\(Int((t * 100).rounded())) percent")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: onInput(min(1, t + 0.05))
            case .decrement: onInput(max(0, t - 0.05))
            @unknown default: break
            }
        }
    }
}

// MARK: - M / S keys (`.jb-ms-key`)

/// 26 pt mute / solo squares on the light panel: paper face with a 1 pt
/// rule lip; orange (M) / green (S) when on.
struct JBMSKeys: View {
    let mute: Bool
    let solo: Bool
    let onMute: () -> Void
    let onSolo: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            key("M", on: mute, color: JBTheme.orange, lip: Color(hex: 0xB23A0F), action: onMute)
            key("S", on: solo, color: JBTheme.green, lip: Color(hex: 0x0A6A49), action: onSolo)
        }
    }

    private func key(_ label: String, on: Bool, color: Color, lip: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(JBTheme.panelFont(11, weight: .bold))
                .frame(width: 26, height: 26)
                .background {
                    let shape = RoundedRectangle(cornerRadius: 7, style: .continuous)
                    ZStack {
                        shape.fill(on ? lip : JBTheme.panelKeyLip).offset(y: 1)
                        shape.fill(on ? color : JBTheme.panel4)
                            .overlay(shape.stroke(on ? Color.white.opacity(0.2) : JBTheme.highlight, lineWidth: 1).padding(0.5)
                                .mask(LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .init(x: 0.5, y: 0.4))))
                    }
                }
                .foregroundStyle(on ? .white : JBTheme.ink3)
        }
        .buttonStyle(SeqPressStyle())
        .accessibilityLabel(label == "M" ? "Mute" : "Solo")
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

// MARK: - Tags (`.jb-tag`)

struct JBTag: View {
    enum Style { case green, ink, outline }
    let text: String
    var style: Style = .outline

    var body: some View {
        Text(text)
            .font(JBTheme.panelFont(10.5, weight: .semibold))
            .tracking(1.4)
            .textCase(.uppercase)
            .foregroundStyle(style == .outline ? JBTheme.ink3 : (style == .ink ? JBTheme.keyLabel : .white))
            .padding(.horizontal, 6)
            .padding(.vertical, 1)
            .background(style == .green ? JBTheme.green : (style == .ink ? JBTheme.keyFill : .clear))
            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 4, style: .continuous).stroke(style == .outline ? JBTheme.ink3 : .clear, lineWidth: 1))
    }
}

// MARK: - Cards (`.jb-card`)

struct JBCardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(JBTheme.panel2)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(JBTheme.rule, lineWidth: 1))
            .overlay(alignment: .top) {
                // inset 0 1px 0 #fff
                RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(JBTheme.highlight, lineWidth: 1).padding(1)
                    .mask(LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .init(x: 0.5, y: 0.08)))
            }
    }
}

extension View {
    func jbCard() -> some View { modifier(JBCardStyle()) }
}

#Preview("Keys") {
    VStack(alignment: .leading, spacing: 16) {
        JBWordmark(size: 22)
        JBWordmark(size: 40)
        HStack { Button("Send") {}.buttonStyle(JBKeyStyle(variant: .orange)); Button("Controls") {}.buttonStyle(JBKeyStyle(variant: .ink, size: .small)); Button("Bounce") {}.buttonStyle(JBKeyStyle(variant: .panel, size: .small)) }
        HStack { Button("Publish") {}.buttonStyle(JBKeyStyle(variant: .green, size: .xs)); Button("Share") {}.buttonStyle(JBKeyStyle(variant: .panel, size: .xs)); Button("Unpublish") {}.buttonStyle(JBKeyStyle(variant: .ghost, size: .xs)); Button("x") {}.buttonStyle(JBKeyStyle(variant: .orange)).disabled(true) }
        JBGroupRow("JT90 drums", subtitle: "kick · snare · clap") { JBMSKeys(mute: true, solo: false, onMute: {}, onSolo: {}) }
        JBFader(t: 0.4) { _ in }
        HStack { JBTag(text: "public", style: .green); JBTag(text: "remix") }
        JBSheetHeader("Controls", status: (false, "live"), onDone: {})
    }
    .padding(16)
    .background(JBTheme.panel)
}
