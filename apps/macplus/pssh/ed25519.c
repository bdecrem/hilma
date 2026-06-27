/* ed25519.c - portable Ed25519 signature verification (RFC 8032), verify only.
 *
 * Field arithmetic mod p = 2^255-19: 8 limbs of radix 2^32 (little-endian),
 * values kept < 2^256 but not necessarily canonical (< p). Every field partial
 * product is uint32 * uint32 -> uint64 only; reductions use 2^256 = 38 (mod p).
 * NO __int128, no builtins, no OS calls beyond <string.h>. `int` assumed 32-bit.
 * Compiles for 68000 (Retro68 gcc) and modern hosts (clang) alike.
 *
 * Curve: twisted Edwards -x^2 + y^2 = 1 + d x^2 y^2, d = -121665/121666.
 * Points are kept in extended coordinates (X,Y,Z,T) with x=X/Z, y=Y/Z, T=XY/Z.
 * The complete unified addition (Hisil-Wong-Carter-Dawson 2008, a=-1 variant)
 * is used for both doubling and addition, so the double-and-add loop needs no
 * special cases for the identity.
 */
#include <stdint.h>
#include <string.h>
#include "ed25519.h"
#include "sha512.h"

/* ---------------------------------------------------------------- constants */

/* p = 2^255 - 19 as 8 little-endian 32-bit limbs. */
static const uint32_t FE_P[8] = {
    0xffffffedu, 0xffffffffu, 0xffffffffu, 0xffffffffu,
    0xffffffffu, 0xffffffffu, 0xffffffffu, 0x7fffffffu
};

/* d = -121665/121666 mod p */
static const uint32_t FE_D[8] = {
    0x135978a3u, 0x75eb4dcau, 0x4141d8abu, 0x00700a4du,
    0x7779e898u, 0x8cc74079u, 0x2b6ffe73u, 0x52036ceeu
};
/* 2*d mod p (the k constant in the unified addition) */
static const uint32_t FE_2D[8] = {
    0x26b2f159u, 0xebd69b94u, 0x8283b156u, 0x00e0149au,
    0xeef3d130u, 0x198e80f2u, 0x56dffce7u, 0x2406d9dcu
};
/* sqrt(-1) mod p = 2^((p-1)/4) */
static const uint32_t FE_SQRTM1[8] = {
    0x4a0ea0b0u, 0xc4ee1b27u, 0xad2fe478u, 0x2f431806u,
    0x3dfbd7a7u, 0x2b4d0099u, 0x4fc1df0bu, 0x2b832480u
};
/* base point B = (Bx, By), and Bt = Bx*By mod p */
static const uint32_t FE_BX[8] = {
    0x8f25d51au, 0xc9562d60u, 0x9525a7b2u, 0x692cc760u,
    0xfdd6dc5cu, 0xc0a4e231u, 0xcd6e53feu, 0x216936d3u
};
static const uint32_t FE_BY[8] = {
    0x66666658u, 0x66666666u, 0x66666666u, 0x66666666u,
    0x66666666u, 0x66666666u, 0x66666666u, 0x66666666u
};
static const uint32_t FE_BT[8] = {
    0xa5b7dda3u, 0x6dde8ab3u, 0x775152f5u, 0x20f09f80u,
    0x64abe37du, 0x66ea4e8eu, 0xd78b7665u, 0x67875f0fu
};

/* Group order L = 2^252 + 27742317777372353535851937790883648493,
 * as 8 little-endian 32-bit limbs. */
static const uint32_t ED_L[8] = {
    0x5cf5d3edu, 0x5812631au, 0xa2f79cd6u, 0x14def9deu,
    0x00000000u, 0x00000000u, 0x00000000u, 0x10000000u
};

/* ----------------------------------------------------- field arithmetic (Fp) */

/* Fold a small value into limb 0 and propagate; any carry above 2^256 folds
 * back as *38 (2^256 == 38 mod p). Converges to a value < 2^256. */
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
        c = c * 38ULL;
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
    for (i = 0; i < 8; i++) {
        carry = 0;
        for (j = 0; j < 8; j++) {
            uint64_t v = (uint64_t)t[i + j] + (uint64_t)a[i] * (uint64_t)b[j] + carry;
            t[i + j] = (uint32_t)v;
            carry = v >> 32;
        }
        t[i + 8] = (uint32_t)carry;
    }
    /* reduce 512 -> 256: value = L + 38*H */
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

