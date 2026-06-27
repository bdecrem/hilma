/* aes128.h - portable AES (128 or 256) encryption (CTR mode) for the SSH client.
 *
 * Encryption + key schedule only (no decryption; CTR needs only encrypt).
 * Compiles on a modern host (clang/gcc) and a 1986 Macintosh (68000, Retro68
 * gcc). Uses only <stdint.h> fixed types and 8/32-bit ops. Freestanding.
 *
 * One generic context handles both key sizes (aes128-ctr and aes256-ctr, both
 * negotiated by the SSH transport). The legacy aes128_* names are kept as thin
 * wrappers so existing callers/tests still build.
 */
#ifndef AES128_H
#define AES128_H

#include <stdint.h>
#include <stddef.h>

/* rk holds up to 15 round keys (AES-256 = 240 bytes); nr = number of rounds. */
typedef struct { uint8_t rk[240]; int nr; } aes_ctx;

/* Expand a 16- or 32-byte key (keybytes = 16 or 32). */
void aes_init(aes_ctx *c, const uint8_t *key, int keybytes);

/* Encrypt one 16-byte block. in and out may alias. */
void aes_encrypt(const aes_ctx *c, const uint8_t in[16], uint8_t out[16]);

/* CTR mode: XOR `len` bytes; `counter` is a 16-byte big-endian counter block,
 * incremented once per 16-byte block; on return it holds the next value. */
void aes_ctr_xor(const aes_ctx *c, uint8_t counter[16],
                 const uint8_t *in, uint8_t *out, size_t len);

/* ---- legacy AES-128 API (wrappers around the generic one) ---- */
typedef aes_ctx aes128_ctx;
#define aes128_init(c, key)        aes_init((c), (key), 16)
#define aes128_encrypt(c, in, out) aes_encrypt((c), (in), (out))
#define aes128_ctr_xor(c, ctr, in, out, len) aes_ctr_xor((c), (ctr), (in), (out), (len))

#endif /* AES128_H */
