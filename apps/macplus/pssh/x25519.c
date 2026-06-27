/* x25519.c - portable Curve25519 ECDH (RFC 7748).
 *
 * Field arithmetic: 8 limbs of radix 2^32 (little-endian), values kept < 2^256
 * but not necessarily canonical (< p). All field partial products are formed as
 * uint32 * uint32 -> uint64; reductions use 2^256 = 38 (mod p) and 2^255 = 19.
 * No __int128, no builtins, no OS calls beyond <string.h>. `int` assumed 32-bit.
 */
#include <stdint.h>
#include <string.h>
#include "x25519.h"

/* p = 2^255 - 19, as 8 little-endian 32-bit limbs. */
static const uint32_t FE_P[8] = {
    0xffffffedu, 0xffffffffu, 0xffffffffu, 0xffffffffu,
    0xffffffffu, 0xffffffffu, 0xffffffffu, 0x7fffffffu
};

/* Add a small value at limb 0 and propagate; any carry out of the top
 * (coefficient of 2^256) folds back as *38 (since 2^256 = 38 mod p). Converges
 * to a value < 2^256. */
static void fe_fold(uint32_t out[8], uint32_t add0)
{
    uint64_t c = add0;
    int k;
    while (c) {
        for (k = 0; k < 8 && c; k++) {
            uint64_t v = (uint64_t)out[k] + c;
            out[k] = (uint32_t)v;
            c = v >> 32;
        }
        c = c * 38ULL;   /* leftover above 2^256 folds back to position 0 */
    }
}

/* out = a * b (mod p). Schoolbook 8x8 -> 16 limbs, then reduce. */
static void fe_mul(uint32_t out[8], const uint32_t a[8], const uint32_t b[8])
{
    uint32_t t[16];
    uint64_t carry;
    int i, j;

    for (i = 0; i < 16; i++)
        t[i] = 0;

    /* operand scanning; every partial product is uint32*uint32->uint64 */
    for (i = 0; i < 8; i++) {
        carry = 0;
        for (j = 0; j < 8; j++) {
            uint64_t v = (uint64_t)t[i + j] + (uint64_t)a[i] * (uint64_t)b[j] + carry;
            t[i + j] = (uint32_t)v;
            carry = v >> 32;
        }
        t[i + 8] = (uint32_t)carry;   /* fresh high slot */
    }

    /* reduce 512 -> 256: value = L + 38*H  (H = high 256 bits) */
    carry = 0;
    for (i = 0; i < 8; i++) {
        uint64_t v = (uint64_t)t[i] + 38ULL * (uint64_t)t[i + 8] + carry;
        out[i] = (uint32_t)v;
        carry = v >> 32;
    }
    fe_fold(out, (uint32_t)(carry * 38ULL));
}

static void fe_sq(uint32_t out[8], const uint32_t a[8])
{
    fe_mul(out, a, a);
}

/* out = a * 121665 (mod p), the a24 multiply in the ladder. */
static void fe_mul121665(uint32_t out[8], const uint32_t a[8])
{
    uint64_t carry = 0;
    int i;
    for (i = 0; i < 8; i++) {
        uint64_t v = (uint64_t)a[i] * 121665u + carry;
        out[i] = (uint32_t)v;
        carry = v >> 32;
    }
    fe_fold(out, (uint32_t)(carry * 38ULL));
}

/* out = a + b (mod p), result < 2^256. */
static void fe_add(uint32_t out[8], const uint32_t a[8], const uint32_t b[8])
{
    uint64_t carry = 0;
    int k;
    for (k = 0; k < 8; k++) {
        uint64_t v = (uint64_t)a[k] + (uint64_t)b[k] + carry;
        out[k] = (uint32_t)v;
        carry = v >> 32;
    }
    fe_fold(out, (uint32_t)(carry * 38ULL));   /* carry is 0 or 1 */
}

/* out = a - b (mod p), result < 2^256.
 * Computes a + 4p - b (4p = 2^257 - 76, which is 0 mod p) to stay positive,
 * then folds. */
