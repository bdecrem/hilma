import Foundation
import Observation
import os

/// State + edits for one instrument's pattern in the Seq tab. Loads through
/// `engine.pattern`, applies edits through `engine.seq` (optimistic local
/// update first, then the engine's dense pattern replaces it once no edit
/// is in flight), and hands the host a coalesced agent note per edit.
///
/// Created by `SeqView` unless the caller passes its own (the -seqPreview
/// harness does, to drive it headlessly).
@Observable
@MainActor
final class SeqModel {
    static let log = Logger(subsystem: "com.bartdecrem.Jambot", category: "seq")

    /// What the view is editing right now.
    private(set) var inst: String? = nil
    private(set) var section: Int? = nil
    private(set) var pattern: SeqPattern? = nil
    private(set) var loadError: String? = nil
    private(set) var inflight = 0

    var page = 0
    var sel = 0
    var loopSection = true
    var armed = false

    /// Called after every edit that landed in the engine: `(noteKey, noteText)`.
    var onEdited: ((String, String) -> Void)?
    /// Fresh description after every edit (bars can change on a loop-mode resize).
    var onDesc: ((SessionDescription) -> Void)?

    private(set) var engine: EngineAPI?
    private var notes = SeqNoteCoalescer()
    private var armTask: Task<Void, Never>?
    private var loadTask: Task<Void, Never>?
    private var edits = 0

    init() {}

    func configure(engine: EngineAPI, notes: SeqNoteCoalescer?) {
        self.engine = engine
        if let notes { self.notes = notes }
    }

    // MARK: Target

    var length: Int { pattern?.length ?? 16 }
    var bars: Int { pattern?.bars ?? 1 }
    var silent: Bool { pattern.map { $0.silent || $0.missing } ?? true }
    var kind: SeqMath.Kind { pattern?.isDrums == false ? .mono : .drums }
    var type: String { pattern?.type ?? "jt90" }
    var voices: [String] { SeqMath.voices(for: type) }
    var selStep: MonoStep? {
        guard let m = pattern?.mono, !m.isEmpty else { return nil }
        return m[min(sel, m.count - 1)]
    }

    /// Re-targets (instrument and/or section) and reloads. Paging resets when
    /// the instrument changes; the selection resets in both cases.
    func target(inst: String?, section: Int?) {
        let instChanged = inst != self.inst
        let changed = instChanged || section != self.section
        self.inst = inst
        self.section = section
        if instChanged { page = 0; sel = 0 } else if changed { page = 0 }
        reload()
    }

