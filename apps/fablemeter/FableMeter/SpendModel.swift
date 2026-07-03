/*
 * SpendModel — computes Fable 5 API spend from the local proxy's usage log.
 *
 * Reads ~/.fablemeter/usage.jsonl (one JSON object per API call, written by
 * proxy/fable-proxy.mjs), keeps the lines whose model mentions "fable", and
 * prices the tokens at the published Fable 5 rates. No admin key, no cost
 * API, no account access — just the token counts the proxy tapped from your
 * own traffic. Reset is exact: it stamps a cutoff time and the counter shows
 * only calls after it.
 *
 * Pricing (per token), Fable 5:
 *   input               $10 / 1M   = 10e-6
 *   output              $50 / 1M   = 50e-6
 *   cache write (5m)    1.25x in   = 12.5e-6
 *   cache read          0.1x in    = 1.0e-6
 */
import Foundation
import Observation

@Observable
final class SpendModel {
    private static let logPath = "\(NSHomeDirectory())/.fablemeter/usage.jsonl"
    private static let refreshInterval: TimeInterval = 5

    private static let priceInput = 10.0e-6
    private static let priceOutput = 50.0e-6
    private static let priceCacheWrite = 12.5e-6
    private static let priceCacheRead = 1.0e-6

    var lifetimeTotal: Double? = nil     // all-time Fable cost (nil until first read)
    var spentSinceReset: Double? = nil   // cost of calls after the reset cutoff
    var callCount: Int = 0               // Fable calls counted since reset
    var errorText: String? = nil
    var isLoading = false
    var lastFetch: Date? = nil

    private var timer: Timer? = nil

    init() {
        let t = Timer(timeInterval: Self.refreshInterval, repeats: true) { [weak self] _ in
            Task { await self?.refresh() }
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
        Task { await refresh() }
    }

    // ---- reset bookkeeping ----

    private var resetTs: Double {
        get { UserDefaults.standard.double(forKey: "resetTs") }   // 0 = never reset
        set { UserDefaults.standard.set(newValue, forKey: "resetTs") }
    }
    private var resetDate: Date? {
        get { UserDefaults.standard.object(forKey: "resetDate") as? Date }
        set { UserDefaults.standard.set(newValue, forKey: "resetDate") }
    }

    func resetCounter() {
        resetTs = Date().timeIntervalSince1970
        resetDate = Date()
        Task { await refresh() }
    }

    // ---- display ----

    var menuTitle: String {
        guard let spent = spentSinceReset else { return "ƒ—" }
        return String(format: "ƒ$%.2f", spent)
    }

    var displayAmount: String {
        guard let spent = spentSinceReset else { return "$–.––" }
        return String(format: "$%.2f", spent)
    }

    var subtitle: String {
        var parts: [String] = []
        if let reset = resetDate {
            parts.append("since \(reset.formatted(date: .abbreviated, time: .shortened))")
        } else {
            parts.append("all-time")
        }
        parts.append("\(callCount) call\(callCount == 1 ? "" : "s")")
        return parts.joined(separator: "  ·  ")
    }

    // ---- reading the proxy log ----

    func refreshIfStale() async {
        if let last = lastFetch, Date().timeIntervalSince(last) < 2 { return }
        await refresh()
    }

    @MainActor
    func refresh() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        guard FileManager.default.fileExists(atPath: Self.logPath) else {
            lifetimeTotal = 0; spentSinceReset = 0; callCount = 0
            errorText = "No usage logged yet. Start the proxy (node fable-proxy.mjs) and route calls through it: export ANTHROPIC_BASE_URL=http://127.0.0.1:8787"
            lastFetch = Date()
            return
        }
        guard let text = try? String(contentsOfFile: Self.logPath, encoding: .utf8) else {
            errorText = "Can't read \(Self.logPath)"
            lastFetch = Date()
            return
        }

        let cutoff = resetTs
        var lifetime = 0.0, sinceReset = 0.0, count = 0

        for line in text.split(separator: "\n") {
            guard let data = line.data(using: .utf8),
                  let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue }
            let model = (obj["model"] as? String ?? "").lowercased()
            guard model.contains("fable") else { continue }

            let cost = Self.priceInput * dbl(obj["input_tokens"])
                     + Self.priceOutput * dbl(obj["output_tokens"])
                     + Self.priceCacheWrite * dbl(obj["cache_creation_input_tokens"])
                     + Self.priceCacheRead * dbl(obj["cache_read_input_tokens"])
            lifetime += cost

            let ts = dbl(obj["ts"])
            if ts >= cutoff {
                sinceReset += cost
                count += 1
            }
        }

        lifetimeTotal = lifetime
        spentSinceReset = sinceReset
        callCount = count
        errorText = nil
        lastFetch = Date()
    }

    private func dbl(_ v: Any?) -> Double {
        switch v {
        case let n as NSNumber: return n.doubleValue
        case let s as String: return Double(s) ?? 0
        default: return 0
        }
    }
}
