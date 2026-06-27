/* x25519.h - portable Curve25519 ECDH (RFC 7748), 68000-friendly.
 *
 * No __int128, no OS calls beyond <string.h>. Fixed-size state, no heap.
 * Field is 8 limbs of 32 bits (radix 2^32); all field partial products are
 * uint32 * uint32 -> uint64 only. Suitable for 1986 Macintosh (Retro68 gcc)
 * and modern hosts (clang) alike.
 */
#ifndef X25519_H
#define X25519_H

#include <stdint.h>

/* Resumable ladder state. All fixed-size arrays, no heap.
 * Field elements are 8 little-endian 32-bit limbs (value < 2^256). */
typedef struct {
    uint32_t x1[8];     /* decoded base u (constant through the ladder) */
    uint32_t x2[8];     /* working projective coordinates */
    uint32_t z2[8];
    uint32_t x3[8];
    uint32_t z3[8];
    uint8_t  scalar[32];/* clamped scalar (RFC 7748) */
    int      bit;       /* next ladder bit to process: starts 254, ends -1 */
    uint32_t swap;      /* running cswap bit */
} x25519_state;

/* One-shot scalar multiplication: out = scalar * point. */
void x25519(uint8_t out[32], const uint8_t scalar[32], const uint8_t point[32]);

/* Resumable form: the 255-iteration Montgomery ladder, run in slices. */
void x25519_start (x25519_state *st, const uint8_t scalar[32], const uint8_t point[32]);
int  x25519_step  (x25519_state *st, int max_steps);   /* returns 1 when all 255 bits done, else 0 */
void x25519_finish(x25519_state *st, uint8_t out[32]);  /* final inversion + encode */

#endif /* X25519_H */
