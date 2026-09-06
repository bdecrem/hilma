import SwiftUI

// Panels tab entry point — native port of `alt/panels.tsx`'s `AltPanels`:
// one accordion, one section open at a time (remembered in
// UserDefaults "jam.panelsOpen"), first active instrument open by default.
//
// Public API (see DESIGN.md "Panels" row / PROGRESS.md box 6):
//
//   PanelsView(desc: SessionDescription, hits: [String: [String]],
//              onParam: PanelOnParam, onMix: PanelOnMix)
//
// `effects` is additive and defaults to `[]` — see the integration note:
// `SessionDescription` has no `effects` field yet, so no EffectPanel shows
// up until that lands; the view and EffectPanel are ready for it.
struct PanelsView: View {
    let desc: SessionDescription?
    var hits: [String: [String]] = [:]
    var effects: [PanelEffectTarget] = []
    /// `true` (default): the view is its own ScrollView. `false`: a plain
    /// stack for embedding under other content inside the caller's
    /// ScrollView (the Controls sheet puts the Track card above it).
    var scrolls: Bool = true
    let onParam: PanelOnParam
    let onMix: PanelOnMix

    private enum Picked: Equatable { case none, closed, id(String) }
    @State private var picked: Picked = .none
    @AppStorage("jam.panelsOpen") private var storedOpen: String = ""

    private var items: [PanelItem] {
        guard let desc else { return [] }
        var out: [PanelItem] = []
        for inst in desc.instruments {
            let type = inst.type.isEmpty ? inst.id : inst.type
            guard inst.active, let skin = PanelSkin(instrumentType: type) else { continue }
            out.append(PanelItem(
                id: inst.id, skin: skin, name: skin.label,
                sub: inst.id == type ? nil : inst.id,
                summary: PanelParams.instrumentSummary(inst),
                isInstrument: true,
                body: AnyView(instrumentBody(inst, type: type))
            ))
        }
        for fx in effects {
            for c in fx.chain {
                guard !c.descriptors.isEmpty else { continue }
                let id = "fx.\(fx.target).\(c.id)"
                out.append(PanelItem(
                    id: id, skin: .fx, name: c.type.uppercased(), sub: "on \(fx.target)",
                    summary: PanelParams.effectSummary(type: c.type, params: c.params, descriptors: c.descriptors),
                    isInstrument: false,
                    body: AnyView(EffectPanel(target: fx.target, fxId: c.id, type: c.type, params: c.params, descriptors: c.descriptors, onParam: onParam))
                ))
            }
        }
        return out
    }

    @ViewBuilder
    private func instrumentBody(_ inst: InstrumentDescription, type: String) -> some View {
        switch type {
        case "jb202": JB202Panel(inst: inst, onParam: onParam)
        case "jt30": JT30Panel(inst: inst, onParam: onParam)
        case "jt10": JT10Panel(inst: inst, onParam: onParam)
        case "jt90": JT90Panel(inst: inst, onParam: onParam, hitVoices: hits[inst.id] ?? [])
        case "jb01": JB01Panel(inst: inst, onParam: onParam, hitVoices: hits[inst.id] ?? [])
        default: EmptyView()
        }
    }

    /// Debug sentinel `PanelsPreviewHost` writes to the same UserDefaults
    /// key to screenshot every section collapsed (otherwise unreachable
    /// without a tap — the accordion always opens the first item by
    /// default, same as the web).
    private static let closedSentinel = "__closed__"

    private func resolveOpen(_ ids: [String]) -> String? {
        switch picked {
        case .closed: return nil
        case .id(let x) where ids.contains(x): return x
        default: break
        }
        if storedOpen == Self.closedSentinel { return nil }
        if !storedOpen.isEmpty, ids.contains(storedOpen) { return storedOpen }
        return ids.first
    }

    private func toggle(_ id: String, currentOpen: String?) {
        if currentOpen == id {
            picked = .closed
        } else {
            picked = .id(id)
            storedOpen = id
        }
    }

    var body: some View {
        let list = items
        let ids = list.map(\.id)
        let open = resolveOpen(ids)
        Group {
            if scrolls {
                ScrollViewReader { proxy in
                    ScrollView {
                        stack(list, open: open).padding(16)
                    }
                    .onChange(of: open) { _, newValue in
                        if case .id = picked, let newValue { withAnimation { proxy.scrollTo(newValue, anchor: .top) } }
                    }
                }
                .background(JBTheme.panel)
            } else {
                stack(list, open: open)
            }
        }
    }

    @ViewBuilder
    private func stack(_ list: [PanelItem], open: String?) -> some View {
        LazyVStack(spacing: 10) {
            if list.isEmpty {
                Text("Nothing to tweak yet. Ask for a beat first.")
                    .font(JBTheme.bodyFont(15))
                    .foregroundStyle(JBTheme.ink3)
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
                    .padding(.top, 40)
            }
            ForEach(list) { item in
                let mute = desc?.tracks?[item.id]?.mute ?? false
                let solo = desc?.tracks?[item.id]?.solo ?? false
                PanelShellView(
                    skin: item.skin, name: item.name, sub: item.sub, summary: item.summary,
                    hit: PanelParams.isHit(item.id, hits: hits), open: open == item.id,
                    silenced: item.isInstrument && PanelParams.isSilenced(item.id, tracks: desc?.tracks, anySolo: desc?.anySolo),
                    showMS: item.isInstrument, mute: mute, solo: solo,
                    onToggle: { toggle(item.id, currentOpen: open) },
                    onMute: { onMix(item.id, "mute", !mute) },
                    onSolo: { onMix(item.id, "solo", !solo) },
                    body_: { item.body }
                )
                .id(item.id)
            }
        }
    }
}

extension PanelEffectTarget {
    /// The Panels tab's effect model from the engine description.
    static func from(_ effects: [EffectTargetDescription]?) -> [PanelEffectTarget] {
        (effects ?? []).map { fx in
            PanelEffectTarget(target: fx.target, chain: fx.chain.map {
                PanelEffectChain(id: $0.id, type: $0.type, params: $0.params, descriptors: $0.descriptors)
            })
        }
    }
}

private struct PanelItem: Identifiable {
    let id: String
    let skin: PanelSkin
    let name: String
    let sub: String?
    let summary: String
    let isInstrument: Bool
    let body: AnyView
}
