import SwiftUI

/// Chat + transport + Controls sheet for one track. Port of
/// `src/app/jam/Studio.tsx`: header (back · Share · Publish over the
/// tap-to-rename title and the readout), chat feed, transport (Play/Stop,
/// readout, LED strip, Bounce, Controls), composer.
struct StudioView: View {
    /// Starter prompts for an empty track (the web app's SUGGESTIONS).
    static let starters = [
        "techno at 128 with a 909 kick and offbeat hats",
        "dub techno: soft kick, chord stabs into a long delay",
        "an acid line on the 303 over a 909 kick at 130",
        "minimal house at 122 with a fat 202 bass",
    ]
    @State private var model: StudioModel
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss
    @Environment(Session.self) private var session
    @FocusState private var composerFocused: Bool
    @State private var expandedTools: Set<String> = []

    init(trackId: String, initialMeta: TrackMeta?, engine: EngineAPI) {
        _model = State(initialValue: StudioModel(trackId: trackId, initialMeta: initialMeta, engine: engine))
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            content
            transport
            composer
        }
        .columnWidth()
        .frame(maxWidth: .infinity)
        .background(JBTheme.panel)
        .navigationBarBackButtonHidden(true)
        .background {
            // Space toggles play/stop while the composer isn't typing.
            if !composerFocused {
                Color.clear.jambotPlayStopShortcut { model.togglePlay() }
            }
        }
        .jambotControlsShortcut { model.controlsOpen.toggle() }
        .task {
            model.onAuthLost = { session.authLost() }
            await model.load()
            model.startPlayheadClock()
            // DEBUG-only: `-openControls` opens the Controls sheet right
            // after load, for headless simulator screenshots (see "NO
            // SCREEN CONTROL" in DESIGN.md/PROGRESS.md verify steps).
            if CommandLine.arguments.contains("-openControls") {
                model.controlsOpen = true
            }
            // DEBUG-only: `-studioScript "play;wait:4;…"` drives the studio
            // headlessly (see UI/StudioScript.swift).
            if let steps = StudioScript.steps {
                await StudioScript.run(steps, model: model, back: { dismiss() })
            }
        }
        .onDisappear {
            model.close()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { model.flushSave() }
        }
        // Controls and Bounce are in-window panels that slide up over the
        // studio (the web app's .jb-sheet), not .sheet presentations: on Mac
        // Catalyst a sheet presented from inside a navigationDestination can
        // never be dismissed — not through its binding, not through
        // dismiss() (tooling/catalyst-sheet-probe.sh). Overlays behave the
        // same on iPhone, iPad and Mac.
        .overlay {
            if model.controlsOpen {
                ControlsSheetView(model: model)
                    .background(JBTheme.panel.ignoresSafeArea())
                    .transition(.move(edge: .bottom))
                    .zIndex(2)
            }
        }
        .overlay {
            if model.bounceOpen {
                ZStack(alignment: .bottom) {
                    Color.black.opacity(0.28).ignoresSafeArea()
                        .onTapGesture { model.bounceOpen = false }
                        .transition(.opacity)
                    BounceSheet(render: model.lastRender, bpm: model.bpm, onDone: { model.bounceOpen = false })
                        .frame(maxWidth: 560)
                        .background(JBTheme.panel)
                        .clipShape(UnevenRoundedRectangle(topLeadingRadius: 18, topTrailingRadius: 18))
                        .transition(.move(edge: .bottom))
                }
                .zIndex(3)
            }
        }
        .animation(.easeOut(duration: 0.26), value: model.controlsOpen)
        .animation(.easeOut(duration: 0.22), value: model.bounceOpen)
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            StudioHeaderActions(
                state: model.sharing,
                onRename: { model.rename($0) },
                onPublishToggle: { Task { await model.togglePublish() } },
                leading: {
                    Button {
                        dismiss()
                    } label: {
                        HStack(alignment: .center, spacing: 3) {
                            Text("‹").font(.system(size: 18, weight: .semibold)).offset(y: -1)
                            Text("TRACKS")
                                .font(JBTheme.panelFont(12, weight: .semibold))
                                .tracking(1.44)
                        }
                        .foregroundStyle(JBTheme.ink2)
                        .frame(minHeight: 32)
                        .padding(.trailing, 8)
                    }
                    .buttonStyle(.plain)
                }
            )
            HStack(spacing: 4) {
                Text("\(model.bpm)").fontWeight(.medium) + Text(" BPM · \(model.shownBars) \(model.shownBars == 1 ? "bar" : "bars")\(model.inSong ? (model.sectionNow.map { " · section \($0)" } ?? " · song") : "")\(model.swing > 0 ? " · swing \(Int(model.swing.rounded()))" : "")")
                if model.saveState == .saving {
                    Text(" · saving").foregroundStyle(JBTheme.ink3)
                } else if model.saveState == .failed {
                    Text(" · not saved").foregroundStyle(JBTheme.orange)
                }
            }
            .font(JBTheme.monoFont(12))
            .foregroundStyle(JBTheme.ink2)
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 8)
    }

    // MARK: - Chat feed

    @ViewBuilder
    private var content: some View {
        ScrollViewReader { scroll in
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    switch model.status {
                    case .loading:
                        Text("Loading the groovebox…")
                            .font(JBTheme.monoFont(12))
                            .foregroundStyle(JBTheme.ink3)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 60)
                    case .error(let message):
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Couldn't load Jambot.").font(JBTheme.bodyFont(15, weight: .semibold))
                            Text(message).font(JBTheme.bodyFont(13)).foregroundStyle(JBTheme.ink3)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(JBTheme.panel2)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .padding(.top, 40)
                    case .ready:
                        if model.feed.isEmpty {
                            // Empty track: the web app's starter prompts. Tapping one
                            // fills the composer (not sends) so it can be edited first.
                            VStack(spacing: 10) {
                                Text("SAY IT LIKE YOU'D SAY IT TO A PRODUCER")
                                    .font(JBTheme.panelFont(11, weight: .semibold))
                                    .tracking(1)
                                    .foregroundStyle(JBTheme.ink3)
                                    .frame(maxWidth: .infinity)
                                    .multilineTextAlignment(.center)
                                    .padding(.bottom, 8)
                                ForEach(StudioView.starters, id: \.self) { prompt in
                                    Button {
                                        model.input = prompt
                                        composerFocused = true
                                    } label: {
                                        Text(prompt)
                                            .font(JBTheme.bodyFont(15, weight: .medium))
                                            .foregroundStyle(JBTheme.ink)
                                            .multilineTextAlignment(.leading)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .padding(.horizontal, 14)
                                            .padding(.vertical, 12)
                                            .background(JBTheme.panel2)
                                            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(JBTheme.rule, lineWidth: 1))
                                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityIdentifier("starter")
                                }
                            }
                            .padding(.top, 36)
                        }
                        ForEach(model.feed) { item in
                            feedRow(item)
                        }
                        if model.busy {
                            HStack(spacing: 8) {
                                JBLed(on: true, pulse: true)
                                Text("working").font(JBTheme.monoFont(11)).foregroundStyle(JBTheme.ink3)
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 12)
                .id("bottom")
            }
            .defaultScrollAnchor(.bottom)
            .onChange(of: model.feed.count) { _, _ in
                withAnimation { scroll.scrollTo("bottom", anchor: .bottom) }
            }
        }
    }

    @ViewBuilder
    private func feedRow(_ item: FeedItem) -> some View {
        switch item {
        case .user(_, let text):
            HStack {
                Spacer(minLength: 40)
                Text(text)
                    .font(JBTheme.bodyFont(15))
                    .foregroundStyle(JBTheme.keyLabel)
                    .padding(.vertical, 10)
                    .padding(.horizontal, 14)
                    .background(JBTheme.keyFill)
                    .clipShape(RoundedCorner(radius: 16, corners: [.topLeft, .topRight, .bottomLeft]))
            }
        case .assistant(_, let text):
            Text(text)
                .font(JBTheme.bodyFont(15.5))
                .foregroundStyle(JBTheme.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
        case .note(_, let text, let error):
            Text(text)
                .font(JBTheme.monoFont(11.5))
                .foregroundStyle((error ?? false) ? JBTheme.orange : JBTheme.ink3)
        case .tool(let id, let name, let input, let result, let isError):
            VStack(alignment: .leading, spacing: 4) {
                Button {
                    if expandedTools.contains(id) { expandedTools.remove(id) } else { expandedTools.insert(id) }
                } label: {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(result == nil ? JBTheme.ledOff : ((isError ?? false) ? JBTheme.orange : JBTheme.green))
                            .frame(width: 6, height: 6)
                        Text(name).font(JBTheme.monoFont(11))
                    }
                    .padding(.vertical, 3)
                    .padding(.horizontal, 9)
                    .background(JBTheme.panel3)
                    .foregroundStyle((isError ?? false) ? JBTheme.orange : JBTheme.ink2)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
                .buttonStyle(.plain)
                if expandedTools.contains(id) {
                    Text(jsonDescription(input) + (result.map { "\n→ \($0)" } ?? ""))
                        .font(JBTheme.monoFont(11))
                        .foregroundStyle(JBTheme.ink2)
                        .padding(8)
                        .background(JBTheme.panel4)
                        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(JBTheme.rule, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
            }
        }
    }

    private func jsonDescription(_ v: JSONValue) -> String {
        switch v {
        case .null: return "null"
        case .bool(let b): return "\(b)"
        case .number(let n): return "\(n)"
        case .string(let s): return s
        case .array(let a): return "[" + a.map(jsonDescription).joined(separator: ", ") + "]"
        case .object(let o): return "{" + o.map { "\($0.key): \(jsonDescription($0.value))" }.joined(separator: ", ") + "}"
        }
    }

    // MARK: - Transport

    private var transport: some View {
        VStack(spacing: 10) {
            LedStripView(strip: model.strip, step: model.ledStep)
            HStack(spacing: 10) {
                Button {
                    model.togglePlay()
                } label: {
                    Image(systemName: model.playing ? "stop.fill" : "play.fill")
                        .font(.system(size: 18))
                }
                .buttonStyle(JBKeyStyle(variant: .ink, square: true))
                .disabled(!model.hasBuffer)
                .accessibilityLabel(model.playing ? "Stop" : "Play")

                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        JBLed(on: model.playing, color: model.playing ? JBTheme.orange : JBTheme.green, alwaysLit: model.rendering, pulse: model.rendering)
                        transportReadout
                            .font(JBTheme.monoFont(12))
                            .foregroundStyle(JBTheme.ink2)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(JBTheme.rule)
                            Capsule().fill(JBTheme.ink).frame(width: geo.size.width * model.pos)
                        }
                    }
                    .frame(height: 6)
                }
                .layoutPriority(-1)

                Button("Controls") { model.controlsOpen = true }
                    .buttonStyle(JBKeyStyle(variant: .ink, size: .small))
                    .disabled(model.status != .ready)
                Button("Bounce") { model.bounceOpen = true }
                    .buttonStyle(JBKeyStyle(variant: .panel, size: .small))
                    .disabled(model.lastRender == nil)
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(JBTheme.panel3)
        .overlay(Rectangle().fill(JBTheme.rule).frame(height: 1), alignment: .top)
    }

    /// "bar **2**/16" / "section **1** · bar **3**/8" — the numbers in ink,
    /// the rest ink-2, like `.jb-readout b`.
    private var transportReadout: Text {
        let label = model.transportLabel
        var out = Text("")
        var run = ""
        func flush() { if !run.isEmpty { out = out + Text(run); run = "" } }
        var i = label.startIndex
        while i < label.endIndex {
            let ch = label[i]
            if ch.isNumber {
                flush()
                var j = i
                while j < label.endIndex, label[j].isNumber { j = label.index(after: j) }
                // only the first number of "n/N" is emphasised
                let isDenominator = i > label.startIndex && label[label.index(before: i)] == "/"
                let num = Text(String(label[i..<j]))
                out = out + (isDenominator ? num : num.fontWeight(.medium).foregroundColor(JBTheme.ink))
                i = j
            } else {
                run.append(ch)
                i = label.index(after: i)
            }
        }
        flush()
        return out
    }

    // MARK: - Composer

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 8) {
            TextField("tell it what to play…", text: $model.input, prompt: jbPrompt("tell it what to play…"), axis: .vertical)
                .lineLimit(1...4)
                .jbField()
                .focused($composerFocused)
                .disabled(model.status != .ready)

            Button("Send") {
                model.send(model.input)
            }
            .buttonStyle(JBKeyStyle(variant: .orange))
            .disabled(model.status != .ready || model.busy || model.input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .jambotSendShortcut { model.send(model.input) }
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 10)
        .background(JBTheme.panel3)
    }
}

/// Rounded rect with per-corner radii, for the chat bubble's tail corner.
private struct RoundedCorner: Shape {
    var radius: CGFloat = 12
    var corners: UIRectCorner = .allCorners

    func path(in rect: CGRect) -> Path {
        Path(UIBezierPath(roundedRect: rect, byRoundingCorners: corners, cornerRadii: CGSize(width: radius, height: radius)).cgPath)
    }
}

#Preview {
    NavigationStack {
        StudioView(trackId: "preview", initialMeta: nil, engine: MockEngine())
    }
    .environment(Session())
}
