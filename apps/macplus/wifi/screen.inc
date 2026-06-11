/*
 * screen.inc — on-demand framebuffer capture, baked into the WiFi service.
 * Included by wifi.c after muxclient.inc + the WIFIState definition.
 *
 * Whatever app is frontmost, when a "GRAB" line arrives on the reserved screen
 * channel we snapshot the 512x342 1-bit screen (qd.screenBits), PackBits-compress
 * it (Apple TN1023 — the same scheme MacPaint/PICT use), and stream it back as
 * BINARY on the screen channel:
 *   SCRB <w> <h> <rowBytes> <packedLen>\r   header line
 *   then the packed bytes in <=CHUNK pieces, STOP-AND-WAIT: after each piece we
 *   block for a "K\r" ack from the agent before sending the next.
 * The mini's agent-screen un-PackBits it, inverts (Mac 1=black vs PNG 0=black),
 * and writes a 1-bit PNG.
 *
 * Why binary PackBits, not hex+RLE: the raw frame is only 21,888 bytes; hex
 * doubles it and naive run-length *expands* on the dithered gray desktop. PackBits
 * sends a blank screen in ~342 bytes, the gray desktop in ~684, never expanding
 * past ~1/128 over raw.
 *
 * Why stop-and-wait acks: the Plus->modem uplink has NO hardware flow control and
 * the modem's WiFi uplink is slow, so blasting a multi-KB frame overruns the
 * modem and FSWrite blocks forever — freezing the app. Waiting for the agent to
 * confirm each chunk self-paces to the link's true speed: the next chunk only
 * goes out once the modem has drained the last one. Reliable, if not fast.
 *
 * The grab runs synchronously (blocks the app's loop for the send). Fine for an
 * on-demand "show me the screen" — it's a screenshot, not VNC.
 */

#define SCR_CHUNK   512             /* bytes per stop-and-wait window */
#define SCR_ACKWAIT 1200            /* ticks (~20s) to wait for a chunk ack */

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

/* Drain the serial link and feed the MUX parser until the agent's chunk ack
 * (gW->scrAck, set by MuxData when a "K" line lands on the screen channel) shows
 * up, or we time out. This is WIFIIdle's read body without the grab re-entry. */
static Boolean scrWaitAck(short timeoutTicks)
{
    unsigned long deadline = TickCount() + (unsigned long)timeoutTicks;
    long a, c;
    gW->scrAck = false;
    while ((long)(TickCount() - deadline) < 0) {
        if (SerGetBuf(gW->inRef, &a) == noErr && a > 0) {
            c = a; if (c > (long)sizeof(gW->serScratch)) c = sizeof(gW->serScratch);
            if (FSRead(gW->inRef, &c, gW->serScratch) == noErr)
                MuxRxFeed(&gW->rx, (const unsigned char *)gW->serScratch, (short)c);
        }
        if (gW->scrAck) return true;
        SystemTask();
    }
    return false;
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

    /* stop-and-wait: one chunk, then block for the agent's ack before the next.
     * If an ack never comes (agent gone / link wedged) we bail so the app frees. */
    for (off = 0; off < packed; off += SCR_CHUNK) {
        long c = packed - off; if (c > SCR_CHUNK) c = SCR_CHUNK;
        MuxSend(WIFI_SCREEN_CHAN, (const char *)(gScrPacked + off), c);
        if (!scrWaitAck(SCR_ACKWAIT)) break;
        SystemTask();
    }
}
