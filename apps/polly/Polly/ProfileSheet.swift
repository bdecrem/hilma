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
/// Light + dark are inherited automatically via PollyTheme tokens.
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
    @State private var dailyCardEnabled = false
    @State private var dailyCardPaired = false
    @State private var dailyCardError: String? = nil
    @State private var showHelp = false
    @State private var showVoice = false
    @AppStorage(VoiceSettingsView.holdToTalkKey) private var holdToTalk = false
    @State private var recertEnabled = true
    @State private var isGuest = false
    @State private var showClaim = false
    @State private var showIntro = false
    @State private var pathCardHidden = false
    private var studyUI: Bool { UILanguage.shared.studyUI }
    private var currentLanguageCode: String? {
        if case let .signedIn(user) = session.state { return user.language }
        return nil
    }
    @State private var showLanguages = false
    @State private var contentQuality: ContentQuality = .fast

    var body: some View {
        VStack(spacing: 0) {
            handle
            header
            ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 0) {
                    hero
                    sections
                }
            }
            #if targetEnvironment(simulator) || (DEBUG && targetEnvironment(macCatalyst))
            // `-ProfileScrollTo learning|daily-card|account|…` — bring a section into view for screenshots.
            .task {
                if let section = UserDefaults.standard.string(forKey: "ProfileScrollTo") {
                    try? await Task.sleep(for: .milliseconds(600))
                    proxy.scrollTo("settings-" + section, anchor: .top)
                }
            }
            #endif
            }
            .scrollIndicators(.hidden)
        }
        .background(PollyTheme.bgRaised.ignoresSafeArea())
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            uploadAvatar(item: item)
        }
        .alert("Couldn't upload avatar",
               isPresented: Binding(get: { uploadError != nil }, set: { if !$0 { uploadError = nil } })) {
            Button("OK") { uploadError = nil }
        } message: { Text(uploadError ?? "") }
        .sheet(isPresented: $showHelp) {
            HelpSheet()
        }
        .sheet(isPresented: $showVoice) {
            VoiceSettingsView()
        }
        .sheet(isPresented: $showLanguages) {
            LanguageSwitcherView()
                .environment(session)
        }
        .sheet(isPresented: $showIntro) {
            OnboardingView(mode: .replay)
                .environment(session)
        }
        .sheet(isPresented: $showClaim) {
            ClaimAccountSheet { user in
                session.applyClaimedUser(user)
                isGuest = false
            }
            .environment(session)
        }
        .sheet(isPresented: $showPairing) {
            NavigationStack {
                IMessagePairingView { newHandle in
                    if !imessageHandles.contains(newHandle) {
                        imessageHandles.append(newHandle)
                    }
                }
            }
        }
        .alert("Daily card", isPresented: Binding(
            get: { dailyCardError != nil }, set: { if !$0 { dailyCardError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(dailyCardError ?? "")
        }
        .task {
            #if targetEnvironment(simulator) || (DEBUG && targetEnvironment(macCatalyst))
            // `-OpenLanguages 1` — straight to the language switcher.
            if UserDefaults.standard.bool(forKey: "OpenLanguages"), LaunchOnce.take("OpenLanguages") {
                showLanguages = true
            }
            #endif
            // Refresh user-wide progress so the ring + bar reflect any star
            // earned right before this sheet was opened.
            await session.refreshProgress()
            do { imessageHandles = try await PollyAPI.shared.listImessageHandles() }
            catch {}
            if let p = try? await PollyAPI.shared.getPath() { pathCardHidden = p.cardDismissed }
            if case let .signedIn(user) = session.state { isGuest = user.isGuest }
            do {
                let status = try await PollyAPI.shared.dailyCardStatus()
                dailyCardEnabled = status.dailyCardEnabled
                dailyCardPaired = status.imessagePaired
                recertEnabled = status.recertEnabled
                contentQuality = ContentQuality(rawValue: status.contentQuality) ?? .fast
                isGuest = status.isGuest
                // Mirror for views that render before this sheet ever loads
                // (the topic screen's Refresher chip, notification sync).
                UserDefaults.standard.set(status.recertEnabled, forKey: "recertEnabled")
            } catch { /* keep defaults */ }
        }
    }

    private func setContentQuality(_ quality: ContentQuality) async {
        let before = contentQuality
        contentQuality = quality // optimistic
        do {
            contentQuality = try await PollyAPI.shared.setContentQuality(quality)
        } catch {
            contentQuality = before
            dailyCardError = error.localizedDescription
        }
    }

    private func setRecert(_ enabled: Bool) async {
        do {
            recertEnabled = try await PollyAPI.shared.setRecertEnabled(enabled)
            UserDefaults.standard.set(recertEnabled, forKey: "recertEnabled")
            if !recertEnabled { RecertNotifications.clearAll() }
        } catch {
            recertEnabled = !enabled
            dailyCardError = error.localizedDescription
        }
    }

    private func setDailyCard(_ enabled: Bool) async {
        do {
            dailyCardEnabled = try await PollyAPI.shared.setDailyCardEnabled(enabled)
        } catch {
            dailyCardEnabled = !enabled // revert the optimistic flip
            dailyCardError = error.localizedDescription
        }
    }

    private func removeImessage(handle: String) async {
        // Optimistic: drop from local list, then call the server.
        imessageHandles.removeAll { $0 == handle }
        do { try await PollyAPI.shared.removeImessageHandle(handle: handle) }
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
            .fill(PollyTheme.surface3)
            .frame(width: 38, height: 4)
            .padding(.top, 8)
            .frame(maxWidth: .infinity)
    }

    private var header: some View {
        ZStack {
            Text("Profile")
                .font(.system(size: 16, weight: .semibold))
                .tracking(-0.2)
                .foregroundStyle(PollyTheme.text)
            HStack {
                Spacer()
                Button { closeModal(dismiss) } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(PollyTheme.text2)
                        .frame(width: 36, height: 36)
                        .background(PollyTheme.surface2, in: Circle())
                        .overlay(Circle().stroke(PollyTheme.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.cancelAction)
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
                        .foregroundStyle(PollyTheme.text)
                        .lineLimit(1)
                    HStack(spacing: 4) {
                        Text("Level ")
                            .foregroundStyle(PollyTheme.text2)
                        Text("\(session.progress.level)")
                            .foregroundStyle(PollyTheme.text)
                            .fontWeight(.semibold)
                        Text("·")
                            .foregroundStyle(PollyTheme.text3)
                        Text(pollyLevelTitle(session.progress.level))
                            .italic()
                            .foregroundStyle(PollyTheme.text2)
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
                    .fill(PollyTheme.surface2)
                    .frame(width: 28, height: 28)
                Circle()
                    .stroke(PollyTheme.bgRaised, lineWidth: 2)
                    .frame(width: 28, height: 28)
                if uploadingAvatar {
                    ProgressView()
                        .controlSize(.mini)
                        .tint(PollyTheme.text)
                } else {
                    Image(systemName: "camera.fill")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(PollyTheme.text)
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
                .stroke(PollyTheme.surface2, lineWidth: 2)
                .frame(width: ring, height: ring)
            Circle()
                .trim(from: 0, to: p.progressFraction)
                .stroke(PollyTheme.accent, style: StrokeStyle(lineWidth: 2, lineCap: .round))
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
            .fill(PollyTheme.avatarGradient)
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
                        .foregroundStyle(PollyTheme.text)
                        .fontWeight(.semibold)
                    Text("/ \(p.nextLevelAt) stars")
                        .foregroundStyle(PollyTheme.text3)
                }
                Spacer()
                if p.toNextLevel > 0 {
                    HStack(spacing: 4) {
                        Text("\(p.toNextLevel) more")
                            .foregroundStyle(PollyTheme.accent)
                            .fontWeight(.semibold)
                        Text("to Level \(p.level + 1)")
                            .foregroundStyle(PollyTheme.text3)
                    }
                } else {
                    Text("Max")
                        .foregroundStyle(PollyTheme.text3)
                }
            }
            .font(.system(size: 12))
            .tracking(-0.1)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(PollyTheme.surface2)
                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: [PollyTheme.accent, Color(hex: 0xF0A78C)],
                                startPoint: .leading, endPoint: .trailing
                            )
                        )
                        .frame(width: geo.size.width * fill)
                        .shadow(color: PollyTheme.accent.opacity(0.5), radius: 6)
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
                    .foregroundStyle(PollyTheme.gold)
            }
            StatChip(value: "\(p.masteredTopicCount)", label: "mastered") {
                ZStack {
                    Circle()
                        .stroke(PollyTheme.accent, lineWidth: 1.4)
                        .frame(width: 11, height: 11)
                    Circle().fill(PollyTheme.accent).frame(width: 5, height: 5)
                }
            }
            StatChip(value: "\(p.topicCount)", label: "topics") {
                VStack(spacing: 1.5) {
                    Rectangle().fill(PollyTheme.text2).frame(width: 11, height: 1.6).cornerRadius(0.6)
                    Rectangle().fill(PollyTheme.text2).frame(width: 11, height: 1.6).cornerRadius(0.6)
                    Rectangle().fill(PollyTheme.text2).frame(width: 7, height: 1.6).cornerRadius(0.6)
                }
            }
        }
    }

    // MARK: - Sections

    private var sections: some View {
        VStack(spacing: 18) {
            if isGuest {
                SettingsCard {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("You're trying Polly as a guest")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(PollyTheme.text)
                        Text("Everything you do is saved to this phone's session. Create an account and it all comes along — topics, cards, XP.")
                            .font(.system(size: 13))
                            .lineSpacing(2)
                            .foregroundStyle(PollyTheme.text2)
                        Button { showClaim = true } label: {
                            Text("Create account")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(PollyTheme.inkOnAccent)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 9)
                                .background(PollyTheme.accent, in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 4)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                }
            }
            SettingsSection(label: "Appearance") {
                ThemeSegmented(value: colorSchemeRaw) { mode in
                    colorSchemeRaw = mode
                }
            }
            SettingsSection(label: "Voice") {
                SettingsCard {
                    SettingsRow(label: "Voice & style") {
                        showVoice = true
                    }
                    SettingsDivider()
                    // Push to talk — device-local (it's about the room this
                    // phone is in), so it lives here rather than on the
                    // account-wide voice prefs.
                    Toggle(isOn: $holdToTalk) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Push to talk")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(PollyTheme.text)
                            Text("Hold the radio's button while you speak. For noisy places.")
                                .font(.system(size: 12.5))
                                .foregroundStyle(PollyTheme.text3)
                        }
                    }
                    .tint(PollyTheme.accent)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                }
            }
            SettingsSection(label: "iMessage") {
                SettingsCard {
                    if imessageHandles.isEmpty {
                        SettingsRow(label: "Add iMessage", labelColor: PollyTheme.accent) {
                            showPairing = true
                        }
                    } else {
                        ForEach(Array(imessageHandles.enumerated()), id: \.element) { idx, h in
                            SettingsRow(label: h, detail: nil, labelColor: PollyTheme.text) {
                                Task { await removeImessage(handle: h) }
                            }
                            if idx < imessageHandles.count - 1 { SettingsDivider() }
                        }
                        SettingsDivider()
                        SettingsRow(label: "Add another", labelColor: PollyTheme.accent) {
                            showPairing = true
                        }
                    }
                }
            }
            SettingsSection(label: "Daily card") {
                SettingsCard {
                    // Delivery rides the paired iMessage handle above — the
                    // toggle is the whole setting.
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("One card a day over iMessage")
                                .font(.system(size: 15))
                                .tracking(-0.2)
                                .foregroundStyle(PollyTheme.text)
                            if !dailyCardPaired && imessageHandles.isEmpty {
                                Text("Pair iMessage above to turn this on")
                                    .font(.system(size: 12.5))
                                    .foregroundStyle(PollyTheme.text3)
                            }
                        }
                        Spacer()
                        Toggle("", isOn: Binding(
                            get: { dailyCardEnabled },
                            set: { on in
                                dailyCardEnabled = on
                                Task { await setDailyCard(on) }
                            }
                        ))
                        .labelsHidden()
                        .tint(PollyTheme.accent)
                        .disabled(!dailyCardPaired && imessageHandles.isEmpty && !dailyCardEnabled)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                }
            }
            SettingsSection(label: "Learning") {
                SettingsCard {
                    // The language switcher — each language is its own
                    // profile (LanguageSwitcherView.swift).
                    Button { showLanguages = true } label: {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Language")
                                    .font(.system(size: 15)).tracking(-0.2).foregroundStyle(PollyTheme.text)
                                Text("Switch to another language, or start one")
                                    .font(.system(size: 12.5)).foregroundStyle(PollyTheme.text3)
                            }
                            Spacer()
                            if let code = currentLanguageCode, let lang = PollyLanguage(rawValue: code) {
                                Text("\(lang.flag) \(lang.name)")
                                    .font(.system(size: 15)).tracking(-0.2).foregroundStyle(PollyTheme.text2)
                            }
                            Image(systemName: "chevron.right")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(PollyTheme.text3)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    SettingsDivider()
                    if let langName = UILang.studyLanguageName(session) {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("App in \(langName)")
                                    .font(.system(size: 15)).tracking(-0.2).foregroundStyle(PollyTheme.text)
                                Text(studyUI ? "Polly's buttons and labels show in \(langName)"
                                             : "Showing the app in English")
                                    .font(.system(size: 12.5)).foregroundStyle(PollyTheme.text3)
                            }
                            Spacer()
                            Toggle("", isOn: Binding(get: { UILanguage.shared.studyUI }, set: { UILanguage.shared.studyUI = $0 })).labelsHidden().tint(PollyTheme.accent)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        SettingsDivider()
                    }
                    // Content quality — one setting over everything Polly
                    // writes or grades (src/lib/polly/quality.ts).
                    VStack(alignment: .leading, spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Polly's care")
                                .font(.system(size: 15)).tracking(-0.2).foregroundStyle(PollyTheme.text)
                            Text(contentQuality == .deep
                                 ? "Clean-ups, cards and grading take a closer look — a few seconds longer"
                                 : "Clean-ups, cards and grading come back as quickly as possible")
                                .font(.system(size: 12.5)).foregroundStyle(PollyTheme.text3)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        HStack(spacing: 4) {
                            ForEach(ContentQuality.allCases, id: \.self) { q in
                                let on = q == contentQuality
                                Button { Task { await setContentQuality(q) } } label: {
                                    Text(q.label)
                                        .font(.system(size: 14, weight: on ? .semibold : .medium))
                                        .tracking(-0.1)
                                        .foregroundStyle(on ? PollyTheme.text : PollyTheme.text2)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 9)
                                        .background(RoundedRectangle(cornerRadius: 8).fill(on ? PollyTheme.surface3 : Color.clear))
                                        .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(3)
                        .background(RoundedRectangle(cornerRadius: 10).fill(PollyTheme.surface2))
                    }
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    SettingsDivider()
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Refreshers")
                                .font(.system(size: 15))
                                .tracking(-0.2)
                                .foregroundStyle(PollyTheme.text)
                            Text(recertEnabled
                                 ? "Gold badges dim over time; short refreshers keep them"
                                 : "Off — mastery is forever, no refresher quizzes")
                                .font(.system(size: 12.5))
                                .foregroundStyle(PollyTheme.text3)
                        }
                        Spacer()
                        Toggle("", isOn: Binding(
                            get: { recertEnabled },
                            set: { on in
                                recertEnabled = on
                                Task { await setRecert(on) }
                            }
                        ))
                        .labelsHidden()
                        .tint(PollyTheme.accent)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    if pathCardHidden {
                        SettingsDivider()
                        SettingsRow(label: "Show learning path card") {
                            pathCardHidden = false
                            Task { _ = try? await PollyAPI.shared.setPathCardDismissed(false) }
                        }
                    }
                    SettingsDivider()
                    SettingsRow(label: "See the intro again") {
                        showIntro = true
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
                            closeModal(dismiss)
                        }
                    }
                    if currentAvatarUrl != nil {
                        SettingsDivider()
                        SettingsRow(label: "Remove profile photo", labelColor: PollyTheme.text2) {
                            Task { await removeAvatar() }
                        }
                    }
                }
            }
            SettingsSection(label: "Help") {
                SettingsCard {
                    SettingsRow(label: "Chat commands") {
                        showHelp = true
                    }
                }
            }
            SettingsSection(label: "About") {
                SettingsCard {
                    SettingsRow(label: "App", detail: "Polly")
                    SettingsDivider()
                    SettingsRow(label: "Version", detail: appVersion)
                    SettingsDivider()
                    SettingsRow(label: "Built", detail: buildDate)
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

    /// When this binary was compiled, read off the executable itself — so it's
    /// right even if someone forgets to bump the build number. Together with
    /// the version it answers "is the build I just installed actually running?"
    private var buildDate: String {
        guard let url = Bundle.main.executableURL,
              let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
              let date = attrs[.modificationDate] as? Date
        else { return "unknown" }
        let f = DateFormatter()
        f.dateFormat = "MMM d, h:mm a"
        return f.string(from: date)
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
                let url = try await PollyAPI.shared.uploadAvatar(imageData: data, mime: mime)
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
                    let url = try await PollyAPI.shared.uploadAvatar(imageData: data, mime: mime)
                    session.setAvatarUrl(url)
                } catch {
                    uploadError = error.localizedDescription
                }
            }
        }
    }

    private func removeAvatar() async {
        do {
            try await PollyAPI.shared.deleteAvatar()
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
                    .foregroundStyle(PollyTheme.text)
            }
            Text(label.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.2)
                .foregroundStyle(PollyTheme.text3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(PollyTheme.border, lineWidth: 1))
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
                .foregroundStyle(PollyTheme.text3)
                .padding(.leading, 4)
            content()
        }
        // Scroll anchor: `-ProfileScrollTo <label>` ("learning", "daily-card", …).
        .id("settings-" + label.lowercased().replacingOccurrences(of: " ", with: "-"))
    }
}

