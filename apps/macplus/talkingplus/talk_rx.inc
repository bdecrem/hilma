/*
 * talk_rx.inc - the TKM utterance parser, shared VERBATIM between the app
 * (talkingplus.c) and the host test (rxtest.c).
 *
 * Wire format (agent -> Plus), lines end \r\n:
 *   TKMSTS <msg>                  status
 *   TKMUTT <nWords> <moodCode>    an utterance begins
 *   T <text>                      speech-bubble text (+ continuation lines)
 *   + <more text>
 *   W <phonemes> | <displayWord>  one per spoken word, in order
 *   TKMEND
 *   TKMERR <msg>
 *
 * Callbacks the including file must define BEFORE including this:
 *   void RxLog(const char *msg);
 *   void RxFail(const char *msg);
 *   void UttBegin(short nWords, short mood);
 *   void UttText(const char *chunk, short first);   first=1 for the T line
 *   void UttWord(short idx, const char *phonemes, const char *display);
 *   void UttDone(void);
 */

#define TRX_IDLE 0
#define TRX_UTT  1

#define TRX_MAX_WORDS 120

static short gRxState = TRX_IDLE;
static unsigned long gRxDeadline = 0;

#define TRX_LINEMAX 220
static char  gRxLineBuf[TRX_LINEMAX + 1];
static short gRxLineLen = 0;

static short gTkWordsWant = 0, gTkWordsGot = 0;

static short TrxStrEq(const char *s, const char *prefix)
{
    short i;
    for (i = 0; prefix[i]; i++)
        if (s[i] != prefix[i]) return 0;
    return 1;
}

static void TrxAbort(const char *msg)
{
    gRxState = TRX_IDLE;
    RxFail(msg);
}

static long TrxNum(const char **pp)
{
    const char *p = *pp;
    long v = 0; short any = 0;
    while (*p == ' ') p++;
    while (*p >= '0' && *p <= '9') { v = v * 10 + (*p - '0'); p++; any = 1; }
    *pp = p;
    return any ? v : -1;
}

static void TrxHandleLine(void)
{
    char *line;
    gRxLineBuf[gRxLineLen] = 0;
    line = gRxLineBuf;

    if (TrxStrEq(line, "TKMSTS")) { RxLog(line[6] == ' ' ? line + 7 : ""); return; }
    if (TrxStrEq(line, "TKMERR")) { TrxAbort(line[6] == ' ' ? line + 7 : "failed"); return; }
    if (TrxStrEq(line, "TKMUTT")) {
        const char *p = line + 6;
        long nw = TrxNum(&p), mood = TrxNum(&p);
        if (nw < 1 || nw > TRX_MAX_WORDS) { TrxAbort("bad utterance header"); return; }
        if (mood < 0 || mood > 9) mood = 0;
        gTkWordsWant = (short)nw;
        gTkWordsGot = 0;
        gRxState = TRX_UTT;
        UttBegin((short)nw, (short)mood);
        return;
    }

    if (gRxState != TRX_UTT) return;       /* noise between frames */

    if (TrxStrEq(line, "TKMEND")) {
        gRxState = TRX_IDLE;
        if (gTkWordsGot != gTkWordsWant) { TrxAbort("words missing from utterance"); return; }
        UttDone();
        return;
    }
    if (line[0] == 'T' && line[1] == ' ') { UttText(line + 2, 1); return; }
    if (line[0] == '+' && line[1] == ' ') { UttText(line + 2, 0); return; }
    if (line[0] == 'W' && line[1] == ' ') {
        /* "W <phonemes> | <display>" */
        char *bar = 0;
        short i;
        const char *ph; const char *disp;
        for (i = 2; line[i]; i++) if (line[i] == '|') { bar = &line[i]; break; }
        if (!bar) { TrxAbort("malformed word line"); return; }
        /* split in place: trim spaces around the bar */
        { char *e = bar - 1; while (e > line + 2 && *e == ' ') *e-- = 0; *bar = 0; }
        ph = line + 2;
        disp = bar + 1;
        while (*disp == ' ') disp++;
        if (gTkWordsGot >= gTkWordsWant) { TrxAbort("too many words"); return; }
        UttWord(gTkWordsGot, ph, disp);
        gTkWordsGot++;
        return;
    }
    /* unknown line inside an utterance: tolerate */
}

static void FeedRxByte(unsigned char b)
{
    if (b == '\r') return;
    if (b == '\n') { TrxHandleLine(); gRxLineLen = 0; return; }
    if (gRxLineLen < TRX_LINEMAX) gRxLineBuf[gRxLineLen++] = (char)b;
}
