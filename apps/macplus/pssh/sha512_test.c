/*
 * sha512_test.c — FIPS 180-4 known-answer tests for sha512.c.
 *
 * Builds freestanding-friendly except for stdio (host test only).
 */
#include "sha512.h"
#include <stdio.h>
#include <string.h>

static int hexeq(const uint8_t out[64], const char *hex)
{
    int i;
    for (i = 0; i < 64; i++) {
        char a = hex[i * 2];
        char b = hex[i * 2 + 1];
        int hi = (a >= '0' && a <= '9') ? a - '0' : (a | 0x20) - 'a' + 10;
        int lo = (b >= '0' && b <= '9') ? b - '0' : (b | 0x20) - 'a' + 10;
        if (out[i] != (uint8_t)((hi << 4) | lo)) return 0;
    }
    return 1;
}

static int passed = 0, failed = 0;

static void check(const char *name, const char *msg, const char *expect)
{
    uint8_t out[64];
    sha512(msg, strlen(msg), out);
    if (hexeq(out, expect)) {
        passed++;
    } else {
        int i;
        failed++;
        printf("  FAIL %s\n    expected %s\n    got      ", name, expect);
        for (i = 0; i < 64; i++) printf("%02x", out[i]);
        printf("\n");
    }
}

int main(void)
{
    check("empty", "",
        "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce"
        "47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e");

    check("abc", "abc",
        "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a"
        "2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f");

    check("896-bit",
        "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmno"
        "ijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu",
        "8e959b75dae313da8cf4f72814fc143f8f7779c6eb9f7fa17299aeadb6889018"
        "501d289e4900f7e4331b99dec4b5433ac7d329eeb6dd26545e96e55b874be909");

    printf("sha512: %d passed, %d failed\n", passed, failed);
    return failed ? 1 : 0;
}
