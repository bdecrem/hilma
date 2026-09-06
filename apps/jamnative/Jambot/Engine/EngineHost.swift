import Foundation
import WebKit
import SwiftUI
import os

// The real engine: one hidden WKWebView running engine.html + jambot-web.js
// (see DESIGN.md "Engine host bridge" and Engine/engine-bridge.js for the
// call table). Swift never runs synth code; it sends calls in, gets JSON
// back, and reassembles rendered PCM from base64 chunks.
//
// Threading: everything here runs on the main actor (WKWebView requires it).
// Calls are serialized through a small gate so the engine handles one at a
// time — except `agent`, which streams for as long as a turn takes and must
// not block a `describe` or a fader `tweak` in the meantime (the web app
// allows those mid-turn too).
//
// Network: the web view never talks to the network. The one HTTP call the
// engine needs (the Messages API) arrives as an `llm` event and is performed
// here through JamAPI with the jam_session cookie.

enum EngineError: LocalizedError {
    case bridge(String)
    case unauthenticated
    case pageFailed(String)
    case crashed
    case badPayload(String)

    var errorDescription: String? {
        switch self {
        case .bridge(let msg): return msg
        case .unauthenticated: return "Not signed in."
        case .pageFailed(let msg): return "The engine page failed to load: \(msg)"
        case .crashed: return "The engine process was terminated."
        case .badPayload(let msg): return "Bad engine payload: \(msg)"
        }
    }
}

@MainActor
final class EngineHost: NSObject, ObservableObject, EngineAPI {
    static let log = Logger(subsystem: "com.bartdecrem.Jambot", category: "engine")

    /// Keeps the WebContent process at foreground priority while the app is
    /// in the background, so a render started with the screen locked
    /// finishes. Private WKWebViewConfiguration property (used by Cordova
    /// and friends); off with the `-engineNoForegroundPriority` launch
    /// argument so the go/no-go can be measured both ways.
    static var runsAtForegroundPriority: Bool {
        !CommandLine.arguments.contains("-engineNoForegroundPriority")
    }

    /// Bumps every time the web content process dies and the page reloads;
    /// the session inside the engine is gone then. Callers re-run `ready()`
    /// + `loadSession` when they see it change.
    @Published private(set) var generation = 0
    @Published private(set) var engineVersion: String?
    @Published private(set) var toolNames: [String] = []

    let webView: WKWebView

    private var pageLoaded = false
    private var pageError: Error?
    private var loadWaiters: [CheckedContinuation<Void, Error>] = []

    private var callSeq = 0
    private var pending: [String: CheckedContinuation<Any, Error>] = [:]
    private var agentStreams: [String: AsyncThrowingStream<AgentEvent, Error>.Continuation] = [:]
    private var pcmChunks: [String: [Data]] = [:]

    // Serial gate for the short calls.
    private var gateBusy = false
    private var gateWaiters: [CheckedContinuation<Void, Never>] = []

    private let relay = MessageRelay()

