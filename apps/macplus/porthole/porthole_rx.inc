/*
 * porthole_rx.inc — the Porthole receive path: binary frame state machine +
 * zlibss decompression into the 1-bit screen buffer. Shared verbatim between
 * porthole.c (the Plus app) and rxtest.c (the host test), so the wire parsing
 * and decode are verified off-hardware against a real agent frame.
 *
 * Depends on (defined by the includer before this file):
 *   CANVAS_W, CANVAS_H, CRB, FRAME_BYTES, ZCAP
 * Calls back into the includer:
 *   void PortBlit(short x, short y, short w, short h);   // paint a rect of gImgBuf
 *   void PortStatus(const char *msg);                    // status / error text
 */
#include <string.h>
#include "zlibss.h"

extern void PortBlit(short x, short y, short w, short h);
extern void PortStatus(const char *msg);

unsigned char gImgBuf[FRAME_BYTES];     /* the 1-bit screen we display */
int           gImgValid = 0;
static unsigned char gZBuf[ZCAP];       /* one compressed frame */
static unsigned char gRectBuf[FRAME_BYTES];  /* inflate target (a rect's rows) */
static zss_inflate   gInf;              /* ~35KB decompressor (BSS) */

enum { P_TYPE, P_FHDR, P_FDATA, P_TLEN, P_TDATA };
static short pState = P_TYPE;
static unsigned char pHdr[16]; static short pHdrLen;
static long  pCLen, pGot, pNeed;
static short pX, pY, pW, pH, pRB;
static char  pText[260];

/* inflate one finished compressed frame into gImgBuf at its rect, then blit. */
static void DecodeFrame(void)
{
    uint32_t outlen = 0; long need; short r;
    zss_inflate_init(&gInf);
    if (zss_inflate_run(&gInf, gZBuf, (uint32_t)pCLen, gRectBuf, (uint32_t)sizeof(gRectBuf), &outlen) != 0) {
        PortStatus("frame decode error"); return;
    }
    need = (long)pH * pRB;
    if ((long)outlen != need) { PortStatus("frame size mismatch"); return; }
    for (r = 0; r < pH; r++)
        memcpy(gImgBuf + (long)(pY + r) * CRB + (pX >> 3), gRectBuf + (long)r * pRB, pRB);
    gImgValid = 1;
    PortBlit(pX, pY, pW, pH);
}

void FeedByte(unsigned char b)
{
    switch (pState) {
    case P_TYPE:
        if (b == 'F') { pHdrLen = 0; pState = P_FHDR; }
        else if (b == 'S' || b == 'T') { pHdrLen = 0; pState = P_TLEN; }
        break;
    case P_FHDR:
        pHdr[pHdrLen++] = b;
        if (pHdrLen == 14) {           /* x,y,w,h,rb (u16 x5) + clen (u32) */
            pX = (pHdr[0] << 8) | pHdr[1]; pY = (pHdr[2] << 8) | pHdr[3];
            pW = (pHdr[4] << 8) | pHdr[5]; pH = (pHdr[6] << 8) | pHdr[7];
            pRB = (pHdr[8] << 8) | pHdr[9];
            pCLen = ((long)pHdr[10] << 24) | ((long)pHdr[11] << 16) | ((long)pHdr[12] << 8) | pHdr[13];
            pGot = 0;
            if (pCLen > 0 && pCLen <= (long)sizeof(gZBuf) &&
                pX >= 0 && pY >= 0 && pW > 0 && pH > 0 &&
                pX + pW <= CANVAS_W && pY + pH <= CANVAS_H && pRB == ((pW + 7) >> 3))
                pState = P_FDATA;
            else { PortStatus("bad frame header"); pState = P_TYPE; }
        }
        break;
    case P_FDATA:
        gZBuf[pGot++] = b;
        if (pGot >= pCLen) { DecodeFrame(); pState = P_TYPE; }
        break;
    case P_TLEN:
        pHdr[pHdrLen++] = b;
        if (pHdrLen == 2) { pNeed = (pHdr[0] << 8) | pHdr[1]; pGot = 0; pState = (pNeed == 0) ? P_TYPE : P_TDATA; }
        break;
    case P_TDATA:
        if (pGot < 255) pText[pGot] = (char)b;
        pGot++;
        if (pGot >= pNeed) { pText[(pNeed < 255) ? pNeed : 255] = 0; PortStatus(pText); pState = P_TYPE; }
        break;
    }
}

void RxReset(void) { pState = P_TYPE; }
int  RxBusy(void)  { return pState != P_TYPE; }
