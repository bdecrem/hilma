/*
 * mux_rx.inc - the MUX framing parser for the Plus side of the .WIFI driver.
 * Shared VERBATIM between the driver (wifidrvr.c) and the host test (rxtest.c).
 *
 * Decodes the single shared byte stream from the mini multiplexer into
 * per-channel data, routing each payload to the channel's ring buffer via a
 * callback the including file defines BEFORE including this:
 *
 *   void MuxData(short chan, const unsigned char *bytes, short n);
 *   void MuxClosed(short chan);
 *   void MuxErr(short chan, const char *msg);
 *   void MuxPing(void);     // mux asked us to pong
 *
 * Wire (mini -> Plus), see agent-mux/src/protocol.ts:
 *   MUX <chan> <nbytes>\r\n<bytes>     data chunk (no trailing CRLF)
 *   MUXCLOSE <chan>\r\n
 *   MUXERR <chan> <msg>\r\n
 *   MUXPING\r\n / MUXPONG\r\n
 *
 * Pure state machine, no allocation, safe to drive from periodic time.
 */

#define MUXRX_LINEMAX 160

typedef struct {
    short state;            /* 0 = line mode, 1 = consuming payload */
    short lineLen;
    char  line[MUXRX_LINEMAX + 1];
    short dataChan;
    long  dataLeft;
} MuxRx;

#define MUXRX_LINE 0
#define MUXRX_DATA 1

static void MuxRxInit(MuxRx *r)
{
    r->state = MUXRX_LINE;
    r->lineLen = 0;
    r->dataChan = -1;
    r->dataLeft = 0;
}

static short MuxStrEq(const char *s, const char *p)
{
    short i;
    for (i = 0; p[i]; i++) if (s[i] != p[i]) return 0;
    return 1;
}

static long MuxNum(const char **pp)
{
    const char *p = *pp; long v = 0; short any = 0;
    while (*p == ' ') p++;
    while (*p >= '0' && *p <= '9') { v = v * 10 + (*p - '0'); p++; any = 1; }
    *pp = p;
    return any ? v : -1;
}

static void MuxRxLine(MuxRx *r)
{
    char *line = r->line;
    line[r->lineLen] = 0;

    if (MuxStrEq(line, "MUX ")) {
        const char *p = line + 4;
        long chan = MuxNum(&p), n = MuxNum(&p);
        if (chan < 0 || n < 0) return;
        if (n == 0) { return; }               /* empty chunk: nothing to route */
        r->dataChan = (short)chan;
        r->dataLeft = n;
        r->state = MUXRX_DATA;
        return;
    }
    if (MuxStrEq(line, "MUXCLOSE")) {
        const char *p = line + 8;
        long chan = MuxNum(&p);
        if (chan >= 0) MuxClosed((short)chan);
        return;
    }
    if (MuxStrEq(line, "MUXERR")) {
        const char *p = line + 6;
        long chan = MuxNum(&p);
        while (*p == ' ') p++;
        if (chan >= 0) MuxErr((short)chan, p);
        return;
    }
    if (MuxStrEq(line, "MUXPING")) { MuxPing(); return; }
    if (MuxStrEq(line, "MUXPONG")) { return; }
    /* unknown/echo/noise: ignore */
}

/* Feed received bytes; routes complete payloads to MuxData. */
static void MuxRxFeed(MuxRx *r, const unsigned char *buf, short len)
{
    short i = 0;
    while (i < len) {
        if (r->state == MUXRX_DATA) {
            short take = (short)((len - i) < r->dataLeft ? (len - i) : r->dataLeft);
            MuxData(r->dataChan, buf + i, take);
            i += take;
            r->dataLeft -= take;
            if (r->dataLeft == 0) { r->state = MUXRX_LINE; r->dataChan = -1; }
            continue;
        }
        {
            unsigned char b = buf[i++];
            if (b == '\r') continue;
            if (b == '\n') { MuxRxLine(r); r->lineLen = 0; continue; }
            if (r->lineLen < MUXRX_LINEMAX) r->line[r->lineLen++] = (char)b;
        }
    }
}
