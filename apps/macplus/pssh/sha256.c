/*
 * sha256.c - portable SHA-256 + HMAC-SHA256
 *
 * FIPS 180-4. 32-bit core arithmetic only (uint64_t used solely for the
 * message-length counter). No compiler builtins, no 64-bit math in the
 * compression function, no OS calls. Only <string.h> for memcpy/memset.
 */
#include "sha256.h"
#include <string.h>

/* Rotate right within 32 bits. The mask keeps it correct even if uint32_t
 * promotes to a wider int on some target. */
#define ROTR(x, n) (((x) >> (n)) | ((x) << (32 - (n))))

#define CH(x, y, z)  (((x) & (y)) ^ ((~(x)) & (z)))
#define MAJ(x, y, z) (((x) & (y)) ^ ((x) & (z)) ^ ((y) & (z)))
#define BSIG0(x) (ROTR(x, 2)  ^ ROTR(x, 13) ^ ROTR(x, 22))
#define BSIG1(x) (ROTR(x, 6)  ^ ROTR(x, 11) ^ ROTR(x, 25))
#define SSIG0(x) (ROTR(x, 7)  ^ ROTR(x, 18) ^ ((x) >> 3))
#define SSIG1(x) (ROTR(x, 17) ^ ROTR(x, 19) ^ ((x) >> 10))

static const uint32_t K[64] = {
    0x428a2f98UL, 0x71374491UL, 0xb5c0fbcfUL, 0xe9b5dba5UL,
    0x3956c25bUL, 0x59f111f1UL, 0x923f82a4UL, 0xab1c5ed5UL,
    0xd807aa98UL, 0x12835b01UL, 0x243185beUL, 0x550c7dc3UL,
    0x72be5d74UL, 0x80deb1feUL, 0x9bdc06a7UL, 0xc19bf174UL,
    0xe49b69c1UL, 0xefbe4786UL, 0x0fc19dc6UL, 0x240ca1ccUL,
    0x2de92c6fUL, 0x4a7484aaUL, 0x5cb0a9dcUL, 0x76f988daUL,
    0x983e5152UL, 0xa831c66dUL, 0xb00327c8UL, 0xbf597fc7UL,
    0xc6e00bf3UL, 0xd5a79147UL, 0x06ca6351UL, 0x14292967UL,
    0x27b70a85UL, 0x2e1b2138UL, 0x4d2c6dfcUL, 0x53380d13UL,
    0x650a7354UL, 0x766a0abbUL, 0x81c2c92eUL, 0x92722c85UL,
    0xa2bfe8a1UL, 0xa81a664bUL, 0xc24b8b70UL, 0xc76c51a3UL,
    0xd192e819UL, 0xd6990624UL, 0xf40e3585UL, 0x106aa070UL,
    0x19a4c116UL, 0x1e376c08UL, 0x2748774cUL, 0x34b0bcb5UL,
    0x391c0cb3UL, 0x4ed8aa4aUL, 0x5b9cca4fUL, 0x682e6ff3UL,
    0x748f82eeUL, 0x78a5636fUL, 0x84c87814UL, 0x8cc70208UL,
    0x90befffaUL, 0xa4506cebUL, 0xbef9a3f7UL, 0xc67178f2UL
};

static void sha256_block(sha256_ctx *c, const uint8_t *p)
{
    uint32_t w[64];
    uint32_t a, b, cc, d, e, f, g, h;
    uint32_t t1, t2;
    int i;

    /* Load the 16 big-endian words of the block. */
    for (i = 0; i < 16; i++) {
        w[i] = ((uint32_t)p[0] << 24) |
               ((uint32_t)p[1] << 16) |
               ((uint32_t)p[2] << 8)  |
               ((uint32_t)p[3]);
        p += 4;
    }
    /* Extend to 64 words. */
    for (i = 16; i < 64; i++) {
        w[i] = SSIG1(w[i - 2]) + w[i - 7] + SSIG0(w[i - 15]) + w[i - 16];
    }

    a = c->h[0]; b = c->h[1]; cc = c->h[2]; d = c->h[3];
    e = c->h[4]; f = c->h[5]; g = c->h[6]; h = c->h[7];

    for (i = 0; i < 64; i++) {
        t1 = h + BSIG1(e) + CH(e, f, g) + K[i] + w[i];
        t2 = BSIG0(a) + MAJ(a, b, cc);
        h = g; g = f; f = e; e = d + t1;
        d = cc; cc = b; b = a; a = t1 + t2;
    }

    c->h[0] += a; c->h[1] += b; c->h[2] += cc; c->h[3] += d;
    c->h[4] += e; c->h[5] += f; c->h[6] += g; c->h[7] += h;
}

