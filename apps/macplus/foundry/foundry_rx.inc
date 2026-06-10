/*
 * foundry_rx.inc - the FND frame receive parser, shared VERBATIM between the
 * app (foundry.c) and the host test (rxtest.c).
 *
 * Wire format (agent -> Plus), lines end \r\n:
 *   FNDSTS <msg>                 build-log line
 *   FNDBIN <totalLen> <cksum>    MacBinary delivery begins
 *   <hex lines>                  uppercase hex, 128 bytes (256 chars) per line
 *   FNDEND                       delivery complete
 *   FNDERR <msg>                 failure
 *
 * The parser decodes hex to bytes, counts them, and keeps a 16-bit additive
 * checksum; FNDEND only reaches BinDone() if both match the FNDBIN header.
 *
 * Callbacks the including file must define BEFORE including this:
 *   void RxLog(const char *msg);                       FNDSTS
 *   void RxFail(const char *msg);                      FNDERR / integrity / abort
 *   void BinBegin(long total);                         FNDBIN
 *   void BinBytes(const unsigned char *b, short n);    decoded payload bytes
 *   void BinDone(void);                                verified complete
 */

#define FRX_IDLE 0
#define FRX_BIN  1

static short gRxState = FRX_IDLE;
static unsigned long gRxDeadline = 0;

#define FRX_LINEMAX 280
static char  gRxLineBuf[FRX_LINEMAX + 1];
static short gRxLineLen = 0;
static short gRxOverflow = 0;

static long          gBinTotal = 0;
static long          gBinCount = 0;
static unsigned short gBinSum = 0;
static unsigned short gBinWant = 0;

static short FrxStrEq(const char *s, const char *prefix)
{
    short i;
    for (i = 0; prefix[i]; i++)
        if (s[i] != prefix[i]) return 0;
    return 1;
}

static void FrxAbort(const char *msg)
{
    gRxState = FRX_IDLE;
    gBinTotal = gBinCount = 0;
    RxFail(msg);
}

static short FrxHexVal(char c)
{
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    return -1;
}

static void FrxHandleLine(void)
{
    char *line;
    gRxLineBuf[gRxLineLen] = 0;
    line = gRxLineBuf;

    if (FrxStrEq(line, "FNDSTS")) {
        RxLog(line[6] == ' ' ? line + 7 : "");
        return;
    }
    if (FrxStrEq(line, "FNDERR")) {
        FrxAbort(line[6] == ' ' ? line + 7 : "build failed");
        return;
    }
    if (FrxStrEq(line, "FNDBIN")) {
        /* FNDBIN <total> <cksum> */
        const char *p = line + 6;
        long total = 0; unsigned long want = 0;
        while (*p == ' ') p++;
        while (*p >= '0' && *p <= '9') { total = total * 10 + (*p - '0'); p++; }
        while (*p == ' ') p++;
        while (*p >= '0' && *p <= '9') { want = want * 10 + (unsigned long)(*p - '0'); p++; }
        if (total <= 0 || total > 900000L) { FrxAbort("bad delivery header"); return; }
        gBinTotal = total;
        gBinCount = 0;
        gBinSum = 0;
        gBinWant = (unsigned short)want;
        gRxState = FRX_BIN;
        BinBegin(total);
        return;
    }

    if (gRxState != FRX_BIN) return;       /* noise between frames: ignore */

    if (FrxStrEq(line, "FNDEND")) {
        gRxState = FRX_IDLE;
        if (gBinCount != gBinTotal)      { FrxAbort("short delivery - bytes missing"); return; }
        if (gBinSum != gBinWant)         { FrxAbort("checksum mismatch - delivery corrupted"); return; }
        BinDone();
        return;
    }

    /* a hex payload line */
    {
        unsigned char chunk[FRX_LINEMAX / 2];
        short n = 0, i = 0;
        if (gRxOverflow) { FrxAbort("wire line too long"); return; }
        if (gRxLineLen & 1) { FrxAbort("odd hex line"); return; }
        while (i < gRxLineLen) {
            short hi = FrxHexVal(line[i]);
            short lo = FrxHexVal(line[i + 1]);
            if (hi < 0 || lo < 0) { FrxAbort("bad hex in delivery"); return; }
            chunk[n] = (unsigned char)((hi << 4) | lo);
            gBinSum = (unsigned short)(gBinSum + chunk[n]);
            n++;
            i += 2;
        }
        gBinCount += n;
        if (gBinCount > gBinTotal) { FrxAbort("delivery longer than promised"); return; }
        if (n > 0) BinBytes(chunk, n);
    }
}

/* Feed one received byte into the parser. */
static void FeedRxByte(unsigned char b)
{
    if (b == '\r') return;
    if (b == '\n') {
        FrxHandleLine();
        gRxLineLen = 0;
        gRxOverflow = 0;
        return;
    }
    if (gRxLineLen < FRX_LINEMAX) gRxLineBuf[gRxLineLen++] = (char)b;
    else gRxOverflow = 1;
}
