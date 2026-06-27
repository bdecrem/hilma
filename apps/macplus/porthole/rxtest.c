/* rxtest.c — host test of the Porthole receive path (porthole_rx.inc).
 * Feeds a real agent 'F' frame (node deflateSync, embedded in test_frame_z.h)
 * through the parser in awkward chunk splits and asserts the reconstructed
 * screen buffer matches the agent's packed bytes (test_frame.h) exactly.
 * Also a regression guard for the zlibss BFINAL (complete-stream) fix.
 *   cc -O2 -I ../pssh -o /tmp/rxtest rxtest.c ../pssh/zlibss.c && /tmp/rxtest
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

int main(void) {
    int pass = 0, fail = 0; long i; int si = 0;
    long sizes[] = { 1, 2, 3, 5, 7, 13, 1, 256, 999 };
    long fn = (long)sizeof(gTestFrameZ);
    for (i = 0; i < fn;) { long c = sizes[si++ % 9]; if (i + c > fn) c = fn - i; { long k; for (k = 0; k < c; k++) FeedByte(gTestFrameZ[i + k]); } i += c; }

    (g_blits == 1) ? pass++ : fail++; printf("%s blit fired once (got %d)\n", g_blits == 1 ? "ok " : "FAIL", g_blits);
    (g_bx==0&&g_by==0&&g_bw==CANVAS_W&&g_bh==CANVAS_H) ? pass++ : fail++;
    printf("%s blit rect = full screen (%d,%d,%d,%d)\n", (g_bx==0&&g_by==0&&g_bw==512&&g_bh==300)?"ok ":"FAIL", g_bx,g_by,g_bw,g_bh);
    (gImgValid) ? pass++ : fail++; printf("%s gImgValid set\n", gImgValid?"ok ":"FAIL");
    (memcmp(gImgBuf, gTestFrame, FRAME_BYTES) == 0) ? pass++ : fail++;
    printf("%s decoded screen == agent packed bytes (exact)\n", memcmp(gImgBuf, gTestFrame, FRAME_BYTES) == 0 ? "ok " : "FAIL");

    printf("\nrxtest: %d passed, %d failed\n", pass, fail);
    return fail ? 1 : 0;
}
