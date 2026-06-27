/* rxtest.c — host test of the Porthole receive path (porthole_rx.inc).
 *   - full frame: a real agent 'F' frame fed in awkward chunk splits
 *     reconstructs the screen exactly (also guards the zlibss BFINAL fix).
 *   - dirty rect (Phase 3): a full frame then a sub-rect frame applies the rect
 *     at the right place and leaves the rest of the screen untouched.
 *   cc -O2 -I. -I ../pssh -o /tmp/rxtest rxtest.c ../pssh/zlibss.c && /tmp/rxtest
 */
#include <stdio.h>
#include <string.h>
#define CANVAS_W 512
#define CANVAS_H 300
#define CRB (CANVAS_W/8)
#define FRAME_BYTES (CRB*CANVAS_H)
#define ZCAP 26000

static short g_bx, g_by, g_bw, g_bh; static int g_blits;
void PortBlit(short x, short y, short w, short h) { g_bx=x; g_by=y; g_bw=w; g_bh=h; g_blits++; }
void PortStatus(const char *s) { fprintf(stderr, "[status] %s\n", s); }
#include "porthole_rx.inc"

#include "test_frame.h"     /* gTestFrame[19200]  (expected packed) */
#include "test_frame_z.h"   /* gTestFrameZ[]      (real 'F' frame)  */
#include "test_diff.h"      /* gDiffFull[], gDiffRect[], DIFF_R*    */

static int pass = 0, fail = 0;
#define OK(cond, msg) do { if (cond) { pass++; printf("ok   %s\n", msg); } else { fail++; printf("FAIL %s\n", msg); } } while (0)

int main(void) {
    long i; int si = 0;
    long sizes[] = { 1, 2, 3, 5, 7, 13, 1, 256, 999 };

    /* ---- full frame, chunk-split ---- */
    long fn = (long)sizeof(gTestFrameZ);
    for (i = 0; i < fn;) { long c = sizes[si++ % 9]; if (i + c > fn) c = fn - i; { long k; for (k = 0; k < c; k++) FeedByte(gTestFrameZ[i + k]); } i += c; }
    OK(g_blits == 1, "full frame: blit fired once");
    OK(g_bx==0&&g_by==0&&g_bw==CANVAS_W&&g_bh==CANVAS_H, "full frame: blit rect = whole screen");
    OK(gImgValid, "full frame: gImgValid set");
    OK(memcmp(gImgBuf, gTestFrame, FRAME_BYTES) == 0, "full frame: decoded == agent packed (exact)");

    /* ---- dirty rect apply ---- */
    {
        static unsigned char bufA[FRAME_BYTES]; int j, bc, outside_ok = 1, inside_changed = 0;
        for (i = 0; i < (long)sizeof(gDiffFull); i++) FeedByte(gDiffFull[i]);   /* full A */
        memcpy(bufA, gImgBuf, FRAME_BYTES);
        g_blits = 0;
        for (i = 0; i < (long)sizeof(gDiffRect); i++) FeedByte(gDiffRect[i]);   /* dirty rect */
        OK(g_blits == 1 && g_bx==DIFF_RX && g_by==DIFF_RY && g_bw==DIFF_RW && g_bh==DIFF_RH, "rect: blit at the diff rect");
        for (j = 0; j < CANVAS_H; j++) for (bc = 0; bc < CRB; bc++) {
            int inRow = (j >= DIFF_RY && j < DIFF_RY + DIFF_RH);
            int inCol = (bc >= DIFF_RX/8 && bc < (DIFF_RX + DIFF_RW)/8);
            if (inRow && inCol) { if (gImgBuf[j*CRB+bc] != bufA[j*CRB+bc]) inside_changed = 1; }
            else if (gImgBuf[j*CRB+bc] != bufA[j*CRB+bc]) outside_ok = 0;
        }
        OK(outside_ok, "rect: pixels outside the rect unchanged");
        OK(inside_changed, "rect: pixels inside the rect updated");
    }

    printf("\nrxtest: %d passed, %d failed\n", pass, fail);
    return fail ? 1 : 0;
}