static void fe_add(uint32_t out[8], const uint32_t a[8], const uint32_t b[8])
{
    uint64_t carry = 0;
    int k;
    for (k = 0; k < 8; k++) {
        uint64_t v = (uint64_t)a[k] + (uint64_t)b[k] + carry;
        out[k] = (uint32_t)v;
        carry = v >> 32;
    }
    fe_fold(out, (uint32_t)(carry * 38ULL));
}

/* out = a - b (mod p). Computes a + 4p - b (4p == 0 mod p) to stay positive. */
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
    t[8] = (uint32_t)(t[8] - borrow);

    carry = 0;
    for (k = 0; k < 8; k++) {
        uint64_t v = (uint64_t)t[k] + (k == 0 ? 38ULL * (uint64_t)t[8] : 0ULL) + carry;
        out[k] = (uint32_t)v;
        carry = v >> 32;
    }
    fe_fold(out, (uint32_t)(carry * 38ULL));
}

static void fe_copy(uint32_t out[8], const uint32_t a[8])
{
    int k;
    for (k = 0; k < 8; k++) out[k] = a[k];
}

static void fe_1(uint32_t a[8]) { int k; a[0] = 1; for (k = 1; k < 8; k++) a[k] = 0; }
static void fe_0(uint32_t a[8]) { int k; for (k = 0; k < 8; k++) a[k] = 0; }

/* Subtract p once if v >= p. */
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
    if (borrow == 0)
        for (k = 0; k < 8; k++) v[k] = r[k];
}

/* Canonicalize (< p) in place: at most three conditional subtractions. */
static void fe_canon(uint32_t v[8])
{
    fe_reduce_p(v);
    fe_reduce_p(v);
    fe_reduce_p(v);
}

/* Serialize to 32 LE bytes (canonical). */
static void fe_tobytes(uint8_t out[32], const uint32_t in[8])
{
    uint32_t t[8];
    int i;
    fe_copy(t, in);
    fe_canon(t);
    for (i = 0; i < 8; i++) {
        out[4 * i]     = (uint8_t)(t[i]);
        out[4 * i + 1] = (uint8_t)(t[i] >> 8);
        out[4 * i + 2] = (uint8_t)(t[i] >> 16);
        out[4 * i + 3] = (uint8_t)(t[i] >> 24);
    }
}

/* Load 8 limbs from 32 LE bytes, masking bit 255. */
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

/* 1 if the 8-limb value is already < p (canonical), else 0. */
static int fe_is_canonical(const uint32_t v[8])
{
    int k;
    for (k = 7; k >= 0; k--) {
        if (v[k] < FE_P[k]) return 1;
        if (v[k] > FE_P[k]) return 0;
    }
    return 0;   /* exactly p -> not canonical */
}

/* 1 if v == 0 (mod p). */
static int fe_iszero(const uint32_t v[8])
{
    uint32_t t[8];
    int k;
    fe_copy(t, v);
    fe_canon(t);
    for (k = 0; k < 8; k++) if (t[k]) return 0;
    return 1;
}

/* low bit of the canonical representative (the "sign" of x). */
static int fe_isodd(const uint32_t v[8])
{
    uint32_t t[8];
    fe_copy(t, v);
    fe_canon(t);
    return (int)(t[0] & 1u);
}

static void fe_neg(uint32_t out[8], const uint32_t a[8])
{
    uint32_t z[8];
    fe_0(z);
    fe_sub(out, z, a);
}

/* 1 if a == b (mod p), else 0. */
static int fe_eq(const uint32_t a[8], const uint32_t b[8])
{
    uint32_t d[8];
    fe_sub(d, a, b);
    return fe_iszero(d);
}

