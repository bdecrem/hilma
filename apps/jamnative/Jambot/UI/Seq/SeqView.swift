import SwiftUI

/// SEQ — the native step sequencer for the Controls sheet. Port of
/// `src/app/jam/seq/Sequencer.tsx` + `seq.css` (desk-instrument look: rubber
/// pads on the enamel panel, orange = lit LED).
///
/// The caller (Controls sheet / Studio) owns the picked instrument and
/// section (remembered per track) and hears about edits through
/// `onEdited(noteKey, noteText)` — the coalesced `[controls]` note to store
/// under `noteKey` (latest text wins) — plus `onScope` for the audition
/// scope (`.section(i)` while "Loop section" is lit, `.song` otherwise and
/// when the view goes away). Edits already landed in the engine when
/// `onEdited` fires: re-render (≈300 ms debounce), autosave.
///
/// Geometry (iPhone portrait 390, 16 pt side padding by the sheet → 358):
///   grid = 52 label + 8 × 4 gaps + 8 pads → pads (358 − 52 − 32) / 8 ≈ 34 wide
///   drum pads 38 tall, mono pads 48 tall, gaps 4; 16 pads per page when
///   the horizontal size class is regular (iPad, wide Catalyst window).
struct SeqView: View {
    let engine: EngineAPI
    let desc: SessionDescription
    /// Absolute 16th index of the playing render (nil when stopped).
    let playStep16: Int?
    /// Scope of the render that is currently playing.
    let playScope: RenderScope
    @Binding var instId: String?
    @Binding var section: Int?
    /// nil → 16 steps per page on regular-width layouts, 8 otherwise.
    var wide: Bool? = nil
    /// Shared note coalescer (reset it when a message is sent); nil → one per view.
    var notes: SeqNoteCoalescer? = nil
    /// A caller-owned model (the -seqPreview harness drives one); nil → the view's own.
    var externalModel: SeqModel? = nil
    let onEdited: (_ noteKey: String, _ noteText: String) -> Void
    let onScope: (RenderScope) -> Void
    /// Fresh description after each edit (loop-mode resize can raise bars).
    var onDesc: ((SessionDescription) -> Void)? = nil

    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var ownModel = SeqModel()
    @State private var defaultSection: Int? = nil

    private var model: SeqModel { externalModel ?? ownModel }

    // MARK: Derived

    private struct Option: Identifiable, Equatable {
        let id: String
        let type: String
        let kind: SeqMath.Kind
        let label: String
        let used: Bool
    }

    private var arr: [ArrangementEntry] { desc.arrangement }
    private var inSong: Bool { !arr.isEmpty }

    private var options: [Option] {
        var list: [Option] = []
        for inst in desc.instruments {
            let type = inst.type.isEmpty ? inst.id : inst.type
            guard let kind = SeqMath.kind(of: type) else { continue }
            let base = SeqMath.instrumentNames[type] ?? type
            let used = inst.active || arr.contains { $0.patterns[inst.id] != nil }
            let name = inst.id == type ? base : "\(base) · \(inst.id)"
            list.append(Option(id: inst.id, type: type, kind: kind, label: used ? name : "\(name) (empty)", used: used))
        }
        return list.filter(\.used) + list.filter { !$0.used }
    }

    private var picked: Option? {
        let o = options
        return o.first { $0.id == instId }
            ?? o.first { $0.used && $0.kind == .drums }
            ?? o.first { $0.used }
            ?? o.first
    }

    private var secIdx: Int? {
        guard inSong else { return nil }
        return max(0, min(arr.count - 1, section ?? defaultSection ?? 0))
    }

    private var per: Int { (wide ?? (sizeClass == .regular)) ? 16 : SeqMath.page }
    private var targetKey: String { "\(picked?.id ?? "-")|\(secIdx.map(String.init) ?? "loop")" }

    private var playingSec: Int? { inSong ? SeqMath.playingSection(arr, scope: playScope, playStep16: playStep16) : nil }
    private var onBeat: Bool { (playStep16 ?? 1) % 4 == 0 }

