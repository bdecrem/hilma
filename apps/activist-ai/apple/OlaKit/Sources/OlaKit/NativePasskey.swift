import Foundation
import Security
#if os(macOS)
import AppKit
import AuthenticationServices
#endif

// Passkeys in the app's own window (2026-11-17, "normal means you'd never leave the app"): signing in
// when the account asks for its passkey too, signing in with a passkey alone, and adding a passkey
// right after the first sign-in. The system's passkey sheet (Touch ID) does the work, for the relying
// party app.ola.cx; the server is the same as the web's (frontdesk/devices.mjs, auth.mjs).
//
// macOS lets an app use a site's passkeys only when the app is signed with the associated-domains
// permission `webcredentials:app.ola.cx` and the site lists the app in
// /.well-known/apple-app-site-association. Until Apple lets the team add that permission (a pending
// agreement on the developer account, 2026-11-17), builds go without it: `NativePasskey.available`
// is false, and the app says plainly that passkeys in the app arrive with the next update. It never
// opens a browser instead.

/// The server's passkey sign-in ceremony: its id, the challenge, and which passkeys may answer.
public struct PasskeyCeremony: Hashable, Sendable {
  public var id: String
  public var challenge: Data
  public var rpID: String
  /// The credential ids that may answer (empty: any of the person's passkeys).
  public var allow: [Data]

  public init(id: String, challenge: Data, rpID: String, allow: [Data]) {
    self.id = id
    self.challenge = challenge
    self.rpID = rpID
    self.allow = allow
  }

  /// From `{ceremony, options: {challenge, rpId, allowCredentials: [{id}]}}`.
  public init(_ j: JSON?) throws {
    guard let j, let id = j["ceremony"].string, let ch = Base64URL.decode(j["options"]["challenge"].str), !ch.isEmpty else { throw AccountError.badReply }
    self.init(id: id, challenge: ch, rpID: j["options"]["rpId"].string ?? AccountAPI.address.host!, allow: j["options"]["allowCredentials"].array.compactMap { Base64URL.decode($0["id"].str) })
  }
}

/// What a passkey answered to a sign-in ceremony, in the server's (WebAuthn's JSON) form.
public struct PasskeyAssertion: Hashable, Sendable {
  public var credentialID: Data
  public var clientDataJSON: Data
  public var authenticatorData: Data
  public var signature: Data
  public var userHandle: Data?

  public init(credentialID: Data, clientDataJSON: Data, authenticatorData: Data, signature: Data, userHandle: Data?) {
    self.credentialID = credentialID
    self.clientDataJSON = clientDataJSON
    self.authenticatorData = authenticatorData
    self.signature = signature
    self.userHandle = userHandle
  }

  public var json: JSON {
    var response: [String: JSON] = ["clientDataJSON": .string(Base64URL.encode(clientDataJSON)), "authenticatorData": .string(Base64URL.encode(authenticatorData)), "signature": .string(Base64URL.encode(signature))]
    if let userHandle, !userHandle.isEmpty { response["userHandle"] = .string(Base64URL.encode(userHandle)) }
    let id = Base64URL.encode(credentialID)
    return ["id": .string(id), "rawId": .string(id), "type": "public-key", "clientExtensionResults": .object([:]), "authenticatorAttachment": "platform", "response": .object(response)]
  }
}

/// What the server needs to make a new passkey for the person.
public struct PasskeyRegistration: Hashable, Sendable {
  public var ceremony: String
  public var challenge: Data
  public var rpID: String
  public var userName: String
  public var userID: Data

  public init(ceremony: String, challenge: Data, rpID: String, userName: String, userID: Data) {
    self.ceremony = ceremony
    self.challenge = challenge
    self.rpID = rpID
    self.userName = userName
    self.userID = userID
  }

  /// From `{ceremony, options: {challenge, rp: {id}, user: {id, name}}}`.
  public init(_ j: JSON?) throws {
    guard let j, let c = j["ceremony"].string, let ch = Base64URL.decode(j["options"]["challenge"].str), !ch.isEmpty,
          let uid = Base64URL.decode(j["options"]["user"]["id"].str), !uid.isEmpty else { throw AccountError.badReply }
    self.init(ceremony: c, challenge: ch, rpID: j["options"]["rp"]["id"].string ?? AccountAPI.address.host!, userName: j["options"]["user"]["name"].str, userID: uid)
  }
}

/// A new passkey, in the server's (WebAuthn's JSON) form.
public struct PasskeyCredential: Hashable, Sendable {
  public var credentialID: Data
  public var clientDataJSON: Data
  public var attestationObject: Data

  public init(credentialID: Data, clientDataJSON: Data, attestationObject: Data) {
    self.credentialID = credentialID
    self.clientDataJSON = clientDataJSON
    self.attestationObject = attestationObject
  }

  public var json: JSON {
    let id = Base64URL.encode(credentialID)
    return ["id": .string(id), "rawId": .string(id), "type": "public-key", "clientExtensionResults": .object([:]), "authenticatorAttachment": "platform",
            "response": ["clientDataJSON": .string(Base64URL.encode(clientDataJSON)), "attestationObject": .string(Base64URL.encode(attestationObject)), "transports": ["internal"]]]
  }
}