struct SettingsCard<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(spacing: 0) { content() }
            .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(PollyTheme.border, lineWidth: 1))
    }
}

struct SettingsDivider: View {
    var body: some View {
        Rectangle().fill(PollyTheme.borderSoft).frame(height: 0.5)
    }
}

struct SettingsRow: View {
    let label: String
    var detail: String? = nil
    var labelColor: Color = PollyTheme.text
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
                        .foregroundStyle(PollyTheme.text2)
                }
                if action != nil && detail == nil {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(PollyTheme.text3)
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
                        .foregroundStyle(active ? PollyTheme.text : PollyTheme.text2)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(
                            RoundedRectangle(cornerRadius: 8)
                                .fill(active ? PollyTheme.surface3 : Color.clear)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(PollyTheme.border, lineWidth: 1))
    }
}

// MARK: - Claim (guest → real account)

/// Email + password on the SAME account — the guest's topics, cards, and XP
/// all survive the upgrade.
struct ClaimAccountSheet: View {
    var onClaimed: (PollyUser) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var error: String? = nil
    @State private var busy = false

    var body: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(PollyTheme.surface3)
                .frame(width: 38, height: 4)
                .padding(.top, 8)
                .frame(maxWidth: .infinity)
            Text("Create your account")
                .font(.system(size: 16, weight: .semibold))
                .tracking(-0.2)
                .foregroundStyle(PollyTheme.text)
                .padding(.top, 14)
            Text("Same progress, real login — usable on any device.")
                .font(.system(size: 13))
                .foregroundStyle(PollyTheme.text3)
                .padding(.top, 2)