    /// Reads the target pattern again (after the agent changed something, or
    /// after a failed edit). Skipped while our own edits are in flight — the
    /// edit's answer carries the fresh pattern.
    func reload() {
        guard let engine, let inst else { pattern = nil; return }
        if inflight > 0 { return }
        loadTask?.cancel()
        let section = self.section
        loadTask = Task {
            do {
                let p = try await engine.pattern(inst: inst, section: section)
                guard !Task.isCancelled, inst == self.inst, section == self.section else { return }
                pattern = p
                loadError = nil
                clampCursor()
            } catch {
                guard !Task.isCancelled else { return }
                loadError = error.localizedDescription
                pattern = nil
                Self.log.error("pattern \(inst, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    // MARK: Paging

    func pages(per: Int) -> Int { max(1, Int((Double(length) / Double(per)).rounded(.up))) }

    func setPage(_ p: Int, per: Int) {
        let n = pages(per: per)
        let next = ((p % n) + n) % n
        page = next
        // Keep the step editor on a visible step.
        if sel / per != next { sel = next * per }
    }

    func setSel(_ i: Int, per: Int) {
        let n = max(1, length)
        sel = ((i % n) + n) % n
        page = sel / per
    }

    private func clampCursor() {
        if sel >= length { sel = max(0, length - 1) }
    }

    // MARK: Edits

    func tapDrum(voice: String, i: Int) {
        guard var p = pattern, var d = p.drums, !silent else { return }
        var row = d[voice] ?? Array(repeating: .off, count: p.length)
        guard i < row.count else { return }
        let s = row[i]
        let state: String
        if !s.isOn { row[i] = DrumStep(velocity: 1, accent: false); state = "on" }
        else if !s.accent { row[i] = DrumStep(velocity: s.velocity, accent: true); state = "accent" }
        else { row[i] = .off; state = "off" }
        d[voice] = row
        p.data = .drums(d)
        commit(p, .cycleDrum(voice: voice, i: i), "\(voice) step \(i + 1) \(state)")
    }

    func tapMono(_ i: Int) {
        guard var p = pattern, var m = p.mono, i < m.count, !silent else { return }
        m[i].gate.toggle()
        p.data = .mono(m)
        sel = i
        commit(p, .toggleGate(i: i), m[i].gate ? "step \(i + 1) on (\(m[i].note))" : "step \(i + 1) off")
    }

    func shift(_ semitones: Int) {
        guard var p = pattern, var m = p.mono, sel < m.count, !silent else { return }
        let from = m[sel].note
        let to = SeqMath.shiftNote(from, by: semitones)
        guard to != from else { return }
        m[sel].note = to
        p.data = .mono(m)
        commit(p, .setNote(i: sel, note: to), "step \(sel + 1) note \(from) → \(to)")
    }

    func toggleAccent() {
        guard var p = pattern, var m = p.mono, sel < m.count, !silent else { return }
        m[sel].accent.toggle()
        p.data = .mono(m)
        commit(p, .toggleAccent(i: sel), "step \(sel + 1) accent \(m[sel].accent ? "on" : "off")")
    }

    func toggleSlide() {
        guard var p = pattern, var m = p.mono, sel < m.count, !silent else { return }
        m[sel].slide.toggle()
        p.data = .mono(m)
        commit(p, .toggleSlide(i: sel), "step \(sel + 1) slide \(m[sel].slide ? "on" : "off")")
    }

    func gateOff() {
        guard var p = pattern, var m = p.mono, sel < m.count, m[sel].gate, !silent else { return }
        m[sel].gate = false
        p.data = .mono(m)
        commit(p, .toggleGate(i: sel), "step \(sel + 1) off")
    }

    func setLength(_ b: Int) {
        guard let p = pattern, b != bars, !silent else { return }
        let steps = b * 16
        var next = p
        switch p.data {
        case .drums(let d):
            next.data = .drums(d.mapValues { row in Array((row + Array(repeating: DrumStep.off, count: max(0, steps - row.count))).prefix(steps)) })
        case .mono(let m):
            let last = m.last?.note ?? "C2"
            let pad = (0..<max(0, steps - m.count)).map { _ in MonoStep(note: last, gate: false, accent: false, slide: false) }
            next.data = .mono(Array((m + pad).prefix(steps)))
        }
        next.length = steps
        page = 0
        commit(next, .resize(bars: b), "length → \(b) \(b == 1 ? "bar" : "bars")")
    }

    /// Two taps: the first arms for 3 s ("clear?"), the second clears.
    func clear() {
        guard !silent else { return }
        if !armed {
            armed = true
            armTask?.cancel()
            armTask = Task {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                guard !Task.isCancelled else { return }
                armed = false
            }
            return
        }
        armTask?.cancel()
        armed = false
        guard var p = pattern else { return }
        switch p.data {
        case .drums(let d): p.data = .drums(d.mapValues { $0.map { _ in DrumStep.off } })
        case .mono(let m): p.data = .mono(m.map { MonoStep(note: $0.note, gate: false, accent: false, slide: false) })
        }
        commit(p, .clear, "cleared all steps")
    }

    /// Optimistic local update, then the engine call. Bridge calls are FIFO,
    /// so the last answer reflects every edit; intermediate answers are
    /// ignored while later edits are still in flight (no flicker).
    private func commit(_ optimistic: SeqPattern, _ op: SeqOp, _ edit: String) {
        guard let engine, let inst else { return }
        let section = self.section
        pattern = optimistic
        inflight += 1
        edits += 1
        Task {
            defer { inflight -= 1 }
            do {
                let r = try await engine.seq(op, inst: inst, section: section)
                guard inst == self.inst, section == self.section else { return }
                if inflight == 1 { pattern = r.pattern; clampCursor() }
                onDesc?(r.desc)
                let name = r.pattern.name ?? "live"
                let inSong = section != nil && !r.desc.arrangement.isEmpty
                let key = "seq:\(inst):\(inSong ? name : "live")"
                let head = "sequencer edited \(inst) \(inSong ? "pattern \(name)" : "live pattern") (steps counted from 1)"
                onEdited?(key, notes.add(key: key, head: head, edit: edit))
                Self.log.info("seq \(op.name, privacy: .public) \(inst, privacy: .public) \(section.map { "section \($0 + 1)" } ?? "loop", privacy: .public): \(edit, privacy: .public)")
            } catch {
                Self.log.error("seq \(op.name, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
                loadError = error.localizedDescription
                if inflight == 1 { reloadNow() }
            }
        }
    }

    private func reloadNow() {
        // `reload()` refuses while inflight > 0; this runs from the last edit's catch, where inflight is still 1.
        guard let engine, let inst else { return }
        let section = self.section
        Task {
            if let p = try? await engine.pattern(inst: inst, section: section), inst == self.inst, section == self.section {
                pattern = p
                clampCursor()
            }
        }
    }
}
