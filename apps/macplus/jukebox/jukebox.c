/*
 * Macinclaude Jukebox - the Mac Plus sings.
 * (System 6.0.8, 68000.) Built with Retro68.
 *
 * The Plus sends one line ("SONG <vibe>"); on the modern side Claude composes
 * an original melody + lyrics, and the score streams back as a tiny JBX frame
 * (notes as MIDI numbers + Mac-tick timings, see jukebox_rx.inc). This app
 * then PERFORMS it: the melody plays on the Sound Manager's square-wave
 * synth through the 1986 speaker, while the lyrics display karaoke-style
 * with a ball that bounces on the beat.
 *
 * Playback is clocked by TickCount from the event loop - the same clock
 * drives freqCmd/quietCmd note changes and the ball - so sound and screen
 * can't drift apart.
 */

#include <Quickdraw.h>
#include <Windows.h>
#include <Menus.h>
#include <Fonts.h>
#include <Events.h>
#include <TextEdit.h>
#include <Dialogs.h>
#include <ToolUtils.h>
#include <Sound.h>
#include <Memory.h>
#include <OSUtils.h>
#include <Devices.h>
#include <Files.h>
#include <Serial.h>
#include <SegLoad.h>

#ifndef geneva
#define geneva 3
#endif
#ifndef monaco
#define monaco 4
#endif
#ifndef systemFont
#define systemFont 0
#endif

/* ---- menus ---- */
#define kAppleMenu 128
#define kFileMenu  129
#define kEditMenu  130
#define kConnMenu  131
#define kJukeMenu  132

#define kFileQuit 1

#define kConnConnect    1
#define kConnDisconnect 2
/* 3 separator */
#define kConnSettings   4

#define kJukeNew    1
#define kJukeReplay 2
#define kJukeStop   3
/* 4 separator */
#define kJukeTest   5

/* ---- Settings dialog (jukebox.r DLOG/DITL 128) ---- */
#define kDlgSettings 128
#define kSave    1
#define kCancel  2
#define kSSID    4
#define kPass    6
#define kHost    8
#define kPortF   10
#define kRB1200  12
#define kRB2400  13
#define kRB9600  14
#define kRB19200 15
#define kFrame   17

/* ---- prompt dialog (jukebox.r DLOG/DITL 129) ---- */
#define kDlgPrompt  129
#define kPromptGo     1
#define kPromptCancel 2
#define kPromptLabel  3
#define kPromptEdit   4
#define kPromptFrame  5

/* ---- prefs ---- */
#define kPrefMagic   0x4A55      /* 'JU' */
#define kPrefVersion 1
#define kPrefName    "\pJukebox Prefs"
#define kPrefCreator 'JUKE'
#define kPrefType    'pref'

typedef struct {
    short          magic;
    short          version;
    short          baudIdx;
    unsigned short tcpPort;       /* 2328 = the jukebox agent */
    Str255         host;
    Str255         ssid;
    Str255         pass;
    Boolean        wifiSaved;
    Boolean        pad;
} Config;

static Config gCfg;
static Boolean gHaveCfg = false;
static short   gPrefVRef = 0;

/* ---- window ---- */
#define WIN_W 496
#define WIN_H 300

/* ---- the song ---- */
#define MAX_NOTES  800
#define MAX_LYRICS 64
#define LYR_CHARS  72

typedef struct { long start; short dur; unsigned char midi; unsigned char pad; } Note;
typedef struct { long start; long end; char text[LYR_CHARS]; } Lyric;

static Note   gNotes[MAX_NOTES];
static Lyric  gLyrics[MAX_LYRICS];
static short  gNNotes = 0, gNLyrics = 0;
static long   gTotalTicks = 0;
static short  gTPB = 30;                 /* ticks per beat */
static char   gTitle[64];
static Boolean gHaveSong = false;

/* ---- playback ---- */
static SndChannelPtr gChan = 0;
static Boolean gPlaying = false;
static unsigned long gT0 = 0;            /* TickCount at song start */
static short  gNoteIdx = 0;
static long   gNoteOff = -1;             /* tick to quiet the current note */
static short  gCurLyr = -1;
static short  gBallX = -1, gBallY = -1;  /* last drawn ball position */
static unsigned long gLastAnim = 0;

/* status text shown while idle/receiving */
static char gStatusLine[2][84];
static short gNStatus = 0;

/* the parser owns these; tentative so callbacks can reference */
static short gRxState;
#define JRX_IDLE 0

/* ---- globals ---- */
static WindowPtr  gWin;
static MenuHandle gAppleM, gFileM, gEditM, gConnM, gJukeM;
static Boolean    gDone = false;

static short   gInRef, gOutRef;
static Boolean gPortOpen = false;
static Boolean gConnected = false;

static char gSerRing[4096];
static char gSerBuf[2048];
static unsigned char gCap[1024];

typedef struct { const char *name; short config; } BaudEntry;
static const BaudEntry kBaudTab[] = {
    { "1200",  baud1200  + data8 + noParity + stop10 },
    { "2400",  baud2400  + data8 + noParity + stop10 },
    { "9600",  baud9600  + data8 + noParity + stop10 },
    { "19200", baud19200 + data8 + noParity + stop10 },
};
#define NBAUD 4

/* ================= small string helpers ================= */

static void StrLen(const char *s, long *n) { long i = 0; while (s[i]) i++; *n = i; }
static short strlenC(const char *s) { short n = 0; while (s[n]) n++; return n; }

