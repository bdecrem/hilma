import Foundation
import Observation
import AVFoundation

/// One open project: the agent loop, what the stage shows, and the game it feeds.
///
/// The loop is the Jambot runAgent shape (see apps/tokensurfers/CLAUDE.md):
/// stream a Messages call, run every tool_use in order, send all results back
/// in one user message, repeat until end_turn. Each request starts a fresh
/// conversation that carries the current file, so history never grows past
/// one build and thinking blocks are always replayed untouched.
@Observable
@MainActor
final class Studio {
    enum Phase: Equatable {
        case idle, thinking, writing, editing, reading, running, done
        case failed(String)
    }
    enum StageTab: String { case app, code }
    enum Cutaway: Equatable { case tokenur, contextino, hallucinello, absolutelyRight }

    let store: ProjectStore
    private(set) var project: Project
    let game = SurfEngine()

    private(set) var html: String
    private(set) var phase: Phase = .idle
    private(set) var caption = ""
    private(set) var captionID = 0
    private(set) var captionIsFiller = false
    private(set) var subtitle = ""
    private(set) var liveCode = ""
    private(set) var patchOld = ""
    private(set) var patchNew = ""
    private(set) var isPatch = false
    var stageTab: StageTab = .app
    var stagePinned = false
    private(set) var cutaway: Cutaway?
    private(set) var previewVersion = 0
    private(set) var outputTokens = 0
    private(set) var inputTokens = 0
    private(set) var lastBugs = 0
    private(set) var steps = 0
    private(set) var lastPrompt = ""

    var building: Bool {
        switch phase {
        case .idle, .done, .failed: return false
        default: return true
        }
    }

    private var task: Task<Void, Never>?
    private let narrator = Narrator()
    private var lastCaptionAt = Date()
    private var usedFillers: Set<String> = []
    private var shownCutaways: Set<Cutaway> = []

    init(store: ProjectStore, project: Project) {
        self.store = store
        self.project = project
        self.html = store.html(for: project.id)
        self.stageTab = html.isEmpty ? .code : .app
    }

    // MARK: public

    func send(_ prompt: String) {
        let p = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !p.isEmpty, !building else { return }
        task = Task { await run(p) }
    }

    func stop() {
        task?.cancel()
        task = nil
        narrator.stop()
        phase = .idle
        setCaption("ok ok. i stopped 🛑", speak: false)
    }

    func retry() {
        guard !lastPrompt.isEmpty else { return }
        send(lastPrompt)
    }

    func rename(_ title: String) {
        project.title = title
        store.update(project)
    }

    var codeForDisplay: String { liveCode.isEmpty ? html : liveCode }

    // MARK: the loop

    private func run(_ prompt: String) async {
        lastPrompt = prompt
        phase = .thinking
        outputTokens = 0
        inputTokens = 0
        lastBugs = 0
        steps = 0
        usedFillers = []
        shownCutaways = []
        subtitle = ""
        liveCode = ""
        isPatch = false
        if !stagePinned { stageTab = .code }
        setCaption(html.isEmpty ? "so it's \(clockString()). new app just dropped" : "they said: \(shortPrompt(prompt))", speak: true)

        let filler = Task { await fillerLoop() }
        defer { filler.cancel() }

        var messages: [[String: Any]] = [["role": "user", "content": firstMessage(prompt)]]
        var recap = ""
        do {
            for _ in 0..<14 {
                try Task.checkCancellation()
                let turn = try await callModel(messages)
                messages.append(["role": "assistant", "content": turn.content])
                if !turn.text.isEmpty { recap = turn.text }

                switch turn.stopReason {
                case "tool_use":
                    var results: [[String: Any]] = []
                    for call in turn.toolCalls {
                        try Task.checkCancellation()
                        results.append(await execute(call))
                    }
                    messages.append(["role": "user", "content": results])
                    phase = .thinking
                case "pause_turn":
                    continue
                case "max_tokens":
                    guard !turn.toolCalls.isEmpty else { break }
                    let results: [[String: Any]] = turn.toolCalls.map {
                        ["type": "tool_result", "tool_use_id": $0.id, "is_error": true,
                         "content": "Your output hit max_tokens and this tool input was cut off. Make smaller edits with edit_file."]
                    }
                    messages.append(["role": "user", "content": results])
                    continue
                case "refusal":
                    throw SurfAPIError(message: "the model declined this one")
                default:
                    finish(recap: recap, prompt: prompt)
                    return
                }
                if turn.stopReason == "max_tokens" { break }
            }
            finish(recap: recap.isEmpty ? "ran out of steps. it's something though." : recap, prompt: prompt)
        } catch is CancellationError {
            return
        } catch let e as URLError where e.code == .cancelled {
            return
        } catch {
            guard !Task.isCancelled else { return }
            phase = .failed(error.localizedDescription)
            setCaption("the server said no 💀", speak: true)
            subtitle = error.localizedDescription
            game.bugs(3)
        }
    }

