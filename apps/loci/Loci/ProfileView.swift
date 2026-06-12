import SwiftUI
import PhotosUI

/// Profile + settings sheet — Loci's take on Feynd's ProfileSheet, in the
/// paper-and-ink language: serif level title, moss progress ring, no game
/// chrome. Opens from the avatar circle on Today.
///
/// Layout, top to bottom: drag handle, title row, hero (avatar 78pt with
/// camera upload + name + level), progress bar, three stat chips,
/// Account / About sections.
struct ProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppSession.self) private var session

    @State private var pickerItem: PhotosPickerItem? = nil
    @State private var uploadingAvatar = false
    @State private var uploadError: String? = nil

    var body: some View {
        VStack(spacing: 0) {
            handle
            header
            ScrollView {
                VStack(spacing: 0) {
                    hero
                    sections
                }
            }
            .scrollIndicators(.hidden)
        }
        .background(Theme.bg.ignoresSafeArea())
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            uploadAvatar(item: item)
        }
        .alert("Couldn't upload photo",
               isPresented: Binding(get: { uploadError != nil }, set: { if !$0 { uploadError = nil } })) {
            Button("OK") { uploadError = nil }
        } message: { Text(uploadError ?? "") }
        .task { await session.refreshProgress() }
    }

    // MARK: Chrome

    private var handle: some View {
        Capsule()
            .fill(Theme.raised)
            .frame(width: 38, height: 4)
            .padding(.top, 8)
            .frame(maxWidth: .infinity)
    }

    private var header: some View {
        ZStack {
            Text("Profile")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.ink)
            HStack {
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.ink2)
                        .frame(width: 36, height: 36)
                        .background(Theme.surface, in: Circle())
                        .overlay(Circle().stroke(Theme.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 14)
        .padding(.bottom, 4)
    }

    // MARK: Hero

    private var hero: some View {
        VStack(spacing: 0) {
            HStack(spacing: 16) {
                PhotosPicker(selection: $pickerItem, matching: .images, photoLibrary: .shared()) {
                    avatarWithCamera
                }
                .buttonStyle(.plain)

                VStack(alignment: .leading, spacing: 4) {
                    Text(username)
                        .font(.system(size: 22, weight: .semibold, design: .serif))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                    HStack(spacing: 4) {
                        Text("Level \(session.progress.level)")
                            .foregroundStyle(Theme.ink)
                            .fontWeight(.semibold)
                        Text("·")
                            .foregroundStyle(Theme.ink3)
                        Text(lociLevelTitle(session.progress.level))
                            .italic()
                            .foregroundStyle(Theme.ink2)
                    }
                    .font(.system(size: 13.5, design: .serif))
                }
                Spacer()
            }
            progressBar
                .padding(.top, 18)
            statsRow
                .padding(.top, 18)
        }
        .padding(.horizontal, 22)
        .padding(.top, 14)
        .padding(.bottom, 18)
    }

    private var avatarWithCamera: some View {
        ZStack(alignment: .bottomTrailing) {
            avatarHero
            ZStack {
                Circle()
                    .fill(Theme.raised)
                    .frame(width: 28, height: 28)
                Circle()
                    .stroke(Theme.bg, lineWidth: 2)
                    .frame(width: 28, height: 28)
                if uploadingAvatar {
                    ProgressView()
                        .controlSize(.mini)
                        .tint(Theme.ink)
                } else {
                    Image(systemName: "camera.fill")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                }
            }
            .offset(x: 2, y: 2)
        }
    }

    @ViewBuilder
    private var avatarHero: some View {
        let s: CGFloat = 78
        let ring = s + 8
        ZStack {
            // Same fraction as the linear bar below — single source of truth.
            Circle()
                .stroke(Theme.raised, lineWidth: 2)
                .frame(width: ring, height: ring)
            Circle()
                .trim(from: 0, to: session.progress.progressFraction)
                .stroke(Theme.moss, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .frame(width: ring, height: ring)

            if let urlStr = session.user?.avatarUrl, let url = URL(string: urlStr) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img): img.resizable().scaledToFill()
                    default: initialCircle(size: s)
                    }
                }
                .frame(width: s, height: s)
                .clipShape(Circle())
            } else {
                initialCircle(size: s)
            }
        }
        .frame(width: ring, height: ring)
    }

    private func initialCircle(size: CGFloat) -> some View {
        Circle()
            .fill(Theme.mossSoft)
            .frame(width: size, height: size)
            .overlay(
                Text(String(username.prefix(1)).uppercased())
                    .font(.system(size: 34, weight: .semibold, design: .serif))
                    .foregroundStyle(Theme.moss)
            )
    }

    private var progressBar: some View {
        let p = session.progress
        return VStack(spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                HStack(spacing: 4) {
                    Text("\(p.totalStars)")
                        .foregroundStyle(Theme.ink)
                        .fontWeight(.semibold)
                    Text("/ \(p.nextLevelAt) stars")
                        .foregroundStyle(Theme.ink3)
                }
                Spacer()
                if p.toNextLevel > 0 {
                    HStack(spacing: 4) {
                        Text("\(p.toNextLevel) more")
                            .foregroundStyle(Theme.moss)
                            .fontWeight(.semibold)
                        Text("to Level \(p.level + 1)")
                            .foregroundStyle(Theme.ink3)
                    }
                } else {
                    Text("Max")
                        .foregroundStyle(Theme.ink3)
                }
            }
            .font(.system(size: 12))

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.raised)
                    Capsule()
                        .fill(Theme.moss)
                        .frame(width: max(8, geo.size.width * p.progressFraction))
                }
            }
            .frame(height: 8)
        }
    }

    private var statsRow: some View {
        let p = session.progress
        return HStack(spacing: 8) {
            statChip(value: "\(p.totalStars)", label: "stars", icon: "star.fill", tint: Theme.ochre)
            statChip(value: "\(p.masteredTopicCount)", label: "mastered", icon: "checkmark.seal.fill", tint: Theme.moss)
            statChip(value: "\(p.topicCount)", label: "topics", icon: "books.vertical.fill", tint: Theme.ink2)
        }
    }

    private func statChip(value: String, label: String, icon: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 5) {
                Image(systemName: icon)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(tint)
                Text(value)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(Theme.ink)
            }
            Text(label.uppercased())
                .font(.system(size: 10.5, weight: .semibold))
                .tracking(0.4)
                .foregroundStyle(Theme.ink3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.border, lineWidth: 1))
    }

    // MARK: Sections

    private var sections: some View {
        VStack(spacing: 18) {
            profileSection(label: "Account") {
                profileRow(label: "Signed in as", detail: username)
                rowDivider
                profileRow(label: "Sign out", labelColor: Theme.clay) {
                    Task {
                        await session.signOut()
                        dismiss()
                    }
                }
                if session.user?.avatarUrl != nil {
                    rowDivider
                    profileRow(label: "Remove profile photo", labelColor: Theme.ink2) {
                        Task { await removeAvatar() }
                    }
                }
            }
            profileSection(label: "About") {
                profileRow(label: "App", detail: "Loci")
                rowDivider
                profileRow(label: "Version", detail: appVersion)
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 44)
    }

    private func profileSection<Content: View>(
        label: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Eyebrow(text: label)
                .padding(.leading, 4)
            VStack(spacing: 0) { content() }
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.border, lineWidth: 1))
        }
    }

    private var rowDivider: some View {
        Rectangle().fill(Theme.borderSoft).frame(height: 0.5)
    }

    private func profileRow(
        label: String,
        detail: String? = nil,
        labelColor: Color = Theme.ink,
        action: (() -> Void)? = nil
    ) -> some View {
        Button { action?() } label: {
            HStack(spacing: 12) {
                Text(label)
                    .font(.system(size: 15))
                    .foregroundStyle(labelColor)
                Spacer()
                if let detail {
                    Text(detail)
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.ink2)
                }
                if action != nil && detail == nil {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.ink3)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 13)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(action == nil)
    }

    private var username: String {
        session.user?.username ?? ""
    }

    private var appVersion: String {
        let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
        let b = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "?"
        return "\(v) (\(b))"
    }

    // MARK: Upload

    private func uploadAvatar(item: PhotosPickerItem) {
        Task {
            uploadingAvatar = true
            defer {
                uploadingAvatar = false
                pickerItem = nil
            }
            do {
                guard let data = try await item.loadTransferable(type: Data.self) else { return }
                let mime = item.supportedContentTypes.contains(where: { $0.identifier.contains("png") })
                    ? "image/png" : "image/jpeg"
                let url = try await API.shared.uploadAvatar(imageData: data, mime: mime)
                session.setAvatarUrl(url)
            } catch {
                uploadError = error.localizedDescription
            }
        }
    }

    private func removeAvatar() async {
        do {
            try await API.shared.deleteAvatar()
            session.setAvatarUrl(nil)
        } catch {
            uploadError = error.localizedDescription
        }
    }
}