/// The account asks for its passkey too: the ceremony to answer.
public struct PasskeyNeeded: Error, Hashable {
  public var ceremony: PasskeyCeremony
}

public enum Base64URL {
  public static func encode(_ d: Data) -> String {
    d.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
  }

  public static func decode(_ s: String) -> Data? {
    guard s.range(of: "^[A-Za-z0-9_-]*$", options: .regularExpression) != nil else { return nil }
    var b = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    while b.count % 4 != 0 { b += "=" }
    return Data(base64Encoded: b)
  }

  /// `n` random bytes from the system.
  public static func random(_ n: Int) -> Data {
    var b = [UInt8](repeating: 0, count: n)
    _ = SecRandomCopyBytes(kSecRandomDefault, n, &b)
    return Data(b)
  }
}

#if os(macOS)
/// The system's passkey sheet for app.ola.cx.
public enum NativePasskey {
  /// The associated domain this app needs to use app.ola.cx's passkeys.
  public static let domain = "webcredentials:app.ola.cx"

  /// Can this build use passkeys at all? Only when it is signed with the associated-domains permission
  /// for app.ola.cx (OLA_PASSKEY=1 in tools/build.sh, once Apple allows it). `OLA_PASSKEY_PREVIEW`
  /// overrides it for screenshots only.
  public static var available: Bool {
    if let v = ProcessInfo.processInfo.environment["OLA_PASSKEY_PREVIEW"] { return v == "1" }
    return signedWithDomain
  }

  /// Whether this build is signed with the associated domain (read from its own signature).
  public static var signedWithDomain: Bool {
    guard let task = SecTaskCreateFromSelf(nil),
          let v = SecTaskCopyValueForEntitlement(task, "com.apple.developer.associated-domains" as CFString, nil) else { return false }
    return (v as? [String])?.contains(domain) == true
  }

  /// Signs in: the sheet asks for one of `ceremony.allow` (or any of the person's passkeys).
  @MainActor
  public static func assert(_ ceremony: PasskeyCeremony) async throws -> PasskeyAssertion {
    let p = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: ceremony.rpID)
    let r = p.createCredentialAssertionRequest(challenge: ceremony.challenge)
    r.allowedCredentials = ceremony.allow.map { ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0) }
    r.userVerificationPreference = .required
    let c = try await Sheet().run(r)
    guard let a = c as? ASAuthorizationPlatformPublicKeyCredentialAssertion, let auth = a.rawAuthenticatorData, let sig = a.signature else { throw AccountError.passkeyRefused }
    return PasskeyAssertion(credentialID: a.credentialID, clientDataJSON: a.rawClientDataJSON, authenticatorData: auth, signature: sig, userHandle: a.userID)
  }

  /// Makes a new passkey for the person on this Mac (Touch ID, kept in iCloud Keychain).
  @MainActor
  public static func register(_ reg: PasskeyRegistration) async throws -> PasskeyCredential {
    let p = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: reg.rpID)
    let r = p.createCredentialRegistrationRequest(challenge: reg.challenge, name: reg.userName, userID: reg.userID)
    r.userVerificationPreference = .required
    let c = try await Sheet().run(r)
    guard let n = c as? ASAuthorizationPlatformPublicKeyCredentialRegistration, let att = n.rawAttestationObject else { throw AccountError.passkeyRefused }
    return PasskeyCredential(credentialID: n.credentialID, clientDataJSON: n.rawClientDataJSON, attestationObject: att)
  }

  /// One run of the system's sheet, over the app's own window.
  @MainActor
  final class Sheet: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var done: CheckedContinuation<ASAuthorizationCredential, Error>?
    private var keep: Sheet?

    func run(_ request: ASAuthorizationRequest) async throws -> ASAuthorizationCredential {
      let c = ASAuthorizationController(authorizationRequests: [request])
      c.delegate = self
      c.presentationContextProvider = self
      keep = self
      defer { keep = nil }
      return try await withCheckedThrowingContinuation { k in
        done = k
        c.performRequests()
      }
    }

    nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
      MainActor.assumeIsolated { NSApp.keyWindow ?? NSApp.windows.first ?? ASPresentationAnchor() }
    }

    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
      MainActor.assumeIsolated { finish(.success(authorization.credential)) }
    }

    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
      let e = error as NSError
      let mapped: Error
      if e.domain == ASAuthorizationError.errorDomain, e.code == ASAuthorizationError.canceled.rawValue { mapped = AccountError.cancelled }
      else if e.domain == ASAuthorizationError.errorDomain, [ASAuthorizationError.notHandled.rawValue, ASAuthorizationError.failed.rawValue].contains(e.code), !NativePasskey.signedWithDomain { mapped = AccountError.passkeysNotInThisVersion }
      else { mapped = AccountError.passkeyRefused }
      MainActor.assumeIsolated { finish(.failure(mapped)) }
    }

    private func finish(_ r: Result<ASAuthorizationCredential, Error>) {
      done?.resume(with: r)
      done = nil
    }
  }

}
#endif
