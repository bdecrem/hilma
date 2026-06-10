/*
 * rxtest.c - host-clang test for the FND receive parser (foundry_rx.inc, the
 * exact code the Plus runs). Loads a REAL Retro68 MacBinary, frames it the
 * way the agent does, feeds it byte-by-byte, and asserts the decoded stream
 * reconstructs the file exactly. Also: status routing, error abort + recovery,
 * checksum/length tamper detection, noise rejection.
 *
 *   cc -o /tmp/foundry_rxtest rxtest.c && /tmp/foundry_rxtest <some.bin>
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef unsigned char Boolean;

/* ---- recorded callback stream ---- */
static unsigned char gOut[1 << 20];
static long gOutLen = 0;
static long gBeginTotal = -1;
static int  gDone = 0;
static char gLastLog[512];
static char gLastErr[512];

static void RxLog(const char *msg) { strncpy(gLastLog, msg, 511); }
static void RxFail(const char *msg) { strncpy(gLastErr, msg, 511); }
static void BinBegin(long total) { gBeginTotal = total; gOutLen = 0; gDone = 0; }
static void BinBytes(const unsigned char *b, short n)
{
    memcpy(gOut + gOutLen, b, n);
    gOutLen += n;
}
static void BinDone(void) { gDone = 1; }

#include "foundry_rx.inc"

static int gFail = 0;
static void check(const char *name, int ok)
{
    printf("%s  %s\n", ok ? "PASS" : "FAIL", name);
    if (!ok) gFail++;
}

static void feed(const char *s) { while (*s) FeedRxByte((unsigned char)*s++); }

/* frame a buffer exactly like the agent's encodeBin() */
static char *makeFrame(const unsigned char *buf, long len, long lieBytes, int corrupt)
{
    long cap = len * 2 + len / 64 + 256;
    char *f = malloc(cap);
    long n = 0, off;
    unsigned sum = 0;
    long i;
    for (i = 0; i < len; i++) sum = (sum + buf[i]) & 0xffff;
    n += sprintf(f + n, "FNDBIN %ld %u\r\n", len + lieBytes, sum);
    for (off = 0; off < len; off += 128) {
        long chunk = len - off < 128 ? len - off : 128;
        for (i = 0; i < chunk; i++) {
            unsigned char b = buf[off + i];
            if (corrupt && off + i == len / 2) b ^= 0xff;
            n += sprintf(f + n, "%02X", b);
        }
        n += sprintf(f + n, "\r\n");
    }
    n += sprintf(f + n, "FNDEND\r\n");
    f[n] = 0;
    return f;
}

