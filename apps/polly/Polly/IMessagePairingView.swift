import SwiftUI

/// Two-step pairing screen.
///   1. enter handle → tap "Send code" → server sends 6-digit code via iMessage
///   2. enter code → tap "Confirm" → handle is bound to the account
///
/// Lives inside the ProfileSheet's NavigationStack so back/close behaves
/// naturally. Themed with PollyTheme.
struct IMessagePairingView: View {
    @Environment(\.dismiss) private var dismiss
    var onPaired: (String) -> Void = { _ in }

    enum Phase: Equatable { case enterHandle, enterCode(handle: String) }
    @State private var phase: Phase = .enterHandle
    @State private var handle = ""
    @State private var code = ""
    @State private var busy = false
    @State private var error: String? = nil

    var body: some View {
        ZStack {
            PollyTheme.bg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 0) {
                header
                content
                    .padding(.horizontal, 22)
                    .padding(.top, 4)
                Spacer()
            }
        }
        .toolbar(.hidden, for: .navigationBar)
    }

    private var header: some View {
        ZStack {
            Text("Add iMessage")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(PollyTheme.text)
            HStack {
                Button { closeModal(dismiss) } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(PollyTheme.text)
                        .frame(width: 36, height: 36)
                        .background(PollyTheme.surface, in: Circle())
                        .overlay(Circle().stroke(PollyTheme.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.cancelAction)
                Spacer()
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 14)
        .padding(.bottom, 12)
    }

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .enterHandle:
            handleStep
        case .enterCode(let pendingHandle):
            codeStep(pendingHandle: pendingHandle)
        }
    }

    private var handleStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Your iPhone number or iCloud email")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PollyTheme.text)
            Text("We'll send a 6-digit code to that handle via iMessage. Enter the code on the next screen to confirm it's you.")
                .font(.system(size: 13))
                .foregroundStyle(PollyTheme.text2)
                .lineSpacing(2)

            PollyAuthField(
                placeholder: "+15551234567 or you@icloud.com",
                text: $handle,
                contentType: .emailAddress,
                autocapitalization: .never,
                keyboardType: .emailAddress
            )

            if let error {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(Color(hex: 0xFF6B5B))
            }

            Button(action: sendCode) {
                Text(busy ? "Sending…" : "Send code")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(busy || handle.isEmpty ? PollyTheme.text3 : PollyTheme.inkOnAccent)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(busy || handle.isEmpty ? PollyTheme.surface2 : PollyTheme.accent,
                                in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .disabled(busy || handle.isEmpty)
        }
    }

    private func codeStep(pendingHandle: String) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Enter the 6-digit code")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PollyTheme.text)
            Text("Sent to \(pendingHandle). Code expires in 10 minutes.")
                .font(.system(size: 13))
                .foregroundStyle(PollyTheme.text2)

            PollyAuthField(
                placeholder: "123456",
                text: $code,
                autocapitalization: .never,
                keyboardType: .numberPad
            )

            if let error {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(Color(hex: 0xFF6B5B))
            }

            HStack(spacing: 8) {
                Button(action: { phase = .enterHandle; code = "" }) {
                    Text("Change handle")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(PollyTheme.text2)
                        .padding(.vertical, 12)
                        .padding(.horizontal, 16)
                        .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 10))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(PollyTheme.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .disabled(busy)

                Button(action: { confirm(handle: pendingHandle) }) {
                    Text(busy ? "Verifying…" : "Confirm")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(busy || code.count != 6 ? PollyTheme.text3 : PollyTheme.inkOnAccent)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(busy || code.count != 6 ? PollyTheme.surface2 : PollyTheme.accent,
                                    in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
                .disabled(busy || code.count != 6)
            }
        }
    }

    // MARK: - Actions

    private func sendCode() {
        guard !busy else { return }
        busy = true
        error = nil
        Task {
            do {
                let h = try await PollyAPI.shared.startImessagePairing(handle: handle)
                phase = .enterCode(handle: h)
            } catch PollyAPIError.http(409, let msg) {
                error = msg ?? "Already paired."
            } catch PollyAPIError.http(400, let msg) {
                error = msg ?? "Enter a phone number or iCloud email."
            } catch PollyAPIError.http(502, let msg) {
                // BlueBubbles often delivers the iMessage even when our HTTP
                // call to it times out. Move to the code-entry step so the
                // user can use the code if it arrives; surface the warning
                // there instead of blocking on this screen.
                phase = .enterCode(handle: handle)
                error = msg ?? "If you didn't get a code, go back and try again."
            } catch let err {
                error = err.localizedDescription
            }
            busy = false
        }
    }

    private func confirm(handle pendingHandle: String) {
        guard !busy else { return }
        busy = true
        error = nil
        Task {
            do {
                let h = try await PollyAPI.shared.confirmImessagePairing(handle: pendingHandle, code: code)
                onPaired(h)
                closeModal(dismiss)
            } catch PollyAPIError.http(401, _) {
                error = "Code didn't match. Check the message and try again."
            } catch PollyAPIError.http(410, _) {
                error = "Code expired — start over."
            } catch let err {
                error = err.localizedDescription
            }
            busy = false
        }
    }
}
