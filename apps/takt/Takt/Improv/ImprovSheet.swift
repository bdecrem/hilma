import SwiftUI

/// Over an improv once the take is sent (IMPROV.md): the teacher at work, then the review: what
/// it loved, two or three notes, the one idea (made from your take) and the way to play it.
struct ImprovSheet: View {
    let app: AppModel
    let state: AppModel.ImprovReview
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        let compact = sizeClass == .compact
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("The teacher")
                    .font(.display(compact ? 28 : 32))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.text)
                Spacer()
                Button("Close", action: app.closeReview)
                    .dataLabel(13, weight: .semibold)
                    .foregroundStyle(Palette.muted)
                    .buttonStyle(.plain)
            }
            Text("Your take · \(state.count.choruses == 1 ? "1 chorus" : "\(state.count.choruses) choruses") · \(state.count.notes) notes")
                .dataLabel(11)
                .foregroundStyle(Palette.muted)
                .padding(.top, 4)

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    switch state.phase {
                    case .listening(let steps):
                        WorkingPanel(steps: ["Sending your take"] + steps, started: state.started, compact: compact)
                    case .failed(let text):
                        Text(text)
                            .bodyText(15)
                            .foregroundStyle(Palette.text)
                            .fixedSize(horizontal: false, vertical: true)
                        PrimaryButton(title: "Send it again", action: app.resendTake)
                    case .reviewed(let review, _):
                        reviewed(review, compact: compact)
                    }
                }
                .padding(.top, 18)
                .padding(.bottom, 8)
            }
            .scrollBounceBehavior(.basedOnSize)

            if case .reviewed(let review, _) = state.phase {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 10) { buttons(review) }
                    VStack(alignment: .leading, spacing: 10) { buttons(review) }
                }
                .padding(.top, 12)
            }
        }
        .padding(compact ? 20 : 28)
        .frame(minWidth: compact ? nil : 520, idealWidth: 560, minHeight: compact ? nil : 600)
        .background(Palette.ground.ignoresSafeArea())
    }

    @ViewBuilder private func buttons(_ review: Improv.Review) -> some View {
        PrimaryButton(title: "Try my version · +\(Improv.XP.version) XP", action: app.tryVersion)
        QuietButton(title: "Improvise again", action: app.improviseAgain)
    }

    @ViewBuilder private func reviewed(_ review: Improv.Review, compact: Bool) -> some View {
        Text(review.headline)
            .font(.display(compact ? 30 : 36))
            .textCase(.uppercase)
            .foregroundStyle(Palette.signal)
            .fixedSize(horizontal: false, vertical: true)
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(review.notes.enumerated()), id: \.offset) { _, note in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Circle().fill(Palette.signal).frame(width: 6, height: 6).offset(y: -2)
                    Text(note)
                        .bodyText(compact ? 15 : 16)
                        .foregroundStyle(Palette.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        if state.xp > 0 || !state.goals.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                if state.xp > 0 {
                    Text("+\(state.xp) XP").dataLabel(12, weight: .semibold).foregroundStyle(Palette.signal)
                }
                ForEach(Array(state.goals.enumerated()), id: \.offset) { _, g in
                    HStack(spacing: 6) {
                        Image(systemName: g.met ? "checkmark.circle.fill" : "circle")
                            .font(.system(size: 12, weight: .semibold))
                        Text(g.met ? "\(g.title): done" : "\(g.title): \(missing)")
                            .dataLabel(11)
                    }
                    .foregroundStyle(g.met ? Palette.good : Palette.muted)
                }
            }
        }
        IdeaCard(idea: review.idea, compact: compact)
        // The whole track, written from the idea once the review is in (over a Stage song).
        if let job = app.trackJob, job.base == state.backingSong {
            TrackCard(job: job, compact: compact, play: app.playTrack, retry: app.retryTrack)
        }
    }

    /// What the take still needs for a level's improv goal (the plan's numbers).
    private var missing: String {
        let titles = state.goals.map(\.title)
        let item = app.plan.levels.flatMap(\.items).first { i in i.kind == .improv && titles.contains { $0.hasSuffix(i.title) } }
        guard let item else { return "not this time" }
        var need: [String] = []
        if state.count.choruses < (item.choruses ?? 0) { need.append("\(item.choruses ?? 0) whole choruses") }
        if state.count.notes < (item.minNotes ?? 0) { need.append("\(item.minNotes ?? 0) notes") }
        if state.count.inScale < (item.inScale ?? 1) - 1e-9 { need.append("\(Int(((item.inScale ?? 1) * 100).rounded()))% on the notes") }
        return need.isEmpty ? "not this time" : "next time, " + need.joined(separator: ", ")
    }
}

/// The one idea: its name, why, and the notes as a row of keys a bar at a time, each with its finger.
struct IdeaCard: View {
    let idea: Improv.Review.Idea
    let compact: Bool

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        VStack(alignment: .leading, spacing: 10) {
            Text("One idea · \(idea.bars == 1 ? "1 bar" : "\(idea.bars) bars")")
                .dataLabel(11, weight: .semibold)
                .foregroundStyle(Palette.cue)
            Text(idea.title)
                .font(.display(compact ? 22 : 26))
                .textCase(.uppercase)
                .foregroundStyle(Palette.text)
                .fixedSize(horizontal: false, vertical: true)
            Text(idea.why)
                .bodyText(compact ? 14 : 15)
                .foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
            IdeaRoll(idea: idea)
                .frame(height: compact ? 90 : 110)
                .padding(.top, 4)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.cue.opacity(0.6), lineWidth: 1))
    }
}