    /// Local step of the playhead inside the shown pattern, if it is the one playing.
    private var playStep: Int? {
        guard let s = playStep16, model.length > 0, !model.silent else { return nil }
        let len = model.length
        guard inSong, let secIdx else { return ((s % len) + len) % len }
        switch playScope {
        case .section(let index):
            return index == secIdx ? s % len : nil
        case .song:
            guard SeqMath.sectionAtBar(arr, bar: s / 16) == secIdx else { return nil }
            return (s - SeqMath.sectionStarts(arr)[secIdx] * 16) % len
        }
    }

    // MARK: Body

    var body: some View {
        Group {
            if options.isEmpty {
                Text("No sequencer-ready instruments in this session yet. Ask for a beat first.")
                    .font(JBTheme.bodyFont(15))
                    .foregroundStyle(JBTheme.ink3)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 32)
            } else {
                content
            }
        }
        .onAppear {
            model.configure(engine: engine, notes: notes)
            model.onEdited = onEdited
            model.onDesc = onDesc
            if defaultSection == nil { defaultSection = initialSection() }
            model.loopSection = true
            retarget()
            emitScope()
        }
        .onDisappear { onScope(.song) }
        .onChange(of: targetKey) { _, _ in retarget(); emitScope() }
        .onChange(of: model.loopSection) { _, _ in emitScope() }
        .onChange(of: desc) { _, _ in model.reload() }
    }

    private func initialSection() -> Int {
        guard inSong else { return 0 }
        if case .section(let index) = playScope { return min(index, arr.count - 1) }
        if let s = playStep16 { return SeqMath.sectionAtBar(arr, bar: s / 16) ?? 0 }
        return 0
    }

    private func retarget() {
        model.target(inst: picked?.id, section: secIdx)
    }

    private func emitScope() {
        if inSong, model.loopSection, let secIdx { onScope(.section(index: secIdx)) } else { onScope(.song) }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 0) {
            eyebrowRule("Instrument").padding(.top, 16)
            instrumentPicker.padding(.top, 8)

            if inSong { sectionBlock }

            overview.padding(.top, 14)
            pageNav.padding(.top, 6)
            grid.padding(.top, 10)

            if model.kind == .mono, let step = model.selStep, !model.silent {
                editor(step).padding(.top, 12)
            }

            footer.padding(.top, 16)
        }
        .animation(.easeOut(duration: 0.12), value: model.armed)
    }

    // MARK: a. instrument picker

    private var instrumentPicker: some View {
        Menu {
            Picker("Instrument", selection: Binding(get: { picked?.id ?? "" }, set: { pick($0) })) {
                ForEach(options) { o in Text(o.label).tag(o.id) }
            }
        } label: {
            HStack(spacing: 8) {
                Text((picked?.label ?? "—").uppercased())
                    .font(JBTheme.panelFont(15, weight: .semibold))
                    .tracking(1.5)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text("▾")
                    .font(.system(size: 15))
                    .foregroundStyle(JBTheme.ink2)
            }
            .foregroundStyle(JBTheme.ink)
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity)
            .frame(height: 44)
            .background(SeqRubber(face: JBTheme.panel4, lip: JBTheme.rule, radius: 11))
        }
        .accessibilityLabel("Instrument")
    }

    private func pick(_ id: String) {
        guard id != picked?.id else { return }
        instId = id
    }

    // MARK: b. section row

    private var sectionBlock: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                eyebrow("Section")
                Rectangle().fill(JBTheme.rule).frame(height: 1)
                Button { model.loopSection.toggle() } label: {
                    HStack(spacing: 8) {
                        SeqLed(on: model.loopSection).padding(.trailing, 2)
                        Text("Loop section")
                    }
                }
                .buttonStyle(SeqKeyStyle(.panel, height: 34, fontSize: 12, radius: 9, tracking: 1.4, hPad: 12))
                .accessibilityAddTraits(model.loopSection ? .isSelected : [])
            }
            .padding(.top, 18)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Array(arr.enumerated()), id: \.offset) { i, s in
                        sectionPill(i, s)
                    }
                }
                .padding(.vertical, 2)
            }
            .padding(.top, 8)

            caption.padding(.top, 6)
        }
    }

    private func sectionPill(_ i: Int, _ s: ArrangementEntry) -> some View {
        let on = i == secIdx
        let playsHere = picked.map { s.patterns[$0.id] != nil } ?? true
        let playing = i == playingSec
        return Button { pickSection(i) } label: {
            ZStack(alignment: .topTrailing) {
                VStack(spacing: 2) {
                    Text("\(i + 1)")
                        .font(JBTheme.panelFont(17, weight: .semibold))
                        .foregroundStyle(on ? JBTheme.panel2 : JBTheme.ink)
                        .opacity(playsHere ? 1 : 0.45)
                    Text("\(s.bars) \(s.bars == 1 ? "bar" : "bars")")
                        .font(JBTheme.monoFont(10, weight: .regular))
                        .foregroundStyle(on ? JBTheme.ledOff : JBTheme.ink3)
                }
                .frame(minWidth: 58 - 20)
                .padding(.horizontal, 10)
                .frame(height: 46)
                SeqLed(on: playing, size: 6)
                    .scaleEffect(playing && onBeat ? 1.6 : 1)
                    .animation(.easeOut(duration: playing && onBeat ? 0.03 : 0.18), value: onBeat)
                    .padding(6)
            }
            .background(SeqRubber(face: on ? JBTheme.ink : JBTheme.panel4, lip: on ? .black : JBTheme.rule, radius: 10))
        }
        .buttonStyle(SeqPressStyle())
        .accessibilityLabel("Section \(i + 1), \(s.bars) bars")
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func pickSection(_ i: Int) {
        section = i
    }

    @ViewBuilder
    private var caption: some View {
        let name = model.pattern?.name
        Group {
            if let p = model.pattern, let name, !p.missing, let id = picked?.id {
                let used = SeqMath.sectionsUsing(arr, inst: id, name: name)
                Text("pattern ").foregroundColor(JBTheme.ink2)
                    + Text(name).fontWeight(.medium).foregroundColor(JBTheme.ink)
                    + Text(" · used in \(used.count == 1 ? "section" : "sections") \(used.map(String.init).joined(separator: ", "))").foregroundColor(JBTheme.ink2)
            } else if let p = model.pattern, p.missing, let name {
                Text("pattern \(name) is referenced here but not saved").foregroundColor(JBTheme.orange)
            } else if let err = model.loadError {
                Text(err).foregroundColor(JBTheme.orange)
            } else if let secIdx {
                Text("not playing in section ").foregroundColor(JBTheme.ink2)
                    + Text("\(secIdx + 1)").fontWeight(.medium).foregroundColor(JBTheme.ink)
            }
        }
        .font(JBTheme.monoFont(12, weight: .regular))
        .frame(minHeight: 16, alignment: .leading)
        if model.silent, model.loadError == nil {
            Text("pick another section, or ask in chat to add it here")
                .font(JBTheme.bodyFont(13))
                .foregroundStyle(JBTheme.ink3)
                .padding(.top, 4)
        }
    }

    // MARK: c. overview strip

    private var overview: some View {
        let len = model.length
        let hits = model.pattern.map(SeqMath.hitRow) ?? Array(repeating: false, count: len)
        let barCount = max(1, Int((Double(len) / 16).rounded(.up)))
        let ps = playStep
        return HStack(spacing: 8) {
            ForEach(0..<barCount, id: \.self) { b in
                let pagesInBar = max(1, Int((Double(min(16, len - b * 16)) / Double(per)).rounded(.up)))
                HStack(spacing: 3) {
                    ForEach(0..<pagesInBar, id: \.self) { pg in
                        let p = (b * 16) / per + pg
                        Button { model.setPage(p, per: per) } label: {
                            HStack(spacing: 2) {
                                ForEach(0..<min(per, len - p * per), id: \.self) { k in
                                    let i = p * per + k
                                    let hit = i < hits.count && hits[i]
                                    RoundedRectangle(cornerRadius: 1)
                                        .fill(hit ? JBTheme.orange : JBTheme.ledOff)
                                        .opacity(hit || ps == i ? 1 : 0.6)
                                        .frame(height: 4)
                                        .overlay(ps == i ? RoundedRectangle(cornerRadius: 1).stroke(JBTheme.ink, lineWidth: 1.5) : nil)
                                }
                            }
                            .padding(.vertical, 8)
                            .padding(.horizontal, 2)
                            .overlay(p == model.page ? RoundedRectangle(cornerRadius: 3).stroke(JBTheme.ink, lineWidth: 1.5).padding(.vertical, 4) : nil)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Go to steps \(p * per + 1)–\(min(len, (p + 1) * per))")
                    }
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    // MARK: d. page nav

    private var pageNav: some View {
        let pages = model.pages(per: per)
        return HStack(spacing: 10) {
            Button("‹") { model.setPage(model.page - 1, per: per) }
                .buttonStyle(SeqKeyStyle(.panel, height: 44, width: 56, fontSize: 22, radius: 11, tracking: 0, hPad: 0))
                .disabled(pages < 2)
                .accessibilityLabel("Previous steps")
            Text(SeqMath.pageLabel(page: model.page, length: model.length, per: per))
                .font(JBTheme.monoFont(12, weight: .regular))
                .tracking(0.7)
                .foregroundStyle(JBTheme.ink2)
                .frame(maxWidth: .infinity)
            Button("›") { model.setPage(model.page + 1, per: per) }
                .buttonStyle(SeqKeyStyle(.panel, height: 44, width: 56, fontSize: 22, radius: 11, tracking: 0, hPad: 0))
                .disabled(pages < 2)
                .accessibilityLabel("Next steps")
        }
    }

    // MARK: e. grid

    private var cols: [Int] {
        let first = model.page * per
        return (first..<min(model.length, first + per)).map { $0 }
    }

    private var grid: some View {
        let cols = self.cols
        let ps = playStep
        let silent = model.silent
        return VStack(spacing: 4) {
            HStack(spacing: 4) {
                Color.clear.frame(width: 52, height: 18)
                ForEach(cols, id: \.self) { i in
                    Text("\(i % 16 + 1)")
                        .font(JBTheme.monoFont(11, weight: ps == i ? .medium : .regular))
                        .foregroundStyle(ps == i ? JBTheme.orange : JBTheme.ink3)
                        .frame(maxWidth: .infinity)
                        .frame(height: 18)
                }
            }
            if let drums = model.pattern?.drums {
                ForEach(model.voices, id: \.self) { voice in
                    let row = drums[voice] ?? []
                    let has = row.contains { $0.isOn }
                    HStack(spacing: 4) {
                        rowLabel(SeqMath.shortLabel(voice), muted: !has)
                        ForEach(cols, id: \.self) { i in
                            let s = i < row.count ? row[i] : .off
                            SeqPad(state: !s.isOn ? .off : s.accent ? .accent : .hit, beat: i % 4 == 0, now: ps == i, selected: false, height: 38)
                                .onTapGesture { model.tapDrum(voice: voice, i: i) }
                                .accessibilityLabel("\(voice) step \(i + 1): \(!s.isOn ? "off" : s.accent ? "accent" : "hit")")
                        }
                    }
                }
            } else if let mono = model.pattern?.mono {
                HStack(spacing: 4) {
                    rowLabel(model.type.uppercased(), muted: false)
                    ForEach(cols, id: \.self) { i in
                        let s = i < mono.count ? mono[i] : MonoStep(note: "C2", gate: false, accent: false, slide: false)
                        SeqPad(state: !s.gate ? .off : s.accent ? .accent : .hit, beat: i % 4 == 0, now: ps == i, selected: model.sel == i, height: 48,
                               note: s.gate ? s.note : nil, slide: s.gate && s.slide, pitch: s.gate ? SeqMath.pitchFrac(s.note, type: model.type) : nil)
                            .onTapGesture { model.tapMono(i) }
                            .accessibilityLabel("Step \(i + 1) \(s.gate ? s.note : "off")")
                    }
                }
            } else {
                // Loading / silent: placeholder rows keep the layout stable.
                ForEach(0..<(model.kind == .mono ? 1 : model.voices.count), id: \.self) { r in
                    HStack(spacing: 4) {
                        rowLabel(model.kind == .mono ? model.type.uppercased() : SeqMath.shortLabel(model.voices[r]), muted: true)
                        ForEach(cols, id: \.self) { i in
                            SeqPad(state: .off, beat: i % 4 == 0, now: false, selected: false, height: model.kind == .mono ? 48 : 38)
                        }
                    }
                }
            }
        }
        .opacity(silent ? 0.35 : 1)
        .allowsHitTesting(!silent)
        .contentShape(Rectangle())
        .simultaneousGesture(
            DragGesture(minimumDistance: 30, coordinateSpace: .local)
                .onEnded { v in
                    let dx = v.translation.width, dy = v.translation.height
                    guard abs(dx) >= 40, abs(dy) < 40 else { return }
                    model.setPage(model.page + (dx < 0 ? 1 : -1), per: per)
                }
        )
    }

    private func rowLabel(_ text: String, muted: Bool) -> some View {
        Text(text)
            .font(JBTheme.panelFont(13, weight: .semibold))
            .tracking(1.5)
            .foregroundStyle(muted ? JBTheme.ink3.opacity(0.55) : JBTheme.ink2)
            .lineLimit(1)
            .padding(.leading, 2)
            .frame(width: 52, alignment: .leading)
    }

    // MARK: mono step editor

    private func editor(_ step: MonoStep) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                eyebrow("Step \(model.sel + 1)", color: JBTheme.ink2)
                Spacer()
                HStack(spacing: 6) {
                    Button("‹") { model.setSel(model.sel - 1, per: per) }
                        .buttonStyle(SeqKeyStyle(.panel, height: 40, width: 48, fontSize: 20, radius: 11, tracking: 0, hPad: 0))
                        .accessibilityLabel("Previous step")
                    Button("›") { model.setSel(model.sel + 1, per: per) }
                        .buttonStyle(SeqKeyStyle(.panel, height: 40, width: 48, fontSize: 20, radius: 11, tracking: 0, hPad: 0))
                        .accessibilityLabel("Next step")
                }
            }
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(step.note)
                    .font(JBTheme.panelFont(34, weight: .bold))
                    .tracking(0.7)
                    .foregroundStyle(step.gate ? JBTheme.ink : JBTheme.ink3)
                    .frame(minWidth: 64, alignment: .leading)
                Group {
                    if step.gate {
                        Text("on").fontWeight(.medium).foregroundColor(JBTheme.ink)
                            + Text(step.accent ? " · accent" : "").foregroundColor(JBTheme.ink2)
                            + Text(step.slide ? " · slide" : "").foregroundColor(JBTheme.ink2)
                    } else {
                        Text("off").foregroundColor(JBTheme.ink3)
                    }
                }
                .font(JBTheme.monoFont(12, weight: .regular))
            }
            .padding(.top, 6)
            HStack(spacing: 6) {
                editorKey("−oct") { model.shift(-12) }
                editorKey("−1") { model.shift(-1) }
                editorKey("+1") { model.shift(1) }
                editorKey("+oct") { model.shift(12) }
            }
            .padding(.top, 12)
            HStack(spacing: 6) {
                Button { model.toggleAccent() } label: { HStack(spacing: 8) { SeqLed(on: step.accent).padding(.trailing, 2); Text("acc") } }
                    .buttonStyle(SeqKeyStyle(.panel, height: 44, fontSize: 13, radius: 11, tracking: 1, hPad: 4, fill: true))
                Button { model.toggleSlide() } label: { HStack(spacing: 8) { SeqLed(on: step.slide).padding(.trailing, 2); Text("slide") } }
                    .buttonStyle(SeqKeyStyle(.panel, height: 44, fontSize: 13, radius: 11, tracking: 1, hPad: 4, fill: true))
                Button("off") { model.gateOff() }
                    .buttonStyle(SeqKeyStyle(.ghost, height: 44, fontSize: 13, radius: 11, tracking: 1, hPad: 4, fill: true))
                    .disabled(!step.gate)
            }
            .padding(.top, 6)
        }
        .padding(EdgeInsets(top: 12, leading: 12, bottom: 14, trailing: 12))
        .background(JBTheme.panel2)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(JBTheme.rule, lineWidth: 1))
    }

    private func editorKey(_ label: String, action: @escaping () -> Void) -> some View {
        Button(label, action: action)
            .buttonStyle(SeqKeyStyle(.panel, height: 44, fontSize: 13, radius: 11, tracking: 1, hPad: 4, fill: true))
    }

    // MARK: f. footer

    private var footer: some View {
        HStack(spacing: 8) {
            eyebrow("Length")
            ForEach([1, 2, 4], id: \.self) { b in
                Button("\(b)") { model.setLength(b) }
                    .buttonStyle(SeqKeyStyle(model.bars == b ? .ink : .panel, height: 28, fontSize: 11, radius: 8, tracking: 1.1, hPad: 10, minWidth: 36))
                    .disabled(model.silent)
                    .accessibilityAddTraits(model.bars == b ? .isSelected : [])
            }
            Spacer()
            Button(model.armed ? "clear?" : "clear") { model.clear() }
                .buttonStyle(SeqKeyStyle(.ghost, height: 28, fontSize: 11, radius: 8, tracking: 1.1, hPad: 10, minWidth: 36, armed: model.armed))
                .disabled(model.silent)
        }
    }

    // MARK: bits

    private func eyebrow(_ text: String, color: Color = JBTheme.ink3) -> some View {
        Text(text.uppercased())
            .font(JBTheme.panelFont(12, weight: .semibold))
            .tracking(2.2)
            .foregroundStyle(color)
            .lineLimit(1)
            .fixedSize()
    }

    private func eyebrowRule(_ text: String) -> some View {
        HStack(spacing: 10) {
            eyebrow(text)
            Rectangle().fill(JBTheme.rule).frame(height: 1)
        }
    }
}

