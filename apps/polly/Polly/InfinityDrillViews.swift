import SwiftUI

// Vocab + Grammar for one cleaned-up conversation — light, playful practice
// over the analysis, no SRS, no grading. Vocab flips either direction; Grammar
// is a one-line explanation plus reveal-the-answer drills.

// MARK: - Vocab (flash, either direction)

struct InfinityVocabView: View {
    let chat: InfinityChat
    @Environment(\.dismiss) private var dismiss
    @State private var index = 0
    @State private var revealed = false
    @State private var termFirst = true

    private var cards: [InfinityVocab] { chat.analysis?.vocab ?? [] }

    var body: some View {
        ZStack {
            PollyTheme.bgRaised.ignoresSafeArea()
            VStack(spacing: 0) {
                grabber
                header
                Spacer(minLength: 0)
                if index < cards.count {
                    card(cards[index])
                } else {
                    done
                }
                Spacer(minLength: 0)
                if index < cards.count { controls }
            }
            .pollyContentColumn()
        }
    }

    private var grabber: some View {
        Capsule().fill(PollyTheme.text4).frame(width: 36, height: 5).padding(.top, 8).padding(.bottom, 4)
    }

    private var header: some View {
        HStack {
            Text("Vocab").font(.custom("Fredoka", size: 20).weight(.semibold)).foregroundStyle(PollyTheme.text)
            Spacer()
            Button {
                withAnimation { termFirst.toggle(); revealed = false }
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "arrow.left.arrow.right").font(.system(size: 11, weight: .bold))
                    Text(termFirst ? "term → English" : "English → term").font(.system(size: 12.5, weight: .semibold))
                }
                .foregroundStyle(PollyTheme.accent)
                .padding(.horizontal, 11).padding(.vertical, 7)
                .background(PollyTheme.accentSoft, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 20).padding(.vertical, 8)
    }

    private func card(_ v: InfinityVocab) -> some View {
        let front = termFirst ? v.term : v.meaning
        let back = termFirst ? v.meaning : v.term
        return Button { withAnimation(.easeOut(duration: 0.15)) { revealed.toggle() } } label: {
            VStack(spacing: 14) {
                Text("\(index + 1) of \(cards.count)")
                    .font(.system(size: 12, weight: .semibold)).foregroundStyle(PollyTheme.text3)
                Text(front)
                    .font(.custom("Fredoka", size: 30).weight(.semibold))
                    .foregroundStyle(PollyTheme.text)
                    .multilineTextAlignment(.center)
                if revealed {
                    Divider().frame(width: 60)
                    Text(back)
                        .font(.system(size: 22)).foregroundStyle(PollyTheme.accent)
                        .multilineTextAlignment(.center)
                } else {
                    Text("tap to flip").font(.system(size: 12.5)).foregroundStyle(PollyTheme.text3)
                }
            }
            .frame(maxWidth: .infinity).padding(.vertical, 44).padding(.horizontal, 20)
            .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(PollyTheme.surface))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(PollyTheme.accentDim, lineWidth: 1))
            .padding(.horizontal, 20)
        }
        .buttonStyle(.plain)
    }

    private var controls: some View {
        Button {
            withAnimation { revealed = false; index += 1 }
        } label: {
            Text(index >= cards.count - 1 ? "Finish" : "Next")
                .font(.system(size: 16, weight: .semibold)).foregroundStyle(PollyTheme.inkOnAccent)
                .frame(maxWidth: .infinity).padding(.vertical, 15)
                .background(PollyTheme.accent, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 24).padding(.bottom, 28).padding(.top, 8)
    }

    private var done: some View {
        VStack(spacing: 14) {
            ZStack { Circle().fill(PollyTheme.accentSoft).frame(width: 78, height: 78); DodoMiniMark(size: 64) }
            Text("Nice run!").font(.custom("Fredoka", size: 24).weight(.semibold)).foregroundStyle(PollyTheme.text)
            HStack(spacing: 12) {
                Button { withAnimation { index = 0; revealed = false } } label: {
                    Text("Again").font(.system(size: 15, weight: .semibold)).foregroundStyle(PollyTheme.accent)
                        .padding(.horizontal, 22).padding(.vertical, 12)
                        .background(PollyTheme.accentSoft, in: Capsule())
                }.buttonStyle(.plain)
                Button { dismiss() } label: {
                    Text("Done").font(.system(size: 15, weight: .semibold)).foregroundStyle(PollyTheme.inkOnAccent)
                        .padding(.horizontal, 22).padding(.vertical, 12)
                        .background(PollyTheme.accent, in: Capsule())
                }.buttonStyle(.plain)
            }
        }
    }
}

// MARK: - Grammar (explanation + reveal drills)

struct InfinityGrammarView: View {
    let chat: InfinityChat
    @Environment(\.dismiss) private var dismiss
    @State private var revealed: Set<String> = []

    private var points: [InfinityGrammar] { chat.analysis?.grammar ?? [] }

    var body: some View {
        ZStack {
            PollyTheme.bgRaised.ignoresSafeArea()
            VStack(spacing: 0) {
                Capsule().fill(PollyTheme.text4).frame(width: 36, height: 5).padding(.top, 8).padding(.bottom, 4)
                HStack {
                    Text("Grammar").font(.custom("Fredoka", size: 20).weight(.semibold)).foregroundStyle(PollyTheme.text)
                    Spacer()
                }
                .padding(.horizontal, 20).padding(.vertical, 8)
                ScrollView {
                    VStack(spacing: 14) {
                        ForEach(points) { pointCard($0) }
                    }
                    .pollyContentColumn()
                    .padding(20)
                }
            }
        }
    }

    private func pointCard(_ g: InfinityGrammar) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(g.point)
                .font(.custom("Fredoka", size: 18).weight(.semibold)).foregroundStyle(PollyTheme.text)
            Text(g.explain)
                .font(.system(size: 14.5)).foregroundStyle(PollyTheme.text2)
                .fixedSize(horizontal: false, vertical: true)
            if !g.drills.isEmpty {
                Divider().padding(.vertical, 2)
                ForEach(g.drills) { drill in
                    let key = "\(g.point)::\(drill.prompt)"
                    Button { withAnimation { toggle(key) } } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(drill.prompt).font(.system(size: 15)).foregroundStyle(PollyTheme.text)
                                .fixedSize(horizontal: false, vertical: true)
                            if revealed.contains(key) {
                                Text(drill.answer).font(.system(size: 15, weight: .semibold)).foregroundStyle(PollyTheme.accent)
                            } else {
                                Text("tap to show answer").font(.system(size: 12.5)).foregroundStyle(PollyTheme.text3)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(PollyTheme.surface2.opacity(0.6), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(PollyTheme.surface))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(PollyTheme.border, lineWidth: 1))
    }

    private func toggle(_ key: String) {
        if revealed.contains(key) { revealed.remove(key) } else { revealed.insert(key) }
    }
}