static void CatLong(char *buf, short *len, long v)
{
    char tmp[12]; short n = 0;
    if (v < 0) { buf[(*len)++] = '-'; v = -v; }
    if (v == 0) tmp[n++] = '0';
    while (v > 0) { tmp[n++] = (char)('0' + (v % 10)); v /= 10; }
    while (n > 0) buf[(*len)++] = tmp[--n];
}
static void CatStr(char *buf, short *len, const char *s)
{
    short i; for (i = 0; s[i]; i++) buf[(*len)++] = s[i];
}

static void P2C(ConstStr255Param p, char *c)
{
    short i, n = p[0];
    for (i = 0; i < n; i++) c[i] = (char)p[i + 1];
    c[n] = 0;
}
static void C2P(const char *c, Str255 p)
{
    short n = 0;
    while (c[n] && n < 255) { p[n + 1] = (unsigned char)c[n]; n++; }
    p[0] = (unsigned char)n;
}

static Boolean Contains(const unsigned char *buf, short len, const char *needle)
{
    short i; long nl; StrLen(needle, &nl);
    if (nl == 0 || len < (short)nl) return false;
    for (i = 0; i + (short)nl <= len; i++) {
        short j; Boolean hit = true;
        for (j = 0; j < (short)nl; j++)
            if (buf[i + j] != (unsigned char)needle[j]) { hit = false; break; }
        if (hit) return true;
    }
    return false;
}

static short FindEnd(const unsigned char *buf, short len, const char *needle)
{
    short i; long nl; StrLen(needle, &nl);
    if (nl == 0 || len < (short)nl) return -1;
    for (i = 0; i + (short)nl <= len; i++) {
        short j; Boolean hit = true;
        for (j = 0; j < (short)nl; j++)
            if (buf[i + j] != (unsigned char)needle[j]) { hit = false; break; }
        if (hit) return (short)(i + (short)nl);
    }
    return -1;
}

/* ================= status (window title + idle screen lines) ================= */

static void DrawScreen(void);

static void SetStatus(const char *msg)
{
    Str255 t; short n = 0; char b[120];
    CatStr(b, &n, "Macinclaude Jukebox");
    if (msg && msg[0]) { CatStr(b, &n, " - "); CatStr(b, &n, msg); if (n > 100) n = 100; }
    b[n] = 0;
    C2P(b, t);
    if (gWin) SetWTitle(gWin, t);
}

static void AddStatus(const char *msg)
{
    short i;
    if (gNStatus < 2) gNStatus++;
    for (i = 0; i < 83 && msg[i]; i++) gStatusLine[gNStatus - 1][i] = msg[i];
    gStatusLine[gNStatus - 1][i] = 0;
    if (gNStatus == 2) {
        /* keep only the last two: shift */
        ;
    }
    if (!gPlaying) DrawScreen();
}

/* ================= sound ================= */

static void SndCmd(short cmd, short p1, long p2)
{
    SndCommand c;
    if (!gChan) return;
    c.cmd = cmd; c.param1 = p1; c.param2 = p2;
    SndDoImmediate(gChan, &c);
}

static Boolean OpenSound(void)
{
    OSErr err;
    if (gChan) return true;
    err = SndNewChannel(&gChan, noteSynth, 0, 0L);
    if (err != noErr) { gChan = 0; return false; }
    SndCmd(ampCmd, 255, 0);
    return true;
}

static void Hush(void) { SndCmd(quietCmd, 0, 0); }

/* ================= karaoke screen ================= */

static void CenterTextC(short y, const char *s, short font, short size, short face)
{
    Str255 p;
    C2P(s, p);
    TextFont(font); TextSize(size); TextFace(face);
    MoveTo((WIN_W - StringWidth(p)) / 2, y);
    DrawString(p);
}

#define BALL_R 5
#define BALL_BASE 150
#define BALL_TOP  116
#define LYR_Y     176
#define NEXT_Y    202

static void EraseBall(void)
{
    Rect r;
    if (gBallX < 0) return;
    SetRect(&r, gBallX - BALL_R - 1, BALL_TOP - BALL_R - 1,
            gBallX + BALL_R + 1, BALL_BASE + BALL_R + 1);
    EraseRect(&r);
    gBallX = -1;
}

static void DrawBall(short x, short y)
{
    Rect r;
    SetRect(&r, x - BALL_R, y - BALL_R, x + BALL_R, y + BALL_R);
    PaintOval(&r);
    gBallX = x; gBallY = y;
}