void sha256_init(sha256_ctx *c)
{
    c->h[0] = 0x6a09e667UL;
    c->h[1] = 0xbb67ae85UL;
    c->h[2] = 0x3c6ef372UL;
    c->h[3] = 0xa54ff53aUL;
    c->h[4] = 0x510e527fUL;
    c->h[5] = 0x9b05688cUL;
    c->h[6] = 0x1f83d9abUL;
    c->h[7] = 0x5be0cd19UL;
    c->total = 0;
    c->n = 0;
}

void sha256_update(sha256_ctx *c, const void *data, size_t len)
{
    const uint8_t *p = (const uint8_t *)data;

    c->total += (uint64_t)len;

    /* Fill an existing partial buffer first. */
    if (c->n != 0) {
        uint32_t need = 64 - c->n;
        uint32_t take = (len < (size_t)need) ? (uint32_t)len : need;
        memcpy(c->buf + c->n, p, take);
        c->n += take;
        p += take;
        len -= take;
        if (c->n == 64) {
            sha256_block(c, c->buf);
            c->n = 0;
        }
    }

    /* Process full blocks straight from the input. */
    while (len >= 64) {
        sha256_block(c, p);
        p += 64;
        len -= 64;
    }

    /* Stash the remainder. */
    if (len != 0) {
        memcpy(c->buf, p, len);
        c->n = (uint32_t)len;
    }
}

void sha256_final(sha256_ctx *c, uint8_t out[32])
{
    uint64_t bits = c->total << 3; /* total * 8, message length in bits */
    int i;

    /* Append 0x80 then pad with zeros until 56 bytes mod 64. */
    c->buf[c->n++] = 0x80;
    if (c->n > 56) {
        memset(c->buf + c->n, 0, 64 - c->n);
        sha256_block(c, c->buf);
        c->n = 0;
    }
    memset(c->buf + c->n, 0, 56 - c->n);

    /* Append the 64-bit big-endian bit length. */
    c->buf[56] = (uint8_t)(bits >> 56);
    c->buf[57] = (uint8_t)(bits >> 48);
    c->buf[58] = (uint8_t)(bits >> 40);
    c->buf[59] = (uint8_t)(bits >> 32);
    c->buf[60] = (uint8_t)(bits >> 24);
    c->buf[61] = (uint8_t)(bits >> 16);
    c->buf[62] = (uint8_t)(bits >> 8);
    c->buf[63] = (uint8_t)(bits);
    sha256_block(c, c->buf);

    /* Emit the hash big-endian. */
    for (i = 0; i < 8; i++) {
        out[i * 4 + 0] = (uint8_t)(c->h[i] >> 24);
        out[i * 4 + 1] = (uint8_t)(c->h[i] >> 16);
        out[i * 4 + 2] = (uint8_t)(c->h[i] >> 8);
        out[i * 4 + 3] = (uint8_t)(c->h[i]);
    }
}

void sha256(const void *data, size_t len, uint8_t out[32])
{
    sha256_ctx c;
    sha256_init(&c);
    sha256_update(&c, data, len);
    sha256_final(&c, out);
}

void hmac_sha256(const uint8_t *key, size_t keylen,
                 const uint8_t *msg, size_t msglen,
                 uint8_t out[32])
{
    uint8_t k[64];
    uint8_t ipad[64];
    uint8_t opad[64];
    uint8_t inner[32];
    sha256_ctx c;
    int i;

    /* Reduce / pad the key to the 64-byte block size. */
    memset(k, 0, sizeof(k));
    if (keylen > 64) {
        sha256(key, keylen, k); /* fills first 32 bytes, rest stays zero */
    } else {
        memcpy(k, key, keylen);
    }

    for (i = 0; i < 64; i++) {
        ipad[i] = (uint8_t)(k[i] ^ 0x36);
        opad[i] = (uint8_t)(k[i] ^ 0x5c);
    }

    /* inner = H(ipad || msg) */
    sha256_init(&c);
    sha256_update(&c, ipad, 64);
    sha256_update(&c, msg, msglen);
    sha256_final(&c, inner);

    /* out = H(opad || inner) */
    sha256_init(&c);
    sha256_update(&c, opad, 64);
    sha256_update(&c, inner, 32);
    sha256_final(&c, out);
}