/* out = a^(p-2) = a^-1.  ref10 addition chain. */
static void fe_invert(uint32_t out[8], const uint32_t z[8])
{
    uint32_t t0[8], t1[8], t2[8], t3[8];
    int i;
    fe_sq(t0, z);
    fe_sq(t1, t0); fe_sq(t1, t1);
    fe_mul(t1, z, t1);
    fe_mul(t0, t0, t1);
    fe_sq(t2, t0);
    fe_mul(t1, t1, t2);
    fe_sq(t2, t1); for (i = 0; i < 4; i++) fe_sq(t2, t2);
    fe_mul(t1, t2, t1);
    fe_sq(t2, t1); for (i = 0; i < 9; i++) fe_sq(t2, t2);
    fe_mul(t2, t2, t1);
    fe_sq(t3, t2); for (i = 0; i < 19; i++) fe_sq(t3, t3);
    fe_mul(t2, t3, t2);
    fe_sq(t2, t2); for (i = 0; i < 9; i++) fe_sq(t2, t2);
    fe_mul(t1, t2, t1);
    fe_sq(t2, t1); for (i = 0; i < 49; i++) fe_sq(t2, t2);
    fe_mul(t2, t2, t1);
    fe_sq(t3, t2); for (i = 0; i < 99; i++) fe_sq(t3, t3);
    fe_mul(t2, t3, t2);
    fe_sq(t2, t2); for (i = 0; i < 49; i++) fe_sq(t2, t2);
    fe_mul(t1, t2, t1);
    fe_sq(t1, t1); for (i = 0; i < 4; i++) fe_sq(t1, t1);
    fe_mul(out, t1, t0);
}

/* out = z^((p-5)/8).  ref10 addition chain (for the modular square root). */
static void fe_pow22523(uint32_t out[8], const uint32_t z[8])
{
    uint32_t t0[8], t1[8], t2[8];
    int i;
    fe_sq(t0, z);
    fe_sq(t1, t0); fe_sq(t1, t1); fe_mul(t1, z, t1);
    fe_mul(t0, t0, t1);
    fe_sq(t0, t0); fe_mul(t0, t1, t0);
    fe_sq(t1, t0); for (i = 0; i < 4; i++) fe_sq(t1, t1); fe_mul(t0, t1, t0);
    fe_sq(t1, t0); for (i = 0; i < 9; i++) fe_sq(t1, t1); fe_mul(t1, t1, t0);
    fe_sq(t2, t1); for (i = 0; i < 19; i++) fe_sq(t2, t2); fe_mul(t1, t2, t1);
    fe_sq(t1, t1); for (i = 0; i < 9; i++) fe_sq(t1, t1); fe_mul(t0, t1, t0);
    fe_sq(t1, t0); for (i = 0; i < 49; i++) fe_sq(t1, t1); fe_mul(t1, t1, t0);
    fe_sq(t2, t1); for (i = 0; i < 99; i++) fe_sq(t2, t2); fe_mul(t1, t2, t1);
    fe_sq(t1, t1); for (i = 0; i < 49; i++) fe_sq(t1, t1); fe_mul(t0, t1, t0);
    fe_sq(t0, t0); fe_sq(t0, t0); fe_mul(out, t0, z);
}

/* ------------------------------------------------- group element operations */
/* A point is an array of four field elements: [0]=X [1]=Y [2]=Z [3]=T. */

#define GE_X 0
#define GE_Y 1
#define GE_Z 2
#define GE_T 3

static void ge_identity(uint32_t P[4][8])
{
    fe_0(P[GE_X]); fe_1(P[GE_Y]); fe_1(P[GE_Z]); fe_0(P[GE_T]);
}

/* R = P + Q, complete unified formula for a = -1 (handles P==Q and identity). */
static void ge_add(uint32_t R[4][8], const uint32_t P[4][8], const uint32_t Q[4][8])
{
    uint32_t A[8], B[8], C[8], D[8], E[8], F[8], G[8], H[8], t[8], u[8];

    fe_sub(t, P[GE_Y], P[GE_X]);     /* Y1-X1 */
    fe_sub(u, Q[GE_Y], Q[GE_X]);     /* Y2-X2 */
    fe_mul(A, t, u);                 /* A = (Y1-X1)(Y2-X2) */

    fe_add(t, P[GE_Y], P[GE_X]);     /* Y1+X1 */
    fe_add(u, Q[GE_Y], Q[GE_X]);     /* Y2+X2 */
    fe_mul(B, t, u);                 /* B = (Y1+X1)(Y2+X2) */

    fe_mul(t, P[GE_T], Q[GE_T]);     /* T1*T2 */
    fe_mul(C, t, FE_2D);             /* C = 2d*T1*T2 */

    fe_mul(t, P[GE_Z], Q[GE_Z]);     /* Z1*Z2 */
    fe_add(D, t, t);                 /* D = 2*Z1*Z2 */

    fe_sub(E, B, A);
    fe_sub(F, D, C);
    fe_add(G, D, C);
    fe_add(H, B, A);

    fe_mul(R[GE_X], E, F);
    fe_mul(R[GE_Y], G, H);
    fe_mul(R[GE_T], E, H);
    fe_mul(R[GE_Z], F, G);
}

