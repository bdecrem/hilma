import SwiftUI

/// Email + password signup. Instant: on submit we POST to /api/f2/auth/signup,
/// the server creates the user and sets the session cookie, and Session
/// transitions to .signedIn. No verification step (decided 2026-05-26).
struct SignupView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var error: String? = nil
    @State private var busy = false

    var body: some View {
        FeyndAuthShell(
            title: "Create account",
            tagline: "Email and a password. That's it.",
            primaryLabel: busy ? "Creating…" : "Create account",
            primaryDisabled: busy || !canSubmit,
            onPrimary: submit,
            footer: {
                Button { dismiss() } label: {
                    HStack(spacing: 4) {
                        Text("Already have one?")
                            .foregroundStyle(FeyndTheme.text2)
                        Text("Sign in")
                            .foregroundStyle(FeyndTheme.accent)
                            .fontWeight(.semibold)
                    }
                    .font(.system(size: 14))
                }
                .buttonStyle(.plain)
            }
        ) {
            FeyndAuthField(
                placeholder: "email",
                text: $email,
                contentType: .emailAddress,
                autocapitalization: .never,
                keyboardType: .emailAddress
            )
            FeyndAuthField(
                placeholder: "password (8+ characters)",
                text: $password,
                contentType: .newPassword,
                isSecure: true
            )

            if let error {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(Color(hex: 0xFF6B5B))
            }
        }
        .toolbar(.hidden, for: .navigationBar)
    }

    private var canSubmit: Bool {
        looksLikeEmail(email) && password.count >= 8
    }

    private func looksLikeEmail(_ s: String) -> Bool {
        // Loose check — the server does the real validation.
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.contains("@") && t.contains(".") && t.count >= 5
    }

    private func submit() {
        guard canSubmit else { return }
        busy = true
        error = nil
        Task {
            do {
                let user = try await F2API.shared.signup(email: email, password: password)
                session.state = .signedIn(user)
                await session.refreshProgress()
                dismiss()
            } catch F2APIError.http(409, _) {
                error = "An account with that email already exists. Try signing in."
            } catch F2APIError.http(400, let msg) {
                error = msg ?? "Check your email and password."
            } catch let err {
                error = err.localizedDescription
            }
            busy = false
        }
    }
}
