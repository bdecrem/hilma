/*
 * sha512.c — portable SHA-512 (FIPS 180-4) implementation.
 *
 * Pure C89/C99. Uses only uint64_t arithmetic (supported in software by
 * 68k gcc) plus memcpy/memset. No __int128, no builtins, no OS calls.
 */
#include "sha512.h"
#include <string.h>

/*
 * 64-bit constant helper. Writing 0x428a2f98d728ae22ULL relies on the
 * compiler accepting ULL suffixes (C99 / 68k gcc both do). We build each
 * constant from two 32-bit halves to stay safe even where 64-bit literals
 * are awkward, then promote explicitly to uint64_t.
 */
#define U64(hi, lo) (((uint64_t)(uint32_t)(hi) << 32) | (uint32_t)(lo))

/* SHA-512 round constants (first 64 bits of fractional parts of the cube
 * roots of the first 80 primes). */
static const uint64_t K[80] = {
    U64(0x428a2f98u, 0xd728ae22u), U64(0x71374491u, 0x23ef65cdu),
    U64(0xb5c0fbcfu, 0xec4d3b2fu), U64(0xe9b5dba5u, 0x8189dbbcu),
    U64(0x3956c25bu, 0xf348b538u), U64(0x59f111f1u, 0xb605d019u),
    U64(0x923f82a4u, 0xaf194f9bu), U64(0xab1c5ed5u, 0xda6d8118u),
    U64(0xd807aa98u, 0xa3030242u), U64(0x12835b01u, 0x45706fbeu),
    U64(0x243185beu, 0x4ee4b28cu), U64(0x550c7dc3u, 0xd5ffb4e2u),
    U64(0x72be5d74u, 0xf27b896fu), U64(0x80deb1feu, 0x3b1696b1u),
    U64(0x9bdc06a7u, 0x25c71235u), U64(0xc19bf174u, 0xcf692694u),
    U64(0xe49b69c1u, 0x9ef14ad2u), U64(0xefbe4786u, 0x384f25e3u),
    U64(0x0fc19dc6u, 0x8b8cd5b5u), U64(0x240ca1ccu, 0x77ac9c65u),
    U64(0x2de92c6fu, 0x592b0275u), U64(0x4a7484aau, 0x6ea6e483u),
    U64(0x5cb0a9dcu, 0xbd41fbd4u), U64(0x76f988dau, 0x831153b5u),
    U64(0x983e5152u, 0xee66dfabu), U64(0xa831c66du, 0x2db43210u),
    U64(0xb00327c8u, 0x98fb213fu), U64(0xbf597fc7u, 0xbeef0ee4u),
    U64(0xc6e00bf3u, 0x3da88fc2u), U64(0xd5a79147u, 0x930aa725u),
    U64(0x06ca6351u, 0xe003826fu), U64(0x14292967u, 0x0a0e6e70u),
    U64(0x27b70a85u, 0x46d22ffcu), U64(0x2e1b2138u, 0x5c26c926u),
    U64(0x4d2c6dfcu, 0x5ac42aedu), U64(0x53380d13u, 0x9d95b3dfu),
    U64(0x650a7354u, 0x8baf63deu), U64(0x766a0abbu, 0x3c77b2a8u),
    U64(0x81c2c92eu, 0x47edaee6u), U64(0x92722c85u, 0x1482353bu),
    U64(0xa2bfe8a1u, 0x4cf10364u), U64(0xa81a664bu, 0xbc423001u),
    U64(0xc24b8b70u, 0xd0f89791u), U64(0xc76c51a3u, 0x0654be30u),
    U64(0xd192e819u, 0xd6ef5218u), U64(0xd6990624u, 0x5565a910u),
    U64(0xf40e3585u, 0x5771202au), U64(0x106aa070u, 0x32bbd1b8u),
    U64(0x19a4c116u, 0xb8d2d0c8u), U64(0x1e376c08u, 0x5141ab53u),
    U64(0x2748774cu, 0xdf8eeb99u), U64(0x34b0bcb5u, 0xe19b48a8u),
    U64(0x391c0cb3u, 0xc5c95a63u), U64(0x4ed8aa4au, 0xe3418acbu),
    U64(0x5b9cca4fu, 0x7763e373u), U64(0x682e6ff3u, 0xd6b2b8a3u),
    U64(0x748f82eeu, 0x5defb2fcu), U64(0x78a5636fu, 0x43172f60u),
    U64(0x84c87814u, 0xa1f0ab72u), U64(0x8cc70208u, 0x1a6439ecu),
    U64(0x90befffau, 0x23631e28u), U64(0xa4506cebu, 0xde82bde9u),
    U64(0xbef9a3f7u, 0xb2c67915u), U64(0xc67178f2u, 0xe372532bu),
    U64(0xca273eceu, 0xea26619cu), U64(0xd186b8c7u, 0x21c0c207u),
    U64(0xeada7dd6u, 0xcde0eb1eu), U64(0xf57d4f7fu, 0xee6ed178u),
    U64(0x06f067aau, 0x72176fbau), U64(0x0a637dc5u, 0xa2c898a6u),
    U64(0x113f9804u, 0xbef90daeu), U64(0x1b710b35u, 0x131c471bu),
    U64(0x28db77f5u, 0x23047d84u), U64(0x32caab7bu, 0x40c72493u),
    U64(0x3c9ebe0au, 0x15c9bebcu), U64(0x431d67c4u, 0x9c100d4cu),
    U64(0x4cc5d4beu, 0xcb3e42b6u), U64(0x597f299cu, 0xfc657e2au),
    U64(0x5fcb6fabu, 0x3ad6faecu), U64(0x6c44198cu, 0x4a475817u)
};