// MARK: - Pieces

/// One step pad. Drum pads are 38 tall; mono pads 48 with the note, a "~"
/// for slide and the pitch bar along the bottom.
struct SeqPad: View {
    enum State { case off, hit, accent }
    let state: State
    let beat: Bool
    let now: Bool
    let selected: Bool
    let height: CGFloat
    var note: String? = nil
    var slide: Bool = false
    var pitch: Double? = nil

    /// color-mix(panel-3 86%, ink) — the shaded beat columns.
    private static let beatFace = Color(hex: 0xB5B9B2)

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .topTrailing) {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(state == .off ? (beat ? Self.beatFace : JBTheme.panel3) : JBTheme.orange)
                    .overlay(
                        // Recessed well when off, a lit top edge when on.
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .stroke(state == .off ? Color.black.opacity(0.10) : Color.white.opacity(0.35), lineWidth: 1)
                            .padding(0.5)
                            .mask(LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .center))
                    )
                if state == .accent {
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .strokeBorder(JBTheme.ink, lineWidth: 2)
                    Circle().fill(JBTheme.ink).frame(width: 5, height: 5).padding(5)
                }
                if let note {
                    Text(note)
                        .font(JBTheme.monoFont(12, weight: .medium))
                        .foregroundStyle(JBTheme.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .offset(y: -2)
                }
                if slide {
                    Text("~")
                        .font(JBTheme.monoFont(11, weight: .regular))
                        .foregroundStyle(JBTheme.ink)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                        .padding(EdgeInsets(top: 3, leading: 5, bottom: 0, trailing: 0))
                }
                if let pitch {
                    RoundedRectangle(cornerRadius: 1)
                        .fill(JBTheme.ink)
                        .frame(width: max(2, (geo.size.width - 8) * pitch), height: 2)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                        .padding(4)
                }
            }
            .overlay {
                if selected {
                    RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(JBTheme.cobalt, lineWidth: 2).padding(-1)
                    if now { RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(JBTheme.panel4, lineWidth: 1.5).padding(-2.75) }
                } else if now {
                    RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(JBTheme.ink, lineWidth: 1.5).padding(-0.75)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .contentShape(Rectangle())
        .animation(.easeOut(duration: 0.06), value: state)
    }
}

