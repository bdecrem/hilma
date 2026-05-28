import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

/// Profile + settings sheet — port of `ProfileSheet` in feynd-screens.jsx.
///
/// Layout, top to bottom:
///   - drag handle
///   - "Profile" title + close button
///   - hero (avatar 78pt with camera upload button) + name + "Level N · *Title*"
///   - level progress bar with "N / M stars" + "K more to Level N+1"
///   - three stat chips (stars / mastered / topics)
///   - Appearance / Library / Account / About sections (themed cards)
///
/// Light + dark are inherited automatically via FeyndTheme tokens.
struct ProfileSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(Session.self) private var session
    @AppStorage("colorSchemePreference") private var colorSchemeRaw = ColorSchemePreference.system.rawValue

    @State private var pickerItem: PhotosPickerItem? = nil
    @State private var showFileImporter = false  // Mac Catalyst fallback
    @State private var uploadingAvatar = false
    @State private var uploadError: String? = nil

    @State private var imessageHandles: [String] = []
    @State private var showPairing = false

    var body: some View {
        VStack(spacing: 0) {
            handle
            header
            ScrollView {
                VStack(spacing: 0) {
                    hero
                    sections
                }
            }
            .scrollIndicators(.hidden)
        }
        .background(FeyndTheme.bgRaised.ignoresSafeArea())
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            uploadAvatar(item: item)
        }
        .alert("Couldn't upload avatar",
               isPresented: Binding(get: { uploadError != nil }, set: { if !$0 { uploadError = nil } })) {
            Button("OK") { uploadError = nil }
        } message: { Text(uploadError ?? "") }
        .sheet(isPresented: $showPairing) {
            NavigationStack {
                IMessagePairingView { newHandle in
                    if !imessageHandles.contains(newHandle) {
                        imessageHandles.append(newHandle)
                    }
                }
            }
        }
        .task {
            // Refresh user-wide progress so the ring + bar reflect any star
            // earned right before this sheet was opened.
            await session.refreshProgress()
            do { imessageHandles = try await F2API.shared.listImessageHandles() }
            catch { /* keep empty */ }
        }
    }

    private func removeImessage(handle: String) async {
        // Optimistic: drop from local list, then call the server.
        imessageHandles.removeAll { $0 == handle }
        do { try await F2API.shared.removeImessageHandle(handle: handle) }
        catch {
            // Restore on failure so the UI reflects reality.
            if !imessageHandles.contains(handle) {
                imessageHandles.append(handle)
            }
        }
    }

    // MARK: - Pieces

    private var handle: some View {
        Capsule()
            .fill(FeyndTheme.surface3)
            .frame(width: 38, height: 4)
            .padding(.top, 8)
            .frame(maxWidth: .infinity)
    }

    private var header: some View {
        ZStack {
            Text("Profile")
                .font(.system(size: 16, weight: .semibold))
                .tracking(-0.2)
                .foregroundStyle(FeyndTheme.text)
            HStack {
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text2)
                        .frame(width: 36, height: 36)
                        .background(FeyndTheme.surface2, in: Circle())
                        .overlay(Circle().stroke(FeyndTheme.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 14)
        .padding(.bottom, 4)
    }

    // MARK: - Hero

    private var hero: some View {
        VStack(spacing: 0) {
            HStack(spacing: 16) {
                // Mac Catalyst doesn't surface a usable PhotosPicker the same
                // way iOS does — tapping it crashes the app when the system
                // tries to bring up the photo library. Use the SwiftUI native
                // .fileImporter on Catalyst (works for jpg/png as required).
                #if targetEnvironment(macCatalyst)
                Button {
                    showFileImporter = true
                } label: {
                    avatarWithCamera
                }
                .buttonStyle(.plain)
                .fileImporter(
                    isPresented: $showFileImporter,
                    allowedContentTypes: [.jpeg, .png],
                    allowsMultipleSelection: false
                ) { result in
                    handleImportedFile(result: result)
                }
                #else
                PhotosPicker(selection: $pickerItem, matching: .images, photoLibrary: .shared()) {
                    avatarWithCamera
                }
                .buttonStyle(.plain)
                #endif

                VStack(alignment: .leading, spacing: 4) {
                    Text(username)
                        .font(.system(size: 22, weight: .bold))
                        .tracking(-0.5)
                        .foregroundStyle(FeyndTheme.text)
                        .lineLimit(1)
                    HStack(spacing: 4) {
                        Text("Level ")
                            .foregroundStyle(FeyndTheme.text2)
                        Text("\(session.progress.level)")
                            .foregroundStyle(FeyndTheme.text)
                            .fontWeight(.semibold)
                        Text("·")
                            .foregroundStyle(FeyndTheme.text3)
                        Text(feyndLevelTitle(session.progress.level))
                            .italic()
                            .foregroundStyle(FeyndTheme.text2)
                    }
                    .font(.system(size: 13))
                    .tracking(-0.1)
                }
                Spacer()
            }
            progressBar
                .padding(.top, 18)
            statsRow
                .padding(.top, 18)
        }
        .padding(.horizontal, 22)
        .padding(.top, 14)
        .padding(.bottom, 18)
    }

    private var avatarWithCamera: some View {
        ZStack(alignment: .bottomTrailing) {
            avatarHero
            ZStack {
                Circle()
                    .fill(FeyndTheme.surface2)
                    .frame(width: 28, height: 28)
                Circle()
                    .stroke(FeyndTheme.bgRaised, lineWidth: 2)
                    .frame(width: 28, height: 28)
                if uploadingAvatar {
                    ProgressView()
                        .controlSize(.mini)
                        .tint(FeyndTheme.text)
                } else {
                    Image(systemName: "camera.fill")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text)
                }
            }
            .shadow(color: .black.opacity(0.5), radius: 2, y: 2)
            .offset(x: 2, y: 2)
        }
    }

    @ViewBuilder
    private var avatarHero: some View {
        let s: CGFloat = 78
        let ring = s + 8
        let p = session.progress
        ZStack {
            // Same progress fraction as the linear bar below — single source.
            Circle()
                .stroke(FeyndTheme.surface2, lineWidth: 2)
                .frame(width: ring, height: ring)
            Circle()
                .trim(from: 0, to: p.progressFraction)
                .stroke(FeyndTheme.coral, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .frame(width: ring, height: ring)

            if let urlStr = currentAvatarUrl, let url = URL(string: urlStr) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img): img.resizable().scaledToFill()
                    default: heroGradient
                    }
                }
                .frame(width: s, height: s)
                .clipShape(Circle())
            } else {
                heroGradient
            }
        }
        .frame(width: ring, height: ring)
        .shadow(color: .black.opacity(0.45), radius: 12, y: 4)
    }

    private var heroGradient: some View {
        Circle()
            .fill(FeyndTheme.avatarGradient)
            .frame(width: 78, height: 78)
            .overlay(
                Text(String(username.prefix(1)).uppercased())
                    .font(.system(size: 36, weight: .semibold))
                    .tracking(-0.4)
                    .foregroundStyle(.white)
            )
    }

    private var progressBar: some View {
        let p = session.progress
        let span = max(1, p.nextLevelAt - p.currentLevelAt)
        let earned = max(0, p.totalStars - p.currentLevelAt)
        let fill = min(1.0, Double(earned) / Double(span))
        return VStack(spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                HStack(spacing: 4) {
                    Text("\(p.totalStars)")
                        .foregroundStyle(FeyndTheme.text)
                        .fontWeight(.semibold)
                    Text("/ \(p.nextLevelAt) stars")
                        .foregroundStyle(FeyndTheme.text3)
                }
                Spacer()
                if p.toNextLevel > 0 {
                    HStack(spacing: 4) {
                        Text("\(p.toNextLevel) more")
                            .foregroundStyle(FeyndTheme.coral)
                            .fontWeight(.semibold)
                        Text("to Level \(p.level + 1)")
                            .foregroundStyle(FeyndTheme.text3)
                    }
                } else {
                    Text("Max")
                        .foregroundStyle(FeyndTheme.text3)
                }
            }
            .font(.system(size: 12))
            .tracking(-0.1)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(FeyndTheme.surface2)
                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: [FeyndTheme.coral, Color(hex: 0xF0A78C)],
                                startPoint: .leading, endPoint: .trailing
                            )
                        )
                        .frame(width: geo.size.width * fill)
                        .shadow(color: FeyndTheme.coral.opacity(0.5), radius: 6)
                }
            }
            .frame(height: 8)
        }
    }

    private var statsRow: some View {
        let p = session.progress
        return HStack(spacing: 8) {
            StatChip(value: "\(p.totalStars)", label: "stars") {
                Image(systemName: "star.fill")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(FeyndTheme.gold)
            }
            StatChip(value: "\(p.masteredTopicCount)", label: "mastered") {
                ZStack {
                    Circle()
                        .stroke(FeyndTheme.coral, lineWidth: 1.4)
                        .frame(width: 11, height: 11)
                    Circle().fill(FeyndTheme.coral).frame(width: 5, height: 5)
                }
            }
            StatChip(value: "\(p.topicCount)", label: "topics") {
                VStack(spacing: 1.5) {
                    Rectangle().fill(FeyndTheme.text2).frame(width: 11, height: 1.6).cornerRadius(0.6)
                    Rectangle().fill(FeyndTheme.text2).frame(width: 11, height: 1.6).cornerRadius(0.6)
                    Rectangle().fill(FeyndTheme.text2).frame(width: 7, height: 1.6).cornerRadius(0.6)
                }
            }
        }
    }

    // MARK: - Sections

    private var sections: some View {
        VStack(spacing: 18) {
            SettingsSection(label: "Appearance") {
                ThemeSegmented(value: colorSchemeRaw) { mode in
                    colorSchemeRaw = mode
                }
            }
            SettingsSection(label: "iMessage") {
                SettingsCard {
                    if imessageHandles.isEmpty {
                        SettingsRow(label: "Add iMessage", labelColor: FeyndTheme.coral) {
                            showPairing = true
                        }
                    } else {
                        ForEach(Array(imessageHandles.enumerated()), id: \.element) { idx, h in
                            SettingsRow(label: h, detail: nil, labelColor: FeyndTheme.text) {
                                Task { await removeImessage(handle: h) }
                            }
                            if idx < imessageHandles.count - 1 { SettingsDivider() }
                        }
                        SettingsDivider()
                        SettingsRow(label: "Add another", labelColor: FeyndTheme.coral) {
                            showPairing = true
                        }
                    }
                }
            }
            SettingsSection(label: "Account") {
                SettingsCard {
                    SettingsRow(label: "Signed in as", detail: username)
                    SettingsDivider()
                    SettingsRow(label: "Sign out", labelColor: Color(hex: 0xFF6B5B)) {
                        Task {
                            await session.logout()
                            dismiss()
                        }
                    }
                    if currentAvatarUrl != nil {
                        SettingsDivider()
                        SettingsRow(label: "Remove profile photo", labelColor: FeyndTheme.text2) {
                            Task { await removeAvatar() }
                        }
                    }
                }
            }
            SettingsSection(label: "About") {
                SettingsCard {
                    SettingsRow(label: "App", detail: "Feynd")
                    SettingsDivider()
                    SettingsRow(label: "Version", detail: appVersion)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 44)
    }

    private var username: String {
        if case let .signedIn(user) = session.state { return user.username }
        return ""
    }

    private var currentAvatarUrl: String? {
        if case let .signedIn(user) = session.state { return user.avatarUrl }
        return nil
    }

    private var appVersion: String {
        let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
        let b = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "?"
        return "\(v) (\(b))"
    }

    // MARK: - Uploads

    private func uploadAvatar(item: PhotosPickerItem) {
        Task {
            uploadingAvatar = true
            defer {
                uploadingAvatar = false
                pickerItem = nil
            }
            do {
                guard let data = try await item.loadTransferable(type: Data.self) else { return }
                // Detect mime by the file extension carried in the supportedContentTypes;
                // default to JPEG for camera-roll items.
                let mime = item.supportedContentTypes.contains(where: { $0.identifier.contains("png") })
                    ? "image/png" : "image/jpeg"
                let url = try await F2API.shared.uploadAvatar(imageData: data, mime: mime)
                session.setAvatarUrl(url)
            } catch {
                uploadError = error.localizedDescription
            }
        }
    }

    /// Mac Catalyst path — handles the result from `.fileImporter`.
    /// Reads the chosen file off disk, detects MIME from extension, uploads.
    private func handleImportedFile(result: Result<[URL], Error>) {
        switch result {
        case .failure(let err):
            uploadError = err.localizedDescription
        case .success(let urls):
            guard let fileURL = urls.first else { return }
            Task {
                uploadingAvatar = true
                defer { uploadingAvatar = false }
                let needsAccess = fileURL.startAccessingSecurityScopedResource()
                defer { if needsAccess { fileURL.stopAccessingSecurityScopedResource() } }
                do {
                    let data = try Data(contentsOf: fileURL)
                    if data.count > 1024 * 1024 {
                        uploadError = "Image is over 1 MB. Pick a smaller one."
                        return
                    }
                    let mime = fileURL.pathExtension.lowercased() == "png" ? "image/png" : "image/jpeg"
                    let url = try await F2API.shared.uploadAvatar(imageData: data, mime: mime)
                    session.setAvatarUrl(url)
                } catch {
                    uploadError = error.localizedDescription
                }
            }
        }
    }

    private func removeAvatar() async {
        do {
            try await F2API.shared.deleteAvatar()
            session.setAvatarUrl(nil)
        } catch {
            uploadError = error.localizedDescription
        }
    }
}

// MARK: - Atoms used only inside the profile sheet

struct StatChip<Icon: View>: View {
    let value: String
    let label: String
    @ViewBuilder var icon: () -> Icon

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 5) {
                icon()
                Text(value)
                    .font(.system(size: 18, weight: .bold))
                    .tracking(-0.4)
                    .foregroundStyle(FeyndTheme.text)
            }
            Text(label.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.2)
                .foregroundStyle(FeyndTheme.text3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(FeyndTheme.border, lineWidth: 1))
    }
}