/* Encode point P to 32 bytes (y with x's low bit in the top bit). */
static void ge_tobytes(uint8_t out[32], const uint32_t P[4][8])
{
    uint32_t zinv[8], x[8], y[8];
    fe_invert(zinv, P[GE_Z]);
    fe_mul(x, P[GE_X], zinv);
    fe_mul(y, P[GE_Y], zinv);
    fe_tobytes(out, y);
    out[31] = (uint8_t)(out[31] | (fe_isodd(x) << 7));
}

/* Decode a 32-byte encoding into extended coords. Returns 0 on success,
 * -1 if the encoding is invalid (non-canonical y or x not recoverable). */
static int ge_frombytes(uint32_t P[4][8], const uint8_t in[32])
{
    uint32_t y[8], yy[8], u[8], v[8], v3[8], x[8], t[8], vxx[8], one[8], neg_u[8];
    int sign = in[31] >> 7;

    fe_frombytes(y, in);
    if (!fe_is_canonical(y))
        return -1;                       /* y must be < p */

    fe_1(one);
    fe_sq(yy, y);                        /* y^2 */
    fe_sub(u, yy, one);                  /* u = y^2 - 1 */
    fe_mul(v, FE_D, yy);
    fe_add(v, v, one);                   /* v = d*y^2 + 1 */

    /* x = u * v^3 * (u * v^7)^((p-5)/8) */
    fe_sq(v3, v); fe_mul(v3, v3, v);     /* v^3 */
    fe_sq(x, v3); fe_mul(x, x, v);       /* v^7 */
    fe_mul(x, x, u);                     /* u*v^7 */
    fe_pow22523(x, x);                   /* (u*v^7)^((p-5)/8) */
    fe_mul(x, x, v3);                    /* * v^3 */
    fe_mul(x, x, u);                     /* * u  -> candidate x */

    /* check v*x^2 == u (mod p); else try x*sqrt(-1); else fail */
    fe_sq(t, x);
    fe_mul(vxx, v, t);                   /* vxx = v*x^2 */
    fe_neg(neg_u, u);
    if (!fe_eq(vxx, u)) {
        if (fe_eq(vxx, neg_u)) {
            fe_mul(x, x, FE_SQRTM1);     /* vxx == -u : multiply x by sqrt(-1) */
        } else {
            return -1;                   /* not a square -> invalid point */
        }
    }

    /* fix sign of x */
    if (fe_iszero(x) && sign)
        return -1;                       /* x==0 with sign bit set is illegal */
    if (fe_isodd(x) != sign)
        fe_neg(x, x);

    fe_copy(P[GE_X], x);
    fe_copy(P[GE_Y], y);
    fe_1(P[GE_Z]);
    fe_mul(P[GE_T], x, y);
    return 0;
}

/* ------------------------------------------------ scalar helpers (mod L etc.) */

/* 1 if the 32-byte LE value s is < L (canonical scalar), else 0. */
static int sc_lt_L(const uint8_t s[32])
{
    uint32_t v[8];
    int k;
    for (k = 0; k < 8; k++) {
        v[k] = (uint32_t)s[4 * k]
             | ((uint32_t)s[4 * k + 1] << 8)
             | ((uint32_t)s[4 * k + 2] << 16)
             | ((uint32_t)s[4 * k + 3] << 24);
    }
    for (k = 7; k >= 0; k--) {
        if (v[k] < ED_L[k]) return 1;
        if (v[k] > ED_L[k]) return 0;
    }
    return 0;   /* equal -> not < L */
}

/* r = (64-byte little-endian) hash  mod L, output 32 LE bytes.
 * Streaming: r = (r*256 + byte) mod L, top byte to bottom. 9 limbs hold r*256. */
