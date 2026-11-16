// A software passkey (ES256, attestation "none") for driving the front desk's WebAuthn routes from
// node, with knobs a real authenticator would never turn: user verification off, another origin,
// an old counter, another person's user handle.
import { createHash, createPrivateKey, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { isoCBOR } from '@simplewebauthn/server/helpers'

const sha = (b) => createHash('sha256').update(b).digest()
const b64u = (b) => Buffer.from(b).toString('base64url')
const u32 = (n) => {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}

export class SoftAuthn {
  constructor({ rpId, origin, saved } = {}) {
    this.rpId = rpId
    this.origin = origin
    if (saved) {
      this.priv = createPrivateKey(saved.priv)
      this.credId = Buffer.from(saved.credId, 'base64url')
      this.counter = saved.counter
      this.userHandle = saved.userHandle
    } else {
      this.priv = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey
      this.credId = randomBytes(16)
      this.counter = 0
      this.userHandle = null
    }
  }
  save() {
    return { priv: this.priv.export({ format: 'pem', type: 'pkcs8' }), credId: b64u(this.credId), counter: this.counter, userHandle: this.userHandle }
  }
  get id() {
    return b64u(this.credId)
  }
  create(options, { uv = true, origin = this.origin, rpId = this.rpId } = {}) {
    const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin, crossOrigin: false }))
    const jwk = this.priv.export({ format: 'jwk' })
    const cose = new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]])
    const len = Buffer.alloc(2)
    len.writeUInt16BE(this.credId.length)
    const flags = 0x01 | (uv ? 0x04 : 0) | 0x40
    const authData = Buffer.concat([sha(rpId), Buffer.from([flags]), u32(this.counter), Buffer.alloc(16), len, this.credId, Buffer.from(isoCBOR.encode(cose))])
    const att = isoCBOR.encode(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', new Uint8Array(authData)]]))
    this.userHandle = options.user.id
    return { id: this.id, rawId: this.id, type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: b64u(clientData), attestationObject: b64u(att), transports: ['internal'] } }
  }
  get(options, { uv = true, origin = this.origin, counter, userHandle } = {}) {
    if (counter === undefined) counter = ++this.counter
    const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin, crossOrigin: false }))
    const authData = Buffer.concat([sha(this.rpId), Buffer.from([0x01 | (uv ? 0x04 : 0)]), u32(counter)])
    const signature = sign('sha256', Buffer.concat([authData, sha(clientData)]), this.priv)
    return { id: this.id, rawId: this.id, type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: b64u(clientData), authenticatorData: b64u(authData), signature: b64u(signature), userHandle: userHandle ?? this.userHandle } }
  }
}
