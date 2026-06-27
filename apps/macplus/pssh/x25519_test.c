/* x25519_test.c - RFC 7748 section 5.2 vectors + chunked==oneshot proof. */
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "x25519.h"

static int hexval(int c)
{
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

static void hex32(const char *h, uint8_t out[32])
{
    int i;
    for (i = 0; i < 32; i++)
        out[i] = (uint8_t)((hexval(h[2 * i]) << 4) | hexval(h[2 * i + 1]));
}

static int eq32(const uint8_t a[32], const uint8_t b[32])
{
    return memcmp(a, b, 32) == 0;
}

/* Run the resumable ladder one bit at a time (max_steps = 1). */
static void x25519_chunked1(uint8_t out[32], const uint8_t scalar[32], const uint8_t point[32])
{
    x25519_state st;
    x25519_start(&st, scalar, point);
    while (!x25519_step(&st, 1)) {
        /* exactly one ladder bit per call */
    }
    x25519_finish(&st, out);
}

int main(void)
{
    int passed = 0, failed = 0;

    /* RFC 7748 section 5.2 */
    const char *S1 = "a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4";
    const char *U1 = "e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c";
    const char *E1 = "c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552";

    const char *S2 = "4b66e9d4d1b4673c5ad22691957d6af5c11b6421e0ea01d42ca4169e7918ba0d";
    const char *U2 = "e5210f12786811d3f4b7959d0538ae2c31dbe7106fc03c3efc4cd549c715a493";
    const char *E2 = "95cbde9476e8907d7aade45cb4b873f88b595a68799fa152e6f8f7647aac7957";

    uint8_t s1[32], u1[32], e1[32];
    uint8_t s2[32], u2[32], e2[32];
    uint8_t out[32], cout[32];

    hex32(S1, s1); hex32(U1, u1); hex32(E1, e1);
    hex32(S2, s2); hex32(U2, u2); hex32(E2, e2);

    /* TV1 one-shot */
    x25519(out, s1, u1);
    if (eq32(out, e1)) passed++; else { failed++; printf("FAIL: TV1 one-shot\n"); }

    /* TV2 one-shot */
    x25519(out, s2, u2);
    if (eq32(out, e2)) passed++; else { failed++; printf("FAIL: TV2 one-shot\n"); }

    /* TV1 chunked (1 bit/call) == one-shot == expected */
    x25519(out, s1, u1);
    x25519_chunked1(cout, s1, u1);
    if (eq32(cout, out) && eq32(cout, e1)) passed++;
    else { failed++; printf("FAIL: TV1 chunked==oneshot\n"); }

    /* TV2 chunked (1 bit/call) == one-shot == expected */
    x25519(out, s2, u2);
    x25519_chunked1(cout, s2, u2);
    if (eq32(cout, out) && eq32(cout, e2)) passed++;
    else { failed++; printf("FAIL: TV2 chunked==oneshot\n"); }

    printf("x25519: %d passed, %d failed\n", passed, failed);
    return failed ? 1 : 0;
}
