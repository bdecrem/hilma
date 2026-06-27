/* aes128.h - portable AES-128 encryption (CTR mode) for SSH client.
 *
 * Encryption + key schedule only (no decryption). Designed to compile on
 * both a modern host (clang/gcc) and a 1986 Macintosh (68000, Retro68 gcc).
 * Uses only <stdint.h> fixed types and 32-bit/8-bit operations. Freestanding,
 * needs only <string.h>.
 */
#ifndef AES128_H
#define AES128_H

#include <stdint.h>
#include <stddef.h>

typedef struct { uint8_t rk[176]; } aes128_ctx;   /* 11 round keys, expanded */

/* Expand the 16-byte key into the round-key schedule. */
void aes128_init(aes128_ctx *c, const uint8_t key[16]);

/* Encrypt one 16-byte block. in and out may alias. */
void aes128_encrypt(const aes128_ctx *c, const uint8_t in[16], uint8_t out[16]);

/* CTR mode: encrypt/decrypt `len` bytes of `in` into `out`, using `counter`
 * as the 16-byte big-endian counter block. The counter is treated as a
 * 128-bit big-endian integer and incremented once per 16-byte block; on
 * return it holds the next unused counter value. XOR is done here. */
void aes128_ctr_xor(const aes128_ctx *c, uint8_t counter[16],
                    const uint8_t *in, uint8_t *out, size_t len);

#endif /* AES128_H */
