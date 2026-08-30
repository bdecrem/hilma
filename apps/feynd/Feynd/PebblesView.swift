import SwiftUI
import PhotosUI
import UIKit

/// Pebbles — the keepsake shelf. Dodos swallowed little stones to grind up
/// their food; these are the stones that help digest what you read. A
/// full-screen swipeable carousel of saved quotes, one per page, reached
/// from the pebble button in the Flash tab. The same card shows one quote
/// at random on the flash grading screen.
struct PebblesView: View {
    /// Non-nil = show only this topic's quotes (the Quotes chip in a topic).
    /// The + form pre-picks the topic, and cards drop the redundant chip.
    var threadId: String? = nil
    var topicLabel: String? = nil

    @Environment(\.dismiss) private var dismiss

    @State private var artifacts: [F2Artifact] = []
    @State private var loading = true
    @State private var loadError: String? = nil
    @State private var page = 0
    @State private var adding = false
    @State private var confirmDeleteId: String? = nil

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                if loading && artifacts.isEmpty {
                    ProgressView().tint(FeyndTheme.text2)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let loadError, artifacts.isEmpty {
                    message(loadError)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if artifacts.isEmpty {
                    emptyState
                } else {
                    carousel
                    dots
                }
            }
        }
        .task {
            #if targetEnvironment(simulator)
            // `-OpenPebbleAdd 1` — straight to the save-a-quote form.
            if UserDefaults.standard.bool(forKey: "OpenPebbleAdd") {
                UserDefaults.standard.removeObject(forKey: "OpenPebbleAdd")
                adding = true
            }
            #endif
            await load()
        }
        .sheet(isPresented: $adding) {
            PebbleAddSheet(presetTopicId: threadId) { await load() }
        }
        .confirmationDialog(
            "Drop this pebble?",
            isPresented: Binding(
                get: { confirmDeleteId != nil },
                set: { if !$0 { confirmDeleteId = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                if let id = confirmDeleteId { delete(id) }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    // MARK: - Pieces

    private var header: some View {
        HStack(spacing: 8) {
            PebbleGlyph(size: 16)
            Text("Pebbles")
                .font(.system(size: 17, weight: .bold))
                .tracking(-0.2)
                .foregroundStyle(FeyndTheme.text)
            Spacer()
            Button { adding = true } label: {
                Image(systemName: "plus")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(FeyndTheme.text)
                    .frame(width: 32, height: 32)
                    .background(FeyndTheme.surface2, in: Circle())
                    .overlay(Circle().stroke(FeyndTheme.border, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Save a new quote")
            Button { closeModal(dismiss) } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(FeyndTheme.text2)
                    .frame(width: 32, height: 32)
                    .background(FeyndTheme.surface2, in: Circle())
                    .overlay(Circle().stroke(FeyndTheme.border, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .keyboardShortcut(.cancelAction)
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 8)
    }

    private var carousel: some View {
        TabView(selection: $page) {
            ForEach(Array(artifacts.enumerated()), id: \.element.id) { i, artifact in
                PebbleQuoteCard(artifact: artifact, showTopic: threadId == nil,
                                fillsHeight: true,
                                onOpenTopic: { closeModal(dismiss) })
                    .padding(.horizontal, 24)
                    .padding(.vertical, 6)
                    .contextMenu {
                        Button(role: .destructive) {
                            confirmDeleteId = artifact.id
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                    .tag(i)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .animation(.easeOut(duration: 0.2), value: artifacts)
    }

    /// Custom page dots — the active one stretches, marigold.
    private var dots: some View {
        HStack(spacing: 7) {
            ForEach(artifacts.indices, id: \.self) { i in
                Capsule()
                    .fill(i == page ? FeyndTheme.accent : FeyndTheme.text4)
                    .frame(width: i == page ? 20 : 7, height: 7)
            }
        }
        .animation(.easeOut(duration: 0.2), value: page)
        .padding(.bottom, 26)
        .padding(.top, 6)
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Spacer()
            PebbleGlyph(size: 44)
            Text(threadId == nil ? "No pebbles yet" : "No pebbles from this topic yet")
                .font(.system(size: 20, weight: .bold))
                .tracking(-0.3)
                .foregroundStyle(FeyndTheme.text)
            Text("Dodos swallowed little stones to grind up their food. Save the lines you want to keep — they'll come back to you between rounds.")
                .font(.system(size: 14))
                .lineSpacing(3)
                .foregroundStyle(FeyndTheme.text2)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 44)
            Button { adding = true } label: {
                Text("Save a quote")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(FeyndTheme.inkOnAccent)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(FeyndTheme.accent, in: Capsule())
            }
            .buttonStyle(.plain)
            .padding(.top, 6)
            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private func message(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13))
            .foregroundStyle(FeyndTheme.text3)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 32)
    }

    // MARK: - Data

    private func load() async {
        loading = artifacts.isEmpty
        loadError = nil
        do {
            let all = try await F2API.shared.listArtifacts()
            artifacts = threadId == nil ? all : all.filter { $0.threadId == threadId }
            page = min(page, max(0, artifacts.count - 1))
        } catch {
            loadError = "Couldn't load your pebbles: \(error.localizedDescription)"
        }
        loading = false
    }

    private func delete(_ id: String) {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        artifacts.removeAll { $0.id == id }
        page = min(page, max(0, artifacts.count - 1))
        Task { try? await F2API.shared.deleteArtifact(id: id) }
    }
}

// MARK: - The quote card

/// One quote, nicely typeset: big marigold quote mark, serif body, a rule,
/// then the source and the topic chip. Shared by the carousel and the
/// grading screen.
struct PebbleQuoteCard: View {
    let artifact: F2Artifact
    /// Off inside a single topic's shelf, where the chip is redundant.
    var showTopic: Bool = true
    /// Carousel mode: the card fills its page and no band ever scrolls —
    /// the footer pins to the card's floor, short quotes float centered.
    /// Off (the grading screen) it stays compact and self-sizing.
    var fillsHeight: Bool = false
    /// Band F's hand-off: called before routing to the topic so the host
    /// (a sheet) can dismiss itself.
    var onOpenTopic: (() -> Void)? = nil

    /// The six bands: type and quote mark step down as the quote grows.
    /// Deterministic by length — the same pebble always renders the same.
    private struct Band {
        let quote: CGFloat
        let spacing: CGFloat
        let mark: CGFloat
        let centered: Bool
        let capped: Bool
    }
    private var band: Band {
        switch artifact.body.count {
        case ...90:  return Band(quote: 27, spacing: 8, mark: 56, centered: true, capped: false)
        case ...200: return Band(quote: 23, spacing: 8, mark: 48, centered: true, capped: false)
        case ...360: return Band(quote: 19, spacing: 7, mark: 40, centered: false, capped: false)
        case ...600: return Band(quote: 16.5, spacing: 7, mark: 34, centered: false, capped: false)
        case ...900: return Band(quote: 14.5, spacing: 6, mark: 30, centered: false, capped: false)
        default:     return Band(quote: 13.5, spacing: 5, mark: 28, centered: false, capped: true)
        }
    }

    @State private var showFullImage = false

    var body: some View {
        if artifact.isImage {
            imageCard
        } else {
            quoteCard
        }
    }

    /// Photo pebble: the picture fills the card, caption + footer below.
    private var imageCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            PebbleImage(url: artifact.imageUrl ?? "", corner: 16)
                .frame(maxWidth: .infinity)
                .frame(maxHeight: fillsHeight ? .infinity : 260)
                .onTapGesture { showFullImage = true }
            if !artifact.body.isEmpty {
                Text(artifact.body)
                    .font(.system(size: 16, design: .serif))
                    .lineSpacing(5)
                    .foregroundStyle(FeyndTheme.text)
                    .lineLimit(fillsHeight ? 6 : 3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 14)
                    .padding(.bottom, 12)
            } else {
                Spacer().frame(height: 4)
            }
            footer
        }
        .padding(18)
        .frame(maxWidth: .infinity,
               maxHeight: fillsHeight ? .infinity : nil,
               alignment: .leading)
        .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(FeyndTheme.border, lineWidth: 1))
        .fullScreenCover(isPresented: $showFullImage) {
            PebbleImageViewer(url: artifact.imageUrl ?? "", caption: artifact.body)
        }
    }

    private var quoteCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            if fillsHeight && band.centered { Spacer(minLength: 0) }

            Text("\u{201C}")
                .font(.system(size: band.mark, weight: .bold, design: .serif))
                .foregroundStyle(FeyndTheme.accent)
                .frame(height: band.mark * 0.6, alignment: .top)

            quoteBlock
                .padding(.top, 8)

            // Bookend: the closing mark mirrors the opener — same size,
            // same marigold, trailing edge. Band F stays open-ended
            // (closing a truncated quote would claim an ending it doesn't
            // show).
            if !band.capped {
                Text("\u{201D}")
                    .font(.system(size: band.mark, weight: .bold, design: .serif))
                    .foregroundStyle(FeyndTheme.accent)
                    .frame(height: band.mark * 0.6, alignment: .top)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .padding(.top, 10)
            }

            if fillsHeight { Spacer(minLength: band.centered ? 0 : 14) }
            footer
        }
        .padding(26)
        .frame(maxWidth: .infinity,
               maxHeight: fillsHeight ? .infinity : nil,
               alignment: .leading)
        .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(FeyndTheme.border, lineWidth: 1))
    }

    @ViewBuilder
    private var quoteBlock: some View {
        if band.capped && fillsHeight {
            // Past the type floor the card stops shrinking: the text fades
            // out honestly and hands off to the topic. Still no scrolling.
            VStack(alignment: .leading, spacing: 8) {
                quoteText
                    .frame(maxHeight: .infinity, alignment: .top)
                    .clipped()
                    .mask(LinearGradient(
                        stops: [.init(color: .black, location: 0),
                                .init(color: .black, location: 0.8),
                                .init(color: .clear, location: 1)],
                        startPoint: .top, endPoint: .bottom))
                if artifact.threadId != nil {
                    Button {
                        openTopic()
                    } label: {
                        Text("Read the rest in the topic \u{2192}")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(FeyndTheme.accent)
                    }
                    .buttonStyle(.plain)
                }
            }
        } else if band.capped {
            // Compact host (grading screen): plain truncation, no link.
            quoteText.lineLimit(9)
        } else {
            quoteText
        }
    }

    private var quoteText: some View {
        Text(artifact.body)
            .font(.system(size: band.quote, design: .serif))
            .lineSpacing(band.spacing)
            .foregroundStyle(FeyndTheme.text)
            .frame(maxWidth: .infinity, alignment: .leading)
            // Safety valve for short phones: a band may shave a step rather
            // than clip. Band F clips by design and skips it.
            .minimumScaleFactor(band.capped ? 1 : 0.82)
    }

    @ViewBuilder
    private var footer: some View {
        if artifact.source != nil || (showTopic && artifact.topic != nil) {
            Rectangle()
                .fill(FeyndTheme.borderSoft)
                .frame(height: 1)
                .padding(.top, fillsHeight ? 0 : 20)
            HStack(spacing: 8) {
                if let source = artifact.source {
                    Text(source)
                        .font(.system(size: 14, weight: .semibold))
                        .italic()
                        .foregroundStyle(FeyndTheme.text2)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                if showTopic, let topic = artifact.topic {
                    Text(topic)
                        .font(.system(size: 11.5, weight: .bold))
                        .foregroundStyle(FeyndTheme.accent)
                        .lineLimit(1)
                        .padding(.horizontal, 11)
                        .padding(.vertical, 5)
                        .background(FeyndTheme.accentSoft, in: Capsule())
                }
            }
            .padding(.top, 14)
        }
    }

    private func openTopic() {
        guard let threadId = artifact.threadId else { return }
        onOpenTopic?()
        DeepLinkRouter.shared.requestTopicChat(threadId: threadId, draft: "")
    }
}

/// Remote photo with the surface as placeholder; fills and clips.
struct PebbleImage: View {
    let url: String
    var corner: CGFloat = 16
    var contentMode: ContentMode = .fill

    var body: some View {
        GeometryReader { geo in
            AsyncImage(url: URL(string: url)) { phase in
                switch phase {
                case .success(let img):
                    img.resizable()
                        .aspectRatio(contentMode: contentMode)
                        .frame(width: geo.size.width, height: geo.size.height)
                        .clipped()
                case .failure:
                    ZStack {
                        FeyndTheme.surface2
                        Image(systemName: "photo")
                            .font(.system(size: 26))
                            .foregroundStyle(FeyndTheme.text3)
                    }
                default:
                    ZStack {
                        FeyndTheme.surface2
                        ProgressView().tint(FeyndTheme.accent)
                    }
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .clipShape(RoundedRectangle(cornerRadius: corner))
    }
}

/// Full-screen look at a photo pebble. Tap or swipe down to leave.
struct PebbleImageViewer: View {
    let url: String
    let caption: String
    @Environment(\.dismiss) private var dismiss
    @State private var drag: CGFloat = 0

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            VStack(spacing: 16) {
                Spacer(minLength: 0)
                AsyncImage(url: URL(string: url)) { phase in
                    if let img = phase.image {
                        img.resizable().aspectRatio(contentMode: .fit)
                    } else {
                        ProgressView().tint(.white)
                    }
                }
                .frame(maxWidth: .infinity)
                if !caption.isEmpty {
                    Text(caption)
                        .font(.system(size: 15, design: .serif))
                        .foregroundStyle(.white.opacity(0.85))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                }
                Spacer(minLength: 0)
            }
            .offset(y: drag)
            .gesture(
                DragGesture().onChanged { drag = max(0, $0.translation.height) }
                    .onEnded { if $0.translation.height > 120 { dismiss() } else { withAnimation { drag = 0 } } }
            )
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(.white.opacity(0.18), in: Circle())
            }
            .buttonStyle(.plain)
            .padding(16)
        }
        .onTapGesture { dismiss() }
    }
}

/// The little stone — an off-round ellipse, marigold.
struct PebbleGlyph: View {
    var size: CGFloat = 16

    var body: some View {
        Ellipse()
            .fill(FeyndTheme.accent)
            .frame(width: size, height: size * 0.76)
            .rotationEffect(.degrees(-8))
    }
}

// MARK: - Add sheet

/// Save a quote: the text, where it's from, and (optionally) which topic it
/// belongs with.
struct PebbleAddSheet: View {
    /// Pre-picks this topic in the picker (the per-topic Quotes shelf).
    var presetTopicId: String? = nil
    /// Called after a successful save so the carousel refreshes.
    var onSaved: () async -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var quote = ""
    @State private var source = ""
    @State private var topics: [F2Topic] = []
    @State private var pickedTopic: F2Topic? = nil
    @State private var saving = false
    @State private var saveError: String? = nil
    @State private var pickerItem: PhotosPickerItem? = nil
    /// Picked photo, downscaled to ≤1600px JPEG, ready to upload.
    @State private var photoData: Data? = nil
    @State private var photoPreview: UIImage? = nil
    @FocusState private var quoteFocused: Bool

    private var hasText: Bool { !quote.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var canSave: Bool { !saving && (hasText || photoData != nil) }

    var body: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(FeyndTheme.surface3)
                .frame(width: 38, height: 4)
                .padding(.top, 8)
                .frame(maxWidth: .infinity)
            ZStack {
                HStack(spacing: 7) {
                    PebbleGlyph(size: 13)
                    Text("New pebble")
                        .font(.system(size: 16, weight: .semibold))
                        .tracking(-0.2)
                        .foregroundStyle(FeyndTheme.text)
                }
                HStack {
                    Spacer()
                    Button { closeModal(dismiss) } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(FeyndTheme.text2)
                            .frame(width: 36, height: 36)
                            .background(FeyndTheme.surface2, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .keyboardShortcut(.cancelAction)
                }
                .padding(.trailing, 14)
            }
            .padding(.top, 12)
            .padding(.bottom, 14)

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    TextField(photoData == nil ? "The quote…" : "Caption (optional)", text: $quote, axis: .vertical)
                        .font(.system(size: 16, design: .serif))
                        .foregroundStyle(FeyndTheme.text)
                        .tint(FeyndTheme.accent)
                        .lineLimit(4...12)
                        .focused($quoteFocused)
                        .padding(14)
                        .background(FeyndTheme.bgRaised, in: RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(FeyndTheme.border, lineWidth: 1))

                    photoRow

                    TextField("Where it's from — e.g. Sapiens, ch. 5", text: $source)
                        .font(.system(size: 14.5))
                        .foregroundStyle(FeyndTheme.text)
                        .tint(FeyndTheme.accent)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .background(FeyndTheme.bgRaised, in: RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(FeyndTheme.border, lineWidth: 1))

                    if !topics.isEmpty {
                        Menu {
                            Button("No topic") { pickedTopic = nil }
                            ForEach(topics) { topic in
                                Button(topic.topic ?? "Untitled") { pickedTopic = topic }
                            }
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "book")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(FeyndTheme.accent)
                                Text(pickedTopic?.topic ?? "Link to a topic (optional)")
                                    .font(.system(size: 14.5, weight: .medium))
                                    .foregroundStyle(pickedTopic == nil ? FeyndTheme.text3 : FeyndTheme.text)
                                    .lineLimit(1)
                                Spacer()
                                Image(systemName: "chevron.up.chevron.down")
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundStyle(FeyndTheme.text3)
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                            .background(FeyndTheme.bgRaised, in: RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(FeyndTheme.border, lineWidth: 1))
                        }
                    }

                    if let saveError {
                        Text(saveError)
                            .font(.system(size: 12.5))
                            .foregroundStyle(Color(hex: 0xE0635A))
                    }

                    Button { save() } label: {
                        HStack(spacing: 8) {
                            if saving { ProgressView().tint(FeyndTheme.inkOnAccent) }
                            Text(saving ? "Saving…" : "Keep it")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(FeyndTheme.inkOnAccent)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .background(FeyndTheme.accent, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(!canSave)
                    .opacity(canSave || saving ? 1 : 0.5)
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 30)
            }
            .scrollIndicators(.hidden)
        }
        .background(FeyndTheme.bgRaised.ignoresSafeArea())
        .presentationDetents([.large])
        .presentationDragIndicator(.hidden)
        .onAppear {
            quoteFocused = true
            #if targetEnvironment(simulator)
            // `-TestPebblePhoto <path>` — attach a photo from disk (headless
            // verification of the downscale + upload path, no picker taps).
            if let path = UserDefaults.standard.string(forKey: "TestPebblePhoto"),
               let image = UIImage(contentsOfFile: path) {
                UserDefaults.standard.removeObject(forKey: "TestPebblePhoto")
                let scaled = image.downscaled(maxSide: 1600)
                photoData = scaled.jpegData(compressionQuality: 0.82)
                photoPreview = scaled
                if UserDefaults.standard.bool(forKey: "TestPebbleSave") {
                    UserDefaults.standard.removeObject(forKey: "TestPebbleSave")
                    quote = "Saved from the app"
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { save() }
                }
            }
            #endif
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task { await loadPhoto(item) }
        }
        .task {
            topics = (try? await F2API.shared.listTopics()) ?? []
            if pickedTopic == nil, let presetTopicId {
                pickedTopic = topics.first { $0.id == presetTopicId }
            }
        }
    }

    /// "Add photo" picker, or the picked photo as a thumbnail with a remove ✕.
    @ViewBuilder
    private var photoRow: some View {
        if let photoPreview {
            HStack(spacing: 12) {
                Image(uiImage: photoPreview)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 64, height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                Text("Photo attached")
                    .font(.system(size: 14.5, weight: .medium))
                    .foregroundStyle(FeyndTheme.text)
                Spacer()
                Button {
                    photoData = nil
                    self.photoPreview = nil
                    pickerItem = nil
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text2)
                        .frame(width: 30, height: 30)
                        .background(FeyndTheme.surface2, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Remove photo")
            }
            .padding(10)
            .background(FeyndTheme.bgRaised, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(FeyndTheme.border, lineWidth: 1))
        } else {
            PhotosPicker(selection: $pickerItem, matching: .images, photoLibrary: .shared()) {
                HStack(spacing: 8) {
                    Image(systemName: "photo.on.rectangle")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(FeyndTheme.accent)
                    Text("Add a photo")
                        .font(.system(size: 14.5, weight: .medium))
                        .foregroundStyle(FeyndTheme.text3)
                    Spacer()
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(FeyndTheme.bgRaised, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(FeyndTheme.border, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
    }

    private func loadPhoto(_ item: PhotosPickerItem) async {
        guard let raw = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: raw) else {
            saveError = "Couldn't read that photo."
            return
        }
        let scaled = image.downscaled(maxSide: 1600)
        guard let jpeg = scaled.jpegData(compressionQuality: 0.82) else { return }
        photoData = jpeg
        photoPreview = scaled
        saveError = nil
    }

    private func save() {
        let body = quote.trimmingCharacters(in: .whitespacesAndNewlines)
        guard canSave else { return }
        saving = true
        saveError = nil
        Task {
            do {
                let trimmedSource = source.trimmingCharacters(in: .whitespacesAndNewlines)
                if let photoData {
                    _ = try await F2API.shared.createImageArtifact(
                        imageData: photoData,
                        body: body.isEmpty ? nil : body,
                        source: trimmedSource.isEmpty ? nil : trimmedSource,
                        threadId: pickedTopic?.id
                    )
                } else {
                    _ = try await F2API.shared.createArtifact(
                        body: body,
                        source: trimmedSource.isEmpty ? nil : trimmedSource,
                        threadId: pickedTopic?.id
                    )
                }
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                await onSaved()
                dismiss()
            } catch {
                saveError = "Couldn't save it: \(error.localizedDescription)"
                saving = false
            }
        }
    }
}


extension UIImage {
    /// Longest side capped at `maxSide`, orientation baked in. Returns self when already small enough.
    func downscaled(maxSide: CGFloat) -> UIImage {
        let longest = max(size.width, size.height)
        let scale = min(1, maxSide / longest)
        let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: target))
        }
    }
}
