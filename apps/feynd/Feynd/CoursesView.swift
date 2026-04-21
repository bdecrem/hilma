import SwiftUI

// MARK: - List of available courses

struct CoursesListView: View {
    let onOpen: (Course) -> Void

    private let courses: [Course] = CourseStore.loadAll()

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                Spacer(minLength: 4)

                if courses.isEmpty {
                    EmptyState()
                        .padding(.top, 40)
                } else {
                    ForEach(courses) { c in
                        CourseRow(course: c)
                            .onTapGesture { onOpen(c) }
                    }
                    .padding(.horizontal, 20)
                }

                Spacer(minLength: 60)
            }
        }
        .scrollIndicators(.hidden)
    }
}

private struct CourseRow: View {
    let course: Course

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            // Accent bezel
            ZStack {
                Circle()
                    .fill(Color(hex: course.accentHex).opacity(0.22))
                    .frame(width: 56, height: 56)
                Image(systemName: "sparkles")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(Color(hex: course.accentHex))
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(course.title)
                    .font(.system(size: 18, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
                Text(course.subtitle)
                    .font(.system(size: 13, design: .rounded))
                    .foregroundStyle(.white.opacity(0.62))
                    .lineLimit(2)
                HStack(spacing: 8) {
                    Label("\(course.videos.count) videos", systemImage: "play.circle.fill")
                    Text("·").foregroundStyle(.white.opacity(0.4))
                    Label("~\(course.estimatedHours)h", systemImage: "clock")
                }
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .foregroundStyle(Color(hex: course.accentHex))
                .padding(.top, 2)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white.opacity(0.3))
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(Color.white.opacity(0.05))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
        .contentShape(Rectangle())
    }
}

private struct EmptyState: View {
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "sparkles")
                .font(.system(size: 44, weight: .light))
                .foregroundStyle(
                    LinearGradient(
                        colors: [
                            Color(red: 0.98, green: 0.72, blue: 0.42),
                            Color(red: 0.95, green: 0.35, blue: 0.52)
                        ],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                )
            Text("No courses yet")
                .font(.system(size: 22, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
            Text("Courses will show up here as soon as they're bundled with the app.")
                .font(.system(size: 14, design: .rounded))
                .foregroundStyle(.white.opacity(0.58))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
    }
}

// MARK: - Course detail

struct CourseDetailView: View {
    let course: Course
    let onAskAbout: (CourseVideo) -> Void
    let onClose: () -> Void

    @State private var progress: CourseProgress
    @Environment(\.openURL) private var openURL

    init(course: Course,
         onAskAbout: @escaping (CourseVideo) -> Void,
         onClose: @escaping () -> Void) {
        self.course = course
        self.onAskAbout = onAskAbout
        self.onClose = onClose
        self._progress = State(initialValue: CourseProgress(courseId: course.id))
    }

    var body: some View {
        ZStack(alignment: .top) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    progressBar
                    videoList
                    conceptMap
                    Spacer(minLength: 100)
                }
                .padding(.horizontal, 20)
                .padding(.top, 68)
            }
            .scrollIndicators(.hidden)

            // Close button
            HStack {
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.8))
                        .frame(width: 34, height: 34)
                        .background(
                            Circle().fill(.ultraThinMaterial)
                        )
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
    }

    // MARK: header

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(course.title)
                .font(.system(size: 26, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
            Text(course.subtitle)
                .font(.system(size: 14, design: .rounded))
                .foregroundStyle(.white.opacity(0.62))
            Text(course.description)
                .font(.system(size: 14, design: .rounded))
                .foregroundStyle(.white.opacity(0.75))
                .padding(.top, 6)
                .lineSpacing(3)
        }
    }

    private var progressBar: some View {
        let pct = progress.percent(of: course.videos.count)
        let accent = Color(hex: course.accentHex)
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("\(progress.watched.count) / \(course.videos.count) watched")
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white.opacity(0.7))
                Spacer()
                Text("\(Int(pct * 100))%")
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(accent)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.08))
                    Capsule()
                        .fill(accent)
                        .frame(width: max(4, geo.size.width * pct))
                }
            }
            .frame(height: 6)
        }
    }

    // MARK: video list

    private var videoList: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Videos")
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
                .padding(.top, 4)

            VStack(spacing: 10) {
                ForEach(course.videos.sorted(by: { $0.order < $1.order })) { v in
                    VideoRow(
                        video: v,
                        accent: Color(hex: course.accentHex),
                        isWatched: progress.isWatched(v.id),
                        onToggleWatched: { progress.toggle(v.id) },
                        onWatch: {
                            if let url = URL(string: v.url) {
                                openURL(url)
                                progress.markWatched(v.id)
                            }
                        },
                        onAsk: { onAskAbout(v) }
                    )
                }
            }
        }
    }

    // MARK: concept map

    private var conceptMap: some View {
        let lit = progress.litConcepts(in: course)
        let groups: [(String, [Concept])] = Dictionary(grouping: course.concepts, by: { $0.group })
            .sorted { a, b in
                // Preserve the JSON-declared group order by matching first
                // appearance in course.concepts.
                let ia = course.concepts.firstIndex(where: { $0.group == a.key }) ?? 0
                let ib = course.concepts.firstIndex(where: { $0.group == b.key }) ?? 0
                return ia < ib
            }
            .map { ($0.key, $0.value) }

        return VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Concepts")
                    .font(.system(size: 17, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
                Spacer()
                Text("\(lit.count) / \(course.concepts.count) unlocked")
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundStyle(Color(hex: course.accentHex))
            }
            .padding(.top, 8)

            ForEach(groups, id: \.0) { (name, items) in
                VStack(alignment: .leading, spacing: 8) {
                    Text(name.uppercased())
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .foregroundStyle(.white.opacity(0.45))
                        .tracking(0.8)
                    FlowLayout(spacing: 6) {
                        ForEach(items) { c in
                            ConceptChip(
                                concept: c,
                                lit: lit.contains(c.id),
                                accent: Color(hex: course.accentHex)
                            )
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Video row

private struct VideoRow: View {
    let video: CourseVideo
    let accent: Color
    let isWatched: Bool
    let onToggleWatched: () -> Void
    let onWatch: () -> Void
    let onAsk: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                Button(action: onToggleWatched) {
                    ZStack {
                        Circle()
                            .stroke(isWatched ? accent : Color.white.opacity(0.25), lineWidth: 1.5)
                            .frame(width: 24, height: 24)
                        if isWatched {
                            Circle().fill(accent).frame(width: 18, height: 18)
                            Image(systemName: "checkmark")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(.black.opacity(0.85))
                        }
                    }
                }
                .buttonStyle(.plain)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text("#\(video.order)")
                            .font(.system(size: 10, weight: .bold, design: .rounded))
                            .foregroundStyle(accent)
                        Text("·")
                            .foregroundStyle(.white.opacity(0.35))
                        Text("\(video.durationMin) min")
                            .font(.system(size: 10, weight: .medium, design: .rounded))
                            .foregroundStyle(.white.opacity(0.55))
                    }
                    Text(video.title)
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("\(video.author) · \(video.host) · \(video.publishedOn)")
                        .font(.system(size: 11, weight: .medium, design: .rounded))
                        .foregroundStyle(.white.opacity(0.5))
                    Text(video.blurb)
                        .font(.system(size: 12, design: .rounded))
                        .foregroundStyle(.white.opacity(0.65))
                        .lineSpacing(2)
                        .padding(.top, 2)
                }
            }

            HStack(spacing: 8) {
                Spacer()
                Button(action: onAsk) {
                    HStack(spacing: 6) {
                        Image(systemName: "waveform")
                        Text("Ask Feynd")
                    }
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(Capsule().fill(Color.white.opacity(0.1)))
                }
                .buttonStyle(.plain)

                Button(action: onWatch) {
                    HStack(spacing: 6) {
                        Image(systemName: "play.fill")
                        Text("Watch")
                    }
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(Color(red: 0.14, green: 0.06, blue: 0.10))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(Capsule().fill(accent))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.white.opacity(0.04))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.white.opacity(isWatched ? 0.12 : 0.05), lineWidth: 1)
        )
    }
}

// MARK: - Concept chip

private struct ConceptChip: View {
    let concept: Concept
    let lit: Bool
    let accent: Color

    var body: some View {
        Text(concept.label)
            .font(.system(size: 11, weight: .semibold, design: .rounded))
            .foregroundStyle(lit ? Color(red: 0.14, green: 0.06, blue: 0.10) : Color.white.opacity(0.6))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule().fill(lit ? accent : Color.white.opacity(0.07))
            )
            .overlay(
                Capsule().stroke(lit ? Color.clear : Color.white.opacity(0.08), lineWidth: 1)
            )
    }
}