/// 8 pt LED: putty when off, 909 orange with a glow when lit.
struct SeqLed: View {
    let on: Bool
    var size: CGFloat = 8

    var body: some View {
        Circle()
            .fill(on ? JBTheme.orange : JBTheme.ledOff)
            .overlay(Circle().stroke(Color.black.opacity(on ? 0 : 0.18), lineWidth: 0.5))
            .shadow(color: on ? JBTheme.orange : .clear, radius: 3)
            .shadow(color: on ? JBTheme.orange.opacity(0.5) : .clear, radius: 7)
            .frame(width: size, height: size)
    }
}

/// A rubber key face with its 2 pt lip below (the CSS `box-shadow: 0 2px 0`).
struct SeqRubber: View {
    let face: Color
    let lip: Color
    let radius: CGFloat
    var pressed: Bool = false

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: radius, style: .continuous).fill(lip).offset(y: pressed ? 0 : 2)
            RoundedRectangle(cornerRadius: radius, style: .continuous).fill(face)
                .overlay(
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .stroke(Color.white.opacity(face == JBTheme.ink ? 0.12 : 1), lineWidth: 1)
                        .padding(0.5)
                        .mask(LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .init(x: 0.5, y: 0.25)))
                )
        }
    }
}

/// Rubber key styles used by the sequencer (`.jb-key`, `--panel`, `--ghost`
/// and the xs / nav / editor size overrides in seq.css).
struct SeqKeyStyle: ButtonStyle {
    enum Variant { case ink, panel, ghost }
    let variant: Variant
    let height: CGFloat
    var width: CGFloat? = nil
    let fontSize: CGFloat
    let radius: CGFloat
    let tracking: CGFloat
    let hPad: CGFloat
    var minWidth: CGFloat? = nil
    /// Expand to fill the row (the 4- and 3-key editor rows).
    var fill: Bool = false
    /// CLEAR after the first tap: orange text + orange ring.
    var armed: Bool = false

