/* ed25519.h - portable Ed25519 signature *verification* (RFC 8032), 68000-friendly.
 *
 * VERIFY ONLY (no signing). For an SSH client to verify a server's host-key
 * signature and defeat man-in-the-middle.
 *
 * Designed to compile on a modern host (clang/gcc) AND on a 1986 Macintosh Plus
 * (68000, Retro68 gcc). Freestanding C89/C99: only <stdint.h>, <stddef.h>, and
 * <string.h> are required, plus a SHA-512 module (sha512.h). No __int128, no
 * compiler builtins, no OS/library calls. All state lives in fixed-size structs
 * (no heap). The field is 8 limbs of radix 2^32; every field partial product is
 * uint32 * uint32 -> uint64 only (same constraint as the curve25519 impl).
 */
#ifndef PSSH_ED25519_H
#define PSSH_ED25519_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* One-shot verify.
 * Returns 1 if `sig` is a valid Ed25519 signature of `msg` (length `msglen`)
 * under public key `pub`, else 0. Never returns nonzero for a malformed input. */
int ed25519_verify(const uint8_t pub[32], const uint8_t *msg, size_t msglen,
                   const uint8_t sig[64]);

/* ---- Resumable (sliced) verify, so a 68000 can verify without freezing its UI.
 *
 * The expensive part is the 256-bit double-scalar multiplication
 * P = [S]B + [h](-A); ed25519_verify_step processes a bounded number of bits per
 * call and returns 0 until the multiply is finished. Typical use:
 *
 *     ed25519_vrfy_state st;
 *     if (ed25519_verify_start(&st, pub, msg, msglen, sig) < 0)  ... reject ...
 *     while (!ed25519_verify_step(&st, 8)) { pump_ui(); }
 *     valid = ed25519_verify_finish(&st);
 *
 * No heap; all working state is inside ed25519_vrfy_state. */
typedef struct {
    /* Decoded points in extended twisted-Edwards coords (X,Y,Z,T), 8 limbs each.
       negA = -A (the negated public-key point); B = the curve base point. */
    uint32_t negA[4][8];   /* -A, used in the [h](-A) term                  */
    uint32_t B[4][8];      /* base point B, used in the [S]B term           */
    uint32_t acc[4][8];    /* running accumulator P                          */

    uint8_t  S[32];        /* signature scalar S (little-endian)             */
    uint8_t  h[32];        /* SHA512(R||A||M) reduced mod L (little-endian)  */
    uint8_t  Renc[32];     /* R as encoded in the signature (for final cmp)  */

    int      bit;          /* next scalar bit to process: starts 255, ends -1 */
    int      valid;        /* -1 = aborted/malformed, 0 = undecided, 1 = ok   */
    int      done;         /* set once the scalar multiply completes          */
} ed25519_vrfy_state;

/* Decode inputs and prime the state machine.
 * Returns 0 on success (ready to step), <0 if inputs are malformed
 * (bad point encoding, or S not canonical / >= group order L). */
int  ed25519_verify_start (ed25519_vrfy_state *st, const uint8_t pub[32],
                           const uint8_t *msg, size_t msglen, const uint8_t sig[64]);

/* Advance the double-scalar multiply by up to max_steps bits.
 * Returns 1 when the multiply is complete (call finish next), else 0. */
int  ed25519_verify_step  (ed25519_vrfy_state *st, int max_steps);

/* Final check: returns 1 if the signature is valid, 0 otherwise. */
int  ed25519_verify_finish(ed25519_vrfy_state *st);

/* ============================================================ SIGNING ====== */

/* Standard Ed25519 (RFC 8032) signing from a 32-byte seed (the private key).
 * `pub` is the corresponding 32-byte public key (derive it once with
 * ed25519_pubkey_from_seed and store it alongside the seed). The signature is
 * deterministic — no RNG — so the same (seed,msg) always yields the same 64
 * bytes. One-shot wrapper for ed25519_sign_{start,step,finish}. */
void ed25519_sign(uint8_t sig[64], const uint8_t *msg, size_t msglen,
                  const uint8_t pub[32], const uint8_t seed[32]);

/* Derive the 32-byte public key from a 32-byte seed, so a caller can generate
 * and store an identity (seed kept secret, pub published). */
void ed25519_pubkey_from_seed(uint8_t pub[32], const uint8_t seed[32]);

/* ---- Resumable (sliced) signing, so a 68000 can sign without freezing its UI.
 *
 * The one expensive step is R = [r]B, a 256-bit fixed-base scalar multiply;
 * ed25519_sign_step processes a bounded number of bits per call and returns 0
 * until the multiply is finished. The two SHA-512 hashes (cheap) happen in
 * _start (r = SHA512(prefix||M)) and _finish (k = SHA512(R||A||M)). Typical use:
 *
 *     ed25519_sign_state st;
 *     ed25519_sign_start(&st, msg, msglen, pub, seed);
 *     while (!ed25519_sign_step(&st, 8)) { pump_ui(); }
 *     ed25519_sign_finish(&st, sig);
 *
 * No heap; all working state is inside ed25519_sign_state. NOTE: _start stashes
 * the msg POINTER (not a copy) — keep msg alive until _finish returns. */
typedef struct {
    /* Extended twisted-Edwards points (X,Y,Z,T), 8 limbs each. */
    uint32_t acc[4][8];    /* running [r]B accumulator (becomes R)           */
    uint32_t B[4][8];      /* base point B                                   */

    uint8_t  r[32];        /* nonce  r = SHA512(prefix||M) mod L  (LE)        */
    uint8_t  a[32];        /* clamped secret scalar a = clamp(SHA512(seed))   */
    uint8_t  prefix[32];   /* SHA512(seed)[32..63], the deterministic-nonce salt */
    uint8_t  pub[32];      /* public key A, hashed into k and copied? no — used in k */

    const uint8_t *msg;    /* borrowed pointer to the message (not copied)    */
    size_t   msglen;       /* message length in bytes                         */

    int      bit;          /* next scalar bit to process: starts 255, ends -1 */
    int      done;         /* set once the scalar multiply completes          */
} ed25519_sign_state;

/* Compute h=SHA512(seed); a=clamp(h[0..31]); prefix=h[32..63];
 * r=SHA512(prefix||M) mod L; prime the [r]B state machine. Returns 0 (the
 * inputs are fixed-size, so it cannot fail) — int for symmetry with verify. */
int  ed25519_sign_start (ed25519_sign_state *st, const uint8_t *msg, size_t msglen,
                         const uint8_t pub[32], const uint8_t seed[32]);

/* Advance the fixed-base scalar multiply R=[r]B by up to max_steps bits.
 * Returns 1 when the multiply is complete (call finish next), else 0. */
int  ed25519_sign_step  (ed25519_sign_state *st, int max_steps);

/* Encode R, compute k=SHA512(R||A||M) mod L and S=(r + k*a) mod L, and write
 * the 64-byte signature sig = R(32) || S(32). */
void ed25519_sign_finish(ed25519_sign_state *st, uint8_t sig[64]);

#ifdef __cplusplus
}
#endif

#endif /* PSSH_ED25519_H */
