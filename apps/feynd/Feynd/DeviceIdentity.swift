import Foundation
import Security

// Keychain-backed device UUID. Generated on first launch and reused forever
// (until the user wipes the phone). Sent as `x-feynd-device` on every
// authenticated backend call so the server can scope chats, quiz attempts,
// and TTS audio by device without requiring sign-in.
enum DeviceIdentity {
    private static let service = "com.bartdecrem.Feynd"
    private static let account = "device_id"

    static var deviceId: String {
        // Allow Secrets.swift to pin a stable device ID (used for seeded
        // content like the Discord Q&A import). Keychain-generated UUIDs
        // are fine for fresh installs — but pinning makes rebuilds stable.
        if !Secrets.deviceIdOverride.isEmpty {
            return Secrets.deviceIdOverride
        }
        if let existing = readKeychain() {
            return existing
        }
        let newId = UUID().uuidString.lowercased()
        writeKeychain(newId)
        return newId
    }

    // MARK: - Keychain

    private static func readKeychain() -> String? {
        let query: [String: Any] = [
            kSecClass as String:            kSecClassGenericPassword,
            kSecAttrService as String:      service,
            kSecAttrAccount as String:      account,
            kSecReturnData as String:       true,
            kSecMatchLimit as String:       kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess,
              let data = item as? Data,
              let str = String(data: data, encoding: .utf8) else {
            return nil
        }
        return str
    }

    private static func writeKeychain(_ value: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String:             kSecClassGenericPassword,
            kSecAttrService as String:       service,
            kSecAttrAccount as String:       account,
            kSecAttrAccessible as String:    kSecAttrAccessibleAfterFirstUnlock,
            kSecValueData as String:         data
        ]
        SecItemDelete(query as CFDictionary)
        let status = SecItemAdd(query as CFDictionary, nil)
        if status != errSecSuccess {
            NSLog("FEYND_KEYCHAIN_ADD_ERR status=\(status)")
        }
    }
}
