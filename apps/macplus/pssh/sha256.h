/*
 * sha256.h - portable SHA-256 + HMAC-SHA256
 *
 * Freestanding C89/C99. Compiles on a modern host (clang) and on a
 * 1986 Macintosh (68000, Retro68 gcc). 32-bit core arithmetic; the only
 * library dependency is <string.h> (memcpy/memset).
 */
#ifndef PSSH_SHA256_H
#define PSSH_SHA256_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint32_t h[8];     /* running hash state                  */
    uint64_t total;    /* total message length in bytes       */
    uint8_t  buf[64];  /* partial block buffer                */
    uint32_t n;        /* number of bytes currently in buf    */
} sha256_ctx;

void sha256_init(sha256_ctx *c);
void sha256_update(sha256_ctx *c, const void *data, size_t len);
void sha256_final(sha256_ctx *c, uint8_t out[32]);

/* one-shot convenience wrapper */
void sha256(const void *data, size_t len, uint8_t out[32]);

/* HMAC-SHA256 (RFC 2104) */
void hmac_sha256(const uint8_t *key, size_t keylen,
                 const uint8_t *msg, size_t msglen,
                 uint8_t out[32]);

#ifdef __cplusplus
}
#endif

#endif /* PSSH_SHA256_H */