struct SettingsSection<Content: View>: View {
    let label: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(FeyndTheme.text3)
                .padding(.leading, 4)
            content()
        }
    }
}

struct SettingsCard<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(spacing: 0) { content() }
            .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(FeyndTheme.border, lineWidth: 1))
    }
}

struct SettingsDivider: View {
    var body: some View {
        Rectangle().fill(FeyndTheme.borderSoft).frame(height: 0.5)
    }
}

struct SettingsRow: View {
    let label: String
    var detail: String? = nil
    var labelColor: Color = FeyndTheme.text
    var action: (() -> Void)? = nil

    var body: some View {
        Button { action?() } label: {
            HStack(spacing: 12) {
                Text(label)
                    .font(.system(size: 15))
                    .tracking(-0.2)
                    .foregroundStyle(labelColor)
                Spacer()
                if let detail {
                    Text(detail)
                        .font(.system(size: 15))
                        .tracking(-0.2)
                        .foregroundStyle(FeyndTheme.text2)
                }
                if action != nil && detail == nil {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text3)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 13)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(action == nil)
    }
}

struct ThemeSegmented: View {
    let value: String
    var onChange: (String) -> Void

    var body: some View {
        HStack(spacing: 4) {
            ForEach(["system", "light", "dark"], id: \.self) { opt in
                let active = opt == value
                Button { onChange(opt) } label: {
                    Text(opt.capitalized)
                        .font(.system(size: 14, weight: active ? .semibold : .medium))
                        .tracking(-0.1)
                        .foregroundStyle(active ? FeyndTheme.text : FeyndTheme.text2)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(
                            RoundedRectangle(cornerRadius: 8)
                                .fill(active ? FeyndTheme.surface3 : Color.clear)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(FeyndTheme.border, lineWidth: 1))
    }
}