/* full redraw for the current mode */
static void DrawScreen(void)
{
    Rect r;
    SetPort(gWin);
    SetRect(&r, 0, 0, WIN_W, WIN_H);
    EraseRect(&r);
    gBallX = -1;

    if (gPlaying || gHaveSong) {
        CenterTextC(34, gTitle[0] ? gTitle : "(untitled)", systemFont, 12, bold);
        /* staff-ish divider */
        PenPat(&qd.gray);
        MoveTo(24, 48); LineTo(WIN_W - 24, 48);
        PenPat(&qd.black);

        if (gCurLyr >= 0 && gCurLyr < gNLyrics)
            CenterTextC(LYR_Y, gLyrics[gCurLyr].text, geneva, 12, bold);
        else if (gPlaying)
            CenterTextC(LYR_Y, "...", geneva, 12, 0);
        if (gCurLyr + 1 < gNLyrics)
            CenterTextC(NEXT_Y, gLyrics[gCurLyr + 1].text, geneva, 9, 0);

        /* progress trough */
        SetRect(&r, 24, WIN_H - 30, WIN_W - 24, WIN_H - 22);
        FrameRect(&r);
        if (gPlaying && gTotalTicks > 0) {
            long t = (long)(TickCount() - gT0);
            short w = (short)(((long)(WIN_W - 50)) * t / gTotalTicks);
            if (w > WIN_W - 50) w = WIN_W - 50;
            SetRect(&r, 25, WIN_H - 29, 25 + w, WIN_H - 23);
            PaintRect(&r);
        }
        if (!gPlaying) {
            CenterTextC(NEXT_Y + 26, "Cmd-R plays it again - Cmd-N asks for another", geneva, 9, 0);
        }
    } else {
        /* idle: a big quarter-note + the latest status lines */
        short cx = WIN_W / 2 - 8, cy = 96;
        SetRect(&r, cx - 12, cy - 8, cx + 8, cy + 6);
        PaintOval(&r);
        PenSize(3, 3);
        MoveTo(cx + 5, cy - 2); LineTo(cx + 5, cy - 56);
        PenSize(1, 1);
        MoveTo(cx + 5, cy - 56); LineTo(cx + 26, cy - 44);

        CenterTextC(140, "MACINCLAUDE JUKEBOX", systemFont, 12, bold);
        CenterTextC(160, "describe a song. the 1986 speaker sings it.", geneva, 9, 0);
        if (gNStatus > 0) CenterTextC(206, gStatusLine[0], monaco, 9, 0);
        if (gNStatus > 1) CenterTextC(220, gStatusLine[1], monaco, 9, 0);
        CenterTextC(258, "Jukebox menu > New Song...  (Cmd-N)", geneva, 9, 0);
    }
}

/* ================= playback engine (event-loop clocked) ================= */

static void StopPlayback(const char *why)
{
    if (!gPlaying) return;
    gPlaying = false;
    Hush();
    gCurLyr = gNLyrics > 0 ? gNLyrics - 1 : -1;
    DrawScreen();
    SetStatus(why);
}

static void StartPlayback(void)
{
    if (!gHaveSong || gNNotes == 0) { SysBeep(1); return; }
    if (!OpenSound()) { SetStatus("no sound channel - is this a Plus?"); return; }
    gPlaying = true;
    gT0 = TickCount();
    gNoteIdx = 0;
    gNoteOff = -1;
    gCurLyr = -1;
    gLastAnim = 0;
    DrawScreen();
    SetStatus(gTitle);
}

/* called every pass through the event loop */
static void PumpPlayback(void)
{
    long t;
    if (!gPlaying) return;
    t = (long)(TickCount() - gT0);

    /* note scheduling */
    while (gNoteIdx < gNNotes && gNotes[gNoteIdx].start <= t) {
        SndCmd(freqCmd, 0, (long)gNotes[gNoteIdx].midi);
        gNoteOff = gNotes[gNoteIdx].start + gNotes[gNoteIdx].dur;
        gNoteIdx++;
    }
    if (gNoteOff >= 0 && t >= gNoteOff &&
        !(gNoteIdx < gNNotes && gNotes[gNoteIdx].start <= gNoteOff + 1)) {
        Hush();                      /* a real gap (rest), not legato */
        gNoteOff = -1;
    }

    /* lyric line */
    {
        short want = gCurLyr;
        while (want + 1 < gNLyrics && gLyrics[want + 1].start <= t) want++;
        if (want != gCurLyr) {
            gCurLyr = want;
            DrawScreen();
        }
    }

    /* ball + progress, ~20 fps */
    if (TickCount() - gLastAnim >= 3) {
        gLastAnim = TickCount();
        SetPort(gWin);
        if (gCurLyr >= 0 && gCurLyr < gNLyrics &&
            t >= gLyrics[gCurLyr].start && t < gLyrics[gCurLyr].end) {
            Lyric *L = &gLyrics[gCurLyr];
            Str255 p;
            short tw, x0, x, y;
            long span = L->end - L->start;
            long into = t - L->start;
            long beatInto = into % gTPB;
            C2P(L->text, p);
            TextFont(geneva); TextSize(12); TextFace(bold);
            tw = StringWidth(p);
            x0 = (WIN_W - tw) / 2;
            x = x0 + (short)((long)tw * into / (span > 0 ? span : 1));
            /* parabola per beat */
            y = BALL_BASE - (short)(((long)(BALL_BASE - BALL_TOP) * 4 *
                    beatInto * (gTPB - beatInto)) / ((long)gTPB * gTPB));
            EraseBall();
            DrawBall(x, y);
        } else {
            EraseBall();
        }
        /* progress fill */
        if (gTotalTicks > 0) {
            Rect r;
            short w = (short)(((long)(WIN_W - 50)) * t / gTotalTicks);
            if (w > WIN_W - 50) w = WIN_W - 50;
            SetRect(&r, 25, WIN_H - 29, 25 + w, WIN_H - 23);
            PaintRect(&r);
        }
    }

    if (t > gTotalTicks) StopPlayback("that's the song - Cmd-R to replay");
}

/* ================= rx callbacks (jukebox_rx.inc contract) ================= */

static void RxLog(const char *msg) { AddStatus(msg); SetStatus("composing..."); }

static void RxFail(const char *msg)
{
    AddStatus(msg);
    SetStatus("failed");
    SysBeep(1);
}

static void SongBegin(short nNotes, short nLyrics, long totalTicks, short tpb)
{
    (void)nNotes; (void)nLyrics;
    StopPlayback("");
    gHaveSong = false;
    gNNotes = 0;
    gNLyrics = 0;
    gTotalTicks = totalTicks;
    gTPB = tpb;
    gTitle[0] = 0;
    SetStatus("receiving the score...");
}

