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

            Text("Peri")
                .font(.system(size: 52, weight: .semibold, design: .serif))
                .foregroundStyle(Theme.ink)
            Text("Learn while you walk.")
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

                Button {
                    signIn()
                } label: {
                    Text(busy ? "Signing in…" : "Sign in")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Color(white: 0.1))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Theme.amber, in: RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)
                .opacity(busy || username.isEmpty || password.isEmpty ? 0.45 : 1)
                .disabled(busy || username.isEmpty || password.isEmpty)
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
                try await session.signIn(
                    username: username.trimmingCharacters(in: .whitespaces),
                    password: password
                )
            } catch {
                self.error = "Couldn't sign in — check your details."
            }
            busy = false
        }
    }
}