static void sc_reduce64(uint8_t out[32], const uint8_t hash[64])
{
    uint32_t r[9];
    int i, k;

    for (k = 0; k < 9; k++) r[k] = 0;

    for (i = 63; i >= 0; i--) {
        uint64_t carry = hash[i];
        /* r = r*256 + byte */
        for (k = 0; k < 9; k++) {
            uint64_t v = (uint64_t)r[k] * 256ULL + carry;
            r[k] = (uint32_t)v;
            carry = v >> 32;
        }
        /* r < 257*L now; subtract L while r >= L */
        for (;;) {
            /* compare r (9 limbs) vs L (8 limbs, zero-extended) */
            int ge = 1, j;
            if (r[8] != 0) {
                ge = 1;
            } else {
                ge = 1;
                for (j = 7; j >= 0; j--) {
                    if (r[j] < ED_L[j]) { ge = 0; break; }
                    if (r[j] > ED_L[j]) { ge = 1; break; }
                    if (j == 0) ge = 1;   /* equal -> still subtract */
                }
            }
            if (!ge) break;
            /* r -= L */
            {
                uint64_t borrow = 0;
                for (j = 0; j < 8; j++) {
                    uint64_t s = (uint64_t)ED_L[j] + borrow;
                    if ((uint64_t)r[j] >= s) {
                        r[j] = (uint32_t)((uint64_t)r[j] - s);
                        borrow = 0;
                    } else {
                        r[j] = (uint32_t)((uint64_t)r[j] + 0x100000000ULL - s);
                        borrow = 1;
                    }
                }
                r[8] = (uint32_t)((uint64_t)r[8] - borrow);
            }
        }
    }

    for (k = 0; k < 8; k++) {
        out[4 * k]     = (uint8_t)(r[k]);
        out[4 * k + 1] = (uint8_t)(r[k] >> 8);
        out[4 * k + 2] = (uint8_t)(r[k] >> 16);
        out[4 * k + 3] = (uint8_t)(r[k] >> 24);
    }
}

/* out = (x*y + z) mod L, all three inputs 32-byte LE scalars (for signing's
 * S = (r + k*a) mod L).  x,y < L < 2^252, so x*y < 2^504 fits in 63 bytes and
 * x*y + z (z < L) is < 2^505 — comfortably inside a 64-byte (512-bit) buffer,
 * which sc_reduce64 then folds mod L.  Partial products are uint32*uint32 only. */
static void sc_muladd(uint8_t out[32], const uint8_t x[32],
                      const uint8_t y[32], const uint8_t z[32])
{
    uint32_t X[8], Y[8], Z[8], prod[16];
    uint8_t  wide[64];
    uint64_t carry;
    int i, j;

    for (i = 0; i < 8; i++) {
        X[i] = (uint32_t)x[4*i] | ((uint32_t)x[4*i+1] << 8)
             | ((uint32_t)x[4*i+2] << 16) | ((uint32_t)x[4*i+3] << 24);
        Y[i] = (uint32_t)y[4*i] | ((uint32_t)y[4*i+1] << 8)
             | ((uint32_t)y[4*i+2] << 16) | ((uint32_t)y[4*i+3] << 24);
        Z[i] = (uint32_t)z[4*i] | ((uint32_t)z[4*i+1] << 8)
             | ((uint32_t)z[4*i+2] << 16) | ((uint32_t)z[4*i+3] << 24);
    }

    for (i = 0; i < 16; i++) prod[i] = 0;
    for (i = 0; i < 8; i++) {                 /* schoolbook X*Y -> 16 limbs */
        carry = 0;
        for (j = 0; j < 8; j++) {
            uint64_t v = (uint64_t)prod[i+j] + (uint64_t)X[i] * (uint64_t)Y[j] + carry;
            prod[i+j] = (uint32_t)v;
            carry = v >> 32;
        }
        prod[i+8] = (uint32_t)carry;
    }

    carry = 0;                                /* + Z into the low 8 limbs */
    for (i = 0; i < 8; i++) {
        uint64_t v = (uint64_t)prod[i] + (uint64_t)Z[i] + carry;
        prod[i] = (uint32_t)v;
        carry = v >> 32;
    }
    for (i = 8; i < 16 && carry; i++) {       /* propagate the add carry up */
        uint64_t v = (uint64_t)prod[i] + carry;
        prod[i] = (uint32_t)v;
        carry = v >> 32;
    }

    for (i = 0; i < 16; i++) {                /* serialize to 64 LE bytes */
        wide[4*i]     = (uint8_t)(prod[i]);
        wide[4*i + 1] = (uint8_t)(prod[i] >> 8);
        wide[4*i + 2] = (uint8_t)(prod[i] >> 16);
        wide[4*i + 3] = (uint8_t)(prod[i] >> 24);
    }
    sc_reduce64(out, wide);
}