static void SongTitle(const char *title)
{
    short i;
    for (i = 0; i < 63 && title[i]; i++) gTitle[i] = title[i];
    gTitle[i] = 0;
}

static void SongNote(short idx, short midi, long start, long dur)
{
    if (idx >= MAX_NOTES) return;
    gNotes[idx].midi = (unsigned char)midi;
    gNotes[idx].start = start;
    gNotes[idx].dur = (short)dur;
    if (idx >= gNNotes) gNNotes = idx + 1;
}

static void SongLyric(short idx, long start, long end, const char *text)
{
    short i;
    if (idx >= MAX_LYRICS) return;
    gLyrics[idx].start = start;
    gLyrics[idx].end = end;
    for (i = 0; i < LYR_CHARS - 1 && text[i]; i++) gLyrics[idx].text[i] = text[i];
    gLyrics[idx].text[i] = 0;
    if (idx >= gNLyrics) gNLyrics = idx + 1;
}

static void SongDone(void)
{
    gHaveSong = true;
    AddStatus("score received - performing!");
    StartPlayback();
}

#include "jukebox_rx.inc"

/* ================= serial plumbing (ring separate from scratch) ============ */

static void ConfigPort(short config)
{
    SerShk shk;
    SerReset(gOutRef, config);
    SerReset(gInRef,  config);
    shk.fXOn = 0; shk.fCTS = 0; shk.xOn = 0; shk.xOff = 0;
    shk.errs = 0; shk.evts = 0; shk.fInX = 0; shk.null = 0;
    SerHShake(gOutRef, &shk);
}

static Boolean OpenSerPort(void)
{
    OSErr err;
    if (gPortOpen) return true;
    err = OpenDriver("\p.AOut", &gOutRef);
    if (err == noErr) err = OpenDriver("\p.AIn", &gInRef);
    if (err != noErr) { SetStatus("could not open modem port"); return false; }
    SerSetBuf(gInRef, (Ptr)gSerRing, (short)sizeof(gSerRing));
    ConfigPort(kBaudTab[gCfg.baudIdx].config);
    gPortOpen = true;
    return true;
}

static void CloseSerPort(void)
{
    if (!gPortOpen) return;
    SerSetBuf(gInRef, (Ptr)gSerRing, 0);
    CloseDriver(gInRef);
    CloseDriver(gOutRef);
    gPortOpen = false;
}

static void DrainInput(void)
{
    long avail, cnt;
    if (!gPortOpen) return;
    while (SerGetBuf(gInRef, &avail) == noErr && avail > 0) {
        cnt = avail; if (cnt > (long)sizeof(gSerBuf)) cnt = sizeof(gSerBuf);
        FSRead(gInRef, &cnt, gSerBuf);
    }
}

static void SendBytes(const char *s, long n)
{
    long cnt = n;
    if (!gPortOpen) return;
    FSWrite(gOutRef, &cnt, (Ptr)s);
}
static void SendStr(const char *s) { long n; StrLen(s, &n); SendBytes(s, n); }

static short CaptureFor(short ticks, unsigned char *out, short cap)
{
    unsigned long deadline = TickCount() + (unsigned long)ticks;
    short total = 0; long avail, cnt;
    while ((long)(TickCount() - deadline) < 0) {
        if (SerGetBuf(gInRef, &avail) == noErr && avail > 0) {
            cnt = avail; if (cnt > (long)sizeof(gSerBuf)) cnt = sizeof(gSerBuf);
            if (FSRead(gInRef, &cnt, gSerBuf) == noErr) {
                short i;
                for (i = 0; i < (short)cnt; i++)
                    if (total < cap) out[total++] = (unsigned char)gSerBuf[i];
            }
        }
    }
    return total;
}

static void PumpReceive(void)
{
    long avail, cnt; short i;
    if (!gPortOpen) return;
    if (SerGetBuf(gInRef, &avail) != noErr || avail <= 0) {
        if (gRxState != JRX_IDLE && (long)(TickCount() - gRxDeadline) > 0)
            JrxAbort("timed out waiting for the agent");
        return;
    }
    cnt = avail; if (cnt > (long)sizeof(gSerBuf)) cnt = sizeof(gSerBuf);
    if (FSRead(gInRef, &cnt, gSerBuf) != noErr) return;
    for (i = 0; i < (short)cnt; i++) FeedRxByte((unsigned char)gSerBuf[i]);
    gRxDeadline = TickCount() + 180L * 60L;
}

/* ================= prefs ================= */

static void PrefsLocate(void)
{
    SysEnvRec env;
    if (SysEnvirons(curSysEnvVers, &env) == noErr) gPrefVRef = env.sysVRefNum;
    else gPrefVRef = 0;
}

static void SetDefaults(void)
{
    short i;
    gCfg.magic = kPrefMagic;
    gCfg.version = kPrefVersion;
    gCfg.baudIdx = 2;
    gCfg.tcpPort = 2328;
    { const char *h = "192.168.7.50"; gCfg.host[0] = 12;
      for (i = 0; i < 12; i++) gCfg.host[i + 1] = (unsigned char)h[i]; }
    gCfg.ssid[0] = 0;
    gCfg.pass[0] = 0;
    gCfg.wifiSaved = false;
}

static Boolean LoadPrefs(void)
{
    short refNum; long count;
    if (FSOpen(kPrefName, gPrefVRef, &refNum) != noErr) return false;
    count = sizeof(Config);
    SetFPos(refNum, fsFromStart, 0);
    if (FSRead(refNum, &count, (Ptr)&gCfg) != noErr || count != (long)sizeof(Config)) {
        FSClose(refNum); return false;
    }
    FSClose(refNum);
    if (gCfg.magic != kPrefMagic || gCfg.version != kPrefVersion) return false;
    if (gCfg.baudIdx < 0 || gCfg.baudIdx >= NBAUD) gCfg.baudIdx = 2;
    return true;
}

