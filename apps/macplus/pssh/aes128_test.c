/* aes128_test.c - assert FIPS-197 / NIST SP800-38A known-answer vectors. */
#include "aes128.h"
#include <string.h>
#include <stdio.h>

static int g_pass = 0;
static int g_fail = 0;

/* Parse a hex string into bytes. */
static void hex2bin(const char *hex, uint8_t *out, int n)
{
  int i;
  for (i = 0; i < n; i++) {
    int hi = hex[i * 2], lo = hex[i * 2 + 1];
    hi = (hi <= '9') ? hi - '0' : (hi | 0x20) - 'a' + 10;
    lo = (lo <= '9') ? lo - '0' : (lo | 0x20) - 'a' + 10;
    out[i] = (uint8_t)((hi << 4) | lo);
  }
}

static void check(const char *name, const uint8_t *got, const char *want_hex, int n)
{
  uint8_t want[64];
  hex2bin(want_hex, want, n);
  if (memcmp(got, want, (size_t)n) == 0) {
    g_pass++;
  } else {
    int i;
    g_fail++;
    printf("  FAIL %s\n    got  ", name);
    for (i = 0; i < n; i++) printf("%02x", got[i]);
    printf("\n    want %s\n", want_hex);
  }
}

int main(void)
{
  aes128_ctx ctx;
  uint8_t key[16], in[64], out[64], ctr[16];

  /* Vector 1: FIPS-197 Appendix B / C.1 */
  hex2bin("000102030405060708090a0b0c0d0e0f", key, 16);
  hex2bin("00112233445566778899aabbccddeeff", in, 16);
  aes128_init(&ctx, key);
  aes128_encrypt(&ctx, in, out);
  check("FIPS-197 C.1 ECB", out, "69c4e0d86a7b0430d8cdb78070b4c55a", 16);

  /* Vector 2: SP800-38A ECB block 1 */
  hex2bin("2b7e151628aed2a6abf7158809cf4f3c", key, 16);
  hex2bin("6bc1bee22e409f96e93d7e117393172a", in, 16);
  aes128_init(&ctx, key);
  aes128_encrypt(&ctx, in, out);
  check("SP800-38A ECB blk1", out, "3ad77bb40d7a3660a89ecaf32466ef97", 16);

  /* Vector 3: SP800-38A F.5.1 CTR, full 4-block stream.
   * Confirms keystream + big-endian counter increment across blocks. */
  hex2bin("2b7e151628aed2a6abf7158809cf4f3c", key, 16);
  hex2bin("f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff", ctr, 16);
  hex2bin("6bc1bee22e409f96e93d7e117393172a"
          "ae2d8a571e03ac9c9eb76fac45af8e51"
          "30c81c46a35ce411e5fbc1191a0a52ef"
          "f69f2445df4f9b17ad2b417be66c3710", in, 64);
  aes128_init(&ctx, key);
  aes128_ctr_xor(&ctx, ctr, in, out, 64);
  check("SP800-38A F.5.1 CTR x4",
        out,
        "874d6191b620e3261bef6864990db6ce"
        "9806f66b7970fdff8617187bb9fffdff"
        "5ae4df3edbd5d35e5b4f09020db03eab"
        "1e031dda2fbe03d1792170a0f3009cee", 64);

  /* Confirm CTR == ECB(counter) XOR pt for the first block specifically. */
  hex2bin("f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff", ctr, 16);
  aes128_encrypt(&ctx, ctr, out);
  check("CTR keystream blk1 (raw ECB)", out, "ec8cdf7398607cb0f2d21675ea9ea1e4", 16);

  /* CTR decrypt round-trip: encrypting then decrypting 37 bytes (non-block
   * multiple) with the same counter restores the plaintext. */
  {
    uint8_t pt[37], ct[37], rt[37];
    int i, ok = 1;
    for (i = 0; i < 37; i++) pt[i] = (uint8_t)(i * 7 + 1);
    hex2bin("f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff", ctr, 16);
    aes128_ctr_xor(&ctx, ctr, pt, ct, 37);
    hex2bin("f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff", ctr, 16);
    aes128_ctr_xor(&ctx, ctr, ct, rt, 37);
    for (i = 0; i < 37; i++) if (rt[i] != pt[i]) ok = 0;
    if (ok) g_pass++; else { g_fail++; printf("  FAIL CTR round-trip 37B\n"); }
  }

  printf("aes128: %d passed, %d failed\n", g_pass, g_fail);
  return g_fail == 0 ? 0 : 1;
}