/* R = [scalar]B for the base point B (fixed-base double-and-add, MSB first).
 * Used by ed25519_pubkey_from_seed; signing slices the same loop in sign_step. */
static void ge_scalarmult_base(uint32_t R[4][8], const uint8_t scalar[32])
{
    uint32_t B[4][8];
    int i;

    fe_copy(B[GE_X], FE_BX);
    fe_copy(B[GE_Y], FE_BY);
    fe_1(B[GE_Z]);
    fe_copy(B[GE_T], FE_BT);

    ge_identity(R);
    for (i = 255; i >= 0; i--) {
        ge_add(R, R, R);                                   /* double */
        if ((scalar[i >> 3] >> (i & 7)) & 1u)
            ge_add(R, R, B);                               /* + B bit */
    }
}

/* ----------------------------------------------------------- public verify */

int ed25519_verify_start(ed25519_vrfy_state *st, const uint8_t pub[32],
                         const uint8_t *msg, size_t msglen, const uint8_t sig[64])
{
    uint32_t A[4][8];
    uint8_t  hbuf[64];
    sha512_ctx sc;
    int i;

    memset(st, 0, sizeof(*st));
    st->valid = -1;     /* assume bad until decoded */

    /* S = sig[32..63] must be a canonical scalar (< L). */
    for (i = 0; i < 32; i++) st->S[i] = sig[32 + i];
    if (!sc_lt_L(st->S))
        return -1;

    /* R encoding kept for the final comparison. */
    for (i = 0; i < 32; i++) st->Renc[i] = sig[i];

    /* Decode A from the public key, then build negA = -A = (-X, Y, Z, -T). */
    if (ge_frombytes(A, pub) != 0)
        return -1;
    fe_neg(st->negA[GE_X], A[GE_X]);
    fe_copy(st->negA[GE_Y], A[GE_Y]);
    fe_copy(st->negA[GE_Z], A[GE_Z]);
    fe_neg(st->negA[GE_T], A[GE_T]);

    /* h = SHA512(R || A || M) mod L. */
    sha512_init(&sc);
    sha512_update(&sc, sig, 32);      /* R */
    sha512_update(&sc, pub, 32);      /* A */
    sha512_update(&sc, msg, msglen);  /* M */
    sha512_final(&sc, hbuf);
    sc_reduce64(st->h, hbuf);

    /* base point B in extended coords. */
    fe_copy(st->B[GE_X], FE_BX);
    fe_copy(st->B[GE_Y], FE_BY);
    fe_1(st->B[GE_Z]);
    fe_copy(st->B[GE_T], FE_BT);

    /* accumulator starts at identity; process bits 255..0. */
    ge_identity(st->acc);
    st->bit   = 255;
    st->valid = 0;
    st->done  = 0;
    return 0;
}

int ed25519_verify_step(ed25519_vrfy_state *st, int max_steps)
{
    int n = 0;
    if (st->valid < 0 || st->done)
        return 1;

    while (st->bit >= 0 && n < max_steps) {
        int t = st->bit;
        uint32_t sbit = (uint32_t)((st->S[t >> 3] >> (t & 7)) & 1u);
        uint32_t hbit = (uint32_t)((st->h[t >> 3] >> (t & 7)) & 1u);

        ge_add(st->acc, st->acc, st->acc);          /* double */
        if (sbit) ge_add(st->acc, st->acc, st->B);   /* + [S]B  bit */
        if (hbit) ge_add(st->acc, st->acc, st->negA);/* + [h](-A) bit */

        st->bit--;
        n++;
    }
    if (st->bit < 0) {
        st->done = 1;
        return 1;
    }
    return 0;
}

int ed25519_verify_finish(ed25519_vrfy_state *st)
{
    uint8_t enc[32];
    if (st->valid < 0)
        return 0;
    ge_tobytes(enc, st->acc);            /* enc = [S]B - [h]A */
    return (memcmp(enc, st->Renc, 32) == 0) ? 1 : 0;
}

