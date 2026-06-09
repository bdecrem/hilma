/*
 * surf_rx.inc - the SRF frame receive parser, shared VERBATIM between the app
 * (surf.c) and the host test (rxtest.c), like atkinson_rx.inc.
 *
 * Wire format (agent -> Plus), one line at a time, \r\n terminated:
 *   SRFSTS <msg>     transient status
 *   SRFPAG           page begins
 *   T/H/P/Q/-/L/B/+  blocks (see agent-surf/README.md)
 *   SRFEND           page ends
 *   SRFERR <msg>     failure
 *
 * The parser assembles wire lines into complete BLOCKS (joining "+"
 * continuations with a space) and hands them to the host via callbacks the
 * including file must define BEFORE including this:
 *
 *   void PageClear(void);                                   SRFPAG seen
 *   void BlockReady(char style, const char *text,
 *                   short len, short link);                  one block
 *        style is 'T','H','P','Q','-','L','B'; for 'L' link is the number.
 *   void PageDone(void);                                    SRFEND seen
 *   void RxStatus(const char *msg);                         SRFSTS
 *   void RxError(const char *msg);                          SRFERR / abort
 */

/* parser states */
#define SRX_IDLE 0   /* nothing expected (frames may still arrive: welcome) */
#define SRX_WAIT 1   /* command sent, waiting for SRFPAG */
#define SRX_PAGE 2   /* inside a frame */

static short gRxState = SRX_IDLE;
static unsigned long gRxDeadline = 0;

#define SRX_LINEMAX 256
static char  gRxLineBuf[SRX_LINEMAX + 1];
static short gRxLineLen = 0;

/* block assembly: continuations join here before BlockReady fires */
#define SRX_BLOCKMAX 4096
static char  gBlkBuf[SRX_BLOCKMAX + 2];
static short gBlkLen = 0;
static char  gBlkStyle = 0;     /* 0 = no block pending */
static short gBlkLink = 0;

static short SrxStrEq(const char *s, const char *prefix)
{
    short i;
    for (i = 0; prefix[i]; i++)
        if (s[i] != prefix[i]) return 0;
    return 1;
}

static void SrxFlushBlock(void)
{
    if (gBlkStyle) {
        gBlkBuf[gBlkLen] = 0;
        BlockReady(gBlkStyle, gBlkBuf, gBlkLen, gBlkLink);
        gBlkStyle = 0;
        gBlkLen = 0;
        gBlkLink = 0;
    }
}

static void SrxStartBlock(char style, const char *text, short link)
{
    short i;
    SrxFlushBlock();
    gBlkStyle = style;
    gBlkLink = link;
    gBlkLen = 0;
    for (i = 0; text[i] && gBlkLen < SRX_BLOCKMAX; i++)
        gBlkBuf[gBlkLen++] = text[i];
}

static void SrxAppendBlock(const char *text)
{
    short i;
    if (!gBlkStyle) { SrxStartBlock('P', text, 0); return; }
    if (gBlkLen > 0 && gBlkLen < SRX_BLOCKMAX) gBlkBuf[gBlkLen++] = ' ';
    for (i = 0; text[i] && gBlkLen < SRX_BLOCKMAX; i++)
        gBlkBuf[gBlkLen++] = text[i];
}

static void SrxAbort(const char *msg)
{
    gBlkStyle = 0;
    gBlkLen = 0;
    gRxState = SRX_IDLE;
    RxError(msg);
}

static void SrxHandleLine(void)
{
    char *line;
    gRxLineBuf[gRxLineLen] = 0;
    line = gRxLineBuf;

    /* frame control lines work in any state */
    if (SrxStrEq(line, "SRFSTS")) {
        RxStatus(line[6] == ' ' ? line + 7 : "");
        return;
    }
    if (SrxStrEq(line, "SRFERR")) {
        SrxAbort(line[6] == ' ' ? line + 7 : "error");
        return;
    }
    if (SrxStrEq(line, "SRFPAG")) {
        gBlkStyle = 0;
        gBlkLen = 0;
        gRxState = SRX_PAGE;
        PageClear();
        return;
    }

    if (gRxState != SRX_PAGE) return;     /* modem noise / echoes: ignore */

    if (SrxStrEq(line, "SRFEND")) {
        SrxFlushBlock();
        gRxState = SRX_IDLE;
        PageDone();
        return;
    }

    /* block lines: <tag> [text] */
    {
        char tag = line[0];
        const char *rest = (line[1] == ' ') ? line + 2 : "";
        if (line[1] != 0 && line[1] != ' ') return;   /* malformed: skip */

        switch (tag) {
            case 'B':
                SrxFlushBlock();
                BlockReady('B', "", 0, 0);
                break;
            case '+':
                SrxAppendBlock(rest);
                break;
            case 'L': {
                /* "L <n> <label>" */
                short n = 0;
                const char *p = rest;
                while (*p >= '0' && *p <= '9') { n = n * 10 + (*p - '0'); p++; }
                if (*p == ' ') p++;
                SrxStartBlock('L', p, n);
                break;
            }
            case 'T': case 'H': case 'P': case 'Q': case '-':
                SrxStartBlock(tag, rest, 0);
                break;
            default:
                break;                                 /* unknown tag: skip */
        }
    }
}

/* Feed one received byte into the parser. */
static void FeedRxByte(unsigned char b)
{
    if (b == '\r') return;
    if (b == '\n') {
        SrxHandleLine();
        gRxLineLen = 0;
        return;
    }
    if (gRxLineLen < SRX_LINEMAX) gRxLineBuf[gRxLineLen++] = (char)b;
}