static void SavePrefs(void)
{
    short refNum; long count;
    Create(kPrefName, gPrefVRef, kPrefCreator, kPrefType);
    if (FSOpen(kPrefName, gPrefVRef, &refNum) != noErr) { SetStatus("could not save prefs"); return; }
    count = sizeof(Config);
    SetFPos(refNum, fsFromStart, 0);
    FSWrite(refNum, &count, (Ptr)&gCfg);
    SetEOF(refNum, (long)sizeof(Config));
    FSClose(refNum);
    FlushVol(NULL, gPrefVRef);
}

/* ================= modem operations ================= */

static Boolean ModemAlive(void)
{
    short tries, got;
    for (tries = 0; tries < 3; tries++) {
        DrainInput();
        SendStr("AT\r");
        got = CaptureFor(90, gCap, sizeof(gCap));
        if (Contains(gCap, got, "OK")) return true;
    }
    return false;
}

static Boolean JoinWiFi(void)
{
    char cmd[600]; short n; short got;
    char ssidC[256], passC[256];

    if (gCfg.ssid[0] == 0) { SetStatus("no SSID set"); return false; }
    if (!OpenSerPort()) return false;

    SetStatus("joining WiFi...");
    if (!ModemAlive()) { SetStatus("modem did not answer AT - check cable/power"); return false; }

    P2C(gCfg.ssid, ssidC);
    P2C(gCfg.pass, passC);

    n = 0; CatStr(cmd, &n, "ATW\"");
    CatStr(cmd, &n, ssidC); CatStr(cmd, &n, ",");
    CatStr(cmd, &n, passC); CatStr(cmd, &n, "\"\r");
    cmd[n] = 0;
    DrainInput();
    SendStr(cmd);
    got = CaptureFor(900, gCap, sizeof(gCap));

    if (Contains(gCap, got, "ERROR") || got == 0) { SetStatus("WiFi join failed - check SSID/password"); return false; }
    DrainInput();
    SendStr("AT&W\r");
    CaptureFor(90, gCap, sizeof(gCap));
    gCfg.wifiSaved = true;
    SetStatus("WiFi joined and saved");
    return true;
}

static Boolean DialAgent(void)
{
    char cmd[320]; short n; short got = 0;
    char hostC[256];
    unsigned long deadline;

    if (!OpenSerPort()) return false;

    SetStatus("connecting...");
    if (!ModemAlive()) { SetStatus("modem did not answer AT @ this baud"); return false; }

    P2C(gCfg.host, hostC);
    SetStatus("dialing...");

    n = 0; CatStr(cmd, &n, "ATDT\"");
    CatStr(cmd, &n, hostC); CatStr(cmd, &n, ":");
    CatLong(cmd, &n, (long)gCfg.tcpPort);
    CatStr(cmd, &n, "\"\r");
    cmd[n] = 0;
    DrainInput();
    SendStr(cmd);

    deadline = TickCount() + 600;
    while ((long)(TickCount() - deadline) < 0) {
        long avail, cnt;
        if (SerGetBuf(gInRef, &avail) == noErr && avail > 0) {
            cnt = avail; if (cnt > (long)sizeof(gSerBuf)) cnt = sizeof(gSerBuf);
            if (FSRead(gInRef, &cnt, gSerBuf) == noErr) {
                short i;
                for (i = 0; i < (short)cnt; i++)
                    if (got < (short)sizeof(gCap)) gCap[got++] = (unsigned char)gSerBuf[i];
            }
        }
        {
            short past = FindEnd(gCap, got, "CONNECT");
            if (past >= 0) {
                short i;
                gConnected = true;
                gRxState = JRX_IDLE;
                gRxDeadline = TickCount() + 60L * 60L;
                SetStatus("connected");
                gRxLineLen = 0;
                for (i = past; i < got; i++) FeedRxByte(gCap[i]);
                return true;
            }
        }
        if (Contains(gCap, got, "BUSY")) { SetStatus("BUSY - agent listener may be down"); return false; }
        if (Contains(gCap, got, "NO CARRIER") || Contains(gCap, got, "NO ANSWER")) {
            SetStatus("no answer - is the jukebox agent up?"); return false;
        }
    }
    if (got == 0) SetStatus("silence - WiFi not joined? try Settings");
    else          SetStatus("unexpected reply from modem");
    return false;
}

static void Disconnect(void)
{
    if (!gPortOpen) { gConnected = false; return; }
    if (gConnected) {
        SendStr("+++");
        CaptureFor(90, gCap, sizeof(gCap));
        SendStr("ATH\r");
        CaptureFor(60, gCap, sizeof(gCap));
    }
    gConnected = false;
    gRxState = JRX_IDLE;
    SetStatus("disconnected");
}

/* ================= sending ================= */

#ifdef JUKE_TEST
#include "test_song.h"   /* gTestSong[] - Daisy Bell as a real JBX frame */
static void LoadTestSong(void)
{
    long i, n;
    StrLen(gTestSong, &n);
    for (i = 0; i < n; i++) FeedRxByte((unsigned char)gTestSong[i]);
}
#endif