int main(int argc, char **argv)
{
    unsigned char *bin;
    long binLen;
    FILE *fp;

    if (argc < 2) { fprintf(stderr, "usage: %s <app.bin>\n", argv[0]); return 2; }
    fp = fopen(argv[1], "rb");
    if (!fp) { perror(argv[1]); return 2; }
    fseek(fp, 0, SEEK_END);
    binLen = ftell(fp);
    fseek(fp, 0, SEEK_SET);
    bin = malloc(binLen);
    fread(bin, 1, binLen, fp);
    fclose(fp);
    printf("loaded %s: %ld bytes\n", argv[1], binLen);

    /* ---- 1. status + clean delivery reconstructs exactly ---- */
    feed("FNDSTS claude is writing the code...\r\n");
    check("status routed", strcmp(gLastLog, "claude is writing the code...") == 0);
    {
        char *f = makeFrame(bin, binLen, 0, 0);
        feed(f);
        free(f);
    }
    check("delivery begun with total", gBeginTotal == binLen);
    check("delivery complete", gDone == 1);
    check("byte count exact", gOutLen == binLen);
    check("bytes identical", memcmp(gOut, bin, binLen) == 0);
    check("parser idle", gRxState == FRX_IDLE);

    /* ---- 2. corrupted byte -> checksum abort, then clean recovery ---- */
    gLastErr[0] = 0; gDone = 0;
    {
        char *f = makeFrame(bin, binLen, 0, 1);
        feed(f);
        free(f);
    }
    check("corruption detected", strstr(gLastErr, "checksum") != NULL);
    check("no DONE after corruption", gDone == 0);
    {
        char *f = makeFrame(bin, binLen, 0, 0);
        feed(f);
        free(f);
    }
    check("recovers after corruption", gDone == 1 && gOutLen == binLen);

    /* ---- 3. short delivery -> length abort ---- */
    gLastErr[0] = 0; gDone = 0;
    {
        char *f = makeFrame(bin, binLen, 100, 0);   /* header promises 100 extra */
        feed(f);
        free(f);
    }
    check("short delivery detected", strstr(gLastErr, "short") != NULL && gDone == 0);

    /* ---- 4. FNDERR aborts; noise between frames ignored ---- */
    gLastErr[0] = 0;
    feed("FNDERR could not get a clean build\r\n");
    check("FNDERR routed", strcmp(gLastErr, "could not get a clean build") == 0);
    gLastLog[0] = 0; gLastErr[0] = 0; gDone = 0;
    feed("RING\r\nCONNECT 9600\r\nrandom echo noise\r\n4845API\r\n");
    check("noise ignored", gLastLog[0] == 0 && gLastErr[0] == 0 && gDone == 0);

    /* ---- 5. bad hex mid-delivery aborts ---- */
    gLastErr[0] = 0;
    feed("FNDBIN 256 0\r\nZZZZ\r\n");
    check("bad hex detected", gLastErr[0] != 0 && gRxState == FRX_IDLE);

    /* ---- 6. adversarial fuzz: every malformed frame must abort-or-stay-idle,
     *        never run away or leave the parser stuck mid-delivery. These are
     *        the inputs a flaky 9600-baud modem link can actually produce. ---- */
    gLastErr[0] = 0; gDone = 0;
    feed("FNDBIN 99999999 0\r\n");                 /* total way over the 900000 cap */
    check("oversized header rejected", strstr(gLastErr, "bad delivery header") != NULL && gRxState == FRX_IDLE);

    gLastErr[0] = 0;
    feed("FNDBIN 256 0\r\n");                       /* valid header... */
    {
        int i; for (i = 0; i < 400; i++) FeedRxByte('A');  /* ...then a hex line longer than FRX_LINEMAX */
        FeedRxByte('\r'); FeedRxByte('\n');
    }
    check("overlong hex line rejected", strstr(gLastErr, "too long") != NULL && gRxState == FRX_IDLE);

    gLastErr[0] = 0;
    feed("FNDBIN 256 0\r\nABC\r\n");                /* odd-length hex line */
    check("odd hex line rejected", strstr(gLastErr, "odd hex") != NULL && gRxState == FRX_IDLE);

    gLastErr[0] = 0; gDone = 0;
    feed("FNDBIN 4 0\r\n");                          /* promise 4, send 256 -> overrun */
    { int i; for (i = 0; i < 128; i++) FeedRxByte('4'), FeedRxByte('1'); FeedRxByte('\r'); FeedRxByte('\n'); }
    check("overrun rejected", strstr(gLastErr, "longer than promised") != NULL && gRxState == FRX_IDLE);

    /* random byte storm: deterministic LCG, no \r\n discipline. Must not crash,
     * must not get stuck in FRX_BIN forever. */
    {
        unsigned long seed = 0x1234567u;
        long i; int everStuck = 0;
        for (i = 0; i < 200000; i++) {
            seed = seed * 1103515245u + 12345u;
            FeedRxByte((unsigned char)(seed >> 16));
        }
        FeedRxByte('\n');                            /* flush any partial line */
        /* parser is either idle or mid-line, never wedged with a live delivery
         * that can't be ended — assert it isn't sitting in FRX_BIN with a count */
        if (gRxState == FRX_BIN && gBinCount > 0 && gBinCount < gBinTotal) everStuck = 1;
        check("random storm survived (no crash)", 1);
        check("random storm left no wedged delivery", !everStuck);
    }
    /* a clean delivery still works after all that abuse */
    gDone = 0;
    { char *f = makeFrame(bin, binLen, 0, 0); feed(f); free(f); }
    check("clean delivery after fuzz", gDone == 1 && gOutLen == binLen);

    printf(gFail ? "\n%d FAILURE(S)\n" : "\nALL RX TESTS PASSED\n", gFail);
    return gFail ? 1 : 0;
}
