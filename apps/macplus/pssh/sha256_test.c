/*
 * sha256_test.c - official test vectors for sha256.c
 *
 * Builds freestanding except for <stdio.h>/<string.h> used by the harness.
 * (The library itself only needs <string.h>; stdio here is host-only.)
 */
#include "sha256.h"
#include <stdio.h>
#include <string.h>

static int g_passed = 0;
static int g_failed = 0;

/* Convert a 32-byte digest to lowercase hex. */
static void to_hex(const uint8_t *d, char *hex)
{
    static const char *digits = "0123456789abcdef";
    int i;
    for (i = 0; i < 32; i++) {
        hex[i * 2]     = digits[(d[i] >> 4) & 0xf];
        hex[i * 2 + 1] = digits[d[i] & 0xf];
    }
    hex[64] = '\0';
}

static void check(const char *name, const uint8_t *digest, const char *expect)
{
    char hex[65];
    to_hex(digest, hex);
    if (strcmp(hex, expect) == 0) {
        g_passed++;
        printf("  PASS %s\n", name);
    } else {
        g_failed++;
        printf("  FAIL %s\n    got      %s\n    expected %s\n",
               name, hex, expect);
    }
}

int main(void)
{
    uint8_t d[32];
    const char *abc_long =
        "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";

    /* SHA256("") */
    sha256("", 0, d);
    check("SHA256(\"\")", d,
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");

    /* SHA256("abc") */
    sha256("abc", 3, d);
    check("SHA256(\"abc\")", d,
          "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

    /* SHA256(56-byte two-block message) */
    sha256(abc_long, strlen(abc_long), d);
    check("SHA256(56-byte)", d,
          "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");

    /* HMAC-SHA256 RFC 4231 Test Case 2 */
    hmac_sha256((const uint8_t *)"Jefe", 4,
                (const uint8_t *)"what do ya want for nothing?", 28, d);
    check("HMAC-SHA256 RFC4231 #2", d,
          "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");

    printf("sha256: %d passed, %d failed\n", g_passed, g_failed);
    return g_failed == 0 ? 0 : 1;
}
