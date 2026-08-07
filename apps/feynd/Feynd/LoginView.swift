import SwiftUI

/// Login screen — styled with FeyndTheme so it matches the rest of the app.
/// "Create an account" link at the bottom pushes to SignupView in the same
/// navigation stack.
struct LoginView: View {
    @Environment(Session.self) private var session
    @State private var username = ""
    @State private var password = ""
    @State private var busy = false

    var body: some View {
        NavigationStack {
            FeyndAuthShell(
                title: "dodo",
                tagline: "Learn anything.",
                primaryLabel: busy ? "Signing in…" : "Sign in",
                primaryDisabled: busy || username.isEmpty || password.isEmpty,
                onPrimary: signIn,
                footer: {
                    NavigationLink {
                        SignupView()
                    } label: {
                        HStack(spacing: 4) {
                            Text("New here?")
                                .foregroundStyle(FeyndTheme.text2)
                            Text("Create an account")
                                .foregroundStyle(FeyndTheme.accent)
                                .fontWeight(.semibold)
                        }
                        .font(.system(size: 14))
                    }
                    .buttonStyle(.plain)
                }
            ) {
                FeyndAuthField(
                    placeholder: "email or username",
                    text: $username,
                    contentType: .username,
                    autocapitalization: .never
                )
                FeyndAuthField(
                    placeholder: "password",
                    text: $password,
                    contentType: .password,
                    isSecure: true
                )

                if let err = session.loginError {
                    Text(err)
                        .font(.system(size: 13))
                        .foregroundStyle(Color(hex: 0xFF6B5B))
                }
            }
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private func signIn() {
        Task {
            busy = true
            await session.login(username: username, password: password)
            busy = false
        }
    }
}

/// Shared layout chrome for Login + Signup: hero title, tagline, body fields,
/// coral CTA, footer link slot. Centered, max-width 480 so Catalyst windows
/// don't stretch it edge-to-edge.
struct FeyndAuthShell<Body: View, Footer: View>: View {
    let title: String
    let tagline: String
    let primaryLabel: String
    let primaryDisabled: Bool
    var onPrimary: () -> Void
    @ViewBuilder var footer: () -> Footer
    @ViewBuilder var content: () -> Body

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(title)
                        // Brand type: Fredoka SemiBold, the Dodo text mark
                        // (−0.4px tracking at 27px, scaled to this size).
                        .font(.custom("Fredoka", size: 44).weight(.semibold))
                        .tracking(-0.65)
                        .foregroundStyle(FeyndTheme.text)
                    Text(tagline)
                        .font(.system(size: 16))
                        .foregroundStyle(FeyndTheme.text2)
                }
                .padding(.bottom, 32)

                VStack(spacing: 12) { content() }

                Button(action: onPrimary) {
                    Text(primaryLabel)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(primaryDisabled
                                         ? FeyndTheme.text3
                                         : FeyndTheme.inkOnAccent)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(
                            (primaryDisabled ? FeyndTheme.surface2 : FeyndTheme.accent),
                            in: RoundedRectangle(cornerRadius: 12)
                        )
                }
                .buttonStyle(.plain)
                .disabled(primaryDisabled)
                .padding(.top, 24)

                Spacer()

                HStack { Spacer(); footer(); Spacer() }
                    .padding(.bottom, 24)
            }
            .padding(.horizontal, 28)
            .padding(.top, 80)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
    }
}

/// Themed input field used by Login + Signup. Wraps TextField/SecureField with
/// the warm-surface look that matches the rest of the app's chrome.
struct FeyndAuthField: View {
    let placeholder: String
    @Binding var text: String
    var contentType: UITextContentType? = nil
    var autocapitalization: TextInputAutocapitalization = .sentences
    var keyboardType: UIKeyboardType = .default
    var isSecure: Bool = false

    var body: some View {
        Group {
            if isSecure {
                SecureField(placeholder, text: $text)
            } else {
                TextField(placeholder, text: $text)
                    .textInputAutocapitalization(autocapitalization)
                    .autocorrectionDisabled()
                    .keyboardType(keyboardType)
            }
        }
        .font(.system(size: 16))
        .foregroundStyle(FeyndTheme.text)
        .tint(FeyndTheme.accent)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(FeyndTheme.bgRaised, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(FeyndTheme.border, lineWidth: 1))
        .modifier(ContentTypeModifier(type: contentType))
    }
}

/// Optional textContentType — applied only when caller passes one, so
/// SecureField + TextField both work cleanly.
private struct ContentTypeModifier: ViewModifier {
    let type: UITextContentType?
    func body(content: Content) -> some View {
        if let type {
            content.textContentType(type)
        } else {
            content
        }
    }
}
