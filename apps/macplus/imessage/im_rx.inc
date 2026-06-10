/*
 * im_rx.inc - parser for the iMessage agent's line-tagged payload (the bytes
 * carried inside one MUX channel). Shared VERBATIM between the app (imessage.c)
 * and the host test (rxtest.c).
 *
 * The host file must define these callbacks BEFORE including:
 *   void ImListStart(void);
 *   void ImListRow(short idx, short unread, const char *name);
 *   void ImConvStart(short idx, const char *name);
 *   void ImMsg(char dir, const char *text);     // dir '>' = from me, '<' = in
 *   void ImCont(const char *text);              // continuation of prev message
 *   void ImEnd(void);                           // end of a LIST or CONV block
 *   void ImStatus(const char *msg);
 *   void ImError(const char *msg);
 *   void ImSent(short idx);
 *
 * Wire (agent -> Plus), see agent-imessage/src/protocol.ts:
 *   IMSTS <text> / IMERR <text> / IMSENT <idx>
 *   IMLIST  C <idx> <unread> <name> ...  IMEND
 *   IMCONV <idx> <name>  M <dir> <text>  + <text> ...  IMEND
 *
 * Pure line state machine, no allocation, safe to drive from the receive pump.
 */

#define IMRX_LINEMAX 220

typedef struct {
    short lineLen;
    char  line[IMRX_LINEMAX + 1];
} ImRx;

static void ImRxInit(ImRx *r) { r->lineLen = 0; }

static short ImStrEq(const char *s, const char *p)
{
    short i;
    for (i = 0; p[i]; i++) if (s[i] != p[i]) return 0;
    return 1;
}
static const char *ImSkipSp(const char *p) { while (*p == ' ') p++; return p; }
static long ImNum(const char **pp)
{
    const char *p = *pp; long v = 0; short any = 0;
    while (*p == ' ') p++;
    while (*p >= '0' && *p <= '9') { v = v * 10 + (*p - '0'); p++; any = 1; }
    *pp = p;
    return any ? v : -1;
}

static void ImRxLine(ImRx *r)
{
    char *line = r->line;
    line[r->lineLen] = 0;

    /* data rows first (most frequent), then the IM* keywords */
    if (ImStrEq(line, "C ")) {
        const char *p = line + 2;
        long idx = ImNum(&p), un = ImNum(&p);
        p = ImSkipSp(p);
        if (idx >= 0) ImListRow((short)idx, (short)(un < 0 ? 0 : un), p);
        return;
    }
    if (ImStrEq(line, "M ")) {
        const char *p = line + 2;
        char dir = *p;
        if (dir) p++;
        if (*p == ' ') p++;
        ImMsg(dir, p);
        return;
    }
    if (ImStrEq(line, "+ ")) { ImCont(line + 2); return; }
    if (ImStrEq(line, "IMLIST")) { ImListStart(); return; }
    if (ImStrEq(line, "IMCONV")) {
        const char *p = line + 6;
        long idx = ImNum(&p);
        p = ImSkipSp(p);
        ImConvStart((short)(idx < 0 ? 0 : idx), p);
        return;
    }
    if (ImStrEq(line, "IMEND"))  { ImEnd(); return; }
    if (ImStrEq(line, "IMSTS"))  { ImStatus(ImSkipSp(line + 5)); return; }
    if (ImStrEq(line, "IMSENT")) { const char *p = line + 6; long idx = ImNum(&p); ImSent((short)(idx < 0 ? 0 : idx)); return; }
    if (ImStrEq(line, "IMERR"))  { ImError(ImSkipSp(line + 5)); return; }
    /* unknown / echo / "CONNECT 9600" tail: ignore */
}

static void ImRxFeed(ImRx *r, const unsigned char *buf, short len)
{
    short i;
    for (i = 0; i < len; i++) {
        unsigned char b = buf[i];
        if (b == '\r') continue;
        if (b == '\n') { ImRxLine(r); r->lineLen = 0; continue; }
        if (r->lineLen < IMRX_LINEMAX) r->line[r->lineLen++] = (char)b;
    }
}
