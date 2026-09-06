import SwiftUI

/// Signed-out screen — port of `src/app/jam/AuthScreen.tsx`: eyebrow, the
/// hero wordmark, the signature strip with one LED walking it, the blurb,
/// the sign-in card, then the public catalog ("Listen").
struct LoginView: View {
    @Environment(Session.self) private var session
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var username = ""
    @State private var password = ""
    @State private var isSignup = false
    @State private var busy = false
    @State private var chase: Int? = nil
    @FocusState private var usernameFocused: Bool

    /// The hero strip is a real pattern: four-on-the-floor kick, backbeat
    /// snare, offbeat hats (same as the web's `HERO`).
    private static let hero = Strip(k: "1000100010001000", s: "0000100000001000", h: "0010001000100010")

    var body: some View {
        ScrollViewReader { proxy in
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                JBEyebrow(text: "A groovebox you talk to")
                    .padding(.top, 36)
                JBWordmark(size: 72)
                    .padding(.top, 8)
                LedStripView(strip: Self.hero, step: chase, big: true)
                    .padding(.top, 22)
                Text("Say “techno at 128 with a 909 kick and an acid line”. Hear it in seconds. Turn the knobs. Keep every track.")
                    .font(JBTheme.bodyFont(17))
                    .lineSpacing(4)
                    .foregroundStyle(JBTheme.ink3)
                    .frame(maxWidth: 360, alignment: .leading)
                    .padding(.top, 20)

                card
                    .padding(.top, 28)

                // Signed-out visitors can browse but not play (the shared
                // engine host isn't warmed pre-login) — tapping a row jumps
                // straight to the username field instead.
                CatalogView(title: "Listen", emptyText: "Nothing published yet.", engine: nil, onSignedOutTap: { usernameFocused = true })
                    .padding(.top, 36)
                    .id("catalog")

                Spacer(minLength: 40)
            }
            .padding(.horizontal, 20)
            .columnWidth()
            .frame(maxWidth: .infinity)
        }
        .background(JBTheme.panel)
        .task {
            // DEBUG-only: `-loginScroll catalog` scrolls the signed-out screen
            // to the catalog for a headless screenshot.
            if LibraryModel.launchArgValue("-loginScroll") == "catalog" {
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                withAnimation { proxy.scrollTo("catalog", anchor: .top) }
            }
        }
        .task {
            // idle chase: one LED walking the strip, 3.2 s per lap
            guard !reduceMotion else { return }
            var i = 0
            while !Task.isCancelled {
                chase = i
                i = (i + 1) % 16
                try? await Task.sleep(nanoseconds: 200_000_000)
            }
        }
        }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                JBEyebrow(text: isSignup ? "New account" : "Sign in")
                Spacer()
                Button(isSignup ? "I have an account" : "create an account") {
                    isSignup.toggle()
                    session.loginError = nil
                }
                .font(JBTheme.bodyFont(14))
                .foregroundStyle(JBTheme.ink2)
                .underline()
                .buttonStyle(.plain)
            }
            .padding(.bottom, 4)

            TextField("username", text: $username, prompt: jbPrompt("username"))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .textContentType(.username)
                .focused($usernameFocused)
                .jbField()
            SecureField("password", text: $password, prompt: jbPrompt("password"))
                .textContentType(isSignup ? .newPassword : .password)
                .jbField()

            if let error = session.loginError {
                Text(error)
                    .font(JBTheme.monoFont(11.5))
                    .foregroundStyle(JBTheme.orange)
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
                Text(busy ? "…" : (isSignup ? "Create account" : "Sign in"))
            }
            .buttonStyle(JBKeyStyle(variant: .orange, wide: true))
            .padding(.top, 4)
            .disabled(username.isEmpty || password.isEmpty || busy)
        }
        .padding(16)
        .jbCard()
    }
}

#Preview {
    LoginView().environment(Session())
}