static void SendSong(const char *vibe)
{
#ifdef JUKE_TEST
    (void)vibe;
    LoadTestSong();
    return;
#else
    char cmd[280]; short n = 0;
    if (!gConnected) { SetStatus("not connected - use Connection > Connect"); SysBeep(1); return; }
    StopPlayback("");
    CatStr(cmd, &n, "SONG ");
    CatStr(cmd, &n, vibe);
    cmd[n] = 0;
    SendStr(cmd);
    SendStr("\r");
    gRxDeadline = TickCount() + 180L * 60L;
    SetStatus("sent...");
#endif
}

/* ================= dialogs (the proven set) ================= */

static void SetDlgText(DialogPtr d, short item, ConstStr255Param s)
{
    short t; Handle h; Rect b;
    GetDialogItem(d, item, &t, &h, &b);
    SetDialogItemText(h, s);
}
static void GetDlgText(DialogPtr d, short item, Str255 s)
{
    short t; Handle h; Rect b;
    GetDialogItem(d, item, &t, &h, &b);
    GetDialogItemText(h, s);
}
static ControlHandle DlgCtl(DialogPtr d, short item)
{
    short t; Handle h; Rect b;
    GetDialogItem(d, item, &t, &h, &b);
    return (ControlHandle)h;
}

static void ScrapFromTE(TEHandle te)
{
    short s = (*te)->selStart, e = (*te)->selEnd;
    if (e > s) {
        Handle ht = (*te)->hText;
        HLock(ht);
        ZeroScrap();
        PutScrap((long)(e - s), 'TEXT', (Ptr)(*ht + s));
        HUnlock(ht);
    }
}

static void ScrapIntoTE(TEHandle te)
{
    Handle h; long n, off = 0;
    h = NewHandle(0);
    if (!h) return;
    n = GetScrap(h, 'TEXT', &off);
    if (n > 0) {
        if ((*te)->selEnd > (*te)->selStart) TEDelete(te);
        HLock(h);
        TEInsert((Ptr)*h, n, te);
        HUnlock(h);
    } else {
        SysBeep(1);
    }
    DisposeHandle(h);
}

static short gFrameItem = kSave;
static pascal void FrameDefault(DialogPtr dlg, short itemNo)
{
    short t; Handle h; Rect box;
    (void)itemNo;
    GetDialogItem(dlg, gFrameItem, &t, &h, &box);
    InsetRect(&box, -4, -4);
    PenSize(3, 3);
    FrameRoundRect(&box, 16, 16);
    PenSize(1, 1);
}

static short gDefItem = kSave, gCanItem = kCancel;
static pascal Boolean KeyFilter(DialogPtr dlg, EventRecord *ev, short *itemHit)
{
    char ch, lc;
    DialogPeek dp = (DialogPeek)dlg;
    TEHandle te = dp->textH;
    if (ev->what != keyDown && ev->what != autoKey) return false;
    ch = ev->message & charCodeMask;
    if (ev->modifiers & cmdKey) {
        lc = ch;
        if (lc >= 'A' && lc <= 'Z') lc += 32;
        if (te && dp->editField >= 0) {
            if (lc == 'v') { ScrapIntoTE(te); ev->what = nullEvent; return false; }
            if (lc == 'c') { ScrapFromTE(te); ev->what = nullEvent; return false; }
            if (lc == 'x') {
                ScrapFromTE(te);
                if ((*te)->selEnd > (*te)->selStart) TEDelete(te);
                ev->what = nullEvent; return false;
            }
        }
        return false;
    }
    if (ch == 13 || ch == 3)  { *itemHit = gDefItem; return true; }
    if (ch == 27)             { *itemHit = gCanItem; return true; }
    return false;
}

static void SyncBaudRadios(DialogPtr d, short sel)
{
    SetControlValue(DlgCtl(d, kRB1200),  sel == 0);
    SetControlValue(DlgCtl(d, kRB2400),  sel == 1);
    SetControlValue(DlgCtl(d, kRB9600),  sel == 2);
    SetControlValue(DlgCtl(d, kRB19200), sel == 3);
}

static Boolean DoSettingsDialog(void)
{
    DialogPtr dlg;
    short item, baudSel;
    Str255 num;
    short t; Handle h; Rect box;
    Boolean saved = false;
    ModalFilterUPP filt;

    dlg = GetNewDialog(kDlgSettings, 0L, (WindowPtr)-1L);
    if (!dlg) { SetStatus("could not open Settings dialog"); return false; }
    gDefItem = kSave; gCanItem = kCancel; gFrameItem = kSave;
    filt = NewModalFilterUPP(KeyFilter);

    GetDialogItem(dlg, kFrame, &t, &h, &box);
    SetDialogItem(dlg, kFrame, t, (Handle)NewUserItemUPP(&FrameDefault), &box);

    SetDlgText(dlg, kSSID, gCfg.ssid);
    SetDlgText(dlg, kPass, gCfg.pass);
    SetDlgText(dlg, kHost, gCfg.host);
    NumToString((long)gCfg.tcpPort, num);
    SetDlgText(dlg, kPortF, num);
    baudSel = gCfg.baudIdx;
    SyncBaudRadios(dlg, baudSel);
    SelectDialogItemText(dlg, kSSID, 0, 32767);

    for (;;) {
        ModalDialog(filt, &item);
        if (item == kSave) {
            long pv;
            GetDlgText(dlg, kSSID, gCfg.ssid);
            GetDlgText(dlg, kPass, gCfg.pass);
            GetDlgText(dlg, kHost, gCfg.host);
            GetDlgText(dlg, kPortF, num);
            StringToNum(num, &pv);
            if (pv < 1) pv = 2328;
            gCfg.tcpPort = (unsigned short)pv;
            gCfg.baudIdx = baudSel;
            gCfg.magic = kPrefMagic;
            gCfg.version = kPrefVersion;
            saved = true;
            break;
        } else if (item == kCancel) {
            break;
        } else if (item >= kRB1200 && item <= kRB19200) {
            baudSel = item - kRB1200;
            SyncBaudRadios(dlg, baudSel);
        }
    }
    DisposeModalFilterUPP(filt);
    DisposeDialog(dlg);
    return saved;
}

