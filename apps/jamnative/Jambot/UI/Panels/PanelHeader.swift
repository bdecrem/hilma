import SwiftUI

/// A small glowing dot that snaps bright on a hit and eases back down —
/// port of the `.jam-panel-led` / `.hit` CSS transition (0.03s in,
/// 0.18s ease-out). Shared by the accordion header LED and the JT-90/JB01
/// per-voice LEDs.
struct HitLed: View {
    var hit: Bool
    var color: Color
    var size: CGFloat = 8
    var dim: Bool = false

    @State private var lit = false

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .opacity(dim ? 0.35 : 1)
            .scaleEffect(lit ? 1.6 : 1)
            .shadow(color: color.opacity(lit ? 0.9 : 0.55), radius: lit ? 8 : 5)
            .shadow(color: .white.opacity(lit ? 0.8 : 0), radius: lit ? 3 : 0)
            .onChange(of: hit) { _, isHit in
                guard isHit else { return }
                withAnimation(.linear(duration: 0.03)) { lit = true }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) {
                    withAnimation(.easeOut(duration: 0.18)) { lit = false }
                }
            }
    }
}

/// Accordion header row: LED, name (+ optional sub id), a right-aligned
/// mono summary readout, chevron, M/S keys sharing the bar. Port of
/// `PanelShell` in `alt/panels.tsx` + `.jam-panel-bar`/`.jam-panel-head`.
struct PanelHeaderBar: View {
    let skin: PanelSkin
    let name: String
    var sub: String? = nil
    let summary: String
    let hit: Bool
    let open: Bool
    let silenced: Bool
    let showMS: Bool
    let mute: Bool
    let solo: Bool
    let onToggle: () -> Void
    let onMute: () -> Void
    let onSolo: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            Button(action: onToggle) {
                HStack(spacing: 10) {
                    HitLed(hit: hit, color: skin.accent, dim: silenced)
                    HStack(spacing: 8) {
                        Text(name)
                            .font(.system(size: 15, weight: .bold))
                            .tracking(1.5)
                            .foregroundStyle(skin.accent)
                            .opacity(silenced ? 0.45 : 1)
                        if let sub {
                            Text(sub)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(skin.dim)
                                .opacity(silenced ? 0.45 : 1)
                        }
                    }
                    .lineLimit(1)
                    Spacer(minLength: 8)
                    Text(summary)
                        .font(JBTheme.monoFont(11))
                        .foregroundStyle(skin.dim)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    chevron
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 52)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if showMS {
                HStack(spacing: 4) {
                    msKey("M", on: mute, color: JBTheme.orange, action: onMute)
                    msKey("S", on: solo, color: JBTheme.green, action: onSolo)
                }
                .padding(.trailing, 12)
            }
        }
        .background(skin.bg)
        .overlay(alignment: .bottom) {
            if open { Rectangle().fill(skin.rule).frame(height: 1) }
        }
    }

    private var chevron: some View {
        Image(systemName: "chevron.down")
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(skin.dim)
            .rotationEffect(.degrees(open ? 180 : 0))
            .animation(.easeOut(duration: 0.15), value: open)
    }

    private func msKey(_ label: String, on: Bool, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 11, weight: .bold))
                .frame(width: 24, height: 24)
                .background(on ? color : Color.white.opacity(0.07))
                .foregroundStyle(on ? .white : skin.dim)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(Color.white.opacity(on ? 0 : 0.12), lineWidth: 1))
                .shadow(color: on ? color.opacity(0.6) : .clear, radius: on ? 6 : 0)
        }
        .buttonStyle(.plain)
    }
}

/// The full collapsible section: header bar + body when open.
struct PanelShellView<Body: View>: View {
    let skin: PanelSkin
    let name: String
    var sub: String? = nil
    let summary: String
    let hit: Bool
    let open: Bool
    let silenced: Bool
    let showMS: Bool
    let mute: Bool
    let solo: Bool
    let onToggle: () -> Void
    let onMute: () -> Void
    let onSolo: () -> Void
    @ViewBuilder var body_: () -> Body

    var body: some View {
        VStack(spacing: 0) {
            PanelHeaderBar(skin: skin, name: name, sub: sub, summary: summary, hit: hit, open: open, silenced: silenced,
                           showMS: showMS, mute: mute, solo: solo, onToggle: onToggle, onMute: onMute, onSolo: onSolo)
            if open {
                body_()
                    .padding(12)
                    .background(skin.bg)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(JBTheme.panelEdge, lineWidth: 1))
        .shadow(color: .black.opacity(0.18), radius: 2, y: 1)
    }
}
