import SwiftUI
import UIKit
import UserNotifications

/// Remote push (APNs) — new 2026-10-07 with Actively Read. The server sends
/// at most one Dodo push a day (collapse id "dodo-daily", so a newer one
/// replaces an older one on the lock screen); the payload carries routing
/// data next to `aps`:
///   { "kind": "actively_read", "thread_id": "<topic>", "day": "YYYY-MM-DD" }
/// Tapping it opens today's Actively Read session; the "Not interested"
/// action declines the topic without opening the app.
///
/// The token is uploaded on every launch (tokens can change) once signed in,
/// tagged with the APNs environment of this build: Debug = sandbox,
/// Release (TestFlight / App Store) = production. Catalyst has no push
/// entitlement, so it never registers.
final class DodoAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    static let activelyReadCategory = "ACTIVELY_READ"
    static let notInterestedAction = "NOT_INTERESTED"

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        let talk = UNNotificationAction(identifier: "TALK", title: "Talk it through", options: [.foreground])
        let skip = UNNotificationAction(identifier: Self.notInterestedAction, title: "Not interested", options: [.destructive])
        center.setNotificationCategories([
            UNNotificationCategory(identifier: Self.activelyReadCategory, actions: [talk, skip], intentIdentifiers: [], options: []),
        ])
        PushRegistry.registerIfAuthorized()
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        PushRegistry.didReceive(token: hex)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NSLog("F2_PUSH register failed: %@", error.localizedDescription)
    }

    /// In the foreground the in-app banner already shows today's read, and the
    /// main UI shows one banner at a time — so a push that arrives while the
    /// app is open goes to Notification Center only, and the banner refreshes.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let info = notification.request.content.userInfo
        if info["kind"] as? String == "actively_read" {
            Task { @MainActor in await ActivelyReadStore.shared.refresh() }
            completionHandler([.list])
        } else {
            completionHandler([.banner, .list, .sound])
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        guard info["kind"] as? String == "actively_read", let threadId = info["thread_id"] as? String else {
            completionHandler(); return
        }
        if response.actionIdentifier == Self.notInterestedAction {
            Task {
                try? await F2API.shared.declineActivelyRead(threadId: threadId)
                await ActivelyReadStore.shared.refresh()
                completionHandler()
            }
            return
        }
        if response.actionIdentifier == UNNotificationDefaultActionIdentifier || response.actionIdentifier == "TALK" {
            Task { @MainActor in
                DeepLinkRouter.shared.requestActivelyRead(threadId: threadId, label: nil)
            }
        }
        completionHandler()
    }
}

/// Permission + token upload.
enum PushRegistry {
    private static let tokenKey = "apnsDeviceToken"

    static var environment: String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }

    /// Ask once (the system shows the prompt only the first time), then register.
    /// Called when the signed-in main UI appears.
    static func requestAndRegister() {
        #if targetEnvironment(macCatalyst)
        return
        #else
        #if targetEnvironment(simulator)
        // `-RegisterPushNow 1` — get an APNs token (sandbox) without the
        // permission prompt, which can't be tapped headlessly; proves the
        // token → server → APNs path. Display still needs the permission.
        if UserDefaults.standard.bool(forKey: "RegisterPushNow") {
            DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
        }
        if UserDefaults.standard.bool(forKey: "SkipNotifPrompt") { return }
        #endif
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
        }
        #endif
    }

    /// At launch: register only when notifications are already allowed (no prompt).
    static func registerIfAuthorized() {
        #if !targetEnvironment(macCatalyst)
        UNUserNotificationCenter.current().getNotificationSettings { s in
            guard s.authorizationStatus == .authorized || s.authorizationStatus == .provisional else { return }
            DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
        }
        #endif
    }

    static func didReceive(token: String) {
        UserDefaults.standard.set(token, forKey: tokenKey)
        Task { await upload() }
    }

    /// Send the stored token to the server for whoever is signed in. Quietly
    /// does nothing while signed out; Session calls it again after sign-in.
    static func upload() async {
        guard let token = UserDefaults.standard.string(forKey: tokenKey) else { return }
        do {
            try await F2API.shared.registerPushToken(token, environment: environment,
                                                     bundleId: Bundle.main.bundleIdentifier ?? "com.bartdecrem.Feynd")
            NSLog("F2_PUSH registered %@… %@", String(token.prefix(8)), environment)
        } catch {
            NSLog("F2_PUSH upload failed: %@", error.localizedDescription)
        }
    }

    /// On sign-out: this device stops receiving the previous account's pushes.
    static func unregister() async {
        guard let token = UserDefaults.standard.string(forKey: tokenKey) else { return }
        try? await F2API.shared.unregisterPushToken(token)
    }
}