/// The whole track (IMPROV.md): the teacher writing a solo over every bar of the backing song
/// from the idea, step by step, then the track as it landed on the Stage, the song's Solo
/// level, with Play; or what went wrong and Write it again.
struct TrackCard: View {
    let job: AppModel.TrackJob
    let compact: Bool
    let play: () -> Void
    let retry: () -> Void

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        VStack(alignment: .leading, spacing: 10) {
            Text("The whole track · \(job.baseTitle)")
                .dataLabel(11, weight: .semibold)
                .foregroundStyle(Palette.cue)
            switch job.phase {
            case .writing(let steps):
                HStack(spacing: 10) {
                    PulseDot()
                    Text(steps.last ?? "Sending the review")
                        .bodyText(compact ? 14 : 15)
                        .foregroundStyle(Palette.text)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                    TimelineView(.periodic(from: job.started, by: 1)) { ctx in
                        Text("\(Int(ctx.date.timeIntervalSince(job.started))) s")
                            .dataLabel(11)
                            .foregroundStyle(Palette.muted)
                            .monospacedDigit()
                    }
                }
                Text("A solo over all of \(job.baseTitle), grown from your idea: it moves with the changes and changes chorus by chorus. It lands on the Stage as \(job.baseTitle)'s Solo level; you can close this and keep playing.")
                    .bodyText(compact ? 13 : 14)
                    .foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            case .done(let title, let line, _):
                Text(title)
                    .font(.display(compact ? 22 : 26))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.text)
                    .fixedSize(horizontal: false, vertical: true)
                Text(line)
                    .bodyText(compact ? 14 : 15)
                    .foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                Text("On the Stage: \(job.baseTitle) · Melody · Solo. Every note, as written.")
                    .dataLabel(11)
                    .foregroundStyle(Palette.muted)
                PrimaryButton(title: "Play the whole track", action: play)
                    .padding(.top, 4)
            case .failed(let text):
                Text(text)
                    .bodyText(compact ? 14 : 15)
                    .foregroundStyle(Palette.text)
                    .fixedSize(horizontal: false, vertical: true)
                QuietButton(title: "Write it again", action: retry)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.cue.opacity(0.6), lineWidth: 1))
        .animation(.easeOut(duration: 0.25), value: job.phase)
    }
}

/// The idea drawn as a little piano roll: time across (the bars marked), pitch up, every note a
/// capsule with its finger, the lowest and highest named.
struct IdeaRoll: View {
    let idea: Improv.Review.Idea

    var body: some View {
        Canvas { ctx, size in
            let span = CGFloat(idea.bars * 48)
            let low = idea.notes.map(\.n).min() ?? 60, high = idea.notes.map(\.n).max() ?? 72
            let rows = CGFloat(max(4, high - low + 1))
            let rowH = min(14, (size.height - 4) / rows)
            func y(_ n: Int) -> CGFloat { size.height - 2 - CGFloat(n - low + 1) * rowH - (size.height - 4 - rows * rowH) / 2 }
            for b in 0...idea.bars {
                let x = CGFloat(b * 48) / span * size.width
                ctx.stroke(Path { p in p.move(to: CGPoint(x: x, y: 0)); p.addLine(to: CGPoint(x: x, y: size.height)) },
                           with: .color(Palette.line), lineWidth: b == 0 || b == idea.bars ? 1 : 1)
            }
            for beat in 0..<(idea.bars * 4) where beat % 4 != 0 {
                let x = CGFloat(beat * 12) / span * size.width
                ctx.stroke(Path { p in p.move(to: CGPoint(x: x, y: 0)); p.addLine(to: CGPoint(x: x, y: size.height)) },
                           with: .color(Palette.line.opacity(0.45)), style: StrokeStyle(lineWidth: 1, dash: [2, 3]))
            }
            for n in idea.notes {
                let x = CGFloat(n.t) / span * size.width
                let w = max(rowH, CGFloat(n.len) / span * size.width - 2)
                let rect = CGRect(x: x + 1, y: y(n.n), width: w, height: rowH - 1)
                ctx.fill(Path(roundedRect: rect, cornerRadius: (rowH - 1) / 2), with: .color(Palette.cue))
                if rowH >= 10 {
                    ctx.draw(Text("\(n.f)").font(.system(size: rowH - 4, weight: .bold, design: .monospaced)).foregroundStyle(Palette.ground),
                             at: CGPoint(x: x + 1 + rowH / 2, y: rect.midY))
                }
            }
        }
        .accessibilityElement()
        .accessibilityLabel("The idea: \(idea.notes.map { Self.name($0.n) }.joined(separator: ", "))")
    }

    static func name(_ n: Int) -> String {
        ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][(n % 12 + 12) % 12] + "\(n / 12 - 1)"
    }
}
