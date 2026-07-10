import SwiftUI

struct LoginView: View {
    @Environment(AppSession.self) private var session

    private enum Step {
        case credentials
        case language
        case level
    }

    @State private var creating = false
    @State private var step: Step = .credentials
    @State private var email = ""
    @State private var password = ""
    @State private var chosenLanguage: Language?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            switch step {
            case .credentials: credentials
            case .language: languagePicker
            case .level: levelPicker
            }
        }
    }

    // MARK: Step 1 — email + password

    private var credentials: some View {
        VStack(spacing: 0) {
            Spacer()
            Text("Omniglot")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(Theme.ink)
            Text("Learn a language by speaking it.")
                .font(.system(size: 17))
                .foregroundStyle(Theme.inkSecondary)
                .padding(.top, 8)

            VStack(spacing: 12) {
                field { TextField("Email", text: $email)
                    .keyboardType(.emailAddress)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                }
                field { SecureField("Password", text: $password)
                    .textContentType(creating ? .newPassword : .password)
                }
            }
            .padding(.top, 40)

            if let error {
                Text(error)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.correction)
                    .multilineTextAlignment(.center)
                    .padding(.top, 16)
            }

            PrimaryButton(title: busy ? "One moment…" : (creating ? "Continue" : "Sign in"),
                          disabled: busy || email.isEmpty || password.isEmpty) {
                if creating {
                    error = nil
                    step = .language
                } else {
                    signIn()
                }
            }
            .padding(.top, 24)

            Button {
                creating.toggle()
                error = nil
            } label: {
                Text(creating ? "Have an account? Sign in" : "New here? Create an account")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.accent)
            }
            .padding(.top, 20)

            Spacer()
            Spacer()
        }
        .padding(.horizontal, 20)
    }

    private func field<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .font(.system(size: 17))
            .padding(.horizontal, 16)
            .frame(height: 52)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.hairline, lineWidth: 1))
    }

    // MARK: Step 2 — language grid (typographic tiles, no flags)

    private var languagePicker: some View {
        VStack(alignment: .leading, spacing: 0) {
            backButton { step = .credentials }
            Text("Which language?")
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(Theme.ink)
                .padding(.top, 12)

            ScrollView {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible())], spacing: 12) {
                    ForEach(allLanguages) { lang in
                        languageTile(lang)
                    }
                }
                .padding(.top, 24)
                .padding(.bottom, 20)
            }

            PrimaryButton(title: "Continue", disabled: chosenLanguage == nil) {
                step = .level
            }
        }
        .padding(20)
    }

    private func languageTile(_ lang: Language) -> some View {
        let selected = chosenLanguage == lang
        return Button {
            chosenLanguage = lang
        } label: {
            VStack(spacing: 6) {
                Text(lang.nativeName)
                    .font(.target(22, .semibold))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text(lang.name)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.inkTertiary)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 88)
            .background(selected ? Theme.accentTint : Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(selected ? Theme.accent : Theme.hairline, lineWidth: selected ? 2 : 1)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: Step 3 — starting level

    private var levelPicker: some View {
        VStack(alignment: .leading, spacing: 0) {
            backButton { step = .language }
            Text("Have you studied \(chosenLanguage?.name ?? "it") before?")
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(Theme.ink)
                .padding(.top, 12)

            VStack(spacing: 12) {
                levelOption("Starting fresh", detail: "New to the language", level: 1)
                levelOption("Some basics", detail: "I know greetings and simple phrases", level: 2)
                levelOption("Conversational", detail: "I can hold a simple conversation", level: 3)
            }
            .padding(.top, 24)

            if let error {
                Text(error)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.correction)
                    .padding(.top, 16)
            }

            Spacer()
        }
        .padding(20)
        .overlay {
            if busy {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Theme.bg.opacity(0.6))
            }
        }
    }

    private func levelOption(_ title: String, detail: String, level: Int) -> some View {
        Button {
            signUp(level: level)
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                Text(detail)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.inkSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.hairline, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    private func backButton(_ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: "chevron.left")
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(Theme.inkSecondary)
                .frame(width: 36, height: 36)
                .background(Theme.surface)
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
    }

    // MARK: Actions

    private func signIn() {
        busy = true
        error = nil
        Task {
            do {
                try await session.signIn(email: email, password: password)
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }

    private func signUp(level: Int) {
        guard let lang = chosenLanguage else { return }
        busy = true
        error = nil
        Task {
            do {
                try await session.signUp(email: email, password: password, language: lang.code, level: level)
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}