    @Environment(\.isEnabled) private var isEnabled

    init(_ variant: Variant, height: CGFloat, width: CGFloat? = nil, fontSize: CGFloat, radius: CGFloat, tracking: CGFloat, hPad: CGFloat, minWidth: CGFloat? = nil, fill: Bool = false, armed: Bool = false) {
        self.variant = variant; self.height = height; self.width = width; self.fontSize = fontSize
        self.radius = radius; self.tracking = tracking; self.hPad = hPad; self.minWidth = minWidth; self.fill = fill; self.armed = armed
    }

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        configuration.label
            .font(JBTheme.panelFont(fontSize, weight: .semibold))
            .tracking(tracking)
            .textCase(.uppercase)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .padding(.horizontal, hPad)
            .frame(minWidth: minWidth)
            .frame(width: width, height: height)
            .frame(maxWidth: fill ? .infinity : nil)
            .background {
                switch variant {
                case .ink: SeqRubber(face: JBTheme.ink, lip: .black, radius: radius, pressed: pressed)
                case .panel: SeqRubber(face: JBTheme.panel4, lip: JBTheme.rule, radius: radius, pressed: pressed)
                case .ghost: RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(armed ? JBTheme.orange : JBTheme.ink, lineWidth: 1.5)
                }
            }
            .foregroundStyle(armed ? JBTheme.orange : variant == .ink ? JBTheme.panel2 : JBTheme.ink)
            .offset(y: pressed && variant != .ghost ? 2 : 0)
            .opacity(isEnabled ? 1 : 0.35)
            .animation(.easeOut(duration: 0.05), value: pressed)
            .contentShape(Rectangle())
    }
}

