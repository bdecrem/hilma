/*
 * rxtest.c - host-clang test of the Plus frame parser (atkinson_rx.inc),
 * exercised against a REAL agent frame. This is the only way to test the C
 * receive path: Mini vMac has no serial, and the cable is still out.
 *
 * It compiles the SAME atkinson_rx.inc the Plus app uses, with host stubs for
 * the four callbacks, then:
 *   1. feeds /tmp/atkinson-selftest.frame byte-by-byte through FeedRxByte()
 *      (the file has a banner before the header + junk after ATKEND, to prove
 *      the state machine ignores both),
 *   2. asserts the reconstructed gImgBuf equals /tmp/atkinson-selftest.bin
 *      (the exact bytes dither.py packed on the agent side),
 *   3. asserts all 300 rows were decoded and each DrawBand fired once in order.
 *
 * Produce the inputs first:  cd ../agent-atkinson && OPENAI_API_KEY=... npm run selftest
 * Build + run:               clang -o /tmp/rxtest rxtest.c && /tmp/rxtest
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef int Boolean;
#define true 1
#define false 0

#define IMG_W 480
#define IMG_H 300
#define IMG_RB (IMG_W / 8)
#define FRAME_BYTES (IMG_RB * IMG_H)

/* ---- the globals atkinson_rx.inc decodes into ---- */
static unsigned char gImgBuf[FRAME_BYTES];
static short gImgRB = 0, gImgW = 0, gImgH = 0;
static Boolean gImgValid = false;

/* ---- callbacks the parser calls; here they just record what happened ---- */
static int   gBandCalls = 0;
static int   gLastBandTop = -1;
static int   gBandInOrder = 1;
static char  gStatus[128];

static void DrawBand(short top, short bottom) {
    (void)bottom;
    if (top != gLastBandTop + 1) gBandInOrder = 0;   /* must blit row N then N+1 */
    gLastBandTop = top;
    gBandCalls++;
}
static void ClearCanvas(void) { }
static void SetStatus(const char *m) { strncpy(gStatus, m, sizeof(gStatus) - 1); gStatus[sizeof(gStatus)-1]=0; }
static void SetStatusPct(const char *m, short p) { (void)m; (void)p; }

#include "atkinson_rx.inc"

static long readfile(const char *path, unsigned char **out) {
    FILE *f = fopen(path, "rb");
    if (!f) { fprintf(stderr, "FAIL: cannot open %s (run the agent selftest first)\n", path); exit(2); }
    fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
    unsigned char *b = malloc(n);
    if (fread(b, 1, n, f) != (size_t)n) { fprintf(stderr, "FAIL: short read %s\n", path); exit(2); }
    fclose(f); *out = b; return n;
}

#define CHECK(cond, msg) do { if (!(cond)) { fprintf(stderr, "FAIL: %s\n", msg); fails++; } } while (0)

int main(void) {
    unsigned char *frame, *want;
    long flen = readfile("/tmp/atkinson-selftest.frame", &frame);
    long wlen = readfile("/tmp/atkinson-selftest.bin", &want);
    int fails = 0;
    long i;

    CHECK(wlen == FRAME_BYTES, "reference .bin is not 18000 bytes");

    gRxState = RX_WAIT_HEADER;                 /* as DoNewImage() sets it */
    for (i = 0; i < flen; i++) FeedRxByte(frame[i]);

    CHECK(gImgW == IMG_W && gImgH == IMG_H && gImgRB == IMG_RB, "header dims wrong");
    CHECK(gRxState == RX_IDLE, "parser did not return to IDLE on ATKEND");
    CHECK(gRxRow == IMG_H, "did not decode all 300 rows");
    CHECK(gBandCalls == IMG_H, "DrawBand not called once per row");
    CHECK(gBandInOrder, "rows not blitted top-to-bottom in order");
    CHECK(strcmp(gStatus, "done") == 0, "final status not 'done'");
    CHECK(memcmp(gImgBuf, want, FRAME_BYTES) == 0, "decoded image != agent's packed bytes");

    if (fails) { fprintf(stderr, "rxtest: %d FAILED\n", fails); return 1; }
    printf("rxtest PASS: 300 rows decoded in order, image bytes match agent frame exactly\n");
    return 0;
}