int ed25519_verify(const uint8_t pub[32], const uint8_t *msg, size_t msglen,
                   const uint8_t sig[64])
{
    ed25519_vrfy_state st;
    if (ed25519_verify_start(&st, pub, msg, msglen, sig) < 0)
        return 0;
    while (!ed25519_verify_step(&st, 256))
        ;
    return ed25519_verify_finish(&st);
}

/* ----------------------------------------------------------- public signing */

/* Clamp the low 32 bytes of SHA512(seed) into the secret scalar a (RFC 8032). */
static void ed_clamp(uint8_t a[32])
{
    a[0]  &= 248;
    a[31] &= 127;
    a[31] |= 64;
}

void ed25519_pubkey_from_seed(uint8_t pub[32], const uint8_t seed[32])
{
    uint8_t  h[64], a[32];
    uint32_t A[4][8];
    int i;

    sha512(seed, 32, h);
    for (i = 0; i < 32; i++) a[i] = h[i];
    ed_clamp(a);
    ge_scalarmult_base(A, a);      /* A = [a]B */
    ge_tobytes(pub, A);
}

int ed25519_sign_start(ed25519_sign_state *st, const uint8_t *msg, size_t msglen,
                       const uint8_t pub[32], const uint8_t seed[32])
{
    uint8_t    h[64], rbuf[64];
    sha512_ctx sc;
    int i;

    memset(st, 0, sizeof(*st));

    /* h = SHA512(seed); a = clamp(h[0..31]); prefix = h[32..63]. */
    sha512(seed, 32, h);
    for (i = 0; i < 32; i++) st->a[i]      = h[i];
    for (i = 0; i < 32; i++) st->prefix[i] = h[32 + i];
    ed_clamp(st->a);

    for (i = 0; i < 32; i++) st->pub[i] = pub[i];
    st->msg    = msg;
    st->msglen = msglen;

    /* r = SHA512(prefix || M) mod L. */
    sha512_init(&sc);
    sha512_update(&sc, st->prefix, 32);
    sha512_update(&sc, msg, msglen);
    sha512_final(&sc, rbuf);
    sc_reduce64(st->r, rbuf);

    /* Prime R = [r]B: accumulator at identity, base point ready, bits 255..0. */
    fe_copy(st->B[GE_X], FE_BX);
    fe_copy(st->B[GE_Y], FE_BY);
    fe_1(st->B[GE_Z]);
    fe_copy(st->B[GE_T], FE_BT);
    ge_identity(st->acc);
    st->bit  = 255;
    st->done = 0;
    return 0;
}

int ed25519_sign_step(ed25519_sign_state *st, int max_steps)
{
    int n = 0;
    if (st->done)
        return 1;

    while (st->bit >= 0 && n < max_steps) {
        int t = st->bit;
        ge_add(st->acc, st->acc, st->acc);                 /* double */
        if ((st->r[t >> 3] >> (t & 7)) & 1u)
            ge_add(st->acc, st->acc, st->B);               /* + [r]B bit */
        st->bit--;
        n++;
    }
    if (st->bit < 0) {
        st->done = 1;
        return 1;
    }
    return 0;
}

void ed25519_sign_finish(ed25519_sign_state *st, uint8_t sig[64])
{
    uint8_t    Renc[32], k[32], kbuf[64];
    sha512_ctx sc;
    int i;

    /* Make sure the scalar multiply finished (cheap if already done). */
    while (!ed25519_sign_step(st, 256))
        ;

    ge_tobytes(Renc, st->acc);          /* R = [r]B, encoded */

    /* k = SHA512(R || A || M) mod L. */
    sha512_init(&sc);
    sha512_update(&sc, Renc, 32);
    sha512_update(&sc, st->pub, 32);
    sha512_update(&sc, st->msg, st->msglen);
    sha512_final(&sc, kbuf);
    sc_reduce64(k, kbuf);

    /* S = (r + k*a) mod L. */
    for (i = 0; i < 32; i++) sig[i] = Renc[i];
    sc_muladd(sig + 32, k, st->a, st->r);
}

void ed25519_sign(uint8_t sig[64], const uint8_t *msg, size_t msglen,
                  const uint8_t pub[32], const uint8_t seed[32])
{
    ed25519_sign_state st;
    ed25519_sign_start(&st, msg, msglen, pub, seed);
    while (!ed25519_sign_step(&st, 256))
        ;
    ed25519_sign_finish(&st, sig);
}
