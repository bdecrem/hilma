/*
 * rxtest.c — host-clang test for the Daily Pixel protocol parser (px_rx.inc,
 * shared verbatim with pixel.c). Build & run on the modern Mac:
 *
 *   clang -o /tmp/pxtest rxtest.c && /tmp/pxtest
 */
#include <stdio.h>
#include <string.h>

#include "px_rx.inc"

/* ---- recording hooks ---- */
static int gFrameStarts = 0, gFrameEnds = 0;
static unsigned char gRows[PX_H][PX_RB];
static int gRowSeen[PX_H];
static int gPix[64][3]; static int gNPix = 0;
static char gNote[128] = "";

static void PxOnFrameStart(void) { gFrameStarts++; memset(gRowSeen, 0, sizeof(gRowSeen)); }
static void PxOnRow(short row, const unsigned char *b8) { memcpy(gRows[row], b8, PX_RB); gRowSeen[row] = 1; }
static void PxOnFrameEnd(void) { gFrameEnds++; }
static void PxOnPixel(short x, short y, short v) { if (gNPix < 64) { gPix[gNPix][0] = x; gPix[gNPix][1] = y; gPix[gNPix][2] = v; gNPix++; } }
static void PxOnNote(const char *s) { strncpy(gNote, s, sizeof(gNote) - 1); }

static int fails = 0;
#define OK(cond, name) do { printf("%s %s\n", (cond) ? "ok  " : "FAIL", name); if (!(cond)) fails++; } while (0)

static void feedStr(const char *s) { PxFeed((const unsigned char *)s, (short)strlen(s)); }

int main(void)
{
    int i, all;
    char line[64];

    /* 1. a full frame, split at awkward byte boundaries */
    feedStr("PXINFO 64 64\r");
    feedStr("\n");
    for (i = 0; i < 64; i++) {
        sprintf(line, "PXROW %d %02x0000000000000%x\r\n", i, i, i & 15);
        /* drip it in two chunks to test reassembly */
        PxFeed((const unsigned char *)line, 5);
        PxFeed((const unsigned char *)line + 5, (short)(strlen(line) - 5));
    }
    feedStr("PXEND\r\n");
    OK(gFrameStarts == 1, "frame start");
    OK(gFrameEnds == 1, "frame end");
    all = 1; for (i = 0; i < 64; i++) if (!gRowSeen[i]) all = 0;
    OK(all, "all 64 rows seen");
    OK(gRows[10][0] == 0x0a && gRows[10][7] == 0x0a, "row bytes decoded (hex)");
    OK(gRows[63][0] == 0x3f && gRows[63][7] == 0x0f, "last row decoded");

    /* 2. live pixel + note */
    feedStr("PX 3 5 1\r\nPXNOTE claude drew a hill\r\n");
    OK(gNPix == 1 && gPix[0][0] == 3 && gPix[0][1] == 5 && gPix[0][2] == 1, "PX parsed");
    OK(strcmp(gNote, "claude drew a hill") == 0, "PXNOTE parsed");

    /* 3. malformed lines dropped, never crash */
    {
        long badBefore = gPxBad;
        feedStr("PX 99 5 1\r\n");                 /* x out of range */
        feedStr("PX 5 99 1\r\n");                 /* y out of range */
        feedStr("PX 1 2 7\r\n");                  /* bad value      */
        feedStr("PXROW 64 00000000000000ff\r\n"); /* row out of range */
        feedStr("PXROW 3 00zz0000000000ff\r\n");  /* bad hex        */
        feedStr("PXROW 3 00ff\r\n");              /* short hex      */
        feedStr("PXINFO 32 32\r\n");              /* wrong geometry */
        feedStr("GARBAGE line here\r\n");
        OK(gPxBad == badBefore + 8, "8 malformed lines counted bad");
        OK(gNPix == 1, "no bogus pixel events");
        OK(gFrameStarts == 1, "wrong-geometry PXINFO ignored");
    }

    /* 4. oversized line dropped without overflow */
    {
        long badBefore = gPxBad;
        char big[400];
        memset(big, 'A', sizeof(big));
        memcpy(big, "PXNOTE ", 7);
        big[397] = '\r'; big[398] = '\n'; big[399] = 0;
        feedStr(big);
        OK(gPxBad == badBefore + 1, "oversized line dropped");
        feedStr("PX 1 2 0\r\n");
        OK(gNPix == 2 && gPix[1][2] == 0, "parser recovers after overflow");
    }

    /* 5. byte-at-a-time fuzz of a valid session (state machine robustness) */
    {
        const char *sess = "PXINFO 64 64\r\nPXROW 0 ffffffffffffffff\r\nPXEND\r\nPX 0 0 1\r\n";
        int fs = gFrameStarts, fe = gFrameEnds, np = gNPix;
        for (i = 0; sess[i]; i++) PxFeed((const unsigned char *)sess + i, 1);
        OK(gFrameStarts == fs + 1 && gFrameEnds == fe + 1 && gNPix == np + 1, "byte-at-a-time session ok");
        OK(gRows[0][0] == 0xff, "fuzz frame row decoded");
    }

    printf(fails ? "\n%d FAILURE(S)\n" : "\nall tests passed\n", fails);
    return fails ? 1 : 0;
}
