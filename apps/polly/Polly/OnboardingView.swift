import SwiftUI

/// A language Polly teaches. Codes match `LANGUAGES` in src/lib/polly/language.ts
/// and the check constraint in apps/polly/schema/002.
enum PollyLanguage: String, CaseIterable, Identifiable {
    case italian = "it"
    case french = "fr"
    case korean = "ko"

    var id: String { rawValue }
    var name: String {
        switch self {
        case .italian: return "Italian"
        case .french: return "French"
        case .korean: return "Korean"
        }
    }
    var native: String {
        switch self {
        case .italian: return "Italiano"
        case .french: return "Français"
        case .korean: return "한국어"
        }
    }
    var flag: String {
        switch self {
        case .italian: return "🇮🇹"
        case .french: return "🇫🇷"
        case .korean: return "🇰🇷"
        }
    }
    /// The first thing Polly says in that language on the picker card.
    var hello: String {
        switch self {
        case .italian: return "Ciao!"
        case .french: return "Salut !"
        case .korean: return "안녕!"
        }
    }
}

/// First run, four pages: two intro panels, then the two choices that make
/// the account — which language, and what to call you. The name IS the
/// account (no password; claim it with an email later from Profile), so a
/// new learner is inside the app in two taps and a word. "Sign up with
/// email" and "I already have an account" hang off the name page for people
/// who want the full thing now. Replay (Profile → "See the intro again")
/// shows only the two panels.
struct OnboardingView: View {
    enum Mode { case firstRun, replay }
    let mode: Mode
    /// firstRun: the user chose "sign in" instead of starting with a name.
    var onSignIn: () -> Void = {}

    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var page = 0
    @State private var language: PollyLanguage? = nil
    @State private var name = ""
    @State private var starting = false
    @State private var startError: String? = nil
    @State private var showSignup = false
    @FocusState private var nameFocused: Bool

    private var pageCount: Int { mode == .firstRun ? 4 : 2 }
    private let languagePage = 2
    private let namePage = 3

