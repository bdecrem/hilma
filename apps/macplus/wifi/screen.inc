/*
 * screen.inc — on-demand framebuffer capture, baked into the WiFi service.
 * Included by wifi.c after muxclient.inc + the WIFIState definition.
 *
 * Whatever app is frontmost, when a "GRAB" line arrives on the reserved screen
 * channel we snapshot the 512x342 1-bit screen (qd.screenBits), PackBits-compress
 * it (Apple TN1023 — the same scheme MacPaint/PICT use), and stream it back as
 * BINARY on the screen channel:
 *   SCRB <w> <h> <rowBytes> <packedLen>\r   header line
 *   <packedLen raw PackBits bytes>          count-delimited binary payload
 * The mini's agent-screen un-PackBits it, inverts (Mac 1=black vs PNG 0=black),
 * and writes a 1-bit PNG.
 *
 * Why binary PackBits, not hex+RLE: the raw frame is only 21,888 bytes; hex
 * doubles it and naive run-length *expands* on the dithered gray desktop. PackBits
 * sends a blank screen in ~342 bytes, the gray desktop in ~684, and never expands
 * past ~1/128 over raw — so a grab is a few KB and a couple seconds, not ~90.
 *
 * The grab runs synchronously (blocks the app's loop for the send). Fine for an
 * on-demand "show me the screen" — it's a screenshot, not VNC.
 */

#define SCR_FBMAX  21888L              /* 64 * 342 — the Plus screen, in bytes */
static unsigned char gScrPacked[SCR_FBMAX + SCR_FBMAX/128 + 64];   /* PackBits worst case */

/* PackBits-encode src[0..n) into out; returns the packed length. Mirrors the
 * agent's unpackBits exactly: literal packet hdr 0..127 = (len-1); run packet
 * hdr 129..254 = (257-count) followed by the repeated byte; 128 unused. */
static long scrPackBits(const unsigned char *src, long n, unsigned char *out)
{
    long i = 0, o = 0;
    while (i < n) {
        unsigned char b = src[i];
        long run = 1;
        while (i + run < n && src[i + run] == b && run < 128) run++;
        if (run >= 3) {                       /* worth a run packet */
            out[o++] = (unsigned char)(257 - run);
            out[o++] = b;
            i += run;
        } else {                              /* gather a literal packet */
            long litStart = i, lit = 0;
            while (i < n && lit < 128) {
                if (i + 2 < n && src[i] == src[i + 1] && src[i + 1] == src[i + 2]) break;
                i++; lit++;
            }
            out[o++] = (unsigned char)(lit - 1);
            { long k; for (k = 0; k < lit; k++) out[o++] = src[litStart + k]; }
        }
    }
    return o;
}

static void WIFIScreenGrab(void)
{
    BitMap *sb = &qd.screenBits;
    unsigned char *base = (unsigned char *)sb->baseAddr;
    short rb = (short)(sb->rowBytes & 0x3FFF);
    short w  = (short)(sb->bounds.right - sb->bounds.left);
    short h  = (short)(sb->bounds.bottom - sb->bounds.top);
    long total = (long)rb * (long)h;
    long packed, off;
    char hdr[48]; short hn = 0;

    if (!base || total <= 0 || total > SCR_FBMAX) return;

    packed = scrPackBits(base, total, gScrPacked);

    /* header line: SCRB <w> <h> <rb> <packedLen> */
    { const char *p = "SCRB "; while (*p) hdr[hn++] = *p++; }
    MuxNumStr(hdr, &hn, w);  hdr[hn++] = ' ';
    MuxNumStr(hdr, &hn, h);  hdr[hn++] = ' ';
    MuxNumStr(hdr, &hn, rb); hdr[hn++] = ' ';
    MuxNumStr(hdr, &hn, packed); hdr[hn] = 0;
    MuxSendLine(WIFI_SCREEN_CHAN, hdr);

    /* the packed payload, in chunks so the cursor/clock can breathe between them */
    for (off = 0; off < packed; off += 1024) {
        long c = packed - off; if (c > 1024) c = 1024;
        MuxSend(WIFI_SCREEN_CHAN, (const char *)(gScrPacked + off), c);
        SystemTask();
    }
}