static void fe_sub(uint32_t out[8], const uint32_t a[8], const uint32_t b[8])
{
    static const uint32_t FOURP[9] = {
        0xFFFFFFB4u, 0xFFFFFFFFu, 0xFFFFFFFFu, 0xFFFFFFFFu,
        0xFFFFFFFFu, 0xFFFFFFFFu, 0xFFFFFFFFu, 0xFFFFFFFFu, 0x00000001u
    };
    uint32_t t[9];
    uint64_t carry = 0, borrow = 0;
    int k;

    for (k = 0; k < 8; k++) {
        uint64_t v = (uint64_t)a[k] + (uint64_t)FOURP[k] + carry;
        t[k] = (uint32_t)v;
        carry = v >> 32;
    }
    t[8] = (uint32_t)((uint64_t)FOURP[8] + carry);

    for (k = 0; k < 8; k++) {
        uint64_t s = (uint64_t)b[k] + borrow;
        if ((uint64_t)t[k] >= s) {
            t[k] = (uint32_t)((uint64_t)t[k] - s);
            borrow = 0;
        } else {
            t[k] = (uint32_t)((uint64_t)t[k] + 0x100000000ULL - s);
            borrow = 1;
        }
    }
    t[8] = (uint32_t)(t[8] - borrow);   /* t[8] was >= 1, borrow <= 1 */

    /* fold limb 8 (coefficient of 2^256 == 38), then any remaining carry */
    carry = 0;
    for (k = 0; k < 8; k++) {
        uint64_t v = (uint64_t)t[k] + (k == 0 ? 38ULL * (uint64_t)t[8] : 0ULL) + carry;
        out[k] = (uint32_t)v;
        carry = v >> 32;
    }
    fe_fold(out, (uint32_t)(carry * 38ULL));
}

/* Constant-shape conditional swap of two field elements when (swap & 1). */
static void fe_cswap(uint32_t a[8], uint32_t b[8], uint32_t swap)
{
    uint32_t mask = (uint32_t)(0u - (swap & 1u));
    int k;
    for (k = 0; k < 8; k++) {
        uint32_t t = mask & (a[k] ^ b[k]);
        a[k] ^= t;
        b[k] ^= t;
    }
}

static void fe_1(uint32_t a[8]) { int k; a[0] = 1; for (k = 1; k < 8; k++) a[k] = 0; }
static void fe_0(uint32_t a[8]) { int k; for (k = 0; k < 8; k++) a[k] = 0; }

/* Subtract p once if v >= p (used to canonicalize before serializing). */
static void fe_reduce_p(uint32_t v[8])
{
    uint32_t r[8];
    uint64_t borrow = 0;
    int k;
    for (k = 0; k < 8; k++) {
        uint64_t s = (uint64_t)FE_P[k] + borrow;
        if ((uint64_t)v[k] >= s) {
            r[k] = (uint32_t)((uint64_t)v[k] - s);
            borrow = 0;
        } else {
            r[k] = (uint32_t)((uint64_t)v[k] + 0x100000000ULL - s);
            borrow = 1;
        }
    }
    if (borrow == 0) {            /* v >= p: take the reduced value */
        for (k = 0; k < 8; k++)
            v[k] = r[k];
    }
}

/* Load 32 LE bytes into 8 limbs, masking bit 255 (RFC 7748 u-decode). */
static void fe_frombytes(uint32_t out[8], const uint8_t in[32])
{
    int i;
    for (i = 0; i < 8; i++) {
        out[i] = (uint32_t)in[4 * i]
               | ((uint32_t)in[4 * i + 1] << 8)
               | ((uint32_t)in[4 * i + 2] << 16)
               | ((uint32_t)in[4 * i + 3] << 24);
    }
    out[7] &= 0x7fffffffu;
}

/* Canonicalize (< p) and serialize to 32 LE bytes. */
static void fe_tobytes(uint8_t out[32], const uint32_t in[8])
{
    uint32_t t[8];
    int i;
    for (i = 0; i < 8; i++)
        t[i] = in[i];
    /* input < 2^256 < 3p; at most two real subtractions needed, do three. */
    fe_reduce_p(t);
    fe_reduce_p(t);
    fe_reduce_p(t);
    for (i = 0; i < 8; i++) {
        out[4 * i]     = (uint8_t)(t[i]);
        out[4 * i + 1] = (uint8_t)(t[i] >> 8);
        out[4 * i + 2] = (uint8_t)(t[i] >> 16);
        out[4 * i + 3] = (uint8_t)(t[i] >> 24);
    }
}

