/*
 * FableMeter — a menu bar meter for Claude Fable 5 API spend.
 *
 * Shows "ƒ$12.34" in the menu bar: dollars spent on claude-fable-5 through
 * the Anthropic API since the last reset. Data comes from a local logging
 * proxy (proxy/fable-proxy.mjs) that taps token usage out of your own API
 * traffic — no admin key, no cost API, nothing on your account touched. Only
 * calls routed through the proxy are counted. Reset stamps a cutoff time and
 * the counter shows only calls after it.
 */
import SwiftUI

@main
struct FableMeterApp: App {
    @State private var model = SpendModel()

    var body: some Scene {
        MenuBarExtra {
            MeterPanel(model: model)
        } label: {
            Text(model.menuTitle)
                .monospacedDigit()
        }
        .menuBarExtraStyle(.window)
    }
}

struct MeterPanel: View {
    @Bindable var model: SpendModel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("ƒ")
                    .font(.system(size: 26, weight: .light, design: .serif))
                    .italic()
                    .foregroundStyle(.secondary)
                Text("Fable spend")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.secondary)
                Spacer()
            }

            Text(model.displayAmount)
                .font(.system(size: 34, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .contentTransition(.numericText())

            Text(model.subtitle)
                .font(.system(size: 11))
                .foregroundStyle(.tertiary)

            if let error = model.errorText {
                Text(error)
                    .font(.system(size: 11))
                    .foregroundStyle(.orange)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Divider()

            HStack(spacing: 12) {
                Button {
                    Task { await model.refresh() }
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
                .disabled(model.isLoading)

                Button {
                    model.resetCounter()
                } label: {
                    Label("Reset", systemImage: "arrow.counterclockwise.circle")
                }
                .disabled(model.lifetimeTotal == nil)

                Spacer()

                Button("Quit") { NSApp.terminate(nil) }
            }
            .buttonStyle(.borderless)
            .controlSize(.small)
            .font(.system(size: 11))
        }
        .padding(14)
        .frame(width: 260)
        .task { await model.refreshIfStale() }
    }
}
