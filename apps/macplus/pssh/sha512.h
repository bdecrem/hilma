/*
 * sha512.h — portable, self-contained SHA-512 (FIPS 180-4).
 *
 * Designed to compile on a modern host (clang/gcc) AND on a 1986
 * Macintosh Plus (68000, Retro68 gcc). Freestanding C89/C99: only
 * <stdint.h> and <string.h> are required. No __int128, no compiler
 * builtins, no OS/library calls. All state lives in the context
 * struct (no global mutable state).
 *
 * For SSH Ed25519 host-key verification on PSSH.
 */
#ifndef PSSH_SHA512_H
#define PSSH_SHA512_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint64_t h[8];     /* running hash state */
    uint64_t total;    /* total message length in bytes (messages are tiny) */
    uint8_t  buf[128]; /* partial-block buffer (block size = 128 bytes) */
    uint32_t n;        /* number of bytes currently in buf */
} sha512_ctx;

void sha512_init(sha512_ctx *c);
void sha512_update(sha512_ctx *c, const void *data, size_t len);
void sha512_final(sha512_ctx *c, uint8_t out[64]);

/* One-shot convenience wrapper. */
void sha512(const void *data, size_t len, uint8_t out[64]);

#ifdef __cplusplus
}
#endif

#endif /* PSSH_SHA512_H */