    override init() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.setURLSchemeHandler(EngineSchemeHandler(), forURLScheme: EngineSchemeHandler.scheme)
        config.userContentController.add(relay, name: "engine")
        if Self.runsAtForegroundPriority {
            if config.responds(to: NSSelectorFromString("_setAlwaysRunsAtForegroundPriority:")) {
                config.setValue(true, forKey: "alwaysRunsAtForegroundPriority")
                Self.log.notice("engine: alwaysRunsAtForegroundPriority on")
            } else {
                Self.log.error("engine: alwaysRunsAtForegroundPriority unavailable on this WebKit")
            }
        } else {
            Self.log.notice("engine: alwaysRunsAtForegroundPriority off (-engineNoForegroundPriority)")
        }
        webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 2, height: 2), configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        super.init()
        relay.host = self
        webView.navigationDelegate = self
        loadPage()
    }

    private func loadPage() {
        pageLoaded = false
        pageError = nil
        let url = URL(string: "\(EngineSchemeHandler.scheme)://engine/engine.html")!
        webView.load(URLRequest(url: url))
    }

    // MARK: - EngineAPI

    func ready() async throws {
        let result = try await call("ready")
        let dict = result as? [String: Any] ?? [:]
        engineVersion = dict["version"] as? String
        toolNames = dict["tools"] as? [String] ?? []
        Self.log.notice("engine ready \(self.engineVersion ?? "?", privacy: .public) tools=\(self.toolNames.count)")
    }

    func loadSession(session: JSONValue?, bpm: Int) async throws -> LoadedSession {
        var args: [String: Any] = ["bpm": bpm]
        args["session"] = session?.anyValue ?? NSNull()
        let result = try await call("loadSession", args)
        return LoadedSession(desc: try Self.decode(SessionDescription.self, field: "desc", in: result))
    }

    func serialize() async throws -> JSONValue {
        let result = try await call("serialize")
        return try Self.decode(JSONValue.self, field: "session", in: result)
    }

    func describe() async throws -> SessionDescription {
        try Self.decode(SessionDescription.self, field: "desc", in: try await call("describe"))
    }

    func controls() async throws -> [ControlGroup] {
        try Self.decode([ControlGroup].self, field: "groups", in: try await call("controls"))
    }

    func tweak(path: String, value: Double) async throws -> SessionDescription {
        let result = try await call("tweak", ["path": path, "value": value])
        if let n = (result as? [String: Any])?["wroteThrough"] as? Int, n > 0 {
            Self.log.debug("tweak \(path, privacy: .public) wrote through to \(n) saved pattern(s)")
        }
        return try Self.decode(SessionDescription.self, field: "desc", in: result)
    }

    func tweakChoice(path: String, value: String) async throws -> SessionDescription {
        // The bridge's `tweak` hands the value to the engine's tweak tool
        // untouched, so a string reaches choice params as-is.
        let result = try await call("tweak", ["path": path, "value": value])
        return try Self.decode(SessionDescription.self, field: "desc", in: result)
    }

    func setTrack(key: String, value: Double) async throws -> SessionDescription {
        try Self.decode(SessionDescription.self, field: "desc", in: try await call("setTrack", ["key": key, "value": value]))
    }

    func mix(id: String, what: String, on: Bool) async throws -> SessionDescription {
        try Self.decode(SessionDescription.self, field: "desc", in: try await call("mix", ["id": id, "what": what, "on": on]))
    }

    func render(scope: RenderScope) async throws -> RenderResult {
        let scopeArg: [String: Any]
        switch scope {
        case .song: scopeArg = ["kind": "song"]
        case .section(let index): scopeArg = ["kind": "section", "index": index]
        }
        let started = Date()
        let result = try await call("render", ["scope": scopeArg])
        let r = try assembleRender(from: result)
        Self.log.notice("render \(r.bars) bars @ \(r.bpm) → \(r.length) frames × \(r.channels) ch in \(String(format: "%.2f", Date().timeIntervalSince(started)), privacy: .public)s")
        return r
    }

    nonisolated func agent(task: String, messages: [AgentMessage], notes: [String]) -> AsyncThrowingStream<AgentEvent, Error> {
        AsyncThrowingStream { continuation in
            Task { @MainActor in
                await self.startAgent(task: task, messages: messages, notes: notes, continuation: continuation)
            }
        }
    }

    func agentMessages() async throws -> [AgentMessage] {
        try Self.decode([AgentMessage].self, field: "messages", in: try await call("agentMessages"))
    }

    // MARK: Sequencer (stage 5)

    func hits(step: Int, scope: RenderScope) async throws -> [String: [String]] {
        try Self.decode([String: [String]].self, field: "hits", in: try await call("hits", ["step": step, "scope": scope.bridgeValue]))
    }

    func pattern(inst: String, section: Int?) async throws -> SeqPattern {
        var args: [String: Any] = ["inst": inst]
        if let section { args["section"] = section }
        return try Self.decodeWhole(SeqPattern.self, from: try await call("pattern", args))
    }

    func seq(op: String, inst: String, section: Int?, args: JSONValue) async throws -> SeqResult {
        var call: [String: Any] = ["op": op, "inst": inst, "args": args.anyValue]
        if let section { call["section"] = section }
        let result = try await self.call("seq", call)
        return SeqResult(desc: try Self.decode(SessionDescription.self, field: "desc", in: result),
                         pattern: try Self.decode(SeqPattern.self, field: "pattern", in: result))
    }

    private static func decodeWhole<T: Decodable>(_ type: T.Type, from result: Any) throws -> T {
        do {
            let data = try JSONSerialization.data(withJSONObject: result, options: [.fragmentsAllowed])
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            log.error("decode \(String(describing: T.self), privacy: .public): \(String(describing: error), privacy: .public)")
            throw EngineError.badPayload("could not decode \(String(describing: T.self)): \(error.localizedDescription)")
        }
    }

    // MARK: - Calls

    /// One bridge call, serialized behind the gate. Returns the raw `result`.
    private func call(_ name: String, _ args: [String: Any] = [:]) async throws -> Any {
        await enterGate()
        defer { leaveGate() }
        return try await rawCall(name, args)
    }

    private func rawCall(_ name: String, _ args: [String: Any]) async throws -> Any {
        try await awaitPage()
        callSeq += 1
        let id = "c\(callSeq)"
        let js = try Self.callScript(id: id, name: name, args: args)
        return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Any, Error>) in
            pending[id] = cont
            webView.evaluateJavaScript(js) { [weak self] _, error in
                guard let self, let error else { return }
                if let waiting = self.pending.removeValue(forKey: id) {
                    Self.log.error("bridge call \(name, privacy: .public) could not start: \(error.localizedDescription, privacy: .public)")
                    waiting.resume(throwing: EngineError.bridge("engine call \(name) failed to start: \(error.localizedDescription)"))
                }
            }
        }
    }

    private func startAgent(task: String, messages: [AgentMessage], notes: [String], continuation: AsyncThrowingStream<AgentEvent, Error>.Continuation) async {
        do {
            try await awaitPage()
            callSeq += 1
            let id = "a\(callSeq)"
            let messagesAny = try JSONSerialization.jsonObject(with: JSONEncoder().encode(messages))
            let js = try Self.callScript(id: id, name: "agent", args: ["task": task, "messages": messagesAny, "notes": notes])
            agentStreams[id] = continuation
            continuation.onTermination = { [weak self] _ in
                Task { @MainActor in self?.agentStreams[id] = nil }
            }
            webView.evaluateJavaScript(js) { [weak self] _, error in
                guard let self, let error else { return }
                if let stream = self.agentStreams.removeValue(forKey: id) {
                    Self.log.error("agent call could not start: \(error.localizedDescription, privacy: .public)")
                    stream.yield(.failure("agent call failed to start: \(error.localizedDescription)"))
                    stream.finish()
                }
            }
        } catch {
            Self.log.error("agent call setup failed: \(error.localizedDescription, privacy: .public)")
            continuation.yield(.failure(error.localizedDescription))
            continuation.finish()
        }
    }

    private static func callScript(id: String, name: String, args: [String: Any]) throws -> String {
        let argsData = try JSONSerialization.data(withJSONObject: args)
        let argsJSON = String(decoding: argsData, as: UTF8.self)
        return "window.bridge.call(\(try jsLiteral(id)), \(try jsLiteral(name)), \(try jsLiteral(argsJSON)))"
    }

    /// A JS string literal for `s` (JSON string syntax is valid JS).
    private static func jsLiteral(_ s: String) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: s, options: [.fragmentsAllowed])
        return String(decoding: data, as: UTF8.self)
    }

    private static func decode<T: Decodable>(_ type: T.Type, field: String, in result: Any) throws -> T {
        guard let dict = result as? [String: Any], let value = dict[field] else {
            throw EngineError.badPayload("missing '\(field)' in engine result")
        }
        do {
            let data = try JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed])
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            log.error("decode \(field, privacy: .public) as \(String(describing: T.self), privacy: .public): \(String(describing: error), privacy: .public)")
            throw EngineError.badPayload("could not decode '\(field)': \(error.localizedDescription)")
        }
    }

    // MARK: - Gate

    private func enterGate() async {
        if !gateBusy {
            gateBusy = true
            return
        }
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            gateWaiters.append(cont)
        }
    }

    private func leaveGate() {
        if gateWaiters.isEmpty {
            gateBusy = false
        } else {
            gateWaiters.removeFirst().resume()
        }
    }

    // MARK: - Page lifecycle

    private func awaitPage() async throws {
        if pageLoaded { return }
        if let pageError { throw EngineError.pageFailed(pageError.localizedDescription) }
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            loadWaiters.append(cont)
        }
    }

    private func resolvePage(_ error: Error?) {
        pageLoaded = error == nil
        pageError = error
        let waiters = loadWaiters
        loadWaiters = []
        for w in waiters {
            if let error { w.resume(throwing: EngineError.pageFailed(error.localizedDescription)) }
            else { w.resume() }
        }
    }

    private func failEverything(_ error: Error) {
        let calls = pending
        pending = [:]
        for (_, cont) in calls { cont.resume(throwing: error) }
        let streams = agentStreams
        agentStreams = [:]
        for (_, s) in streams {
            s.yield(.failure(error.localizedDescription))
            s.finish()
        }
        pcmChunks = [:]
    }

    // MARK: - Messages from JS

    fileprivate func handle(_ body: Any) {
        guard let dict = body as? [String: Any] else {
            Self.log.error("bridge: non-dictionary message \(String(describing: body), privacy: .public)")
            return
        }
        if let event = dict["event"] as? String {
            handleEvent(event, dict)
            return
        }
        guard let id = dict["id"] as? String else {
            Self.log.error("bridge: message without id \(String(describing: dict.keys), privacy: .public)")
            return
        }
        let ok = dict["ok"] as? Bool ?? false
        let errorText = dict["error"] as? String ?? "unknown engine error"
        let code = dict["code"] as? String

        if let stream = agentStreams.removeValue(forKey: id) {
            if ok, let result = dict["result"] as? [String: Any] {
                do {
                    let desc = try Self.decode(SessionDescription.self, field: "desc", in: result)
                    let stopReason = result["stopReason"] as? String ?? "end_turn"
                    stream.yield(.end(stopReason: stopReason, desc: desc))
                    stream.finish()
                } catch {
                    stream.yield(.failure(error.localizedDescription))
                    stream.finish()
                }
            } else if code == "unauthenticated" {
                Self.log.error("agent: signed out mid-turn")
                stream.finish(throwing: EngineError.unauthenticated)
            } else {
                Self.log.error("agent failed: \(errorText, privacy: .public)")
                stream.yield(.failure(errorText))
                stream.finish()
            }
            return
        }

        guard let cont = pending.removeValue(forKey: id) else {
            Self.log.error("bridge: answer for unknown call \(id, privacy: .public)")
            return
        }
        if ok {
            cont.resume(returning: dict["result"] ?? [String: Any]())
        } else {
            Self.log.error("bridge call \(id, privacy: .public) failed: \(errorText, privacy: .public)")
            cont.resume(throwing: code == "unauthenticated" ? EngineError.unauthenticated : EngineError.bridge(errorText))
        }
    }

    private func handleEvent(_ event: String, _ dict: [String: Any]) {
        let id = dict["id"] as? String ?? ""
        switch event {
        case "log":
            let text = dict["text"] as? String ?? ""
            switch dict["level"] as? String {
            case "error": Self.log.error("js: \(text, privacy: .public)")
            case "warn": Self.log.notice("js warn: \(text, privacy: .public)")
            default: Self.log.info("js: \(text, privacy: .public)")
            }

        case "chunk":
            guard let group = dict["group"] as? String, let b64 = dict["data"] as? String else {
                Self.log.error("bridge: malformed chunk")
                return
            }
            guard let data = Data(base64Encoded: b64) else {
                Self.log.error("bridge: chunk in \(group, privacy: .public) is not base64")
                return
            }
            pcmChunks[group, default: []].append(data)

        case "llm":
            guard let llmId = dict["llmId"] as? String, let request = dict["request"] else {
                Self.log.error("bridge: malformed llm event")
                return
            }
            Task { await self.proxyLlm(llmId: llmId, request: request) }

        case "render":
            guard let stream = agentStreams[id] else {
                Self.log.error("bridge: render event for unknown agent call \(id, privacy: .public)")
                return
            }
            do {
                stream.yield(.render(try assembleRender(from: dict)))
            } catch {
                Self.log.error("agent render could not be assembled: \(error.localizedDescription, privacy: .public)")
            }

        case "tool":
            guard let stream = agentStreams[id] else { return }
            let name = dict["name"] as? String ?? "?"
            let input = (try? Self.jsonValue(dict["input"] ?? [String: Any]())) ?? .object([:])
            stream.yield(.tool(name: name, input: input))

        case "toolResult":
            guard let stream = agentStreams[id] else { return }
            stream.yield(.toolResult(name: dict["name"] as? String ?? "?",
                                     result: dict["result"] as? String ?? "",
                                     isError: dict["isError"] as? Bool ?? false))

        case "text":
            guard let stream = agentStreams[id] else { return }
            stream.yield(.text(dict["text"] as? String ?? ""))

        default:
            Self.log.notice("bridge: unknown event \(event, privacy: .public)")
        }
    }

    // MARK: - PCM

    private func assembleRender(from meta: Any) throws -> RenderResult {
        guard let dict = meta as? [String: Any],
              let group = dict["group"] as? String,
              let chunkCount = dict["chunkCount"] as? Int,
              let length = dict["length"] as? Int,
              let channels = dict["channels"] as? Int,
              let sampleRate = dict["sampleRate"] as? Double else {
            throw EngineError.badPayload("render meta incomplete")
        }
        let parts = pcmChunks.removeValue(forKey: group) ?? []
        guard parts.count == chunkCount else {
            throw EngineError.badPayload("render \(group): got \(parts.count) of \(chunkCount) chunks")
        }
        var data = Data(capacity: parts.reduce(0) { $0 + $1.count })
        for p in parts { data.append(p) }
        let expected = length * channels * MemoryLayout<Int16>.size
        guard data.count == expected else {
            throw EngineError.badPayload("render \(group): \(data.count) bytes, expected \(expected)")
        }
        let samples = length * channels
        let pcm = [Int16](unsafeUninitializedCapacity: samples) { buf, count in
            data.copyBytes(to: buf)
            count = samples
        }
        let barsValue = dict["bars"] as? Double ?? Double(dict["bars"] as? Int ?? 0)
        let bpmValue = dict["bpm"] as? Double ?? Double(dict["bpm"] as? Int ?? 0)
        return RenderResult(
            bars: Int(barsValue.rounded()),
            bpm: Int(bpmValue.rounded()),
            hasArrangement: dict["hasArrangement"] as? Bool ?? false,
            message: dict["message"] as? String ?? "",
            sampleRate: sampleRate,
            channels: channels,
            length: length,
            pcm: pcm
        )
    }

    private static func jsonValue(_ any: Any) throws -> JSONValue {
        let data = try JSONSerialization.data(withJSONObject: any, options: [.fragmentsAllowed])
        return try JSONDecoder().decode(JSONValue.self, from: data)
    }

    // MARK: - LLM proxy

    private func proxyLlm(llmId: String, request: Any) async {
        var payload: Data
        do {
            let body = try JSONSerialization.data(withJSONObject: request)
            let started = Date()
            let response = try await JamAPI.shared.llm(body: body)
            Self.log.notice("llm \(llmId, privacy: .public): \(body.count) B → \(response.count) B in \(String(format: "%.1f", Date().timeIntervalSince(started)), privacy: .public)s")
            payload = Data("{\"ok\":true,\"response\":".utf8)
            payload.append(response)
            payload.append(Data("}".utf8))
        } catch JamAPIError.unauthenticated {
            Self.log.error("llm \(llmId, privacy: .public): not signed in")
            payload = try! JSONSerialization.data(withJSONObject: ["ok": false, "error": "not signed in", "code": "unauthenticated"])
        } catch {
            Self.log.error("llm \(llmId, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
            payload = try! JSONSerialization.data(withJSONObject: ["ok": false, "error": error.localizedDescription])
        }
        do {
            let js = "window.bridge.resolveLlm(\(try Self.jsLiteral(llmId)), \(try Self.jsLiteral(String(decoding: payload, as: UTF8.self))))"
            webView.evaluateJavaScript(js) { _, error in
                if let error { Self.log.error("resolveLlm \(llmId, privacy: .public): \(error.localizedDescription, privacy: .public)") }
            }
        } catch {
            Self.log.error("resolveLlm \(llmId, privacy: .public) encode: \(error.localizedDescription, privacy: .public)")
        }
    }
}