// MARK: - Flow layout (iOS 16+ Layout proto)

struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxW = proposal.width ?? .infinity
        let rows = computeRows(maxWidth: maxW, subviews: subviews)
        let height = rows.reduce(CGFloat(0)) { $0 + ($0 == 0 ? 0 : spacing) + ($1.maxH) }
        let width = rows.map { $0.totalW }.max() ?? 0
        return CGSize(width: min(width, maxW), height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let rows = computeRows(maxWidth: bounds.width, subviews: subviews)
        var y = bounds.minY
        for row in rows {
            var x = bounds.minX
            for idx in row.indices {
                let size = subviews[idx].sizeThatFits(.unspecified)
                subviews[idx].place(
                    at: CGPoint(x: x, y: y),
                    anchor: .topLeading,
                    proposal: ProposedViewSize(size)
                )
                x += size.width + spacing
            }
            y += row.maxH + spacing
        }
    }

    private struct Row {
        var indices: [Int] = []
        var totalW: CGFloat = 0
        var maxH: CGFloat = 0
    }

    private func computeRows(maxWidth: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = [Row()]
        for (i, sub) in subviews.enumerated() {
            let size = sub.sizeThatFits(.unspecified)
            let needed = (rows.last!.indices.isEmpty ? 0 : spacing) + size.width
            if (rows.last!.totalW + needed) > maxWidth && !rows.last!.indices.isEmpty {
                rows.append(Row())
            }
            var row = rows.removeLast()
            if !row.indices.isEmpty { row.totalW += spacing }
            row.indices.append(i)
            row.totalW += size.width
            row.maxH = max(row.maxH, size.height)
            rows.append(row)
        }
        return rows
    }
}