/// Pill press feedback: 2 pt sink, no other styling (the label draws itself).
struct SeqPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .offset(y: configuration.isPressed ? 2 : 0)
            .animation(.easeOut(duration: 0.05), value: configuration.isPressed)
            .contentShape(Rectangle())
    }
}

#Preview {
    struct Host: View {
        @State var inst: String? = "jt90"
        @State var section: Int? = 0
        let engine = MockEngine()
        var body: some View {
            ScrollView {
                SeqView(engine: engine, desc: SessionDescription(bpm: 128, swing: 0, bars: 16, instruments: [
                    InstrumentDescription(id: "jt90", type: "jt90", active: true, voices: ["kick", "clap", "ch", "oh"], level: 0, params: []),
                    InstrumentDescription(id: "jb202", type: "jb202", active: true, voices: [], level: -3, params: []),
                ], arrangement: [ArrangementEntry(bars: 8, patterns: ["jt90": "A", "jb202": "A"]), ArrangementEntry(bars: 8, patterns: ["jt90": "B"])], tracks: nil, anySolo: false),
                        playStep16: 5, playScope: .section(index: 0), instId: $inst, section: $section,
                        onEdited: { k, t in print(k, t) }, onScope: { _ in })
                .padding(.horizontal, 16)
            }
            .background(JBTheme.panel)
        }
    }
    return Host()
}
