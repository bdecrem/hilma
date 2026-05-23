import SwiftUI

struct LoginView: View {
    @Environment(Session.self) private var session
    @State private var username = ""
    @State private var password = ""
    @State private var busy = false

    var body: some View {
        ZStack {
            Color(.systemGroupedBackground).ignoresSafeArea()

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
                        .background(Color(.secondarySystemGroupedBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(.separator)))

                    SecureField("password", text: $password)
                        .textContentType(.password)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                        .background(Color(.secondarySystemGroupedBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(.separator)))
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
                        .foregroundStyle(Color(.systemBackground))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color(.label))
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
