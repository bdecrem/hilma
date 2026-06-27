/* ed25519_test.c - Ed25519 verification tests.
 *
 *   - RFC 8032 section 7.1 TEST 1 (empty message).
 *   - Fresh keypairs/messages generated with PyNaCl (ed25519_vectors.h), each
 *     asserted to verify.
 *   - Negative tests: flip one bit of the signature / message / public key,
 *     each must be rejected.
 *   - The resumable (sliced) verify, stepped one bit at a time, must agree with
 *     the one-shot verdict for both valid and tampered inputs.
 *
 * Build:
 *   cc -O2 -o /tmp/ed_t ed25519.c sha512.c ed25519_test.c
 */
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "ed25519.h"
#include "ed25519_vectors.h"

static int passed = 0, failed = 0;

static void check(int cond, const char *what)
{
    if (cond) passed++;
    else { failed++; printf("FAIL: %s\n", what); }
}

/* resumable verify driven one bit per step, returns the verdict */
static int verify_sliced(const uint8_t pub[32], const uint8_t *msg, size_t mlen,
                         const uint8_t sig[64])
{
    ed25519_vrfy_state st;
    if (ed25519_verify_start(&st, pub, msg, mlen, sig) < 0)
        return 0;
    while (!ed25519_verify_step(&st, 1))
        ;
    return ed25519_verify_finish(&st);
}

int main(void)
{
    int i;
    char name[64];

    for (i = 0; i < ED_NVECS; i++) {
        const ed_vec *v = &ED_VECS[i];
        const uint8_t *msg = v->msg;
        int oneshot, sliced;
        uint8_t pub[32], sig[64];

        /* positive: one-shot must accept */
        oneshot = ed25519_verify(v->pub, msg, v->msglen, v->sig);
        sprintf(name, "vec %d (%s) one-shot accepts", i, v->name);
        check(oneshot == 1, name);

        /* positive: sliced agrees with one-shot */
        sliced = verify_sliced(v->pub, msg, v->msglen, v->sig);
        sprintf(name, "vec %d sliced==oneshot (valid)", i);
        check(sliced == oneshot, name);

        /* negative: flip a signature bit -> reject (both forms) */
        memcpy(sig, v->sig, 64);
        sig[10] ^= 0x08;
        oneshot = ed25519_verify(v->pub, msg, v->msglen, sig);
        sliced  = verify_sliced(v->pub, msg, v->msglen, sig);
        sprintf(name, "vec %d flipped-sig rejected", i);
        check(oneshot == 0, name);
        sprintf(name, "vec %d sliced==oneshot (bad sig)", i);
        check(sliced == oneshot, name);

        /* negative: flip a public-key bit -> reject */
        memcpy(pub, v->pub, 32);
        pub[5] ^= 0x04;
        oneshot = ed25519_verify(pub, msg, v->msglen, v->sig);
        sliced  = verify_sliced(pub, msg, v->msglen, v->sig);
        sprintf(name, "vec %d flipped-pub rejected", i);
        check(oneshot == 0, name);
        sprintf(name, "vec %d sliced==oneshot (bad pub)", i);
        check(sliced == oneshot, name);

        /* negative: flip a message bit -> reject (only for non-empty messages) */
        if (v->msglen > 0) {
            uint8_t m2[256];
            memcpy(m2, msg, v->msglen);
            m2[v->msglen - 1] ^= 0x01;
            oneshot = ed25519_verify(v->pub, m2, v->msglen, v->sig);
            sliced  = verify_sliced(v->pub, m2, v->msglen, v->sig);
            sprintf(name, "vec %d flipped-msg rejected", i);
            check(oneshot == 0, name);
            sprintf(name, "vec %d sliced==oneshot (bad msg)", i);
            check(sliced == oneshot, name);
        }
    }

    /* Explicit RFC 8032 TEST 1 sanity (vector 0): public key matches the RFC. */
    {
        static const uint8_t rfc_pub[32] = {
            0xd7,0x5a,0x98,0x01,0x82,0xb1,0x0a,0xb7,0xd5,0x4b,0xfe,0xd3,0xc9,0x64,0x07,0x3a,
            0x0e,0xe1,0x72,0xf3,0xda,0xa6,0x23,0x25,0xaf,0x02,0x1a,0x68,0xf7,0x07,0x51,0x1a
        };
        check(memcmp(ED_VECS[0].pub, rfc_pub, 32) == 0, "vec 0 is RFC8032 TEST 1");
        check(ED_VECS[0].msglen == 0, "vec 0 message is empty");
    }

    printf("ed25519: %d passed, %d failed\n", passed, failed);
    return failed ? 1 : 0;
}
