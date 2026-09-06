import SwiftUI

struct LoginView: View {
    @Environment(Session.self) private var session
    @State private var username = ""
    @State private var password = ""
    @State private var isSignup = false
    @State private var busy = false

    var body: some View {
        VStack(spacing: 18) {
            Spacer()

            VStack(spacing: 2) {
                Text("JAMBOT")
                    .font(JBTheme.panelFont(34, weight: .bold))
                    .foregroundStyle(JBTheme.ink)
                Circle()
                    .fill(JBTheme.orange)
                    .frame(width: 8, height: 8)
                    .shadow(color: JBTheme.orange.opacity(0.6), radius: 6)
            }
            .padding(.bottom, 24)

            VStack(spacing: 10) {
                TextField("Username", text: $username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .jbField()
                SecureField("Password", text: $password)
                    .jbField()
            }
            .padding(.horizontal, 28)

            if let error = session.loginError {
                Text(error)
                    .font(JBTheme.bodyFont(13))
                    .foregroundStyle(JBTheme.orange)
                    .padding(.horizontal, 28)
            }

            Button {
                Task {
                    busy = true
                    if isSignup {
                        await session.signup(username: username, password: password)
                    } else {
                        await session.login(username: username, password: password)
                    }
                    busy = false
                }
            } label: {
                Text(busy ? "…" : (isSignup ? "SIGN UP" : "SIGN IN"))
                    .font(JBTheme.panelFont(16, weight: .bold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(JBKeyStyle(variant: .orange))
            .padding(.horizontal, 28)
            .disabled(username.isEmpty || password.isEmpty || busy)

            Button(isSignup ? "Have an account? Sign in" : "New here? Sign up") {
                isSignup.toggle()
            }
            .font(JBTheme.bodyFont(13))
            .foregroundStyle(JBTheme.ink3)

            Spacer()
            Spacer()
        }
    }
}

// MARK: - Shared control styles (Theme.swift only holds raw tokens; the
// small view helpers below are used across Login/Library/Studio).

enum JBKeyVariant { case orange, ghost, panel }

struct JBKeyStyle: ButtonStyle {
    var variant: JBKeyVariant = .panel
    var small: Bool = false
    var square: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(JBTheme.panelFont(small ? 12 : 15, weight: .semibold))
            .tracking(small ? 0.6 : 1.2)
            .frame(width: square ? (small ? 34 : 56) : nil, height: square ? (small ? 34 : 56) : (small ? 34 : 48))
            .padding(.vertical, square ? 0 : (small ? 0 : 12))
            .padding(.horizontal, square ? 0 : (small ? 12 : 18))
            .background(background)
            .foregroundStyle(foreground)
            .clipShape(RoundedRectangle(cornerRadius: small ? 9 : 11, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: small ? 9 : 11, style: .continuous)
                    .stroke(variant == .ghost ? JBTheme.ink : .clear, lineWidth: 1.5)
            )
            .opacity(configuration.isPressed ? 0.85 : 1)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.08), value: configuration.isPressed)
    }

    private var background: Color {
        switch variant {
        case .orange: return JBTheme.orange
        case .ghost: return .clear
        case .panel: return JBTheme.panel4
        }
    }

    private var foreground: Color {
        switch variant {
        case .orange: return JBTheme.ink
        case .ghost: return JBTheme.ink
        case .panel: return JBTheme.ink
        }
    }
}

struct JBFieldStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(JBTheme.bodyFont(15))
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .background(JBTheme.panel4)
            .foregroundStyle(JBTheme.ink)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

extension View {
    func jbField() -> some View { modifier(JBFieldStyle()) }
}

#Preview {
    LoginView().environment(Session())
}