            VStack(spacing: 12) {
                TextField("email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(PollyTheme.bgRaised, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(PollyTheme.border, lineWidth: 1))
                SecureField("password (8+ characters)", text: $password)
                    .textContentType(.newPassword)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(PollyTheme.bgRaised, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(PollyTheme.border, lineWidth: 1))
                if let error {
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundStyle(Color(hex: 0xE0635A))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                Button { submit() } label: {
                    HStack(spacing: 8) {
                        if busy { ProgressView().tint(PollyTheme.inkOnAccent) }
                        Text(busy ? "Creating…" : "Create account")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(PollyTheme.inkOnAccent)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(PollyTheme.accent, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(busy || !canSubmit)
                .opacity(canSubmit ? 1 : 0.5)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            Spacer()
        }
        .background(PollyTheme.bgRaised.ignoresSafeArea())
        .presentationDetents([.medium])
        .presentationDragIndicator(.hidden)
    }

    private var canSubmit: Bool {
        email.contains("@") && email.contains(".") && password.count >= 8
    }

    private func submit() {
        busy = true
        error = nil
        Task {
            do {
                let user = try await PollyAPI.shared.claimAccount(
                    email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                    password: password
                )
                onClaimed(user)
                dismiss()
            } catch PollyAPIError.http(409, _) {
                error = "An account with that email already exists."
            } catch PollyAPIError.http(400, let msg) {
                error = msg ?? "Check your email and password."
            } catch let err {
                error = err.localizedDescription
            }
            busy = false
        }
    }
}
