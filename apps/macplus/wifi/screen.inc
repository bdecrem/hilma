/*
 * screen.inc — on-demand framebuffer capture, baked into the WiFi service.
 * Included by wifi.c after muxclient.inc + the WIFIState definition.
 *
 * Whatever app is frontmost, when a "GRAB" line arrives on the reserved screen
 * channel we snapshot the 512x342 1-bit screen (qd.screenBits), run-length
 * encode it, hex the runs, and stream it back up the screen channel as:
 *   SCR <w> <h> <rowBytes>\r       header
 *   <hex run pairs>\r              lines of CCBB CCBB ... (count, raw byte)
 *   SCREND\r
 * The mini's agent-screen un-RLEs this back to the raw bitmap, inverts (Mac
 * 1=black vs PNG 0=black), and writes a PNG I can look at.
 *
 * The grab runs synchronously (blocks the app's loop for a few seconds). That's
 * fine for an on-demand "show me the screen" — it's a screenshot, not VNC.
 */

static const char kScrHex[] = "0123456789ABCDEF";

static void scrHex2(char *o, short *n, unsigned char b)
{
    o[(*n)++] = kScrHex[(b >> 4) & 0x0F];
    o[(*n)++] = kScrHex[b & 0x0F];
}

static void WIFIScreenGrab(void)
{
    BitMap *sb = &qd.screenBits;
    unsigned char *base = (unsigned char *)sb->baseAddr;
    short rb = (short)(sb->rowBytes & 0x3FFF);
    short w  = (short)(sb->bounds.right - sb->bounds.left);
    short h  = (short)(sb->bounds.bottom - sb->bounds.top);
    long total = (long)rb * (long)h;
    long i = 0;
    char line[256]; short ln = 0;
    char hdr[40]; short hn = 0;

    if (!base || total <= 0) return;

    /* header: SCR <w> <h> <rowBytes> */
    { const char *p = "SCR "; while (*p) hdr[hn++] = *p++; }
    MuxNumStr(hdr, &hn, w); hdr[hn++] = ' ';
    MuxNumStr(hdr, &hn, h); hdr[hn++] = ' ';
    MuxNumStr(hdr, &hn, rb); hdr[hn] = 0;
    MuxSendLine(WIFI_SCREEN_CHAN, hdr);

    /* RLE: (count<=255, raw byte) pairs, hex-encoded, ~240 chars per line */
    while (i < total) {
        unsigned char b = base[i];
        long run = 1;
        while (i + run < total && base[i + run] == b && run < 255) run++;
        i += run;
        scrHex2(line, &ln, (unsigned char)run);
        scrHex2(line, &ln, b);
        if (ln >= 240) {
            line[ln] = 0;
            MuxSendLine(WIFI_SCREEN_CHAN, line);
            ln = 0;
            SystemTask();   /* let the cursor/clock breathe between lines */
        }
    }
    if (ln > 0) { line[ln] = 0; MuxSendLine(WIFI_SCREEN_CHAN, line); }
    MuxSendLine(WIFI_SCREEN_CHAN, "SCREND");
}