    private func finish(recap: String, prompt: String) {
        phase = .done
        project.builds += 1
        project.prompts.append(prompt)
        project.recap = recap
        project.tokens += outputTokens
        project.updated = .now
        store.update(project)
        store.addTokens(outputTokens)
        liveCode = ""
        isPatch = false
        previewVersion += 1
        stageTab = .app
        stagePinned = false
        game.celebrate()
        showCutaway(.absolutelyRight, force: true)
        subtitle = recap
        Task {
            try? await Task.sleep(for: .seconds(2.2))
            setCaption(recap, speak: true)
        }
    }

    // MARK: one streamed model call

    private struct ToolCall { let id: String; let name: String; let input: [String: Any]?; let raw: String }
    private struct Turn { var content: [[String: Any]]; var stopReason: String; var toolCalls: [ToolCall]; var text: String }

    private final class Block {
        var type = ""
        var text = ""
        var thinking = ""
        var signature = ""
        var data = ""
        var id = ""
        var name = ""
        var json = ""
        var spokenCaption = false
    }

    private func callModel(_ messages: [[String: Any]]) async throws -> Turn {
        var blocks: [Int: Block] = [:]
        var stopReason = "end_turn"
        var lastUI = Date.distantPast

        for try await ev in SurfAPI.stream(messages: messages) {
            switch ev {
            case let .messageStart(input, cached):
                inputTokens = input + cached
                if inputTokens > 30_000 { showCutaway(.contextino) }
            case let .blockStart(i, raw):
                let b = Block()
                b.type = raw["type"] as? String ?? ""
                b.id = raw["id"] as? String ?? ""
                b.name = raw["name"] as? String ?? ""
                b.data = raw["data"] as? String ?? ""
                blocks[i] = b
                if b.type == "tool_use" { toolStarted(b.name) }
            case let .textDelta(i, t):
                blocks[i]?.text += t
                count(t)
                subtitle = blocks[i]?.text ?? subtitle
            case let .thinkingDelta(i, t):
                blocks[i]?.thinking += t
                count(t)
                if let th = blocks[i]?.thinking, !th.trimmingCharacters(in: .whitespaces).isEmpty { subtitle = th }
            case let .signatureDelta(i, s):
                blocks[i]?.signature += s
            case let .inputJSONDelta(i, p):
                guard let b = blocks[i] else { break }
                b.json += p
                count(p)
                if Date().timeIntervalSince(lastUI) > 0.08 {
                    lastUI = Date()
                    toolStreaming(b)
                }
            case let .blockStop(i):
                if let b = blocks[i], b.type == "tool_use" { toolStreaming(b) }
            case let .messageDelta(reason, out):
                if let reason { stopReason = reason }
                if out > 0 { outputTokens = max(outputTokens, steps + out) }
            case .messageStop:
                break
            }
        }
        steps = outputTokens

        var content: [[String: Any]] = []
        var calls: [ToolCall] = []
        var text = ""
        for i in blocks.keys.sorted() {
            guard let b = blocks[i] else { continue }
            switch b.type {
            case "text":
                if !b.text.isEmpty { content.append(["type": "text", "text": b.text]) }
                text += b.text
            case "thinking":
                content.append(["type": "thinking", "thinking": b.thinking, "signature": b.signature])
            case "redacted_thinking":
                content.append(["type": "redacted_thinking", "data": b.data])
            case "tool_use":
                let input = (try? JSONSerialization.jsonObject(with: Data((b.json.isEmpty ? "{}" : b.json).utf8))) as? [String: Any]
                content.append(["type": "tool_use", "id": b.id, "name": b.name, "input": input ?? [:]])
                calls.append(ToolCall(id: b.id, name: b.name, input: input, raw: b.json))
            default:
                break
            }
        }
        return Turn(content: content, stopReason: stopReason, toolCalls: calls,
                    text: text.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    /// Streamed characters → an estimate of tokens → coins on the track.
    private var tokenCarry = 0.0
    private func count(_ s: String) {
        let t = Double(s.count) / 3.6
        game.feedTokens(t)
        tokenCarry += t
        if tokenCarry >= 1 {
            outputTokens += Int(tokenCarry)
            tokenCarry -= Double(Int(tokenCarry))
        }
        if outputTokens > 1500 { showCutaway(.tokenur) }
    }

    private func toolStarted(_ name: String) {
        game.toolTrain(name)
        switch name {
        case "write_file":
            phase = .writing
            liveCode = ""
            isPatch = false
            if !stagePinned { stageTab = .code }
        case "edit_file":
            phase = .editing
            isPatch = true
            patchOld = ""
            patchNew = ""
            if !stagePinned { stageTab = .code }
        case "read_file":
            phase = .reading
            showCutaway(.contextino)
        case "run_app":
            phase = .running
        default:
            break
        }
    }

    private func toolStreaming(_ b: Block) {
        if let (cap, done) = PartialJSON.field2("caption", in: b.json), !cap.isEmpty {
            if cap != caption { setCaption(cap, speak: false, bump: !captionStarts(cap)) }
            if done && !b.spokenCaption {
                b.spokenCaption = true
                narrator.say(cap)
            }
        }
        switch b.name {
        case "write_file":
            if let c = PartialJSON.string("content", in: b.json) { liveCode = c }
            if let t = PartialJSON.field2("app_title", in: b.json), t.1, project.title != t.0 {
                project.title = t.0
                if let em = PartialJSON.field2("app_emoji", in: b.json), em.1 { project.emoji = em.0 }
            }
        case "edit_file":
            patchOld = PartialJSON.string("old_string", in: b.json) ?? ""
            patchNew = PartialJSON.string("new_string", in: b.json) ?? ""
        default:
            break
        }
    }

    /// A caption that is still being typed shouldn't restart the animation per letter.
    private func captionStarts(_ c: String) -> Bool { !caption.isEmpty && c.hasPrefix(caption) && !captionIsFiller }

    // MARK: tools

    private func execute(_ call: ToolCall) async -> [String: Any] {
        func result(_ text: String, error: Bool = false) -> [String: Any] {
            var r: [String: Any] = ["type": "tool_result", "tool_use_id": call.id, "content": text]
            if error { r["is_error"] = true }
            return r
        }
        guard let input = call.input else {
            return result("{\"INVALID_JSON\": \(String(call.raw.prefix(300)).debugDescription)}", error: true)
        }
        switch call.name {
        case "write_file":
            guard let content = input["content"] as? String, !content.isEmpty else {
                return result("content is required", error: true)
            }
            html = content
            store.saveHTML(content, for: project.id)
            if let t = input["app_title"] as? String, !t.isEmpty { project.title = t }
            if let e = input["app_emoji"] as? String, !e.isEmpty { project.emoji = String(e.prefix(2)) }
            project.updated = .now
            store.update(project)
            liveCode = content
            return result("Wrote index.html (\(lineCount(content)) lines).")

        case "edit_file":
            guard let old = input["old_string"] as? String, let new = input["new_string"] as? String, !old.isEmpty else {
                return result("old_string and new_string are required", error: true)
            }
            let n = html.components(separatedBy: old).count - 1
            if n == 0 { return result("old_string not found in index.html. Use read_file to see the current text.", error: true) }
            if n > 1 { return result("old_string found \(n) times. Include more surrounding lines to make it unique.", error: true) }
            if let r = html.range(of: old) { html.replaceSubrange(r, with: new) }
            store.saveHTML(html, for: project.id)
            project.updated = .now
            store.update(project)
            return result("Edited index.html (now \(lineCount(html)) lines).")

        case "read_file":
            let lines = html.components(separatedBy: "\n")
            let start = max(1, input["start_line"] as? Int ?? 1)
            let end = min(lines.count, input["end_line"] as? Int ?? lines.count, start + 1199)
            guard start <= end else { return result("index.html has \(lines.count) lines.") }
            let body = (start...end).map { "\($0)\t\(lines[$0 - 1])" }.joined(separator: "\n")
            return result("index.html lines \(start)-\(end) of \(lines.count):\n\(body)")

        case "run_app":
            guard !html.isEmpty else { return result("There is no index.html yet. Write it first.", error: true) }
            let r = await AppRunner.shared.run(html: html)
            lastBugs = r.errors.count
            previewVersion += 1
            if !stagePinned { stageTab = .app }
            if !r.errors.isEmpty {
                game.bugs(r.errors.count)
                showCutaway(.hallucinello, force: true)
            }
            var text = r.errors.isEmpty ? "No errors." : "\(r.errors.count) error(s):\n" + r.errors.map { "- \($0)" }.joined(separator: "\n")
            if !r.notes.isEmpty { text += "\n\nPage: " + r.notes.prefix(6).joined(separator: "\n") }
            var content: [[String: Any]] = [["type": "text", "text": text]]
            if let jpeg = r.jpeg {
                content.append(["type": "image", "source": ["type": "base64", "media_type": "image/jpeg",
                                                           "data": jpeg.base64EncodedString()]])
            }
            return ["type": "tool_result", "tool_use_id": call.id, "content": content]

        default:
            return result("unknown tool \(call.name)", error: true)
        }
    }

    // MARK: first message

    private func firstMessage(_ prompt: String) -> String {
        if html.isEmpty { return "Build this: \(prompt)" }
        let earlier = project.prompts.suffix(8).map { "- \($0)" }.joined(separator: "\n")
        return """
        My app "\(project.title)" \(project.emoji). Current index.html:

        <file name="index.html">
        \(html)
        </file>

        \(earlier.isEmpty ? "" : "Earlier requests, oldest first:\n\(earlier)\n\n")New request: \(prompt)
        """
    }

    // MARK: captions + cutaways

    private func setCaption(_ text: String, speak: Bool, bump: Bool = true, filler: Bool = false) {
        caption = text
        captionIsFiller = filler
        if bump { captionID += 1 }
        lastCaptionAt = .now
        if speak { narrator.say(text) }
    }

    private static let fillers = [
        "let him cook 🍳", "thinking really hard", "big brain time 🧠", "tok tok tok",
        "consulting the vibes", "hold my tokens", "no thoughts. just code", "one sec. lock in",
        "reading the prompt again", "it's giving… almost", "pixel by pixel",
    ]

    /// Something on screen while the model thinks silently.
    private func fillerLoop() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(0.5))
            guard phase == .thinking, Date().timeIntervalSince(lastCaptionAt) > 4 else { continue }
            let options = Self.fillers.filter { !usedFillers.contains($0) }
            guard let pick = (options.isEmpty ? Self.fillers : options).randomElement() else { continue }
            usedFillers.insert(pick)
            setCaption(pick, speak: false, filler: true)
        }
    }

    private func showCutaway(_ c: Cutaway, force: Bool = false) {
        guard force || !shownCutaways.contains(c) else { return }
        shownCutaways.insert(c)
        cutaway = c
        Task {
            try? await Task.sleep(for: .seconds(c == .absolutelyRight ? 2.2 : 1.8))
            if cutaway == c { cutaway = nil }
        }
    }

    private func clockString() -> String {
        let f = DateFormatter()
        f.dateFormat = "h:mma"
        return f.string(from: .now).lowercased()
    }

    private func shortPrompt(_ p: String) -> String {
        let words = p.split(separator: " ").prefix(6).joined(separator: " ")
        return p.split(separator: " ").count > 6 ? words + "…" : words
    }

    private func lineCount(_ s: String) -> Int { s.reduce(1) { $1 == "\n" ? $0 + 1 : $0 } }
}

/// Reads captions aloud in a flat TikTok-TTS voice. Muted with the game.
@MainActor
final class Narrator {
    private let synth = AVSpeechSynthesizer()

    func say(_ text: String) {
        guard !SurfAudio.shared.muted, UserDefaults.standard.object(forKey: "narrator") as? Bool ?? true else { return }
        let clean = text.unicodeScalars.filter { !$0.properties.isEmojiPresentation && $0.properties.generalCategory != .otherSymbol }
        let s = String(String.UnicodeScalarView(clean)).trimmingCharacters(in: .whitespaces)
        guard !s.isEmpty else { return }
        SurfAudio.shared.start()
        if synth.isSpeaking { synth.stopSpeaking(at: .immediate) }
        let u = AVSpeechUtterance(string: s)
        u.voice = AVSpeechSynthesisVoice(language: "en-US")
        u.rate = 0.53
        u.pitchMultiplier = 1.15
        synth.speak(u)
    }

    func stop() { synth.stopSpeaking(at: .immediate) }
}