static void DoSettings(void)
{
    if (gConnected) Disconnect();
    if (DoSettingsDialog()) {
        SavePrefs();
        gHaveCfg = true;
        SetStatus("settings saved");
        if (gPortOpen) ConfigPort(kBaudTab[gCfg.baudIdx].config);
        if (gCfg.ssid[0] != 0) { if (JoinWiFi()) SavePrefs(); }
    }
}

static Boolean DoPromptDialog(char *out, short cap)
{
    DialogPtr dlg;
    short item;
    short t; Handle h; Rect box;
    Boolean go = false;
    Str255 p;
    ModalFilterUPP filt;

    dlg = GetNewDialog(kDlgPrompt, 0L, (WindowPtr)-1L);
    if (!dlg) { SetStatus("could not open dialog"); return false; }
    gDefItem = kPromptGo; gCanItem = kPromptCancel; gFrameItem = kPromptGo;
    filt = NewModalFilterUPP(KeyFilter);

    GetDialogItem(dlg, kPromptFrame, &t, &h, &box);
    SetDialogItem(dlg, kPromptFrame, t, (Handle)NewUserItemUPP(&FrameDefault), &box);

    SetDlgText(dlg, kPromptEdit, "\p");
    SelectDialogItemText(dlg, kPromptEdit, 0, 32767);

    for (;;) {
        ModalDialog(filt, &item);
        if (item == kPromptGo) {
            GetDlgText(dlg, kPromptEdit, p);
            if (p[0] == 0) { SysBeep(1); continue; }
            P2C(p, out);
            if ((short)p[0] >= cap) out[cap - 1] = 0;
            go = true; break;
        } else if (item == kPromptCancel) {
            break;
        }
    }
    DisposeModalFilterUPP(filt);
    DisposeDialog(dlg);
    return go;
}

static void DoNewSong(void)
{
    char vibe[240];
    if (!DoPromptDialog(vibe, sizeof(vibe))) return;
    SendSong(vibe);
}

/* ================= menus / events ================= */

static void SyncMenus(void)
{
    Boolean up = gConnected;
#ifdef JUKE_TEST
    up = true;
#endif
    if (up) {
        DisableItem(gConnM, kConnConnect);
        EnableItem(gConnM, kConnDisconnect);
        EnableItem(gJukeM, kJukeNew);
    } else {
        EnableItem(gConnM, kConnConnect);
        DisableItem(gConnM, kConnDisconnect);
        DisableItem(gJukeM, kJukeNew);
    }
    if (gHaveSong) EnableItem(gJukeM, kJukeReplay);
    else           DisableItem(gJukeM, kJukeReplay);
    if (gPlaying)  EnableItem(gJukeM, kJukeStop);
    else           DisableItem(gJukeM, kJukeStop);
}

static void DoAbout(void)
{
    AddStatus("claude composes. the beeper performs. 1986 sings.");
}

static void DoMenu(long sel)
{
    short menu = HiWord(sel);
    short item = LoWord(sel);
    Str255 name;
    switch (menu) {
        case kAppleMenu:
            if (item == 1) DoAbout();
            else { GetMenuItemText(gAppleM, item, name); OpenDeskAcc(name); }
            break;
        case kFileMenu:
            if (item == kFileQuit) gDone = true;
            break;
        case kEditMenu:
            SystemEdit(item - 1);
            break;
        case kConnMenu:
            switch (item) {
                case kConnConnect:    if (!gConnected) DialAgent(); break;
                case kConnDisconnect: Disconnect();                 break;
                case kConnSettings:   DoSettings();                 break;
            }
            break;
        case kJukeMenu:
            switch (item) {
                case kJukeNew:    DoNewSong(); break;
                case kJukeReplay: StartPlayback(); break;
                case kJukeStop:   StopPlayback("stopped"); break;
#ifdef JUKE_TEST
                case kJukeTest:   LoadTestSong(); break;
#else
                case kJukeTest:   AddStatus("(test song is a Mini vMac build thing)"); break;
#endif
            }
            break;
    }
    SyncMenus();
    HiliteMenu(0);
}

static void HandleMouseDown(EventRecord *ev)
{
    WindowPtr win;
    short part = FindWindow(ev->where, &win);
    switch (part) {
        case inMenuBar:   DoMenu(MenuSelect(ev->where)); break;
        case inSysWindow: SystemClick(ev, win); break;
        case inDrag:      DragWindow(win, ev->where, &qd.screenBits.bounds); break;
        case inContent:   if (win != FrontWindow()) SelectWindow(win); break;
    }
}

static void HandleEvent(EventRecord *ev)
{
    char ch;
    switch (ev->what) {
        case mouseDown: HandleMouseDown(ev); break;
        case keyDown:
        case autoKey:
            ch = ev->message & charCodeMask;
            if (ev->modifiers & cmdKey) {
                if (ev->what == keyDown) {
                    long sel = MenuKey(ch);
                    if (HiWord(sel)) DoMenu(sel);
                }
            }
            break;
        case updateEvt: {
            WindowPtr w = (WindowPtr)ev->message;
            BeginUpdate(w);
            if (w == gWin) DrawScreen();
            EndUpdate(w);
            break;
        }
        case activateEvt: break;
    }
}

