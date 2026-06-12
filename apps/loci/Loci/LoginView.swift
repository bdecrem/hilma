import SwiftUI

struct LoginView: View {
    @Environment(AppSession.self) private var session
    @State private var username = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String? = nil

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Wordmark — serif, like the spine of a book.
            Text("Loci")
                .font(.system(size: 52, weight: .semibold, design: .serif))
                .foregroundStyle(Theme.ink)
            Text("Read. Understand. Remember.")
                .font(.system(size: 15, design: .serif))
                .italic()
                .foregroundStyle(Theme.ink2)
                .padding(.top, 6)

            VStack(spacing: 12) {
                field("Email or username", text: $username, secure: false)
                field("Password", text: $password, secure: true)

                if let error {
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.clay)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                PrimaryButton(label: busy ? "Signing in…" : "Sign in", disabled: busy || username.isEmpty || password.isEmpty) {
                    signIn()
                }
                .padding(.top, 4)
            }
            .padding(.top, 44)
            .padding(.horizontal, 28)

            Spacer()
            Spacer()
        }
        .background(Theme.bg.ignoresSafeArea())
    }

    @ViewBuilder
    private func field(_ placeholder: String, text: Binding<String>, secure: Bool) -> some View {
        Group {
            if secure {
                SecureField(placeholder, text: text)
            } else {
                TextField(placeholder, text: text)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
                    .keyboardType(.emailAddress)
            }
        }
        .font(.system(size: 16))
        .foregroundStyle(Theme.ink)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.border, lineWidth: 1))
    }

    private func signIn() {
        busy = true
        error = nil
        Task {
            do {
                try await session.signIn(username: username.trimmingCharacters(in: .whitespaces), password: password)
            } catch {
                self.error = "Couldn't sign in — check your details."
            }
            busy = false
        }
    }
}
