/*
 * jukebox_rx.inc - the JBX song-frame receive parser, shared VERBATIM between
 * the app (jukebox.c) and the host test (rxtest.c).
 *
 * Wire format (agent -> Plus), lines end \r\n:
 *   JBXSTS <msg>                                  status line
 *   JBXSON <nNotes> <nLyrics> <totalTicks> <ticksPerBeat>
 *   T <title>                                     (once, first)
 *   N <midi> <startTick> <durTicks>               midi 0 = rest/stop
 *   L <startTick> <endTick> <text>                a timed lyric line
 *   JBXEND                                        song complete
 *   JBXERR <msg>                                  failure
 *
 * Ticks are Mac ticks (1/60 s) from song start. Notes arrive sorted by
 * startTick; lyrics too. The parser validates counts and ranges; the host
 * supplies storage via callbacks:
 *
 *   void RxLog(const char *msg);
 *   void RxFail(const char *msg);
 *   void SongBegin(short nNotes, short nLyrics, long totalTicks, short tpb);
 *   void SongTitle(const char *title);
 *   void SongNote(short idx, short midi, long start, long dur);
 *   void SongLyric(short idx, long start, long end, const char *text);
 *   void SongDone(void);
 */

#define JRX_IDLE 0
#define JRX_SONG 1

#define JBX_MAX_NOTES  800
#define JBX_MAX_LYRICS 64

static short gRxState = JRX_IDLE;
static unsigned long gRxDeadline = 0;

#define JRX_LINEMAX 200
static char  gRxLineBuf[JRX_LINEMAX + 1];
static short gRxLineLen = 0;

static short gJbNotesWant = 0, gJbLyricsWant = 0;
static short gJbNotesGot = 0, gJbLyricsGot = 0;

static short JrxStrEq(const char *s, const char *prefix)
{
    short i;
    for (i = 0; prefix[i]; i++)
        if (s[i] != prefix[i]) return 0;
    return 1;
}

static void JrxAbort(const char *msg)
{
    gRxState = JRX_IDLE;
    RxFail(msg);
}

/* parse a non-negative long, advancing *pp past it and any leading spaces;
 * returns -1 if no digits */
static long JrxNum(const char **pp)
{
    const char *p = *pp;
    long v = 0;
    short any = 0;
    while (*p == ' ') p++;
    while (*p >= '0' && *p <= '9') { v = v * 10 + (*p - '0'); p++; any = 1; }
    *pp = p;
    return any ? v : -1;
}

static void JrxHandleLine(void)
{
    char *line;
    gRxLineBuf[gRxLineLen] = 0;
    line = gRxLineBuf;

    if (JrxStrEq(line, "JBXSTS")) {
        RxLog(line[6] == ' ' ? line + 7 : "");
        return;
    }
    if (JrxStrEq(line, "JBXERR")) {
        JrxAbort(line[6] == ' ' ? line + 7 : "song failed");
        return;
    }
    if (JrxStrEq(line, "JBXSON")) {
        const char *p = line + 6;
        long nn = JrxNum(&p), nl = JrxNum(&p), total = JrxNum(&p), tpb = JrxNum(&p);
        if (nn < 1 || nn > JBX_MAX_NOTES || nl < 0 || nl > JBX_MAX_LYRICS ||
            total < 60 || total > 60L * 60L * 10L || tpb < 10 || tpb > 240) {
            JrxAbort("bad song header");
            return;
        }
        gJbNotesWant = (short)nn;
        gJbLyricsWant = (short)nl;
        gJbNotesGot = 0;
        gJbLyricsGot = 0;
        gRxState = JRX_SONG;
        SongBegin((short)nn, (short)nl, total, (short)tpb);
        return;
    }

    if (gRxState != JRX_SONG) return;        /* noise between frames */

    if (JrxStrEq(line, "JBXEND")) {
        gRxState = JRX_IDLE;
        if (gJbNotesGot != gJbNotesWant)   { JrxAbort("notes missing from song"); return; }
        if (gJbLyricsGot != gJbLyricsWant) { JrxAbort("lyrics missing from song"); return; }
        SongDone();
        return;
    }

    if (line[0] == 'T' && line[1] == ' ') {
        SongTitle(line + 2);
        return;
    }
    if (line[0] == 'N' && line[1] == ' ') {
        const char *p = line + 1;
        long midi = JrxNum(&p), start = JrxNum(&p), dur = JrxNum(&p);
        if (midi < 0 || midi > 127 || start < 0 || dur < 1 || dur > 3600) {
            JrxAbort("bad note");
            return;
        }
        if (gJbNotesGot >= gJbNotesWant) { JrxAbort("too many notes"); return; }
        SongNote(gJbNotesGot, (short)midi, start, dur);
        gJbNotesGot++;
        return;
    }
    if (line[0] == 'L' && line[1] == ' ') {
        const char *p = line + 1;
        long start = JrxNum(&p), end = JrxNum(&p);
        if (start < 0 || end <= start) { JrxAbort("bad lyric timing"); return; }
        if (gJbLyricsGot >= gJbLyricsWant) { JrxAbort("too many lyrics"); return; }
        while (*p == ' ') p++;
        SongLyric(gJbLyricsGot, start, end, p);
        gJbLyricsGot++;
        return;
    }
    /* unknown line inside a song: tolerate */
}

static void FeedRxByte(unsigned char b)
{
    if (b == '\r') return;
    if (b == '\n') {
        JrxHandleLine();
        gRxLineLen = 0;
        return;
    }
    if (gRxLineLen < JRX_LINEMAX) gRxLineBuf[gRxLineLen++] = (char)b;
}
