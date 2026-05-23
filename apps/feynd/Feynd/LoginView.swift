import SwiftUI

struct LoginView: View {
    @Environment(Session.self) private var session
    @State private var username = ""
    @State private var password = ""
    @State private var busy = false

    var body: some View {
        ZStack {
            Color(red: 0.97, green: 0.97, blue: 0.96).ignoresSafeArea()

            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Feynd")
                        .font(.system(size: 40, weight: .semibold))
                    Text("Learn anything.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
                .padding(.bottom, 8)

                VStack(spacing: 12) {
                    TextField("username", text: $username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .textContentType(.username)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                        .background(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(white: 0.85)))

                    SecureField("password", text: $password)
                        .textContentType(.password)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                        .background(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(white: 0.85)))
                }

                if let err = session.loginError {
                    Text(err).foregroundStyle(.red).font(.subheadline)
                }

                Button {
                    Task {
                        busy = true
                        await session.login(username: username, password: password)
                        busy = false
                    }
                } label: {
                    Text(busy ? "Signing in…" : "Sign in")
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.black)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(busy || username.isEmpty || password.isEmpty)
                .opacity(busy || username.isEmpty || password.isEmpty ? 0.5 : 1)

                Spacer()
            }
            .padding(.horizontal, 28)
            .padding(.top, 80)
        }
    }
}