// MARK: - WKNavigationDelegate

extension EngineHost: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Self.log.notice("engine page loaded (generation \(self.generation))")
        resolvePage(nil)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        Self.log.error("engine page failed: \(error.localizedDescription, privacy: .public)")
        resolvePage(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        Self.log.error("engine page failed (provisional): \(error.localizedDescription, privacy: .public)")
        resolvePage(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        Self.log.error("engine: web content process terminated — session lost, reloading page")
        failEverything(EngineError.crashed)
        generation += 1
        engineVersion = nil
        loadPage()
    }
}

// MARK: - Script message relay

/// WKUserContentController retains its handlers; this thin object breaks the
/// cycle and hops messages to the host.
private final class MessageRelay: NSObject, WKScriptMessageHandler {
    weak var host: EngineHost?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        host?.handle(message.body)
    }
}

// MARK: - Bundle scheme

/// Serves engine.html, engine-bridge.js and jambot-web.js from the app
/// bundle under jambot-engine://engine/… so the page has a proper origin
/// (ES-module imports and same-origin checks work; file:// would not).
final class EngineSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "jambot-engine"
    private static let allowed: Set<String> = ["engine.html", "engine-bridge.js", "jambot-web.js"]

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }
        let name = url.lastPathComponent
        guard Self.allowed.contains(name), let dir = Bundle.main.resourceURL else {
            EngineHost.log.error("scheme: refused \(url.absoluteString, privacy: .public)")
            urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let fileURL = dir.appendingPathComponent(name)
        guard let data = try? Data(contentsOf: fileURL) else {
            EngineHost.log.error("scheme: missing bundle file \(name, privacy: .public)")
            urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let mime = name.hasSuffix(".js") ? "text/javascript" : name.hasSuffix(".html") ? "text/html" : "application/octet-stream"
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [
            "Content-Type": "\(mime); charset=utf-8",
            "Content-Length": String(data.count),
            "Cache-Control": "no-cache",
        ])!
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

// MARK: - Keeping the web view alive

/// Puts the engine's web view in the view hierarchy (2×2 pt, not
/// interactive). WebKit treats an unparented web view as a background page
/// and throttles it; the engine should stay a live page as long as the app
/// is open. Drop this somewhere in the root view once, e.g. behind the
/// content in a ZStack.
struct EngineHostAnchor: UIViewRepresentable {
    let host: EngineHost

    func makeUIView(context: Context) -> WKWebView { host.webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

// MARK: - JSONValue ⇄ Foundation

extension JSONValue {
    /// Foundation representation for JSONSerialization.
    var anyValue: Any {
        switch self {
        case .null: return NSNull()
        case .bool(let b): return b
        case .number(let n): return n
        case .string(let s): return s
        case .array(let a): return a.map { $0.anyValue }
        case .object(let o): return o.mapValues { $0.anyValue }
        }
    }
}