    var body: some View {
        NavigationStack {
            ZStack {
                PollyTheme.bg.ignoresSafeArea()
                VStack(spacing: 0) {
                    TabView(selection: $page) {
                        pageOne.tag(0)
                        pageTwo.tag(1)
                        if mode == .firstRun {
                            languagePicker.tag(languagePage)
                            namePicker.tag(namePage)
                        }
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))

                    dots
                        .padding(.bottom, 14)

                    bottomBar
                        .padding(.horizontal, 24)
                        .padding(.bottom, 28)
                }
            }
            .navigationDestination(isPresented: $showSignup) {
                SignupView(language: language?.rawValue)
            }
            .toolbar(.hidden, for: .navigationBar)
        }
        .onChange(of: page) { _, p in
            // Landing on the name page brings the keyboard up; leaving drops it.
            nameFocused = (p == namePage)
        }
        #if targetEnvironment(simulator)
        .onAppear {
            // `-OnboardingPage <n>` — open on that page for screenshot runs;
            // `-AutoTryPolly 1` — drive the first run with zero taps (Italian,
            // a random name) so headless checks can reach the signed-in tabs.
            let p = UserDefaults.standard.integer(forKey: "OnboardingPage")
            if p > 0, p < pageCount {
                UserDefaults.standard.removeObject(forKey: "OnboardingPage")
                if p >= namePage { language = .italian }
                page = p
            }
            if UserDefaults.standard.bool(forKey: "AutoTryPolly"), mode == .firstRun {
                UserDefaults.standard.removeObject(forKey: "AutoTryPolly")
                language = .italian
                name = "tester-\(Int.random(in: 1000...9999))"
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { start() }
            }
        }
        #endif
    }

    // MARK: - Intro panels

    private var pageOne: some View {
        VStack(spacing: 20) {
            Spacer()
            DodoTraveler(size: 150)
            Text("Meet Polly")
                .font(.custom("Fredoka", size: 32).weight(.semibold))
                .foregroundStyle(PollyTheme.text)
            Text("A tutor that talks back. Pick a language, and Polly builds the lessons with you — chapter by chapter, out loud when you want it.")
                .font(.system(size: 16))
                .lineSpacing(4)
                .foregroundStyle(PollyTheme.text2)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Spacer()
            Spacer()
        }
    }

    private var pageTwo: some View {
        VStack(spacing: 0) {
            Spacer()
            Text("Learn it. Keep it.")
                .font(.custom("Fredoka", size: 28).weight(.semibold))
                .foregroundStyle(PollyTheme.text)
                .padding(.bottom, 28)
            VStack(alignment: .leading, spacing: 22) {
                introRow(icon: "bubble.left.and.bubble.right.fill",
                         title: "Conversations, not drills",
                         sub: "Ask anything, in either language. Polly explains, corrects, and keeps going.")
                introRow(icon: "bolt.fill",
                         title: "Cards that schedule themselves",
                         sub: "Words and phrases come back right before you'd forget them — by tap, typing, or voice.")
                introRow(icon: "mic.fill",
                         title: "Say it out loud",
                         sub: "Voice sessions where Polly listens, answers, and checks your pronunciation.")
                introRow(icon: "flame.fill",
                         title: "A streak worth keeping",
                         sub: "One card a day by iMessage, and a map you walk one level a week.")
            }
            .padding(.horizontal, 44)
            Spacer()
            Spacer()
        }
    }

    private func introRow(icon: String, title: String, sub: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(PollyTheme.accent)
                .frame(width: 40, height: 40)
                .background(PollyTheme.accentSoft, in: RoundedRectangle(cornerRadius: 12))
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(PollyTheme.text)
                Text(sub)
                    .font(.system(size: 13.5))
                    .lineSpacing(2)
                    .foregroundStyle(PollyTheme.text2)
            }
        }
    }

    // MARK: - Language

    private var languagePicker: some View {
        VStack(spacing: 0) {
            Spacer()
            Text("Which language?")
                .font(.custom("Fredoka", size: 28).weight(.semibold))
                .foregroundStyle(PollyTheme.text)
            Text("You can add another one later.")
                .font(.system(size: 15))
                .foregroundStyle(PollyTheme.text2)
                .padding(.top, 6)
                .padding(.bottom, 26)
            VStack(spacing: 12) {
                ForEach(PollyLanguage.allCases) { lang in
                    languageCard(lang)
                }
            }
            .padding(.horizontal, 28)
            Text("More languages soon.")
                .font(.system(size: 13))
                .foregroundStyle(PollyTheme.text3)
                .padding(.top, 18)
            Spacer()
            Spacer()
        }
    }

    private func languageCard(_ lang: PollyLanguage) -> some View {
        let selected = language == lang
        return Button {
            withAnimation(.easeOut(duration: 0.15)) { language = lang }
        } label: {
            HStack(spacing: 14) {
                Text(lang.flag)
                    .font(.system(size: 30))
                    .frame(width: 44, height: 44)
                    .background(PollyTheme.surface2, in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 2) {
                    Text(lang.name)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(PollyTheme.text)
                    Text(lang.native)
                        .font(.system(size: 13.5))
                        .foregroundStyle(PollyTheme.text2)
                }
                Spacer()
                Text(lang.hello)
                    .font(.custom("Fredoka", size: 16).weight(.medium))
                    .foregroundStyle(selected ? PollyTheme.accent : PollyTheme.text3)
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(selected ? PollyTheme.accent : PollyTheme.text4)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 18))
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .stroke(selected ? PollyTheme.accent : PollyTheme.border, lineWidth: selected ? 2 : 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(lang.name)")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    // MARK: - Name

    private var namePicker: some View {
        VStack(spacing: 0) {
            Spacer()
            DodoMiniMark(size: 74)
            Text("What should Polly call you?")
                .font(.custom("Fredoka", size: 26).weight(.semibold))
                .foregroundStyle(PollyTheme.text)
                .multilineTextAlignment(.center)
                .padding(.top, 10)
            Text(language.map { "That's all you need to start \($0.name). No password — add an email later to keep your progress safe." }
                 ?? "Pick a language first — swipe back.")
                .font(.system(size: 15))
                .lineSpacing(4)
                .foregroundStyle(PollyTheme.text2)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
                .padding(.top, 8)
                .padding(.bottom, 24)
            TextField("your name", text: $name)
                .font(.system(size: 20, weight: .semibold))
                .multilineTextAlignment(.center)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .textContentType(.username)
                .submitLabel(.go)
                .focused($nameFocused)
                .onSubmit { start() }
                .padding(.vertical, 14)
                .padding(.horizontal, 18)
                .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(PollyTheme.border, lineWidth: 1))
                .padding(.horizontal, 44)
            if let startError {
                Text(startError)
                    .font(.system(size: 13))
                    .foregroundStyle(Color(hex: 0xFF6B5B))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
                    .padding(.top, 10)
            }
            Spacer()
            Spacer()
        }
    }

    private var nameOK: Bool {
        let t = name.trimmingCharacters(in: .whitespaces)
        return t.count >= 2 && t.count <= 24
            && t.unicodeScalars.allSatisfy { CharacterSet.alphanumerics.contains($0) || "._-".unicodeScalars.contains($0) }
            && t.first.map { $0.isLetter || $0.isNumber } == true
    }

    // MARK: - Chrome

    private var dots: some View {
        HStack(spacing: 7) {
            ForEach(0..<pageCount, id: \.self) { i in
                Capsule()
                    .fill(i == page ? PollyTheme.accent : PollyTheme.text4)
                    .frame(width: i == page ? 20 : 7, height: 7)
            }
        }
        .animation(.easeOut(duration: 0.2), value: page)
    }

    @ViewBuilder
    private var bottomBar: some View {
        if mode == .firstRun && page == namePage {
            VStack(spacing: 12) {
                primaryKey(starting ? "Setting up…" : (language.map { "Start learning \($0.name)" } ?? "Start"),
                           busy: starting, disabled: starting || !nameOK || language == nil) { start() }
                HStack(spacing: 18) {
                    Button { showSignup = true } label: {
                        Text("Sign up with email")
                            .font(.system(size: 14.5, weight: .semibold))
                            .foregroundStyle(PollyTheme.accent)
                    }
                    .buttonStyle(.plain)
                    .disabled(language == nil)
                    Text("·").foregroundStyle(PollyTheme.text4)
                    Button { onSignIn() } label: {
                        Text("I already have an account")
                            .font(.system(size: 14.5, weight: .semibold))
                            .foregroundStyle(PollyTheme.accent)
                    }
                    .buttonStyle(.plain)
                }
            }
        } else if mode == .firstRun && page == languagePage {
            primaryKey("Continue", busy: false, disabled: language == nil) {
                withAnimation(.easeOut(duration: 0.25)) { page = namePage }
            }
        } else {
            primaryKey(page < pageCount - 1 ? "Next" : "Done", busy: false, disabled: false) {
                if page < pageCount - 1 {
                    withAnimation(.easeOut(duration: 0.25)) { page += 1 }
                } else {
                    closeModal(dismiss)
                }
            }
        }
    }

    private func primaryKey(_ label: String, busy: Bool, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if busy { ProgressView().tint(PollyTheme.inkOnAccent) }
                Text(label)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(PollyTheme.inkOnAccent)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(PollyTheme.accent.opacity(disabled ? 0.45 : 1), in: Capsule())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
    }

    private func start() {
        guard let language, nameOK, !starting else { return }
        starting = true
        startError = nil
        Task {
            await session.startGuest(username: name.trimmingCharacters(in: .whitespaces), language: language.rawValue)
            if case .signedIn = session.state {
                // RootView switches to the tabs on its own.
            } else {
                startError = session.loginError ?? "Couldn't start — try again."
            }
            starting = false
        }
    }
}