/* Rotate-right on 64 bits. (n is always 1..63 here, so no UB.) */
#define ROTR(x, n) (((x) >> (n)) | ((x) << (64 - (n))))
#define SHR(x, n)  ((x) >> (n))

#define CH(x, y, z)  (((x) & (y)) ^ (~(x) & (z)))
#define MAJ(x, y, z) (((x) & (y)) ^ ((x) & (z)) ^ ((y) & (z)))

#define BSIG0(x) (ROTR(x, 28) ^ ROTR(x, 34) ^ ROTR(x, 39))
#define BSIG1(x) (ROTR(x, 14) ^ ROTR(x, 18) ^ ROTR(x, 41))
#define SSIG0(x) (ROTR(x, 1)  ^ ROTR(x, 8)  ^ SHR(x, 7))
#define SSIG1(x) (ROTR(x, 19) ^ ROTR(x, 61) ^ SHR(x, 6))

static void sha512_block(sha512_ctx *c, const uint8_t *p)
{
    uint64_t w[80];
    uint64_t a, b, d, e, f, g, h, hh;
    uint64_t t1, t2;
    int i;

    /* Load 16 big-endian 64-bit words. */
    for (i = 0; i < 16; i++) {
        w[i] = ((uint64_t)p[0] << 56) | ((uint64_t)p[1] << 48) |
               ((uint64_t)p[2] << 40) | ((uint64_t)p[3] << 32) |
               ((uint64_t)p[4] << 24) | ((uint64_t)p[5] << 16) |
               ((uint64_t)p[6] << 8)  | ((uint64_t)p[7]);
        p += 8;
    }
    /* Extend to 80 words. */
    for (i = 16; i < 80; i++) {
        w[i] = SSIG1(w[i - 2]) + w[i - 7] + SSIG0(w[i - 15]) + w[i - 16];
    }

    a = c->h[0]; b = c->h[1]; d = c->h[2]; e = c->h[3];
    f = c->h[4]; g = c->h[5]; h = c->h[6]; hh = c->h[7];

    /* a b d e f g h hh map to a b c d e f g h of the spec. */
    for (i = 0; i < 80; i++) {
        t1 = hh + BSIG1(f) + CH(f, g, h) + K[i] + w[i];
        t2 = BSIG0(a) + MAJ(a, b, d);
        hh = h;
        h  = g;
        g  = f;
        f  = e + t1;
        e  = d;
        d  = b;
        b  = a;
        a  = t1 + t2;
    }

    c->h[0] += a; c->h[1] += b; c->h[2] += d; c->h[3] += e;
    c->h[4] += f; c->h[5] += g; c->h[6] += h; c->h[7] += hh;
}

void sha512_init(sha512_ctx *c)
{
    c->h[0] = U64(0x6a09e667u, 0xf3bcc908u);
    c->h[1] = U64(0xbb67ae85u, 0x84caa73bu);
    c->h[2] = U64(0x3c6ef372u, 0xfe94f82bu);
    c->h[3] = U64(0xa54ff53au, 0x5f1d36f1u);
    c->h[4] = U64(0x510e527fu, 0xade682d1u);
    c->h[5] = U64(0x9b05688cu, 0x2b3e6c1fu);
    c->h[6] = U64(0x1f83d9abu, 0xfb41bd6bu);
    c->h[7] = U64(0x5be0cd19u, 0x137e2179u);
    c->total = 0;
    c->n = 0;
}