/* ================= setup / splash ================= */

static void SetUpMenus(void)
{
    Str255 appleTitle;
    appleTitle[0] = 1; appleTitle[1] = 0x14;

    gAppleM = NewMenu(kAppleMenu, appleTitle);
    AppendMenu(gAppleM, "\pAbout Macinclaude Jukebox");
    AppendMenu(gAppleM, "\p(-");
    AppendResMenu(gAppleM, 'DRVR');
    InsertMenu(gAppleM, 0);

    gFileM = NewMenu(kFileMenu, "\pFile");
    AppendMenu(gFileM, "\pQuit/Q");
    InsertMenu(gFileM, 0);

    gEditM = NewMenu(kEditMenu, "\pEdit");
    AppendMenu(gEditM, "\pUndo/Z;(-;Cut/X;Copy/C;Paste/V;Clear");
    InsertMenu(gEditM, 0);

    gConnM = NewMenu(kConnMenu, "\pConnection");
    AppendMenu(gConnM, "\pConnect/K;Disconnect;(-;Settings...");
    InsertMenu(gConnM, 0);

    gJukeM = NewMenu(kJukeMenu, "\pJukebox");
    AppendMenu(gJukeM, "\pNew Song.../N;Play Again/R;Stop/S;(-;Play Test Song");
    InsertMenu(gJukeM, 0);

    DrawMenuBar();
}

static void SetUpWindow(void)
{
    Rect r;
    short left = (qd.screenBits.bounds.right - WIN_W) / 2;
    short top  = qd.screenBits.bounds.top + 40;
    SetRect(&r, left, top, left + WIN_W, top + WIN_H);
    gWin = NewWindow(0L, &r, "\pMacinclaude Jukebox", true, documentProc,
                     (WindowPtr)-1L, false, 0);
    SetPort(gWin);
}

static void InitToolbox(void)
{
    InitGraf(&qd.thePort);
    InitFonts();
    InitWindows();
    InitMenus();
    TEInit();
    InitDialogs(0L);
    InitCursor();
    FlushEvents(everyEvent, 0);
}

static void CenterPStr(short y, ConstStr255Param s)
{
    MoveTo((WIN_W - StringWidth(s)) / 2, y); DrawString(s);
}

static void ShowSplash(void)
{
    Rect rp, bar, fill; short bx; long t;
    SetPort(gWin);
    SetRect(&rp, 0, 0, WIN_W, WIN_H); EraseRect(&rp);
    /* a pair of beamed eighth notes */
    {
        Rect r; short x = WIN_W / 2 - 34, y = 86;
        SetRect(&r, x - 10, y - 7, x + 6, y + 5); PaintOval(&r);
        SetRect(&r, x + 30, y - 13, x + 46, y - 1); PaintOval(&r);
        PenSize(3, 3);
        MoveTo(x + 3, y - 2); LineTo(x + 3, y - 50);
        MoveTo(x + 43, y - 8); LineTo(x + 43, y - 56);
        PenSize(5, 5);
        MoveTo(x + 3, y - 50); LineTo(x + 43, y - 56);
        PenSize(1, 1);
    }
    TextFont(systemFont); TextFace(bold); TextSize(20);
    CenterPStr(140, "\pMACINCLAUDE");
    CenterPStr(162, "\pJUKEBOX");
    TextFace(0); TextSize(12);
    CenterPStr(192, "\pdescribe a song. the beeper sings it.");
    bx = (WIN_W - 240) / 2;
    SetRect(&bar, bx, 208, bx + 240, 226);
    PenSize(2, 2); FrameRoundRect(&bar, 12, 12); PenSize(1, 1);
    SetRect(&fill, bx + 4, 212, bx + 4 + 232 * 38 / 100, 222); PaintRoundRect(&fill, 8, 8);
    TextSize(9);
    CenterPStr(252, "\pclaude writes the tune. quickdraw bounces the ball. you sing along.");
    Delay(120, &t);
    EraseRect(&rp);
}

int main(void)
{
    EventRecord ev;

    InitToolbox();
    SetUpMenus();
    SetUpWindow();

    ShowSplash();
    PrefsLocate();
    OpenSound();

    gHaveCfg = LoadPrefs();
#ifdef JUKE_TEST
    (void)gHaveCfg;
    gConnected = true;
    SetStatus("TEST BUILD");
    AddStatus("TEST BUILD - Jukebox > Play Test Song sings Daisy Bell.");
    DrawScreen();
#else
    if (!gHaveCfg) {
        SetDefaults();
        SetStatus("first run - set things up");
        if (DoSettingsDialog()) {
            SavePrefs();
            gHaveCfg = true;
            if (gCfg.ssid[0] != 0 && JoinWiFi()) SavePrefs();
        } else {
            SetStatus("setup cancelled - use Connection > Settings");
        }
    }
    if (gHaveCfg) DialAgent();
    DrawScreen();
#endif
    SyncMenus();

    while (!gDone) {
        long sleep = (gPlaying || (gConnected && gRxState != JRX_IDLE)) ? 1L : 15L;
        if (WaitNextEvent(everyEvent, &ev, sleep, 0L))
            HandleEvent(&ev);
        PumpPlayback();
#ifndef JUKE_TEST
        if (gConnected) PumpReceive();
#endif
    }
    StopPlayback("");
    if (gChan) { SndDisposeChannel(gChan, true); gChan = 0; }
    if (gConnected) Disconnect();
    if (gPortOpen) CloseSerPort();
    return 0;
}