/* out = z^(p-2) mod p  (= z^-1). Standard ref10 addition chain. */
static void fe_invert(uint32_t out[8], const uint32_t z[8])
{
    uint32_t t0[8], t1[8], t2[8], t3[8];
    int i;

    fe_sq(t0, z);                                       /* z^2 */
    fe_sq(t1, t0); fe_sq(t1, t1);                       /* z^8 */
    fe_mul(t1, z, t1);                                  /* z^9 */
    fe_mul(t0, t0, t1);                                 /* z^11 */
    fe_sq(t2, t0);                                      /* z^22 */
    fe_mul(t1, t1, t2);                                 /* 2^5 - 1 */
    fe_sq(t2, t1); for (i = 0; i < 4; i++) fe_sq(t2, t2);
    fe_mul(t1, t2, t1);                                 /* 2^10 - 1 */
    fe_sq(t2, t1); for (i = 0; i < 9; i++) fe_sq(t2, t2);
    fe_mul(t2, t2, t1);                                 /* 2^20 - 1 */
    fe_sq(t3, t2); for (i = 0; i < 19; i++) fe_sq(t3, t3);
    fe_mul(t2, t3, t2);                                 /* 2^40 - 1 */
    fe_sq(t2, t2); for (i = 0; i < 9; i++) fe_sq(t2, t2);
    fe_mul(t1, t2, t1);                                 /* 2^50 - 1 */
    fe_sq(t2, t1); for (i = 0; i < 49; i++) fe_sq(t2, t2);
    fe_mul(t2, t2, t1);                                 /* 2^100 - 1 */
    fe_sq(t3, t2); for (i = 0; i < 99; i++) fe_sq(t3, t3);
    fe_mul(t2, t3, t2);                                 /* 2^200 - 1 */
    fe_sq(t2, t2); for (i = 0; i < 49; i++) fe_sq(t2, t2);
    fe_mul(t1, t2, t1);                                 /* 2^250 - 1 */
    fe_sq(t1, t1); for (i = 0; i < 4; i++) fe_sq(t1, t1);
    fe_mul(out, t1, t0);                                /* 2^255 - 21 = p - 2 */
}

/* ---- public API ---- */

void x25519_start(x25519_state *st, const uint8_t scalar[32], const uint8_t point[32])
{
    int i;
    for (i = 0; i < 32; i++)
        st->scalar[i] = scalar[i];
    st->scalar[0]  &= 248;
    st->scalar[31] &= 127;
    st->scalar[31] |= 64;

    fe_frombytes(st->x1, point);
    fe_1(st->x2);
    fe_0(st->z2);
    for (i = 0; i < 8; i++)
        st->x3[i] = st->x1[i];
    fe_1(st->z3);

    st->swap = 0;
    st->bit  = 254;
}

int x25519_step(x25519_state *st, int max_steps)
{
    int n = 0;
    while (st->bit >= 0 && n < max_steps) {
        int t = st->bit;
        uint32_t kt = (uint32_t)((st->scalar[t >> 3] >> (t & 7)) & 1);
        uint32_t A[8], AA[8], B[8], BB[8], E[8], C[8], D[8], DA[8], CB[8], t0[8], t1[8];

        st->swap ^= kt;
        fe_cswap(st->x2, st->x3, st->swap);
        fe_cswap(st->z2, st->z3, st->swap);
        st->swap = kt;

        fe_add(A, st->x2, st->z2);
        fe_sq(AA, A);
        fe_sub(B, st->x2, st->z2);
        fe_sq(BB, B);
        fe_sub(E, AA, BB);
        fe_add(C, st->x3, st->z3);
        fe_sub(D, st->x3, st->z3);
        fe_mul(DA, D, A);
        fe_mul(CB, C, B);
        fe_add(t0, DA, CB);  fe_sq(st->x3, t0);
        fe_sub(t1, DA, CB);  fe_sq(t1, t1);  fe_mul(st->z3, st->x1, t1);
        fe_mul(st->x2, AA, BB);
        fe_mul121665(t0, E); fe_add(t0, AA, t0); fe_mul(st->z2, E, t0);

        st->bit--;
        n++;
    }
    return (st->bit < 0) ? 1 : 0;
}

void x25519_finish(x25519_state *st, uint8_t out[32])
{
    uint32_t zinv[8], res[8];
    /* final cswap (RFC 7748), then x2 / z2 */
    fe_cswap(st->x2, st->x3, st->swap);
    fe_cswap(st->z2, st->z3, st->swap);
    st->swap = 0;
    fe_invert(zinv, st->z2);
    fe_mul(res, st->x2, zinv);
    fe_tobytes(out, res);
}

void x25519(uint8_t out[32], const uint8_t scalar[32], const uint8_t point[32])
{
    x25519_state st;
    x25519_start(&st, scalar, point);
    while (!x25519_step(&st, 1000)) {
        /* run the whole ladder in one slice */
    }
    x25519_finish(&st, out);
}
