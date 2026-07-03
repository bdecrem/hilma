/*
 * px_rx.inc — Daily Pixel wire-protocol parser, shared VERBATIM between the
 * Plus app (pixel.c) and the host test (rxtest.c), like surf_rx.inc/im_rx.inc.
 *
 * Feed raw received bytes to PxFeed(); it assembles lines and fires these
 * hooks, which the including file must define (static, after the include):
 *
 *   static void PxOnFrameStart(void);                          PXINFO 64 64
 *   static void PxOnRow(short row, const unsigned char *b8);   PXROW i <hex16>
 *   static void PxOnFrameEnd(void);                            PXEND
 *   static void PxOnPixel(short x, short y, short v);          PX x y v
 *   static void PxOnNote(const char *s);                       PXNOTE text
 *
 * Malformed/oversized lines are dropped (counted in gPxBad), never overflow.
 */

#define PX_W  64
#define PX_H  64
#define PX_RB 8
#define PX_LINE_MAX 200

static void PxOnFrameStart(void);
static void PxOnRow(short row, const unsigned char *b8);
static void PxOnFrameEnd(void);
static void PxOnPixel(short x, short y, short v);
static void PxOnNote(const char *s);

static char  gPxLine[PX_LINE_MAX + 1];
static short gPxLen = 0;
static short gPxOver = 0;      /* current line exceeded the cap — drop it */
static long  gPxBad = 0;       /* malformed lines seen (for tests/diag)   */

/* parse a non-negative decimal at s[*i]; advance past it; -1 if none */
static short PxNum(const char *s, short *i)
{
    long v = 0; short any = 0;
    while (s[*i] == ' ') (*i)++;
    while (s[*i] >= '0' && s[*i] <= '9') { v = v * 10 + (s[*i] - '0'); (*i)++; any = 1; if (v > 32000) v = 32000; }
    return any ? (short)v : -1;
}

static short PxHexNib(char c)
{
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

static short PxStarts(const char *s, const char *p)
{
    short i = 0;
    while (p[i]) { if (s[i] != p[i]) return 0; i++; }
    return i;   /* length of the prefix */
}

static void PxHandleLine(void)
{
    const char *s = gPxLine;
    short i;
    gPxLine[gPxLen] = 0;
    if (gPxLen == 0) return;

    if (PxStarts(s, "PXINFO ")) {
        short w, h; i = 7;
        w = PxNum(s, &i); h = PxNum(s, &i);
        if (w == PX_W && h == PX_H) PxOnFrameStart(); else gPxBad++;
        return;
    }
    if (PxStarts(s, "PXROW ")) {
        short row, k; unsigned char b8[PX_RB];
        i = 6;
        row = PxNum(s, &i);
        while (s[i] == ' ') i++;
        if (row < 0 || row >= PX_H) { gPxBad++; return; }
        for (k = 0; k < PX_RB; k++) {
            short hi = PxHexNib(s[i]), lo = (hi >= 0) ? PxHexNib(s[i + 1]) : -1;
            if (lo < 0) { gPxBad++; return; }
            b8[k] = (unsigned char)((hi << 4) | lo);
            i += 2;
        }
        PxOnRow(row, b8);
        return;
    }
    if (gPxLen == 5 && PxStarts(s, "PXEND")) { PxOnFrameEnd(); return; }
    if (PxStarts(s, "PXNOTE ")) { PxOnNote(s + 7); return; }
    if (PxStarts(s, "PXERR"))  { gPxBad++; return; }   /* surfaced via note? keep simple */
    if (PxStarts(s, "PX ")) {
        short x, y, v; i = 3;
        x = PxNum(s, &i); y = PxNum(s, &i); v = PxNum(s, &i);
        if (x >= 0 && x < PX_W && y >= 0 && y < PX_H && (v == 0 || v == 1))
            PxOnPixel(x, y, v);
        else gPxBad++;
        return;
    }
    gPxBad++;   /* noise / unknown line */
}

static void PxFeed(const unsigned char *buf, short len)
{
    short i;
    for (i = 0; i < len; i++) {
        unsigned char c = buf[i];
        if (c == '\r') continue;
        if (c == '\n') {
            if (!gPxOver) PxHandleLine();
            else gPxBad++;
            gPxLen = 0; gPxOver = 0;
            continue;
        }
        if (gPxLen < PX_LINE_MAX) gPxLine[gPxLen++] = (char)c;
        else gPxOver = 1;
    }
}