void sha512_update(sha512_ctx *c, const void *data, size_t len)
{
    const uint8_t *p = (const uint8_t *)data;

    c->total += (uint64_t)len;

    /* Top up any partial block first. */
    if (c->n != 0) {
        uint32_t want = 128 - c->n;
        uint32_t take = (len < (size_t)want) ? (uint32_t)len : want;
        memcpy(c->buf + c->n, p, take);
        c->n += take;
        p   += take;
        len -= take;
        if (c->n == 128) {
            sha512_block(c, c->buf);
            c->n = 0;
        }
    }

    /* Process full blocks directly from the input. */
    while (len >= 128) {
        sha512_block(c, p);
        p   += 128;
        len -= 128;
    }

    /* Stash the remainder. */
    if (len != 0) {
        memcpy(c->buf + c->n, p, len);
        c->n += (uint32_t)len;
    }
}

void sha512_final(sha512_ctx *c, uint8_t out[64])
{
    uint64_t bits = c->total << 3; /* messages are tiny; high 64 bits = 0 */
    uint32_t i;

    /* Append 0x80, then pad with zeros until 112 mod 128, then 16-byte
     * length (we only fill the low 8 bytes; high 8 are zero). */
    c->buf[c->n++] = 0x80;
    if (c->n > 112) {
        while (c->n < 128) c->buf[c->n++] = 0;
        sha512_block(c, c->buf);
        c->n = 0;
    }
    while (c->n < 112) c->buf[c->n++] = 0;

    /* High 64 bits of the 128-bit length: always zero here. */
    for (i = 0; i < 8; i++) c->buf[112 + i] = 0;
    /* Low 64 bits, big-endian. */
    c->buf[120] = (uint8_t)(bits >> 56);
    c->buf[121] = (uint8_t)(bits >> 48);
    c->buf[122] = (uint8_t)(bits >> 40);
    c->buf[123] = (uint8_t)(bits >> 32);
    c->buf[124] = (uint8_t)(bits >> 24);
    c->buf[125] = (uint8_t)(bits >> 16);
    c->buf[126] = (uint8_t)(bits >> 8);
    c->buf[127] = (uint8_t)(bits);
    sha512_block(c, c->buf);

    /* Output the 8 state words, big-endian. */
    for (i = 0; i < 8; i++) {
        uint64_t v = c->h[i];
        out[i * 8 + 0] = (uint8_t)(v >> 56);
        out[i * 8 + 1] = (uint8_t)(v >> 48);
        out[i * 8 + 2] = (uint8_t)(v >> 40);
        out[i * 8 + 3] = (uint8_t)(v >> 32);
        out[i * 8 + 4] = (uint8_t)(v >> 24);
        out[i * 8 + 5] = (uint8_t)(v >> 16);
        out[i * 8 + 6] = (uint8_t)(v >> 8);
        out[i * 8 + 7] = (uint8_t)(v);
    }

    /* Wipe sensitive state. */
    memset(c, 0, sizeof(*c));
}

void sha512(const void *data, size_t len, uint8_t out[64])
{
    sha512_ctx c;
    sha512_init(&c);
    sha512_update(&c, data, len);
    sha512_final(&c, out);
}

/* HMAC-SHA-512 (RFC 2104). Block size 128, digest 64. */
void hmac_sha512(const uint8_t *key, size_t keylen,
                 const uint8_t *msg, size_t msglen, uint8_t out[64])
{
    uint8_t k[128];
    uint8_t ipad[128];
    uint8_t opad[128];
    uint8_t inner[64];
    sha512_ctx c;
    int i;

    memset(k, 0, sizeof(k));
    if (keylen > 128) {
        sha512(key, keylen, k);          /* first 64 bytes; rest stays zero */
    } else {
        memcpy(k, key, keylen);
    }

    for (i = 0; i < 128; i++) {
        ipad[i] = (uint8_t)(k[i] ^ 0x36);
        opad[i] = (uint8_t)(k[i] ^ 0x5c);
    }

    sha512_init(&c);
    sha512_update(&c, ipad, 128);
    sha512_update(&c, msg, msglen);
    sha512_final(&c, inner);

    sha512_init(&c);
    sha512_update(&c, opad, 128);
    sha512_update(&c, inner, 64);
    sha512_final(&c, out);
}
