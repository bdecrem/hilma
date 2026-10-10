import SwiftUI

/// Welcome → language → starting point → time and number → the code. No
/// password: the number is the account, the code comes by iMessage.
struct OnboardingView: View {
    @Environment(AppState.self) private var state

    private enum Step: Int { case welcome, language, level, time, phone, code }

    @State private var step: Step = .welcome
    @State private var language = "es"
    @State private var level = "new"
    @State private var hour = 8
    @State private var phone = ""
    @State private var sentTo = ""
    @State private var code = ""
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focused: Bool

    private let skin = Skin.current

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                if step != .welcome {
                    Button {
                        error = nil
                        step = Step(rawValue: step.rawValue - 1) ?? .welcome
                    } label: {
                        Image(systemName: "chevron.left").font(.system(size: 15, weight: .bold))
                            .foregroundStyle(skin.ink2).frame(width: 36, height: 36)
                            .background(Circle().fill(Color.white))
                    }
                    .buttonStyle(.plain)
                }
                Spacer()
                if step != .welcome {
                    Segments(states: (1...5).map { $0 < step.rawValue ? .done : $0 == step.rawValue ? .cur : .todo })
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .frame(height: 44)

            ScrollView {
                VStack(spacing: 22) {
                    switch step {
                    case .welcome: welcome
                    case .language: languageStep
                    case .level: levelStep
                    case .time: timeStep
                    case .phone: phoneStep
                    case .code: codeStep
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 16)
                .padding(.bottom, 30)
            }
            .scrollBounceBehavior(.basedOnSize)

            VStack(spacing: 10) {
                if let error {
                    Text(error).font(skin.uiBold(14)).foregroundStyle(skin.bad).multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                }
                BigButton(title: buttonTitle, action: next)
                    .disabled(busy || !canContinue)
                    .opacity(busy || !canContinue ? 0.55 : 1)
                    .padding(.horizontal, 24)
            }
            .padding(.bottom, 24)
        }
        .animation(.easeInOut(duration: 0.25), value: step)
    }

    // MARK: Steps

    private var welcome: some View {
        VStack(spacing: 18) {
            Mascot(size: 190, mood: .idle).padding(.top, 30)
            Text("Dolly").font(skin.display(54)).foregroundStyle(skin.primary)
            Text("Three minutes of Spanish a day.\nOn the phone, with me.")
                .font(skin.uiBold(19)).foregroundStyle(skin.ink).multilineTextAlignment(.center).lineSpacing(3)
            Text("Talk, say three things back, play ten cards. Every day, from a text.")
                .font(skin.ui(15)).foregroundStyle(skin.ink2).multilineTextAlignment(.center).lineSpacing(2)
                .padding(.horizontal, 10)
        }
    }

    private func heading(_ title: String, _ sub: String) -> some View {
        VStack(spacing: 8) {
            Text(title).font(skin.display(32)).foregroundStyle(skin.ink).multilineTextAlignment(.center)
            Text(sub).font(skin.ui(16)).foregroundStyle(skin.ink2).multilineTextAlignment(.center).lineSpacing(2)
        }
        .padding(.bottom, 6)
    }

    private func choice(_ title: String, _ sub: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(skin.displayMedium(21)).foregroundStyle(skin.ink)
                    if !sub.isEmpty { Text(sub).font(skin.ui(14)).foregroundStyle(skin.ink2) }
                }
                Spacer()
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(selected ? skin.primary : skin.line)
            }
            .padding(18)
            .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color.white))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(selected ? skin.primary : .clear, lineWidth: 2.5))
            .shadow(color: skin.shadow, radius: 10, y: 8)
        }
        .buttonStyle(PressStyle())
    }

    private var languageStep: some View {
        VStack(spacing: 12) {
            heading("Which language?", "One language per account. Spanish has the full course; Mandarin is early.")
            choice("Spanish", "Español", selected: language == "es") { language = "es" }
            choice("Mandarin", "中文 · early access", selected: language == "zh") { language = "zh" }
        }
    }

    private var levelStep: some View {
        VStack(spacing: 12) {
            heading("Where are you starting?", "Roughly. The first call does the real placement.")
            choice("Brand new", "A few words at most", selected: level == "new") { level = "new" }
            choice("I know some", "I can order food and get lost", selected: level == "some") { level = "some" }
            choice("I can hold a conversation", "Slowly, with mistakes", selected: level == "conversational") { level = "conversational" }
        }
    }

    private var timeStep: some View {
        VStack(spacing: 16) {
            heading("When should I text?", "A text with a link straight into the call, every day.")
            Picker("Hour", selection: $hour) {
                ForEach(5...22, id: \.self) { h in
                    Text(hourLabel(h)).font(skin.display(24)).tag(h)
                }
            }
            .pickerStyle(.wheel)
            .frame(height: 170)
            .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color.white))
            .shadow(color: skin.shadow, radius: 10, y: 8)
        }
    }

    private var phoneStep: some View {
        VStack(spacing: 16) {
            heading("Your number", "The daily text goes here, and it signs you in. iMessage only, for now.")
            InputField(placeholder: "+1 415 555 0123", text: $phone, keyboard: .phonePad, content: .telephoneNumber, submit: next)
                .focused($focused)
                .onAppear { focused = true }
        }
    }

    private var codeStep: some View {
        VStack(spacing: 16) {
            heading("The code", "Texted to \(sentTo).")
            InputField(placeholder: "6 digits", text: $code, keyboard: .numberPad, content: .oneTimeCode, submit: next)
                .focused($focused)
                .onAppear { focused = true }
                .onChange(of: code) { _, v in
                    let digits = v.filter(\.isNumber)
                    if digits != v || digits.count > 6 { code = String(digits.prefix(6)) }
                    if code.count == 6 { next() }
                }
            Button("Text it again") { Task { await sendCode() } }
                .font(skin.uiBold(15)).foregroundStyle(skin.primary)
        }
    }

    // MARK: Flow

    private var buttonTitle: String {
        switch step {
        case .welcome: return "Let's go"
        case .phone: return busy ? "Texting…" : "Text me a code"
        case .code: return busy ? "Checking…" : "Sign in"
        default: return "Next"
        }
    }

    private var canContinue: Bool {
        switch step {
        case .phone: return phone.filter(\.isNumber).count >= 7
        case .code: return code.count == 6
        default: return true
        }
    }

    private func next() {
        guard canContinue, !busy else { return }
        error = nil
        switch step {
        case .welcome: step = .language
        case .language: step = .level
        case .level: step = .time
        case .time: step = .phone
        case .phone: Task { await sendCode() }
        case .code: Task { await verify() }
        }
    }

    private func sendCode() async {
        busy = true
        defer { busy = false }
        do {
            sentTo = try await DollyAPI.shared.startCode(phone: phone)
            code = ""
            step = .code
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func verify() async {
        busy = true
        defer { busy = false }
        do {
            let res = try await DollyAPI.shared.verify(phone: sentTo.isEmpty ? phone : sentTo, code: code, language: language, level: level, dailyHour: hour)
            await state.signedIn(res.user)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

func hourLabel(_ h: Int) -> String {
    let twelve = h % 12 == 0 ? 12 : h % 12
    return "\(twelve) \(h < 12 ? "AM" : "PM")"
}
