/*
 * The Talking Plus - a Claude-powered homage to the Talking Moose.
 * (System 6.0.8, 68000.) Built with Retro68.
 *
 * A wry 1-bit character lives in the window and SPEAKS ALOUD through the Mac
 * Plus's own speaker, using the 1986 MacinTalk text-to-speech driver. Claude,
 * on the mini, writes his lines from real data (Hacker News now; calendar /
 * inbox via an optional briefing) and transcribes them to MacinTalk phonemes;
 * this app speaks them word by word, flapping his mouth and lighting up each
 * word in a speech bubble in time with the voice.
 *
 * Speech path: the MacinTalk driver is a 'DRVR' resource named ".SPEECH"
 * inside the "MacinTalk" file (Apple's, NOT redistributed here - drop it on
 * the disk next to this app). We OpenResFile that file so the driver is in the
 * resource chain, OpenDriver(".SPEECH"), and PBWrite phoneme strings to it
 * (the documented MacinTalk calling convention). If the MacinTalk file is
 * absent (e.g. the emulator), he mimes - mouth-flap + word highlight, silent.
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
#include <Resources.h>
#include <Serial.h>
#include <SegLoad.h>

#ifndef geneva
#define geneva 3
#endif
#ifndef systemFont
#define systemFont 0
#endif

/* ---- menus ---- */
#define kAppleMenu 128
#define kFileMenu  129
#define kEditMenu  130
#define kConnMenu  131
#define kTalkMenu  132

#define kFileQuit 1

#define kConnConnect    1
#define kConnDisconnect 2
#define kConnSettings   4

#define kTalkWake 1
#define kTalkNews 2
#define kTalkSay  3
/* 4 sep */
#define kTalkTest 5

/* ---- Settings dialog (talkingplus.r DLOG/DITL 128) ---- */
#define kDlgSettings 128
#define kSave 1
#define kCancel 2
#define kSSID 4
#define kPass 6
#define kHost 8
#define kPortF 10
#define kRB1200 12
#define kRB2400 13
#define kRB9600 14
#define kRB19200 15
#define kFrame 17

/* ---- prompt dialog (talkingplus.r DLOG/DITL 129) ---- */
#define kDlgPrompt 129
#define kPromptGo 1
#define kPromptCancel 2
#define kPromptLabel 3
#define kPromptEdit 4
#define kPromptFrame 5

/* ---- prefs ---- */
#define kPrefMagic   0x544B      /* 'TK' */
#define kPrefVersion 1
#define kPrefName    "\pTalking Plus Prefs"
#define kPrefCreator 'TKMS'
#define kPrefType    'pref'

typedef struct {
    short magic, version, baudIdx;
    unsigned short tcpPort;
    Str255 host, ssid, pass;
    Boolean wifiSaved, pad;
} Config;

static Config gCfg;
static Boolean gHaveCfg = false;
static short gPrefVRef = 0;

/* ---- window ---- */
#define WIN_W 496
#define WIN_H 300

/* ---- the utterance ---- */
#define MAX_WORDS 120
#define WORD_CHARS 28
#define PH_CHARS 56
#define BUBBLE_CHARS 600

typedef struct { char disp[WORD_CHARS]; char ph[PH_CHARS]; } TWord;
static TWord  gWords[MAX_WORDS];
static short  gNWords = 0;
static char   gBubble[BUBBLE_CHARS];
static short  gBubbleLen = 0;
static short  gMood = 0;
static Boolean gHaveUtt = false;

/* bubble layout: wrapped lines into the bubble box */
#define BUB_MAXLINES 6
typedef struct { short off, len; } BubLine;
static BubLine gBubLines[BUB_MAXLINES];
static short   gNBubLines = 0;
/* per-word position for highlight: which bubble line + x range */
static short gWordLine[MAX_WORDS];
static short gWordX0[MAX_WORDS], gWordX1[MAX_WORDS];

/* ---- performance state ---- */
static Boolean gSpeaking = false;
static short   gSpeakIdx = 0;
static Boolean gMouthOpen = false;
static unsigned long gNextStep = 0;     /* for silent miming pacing */
static Boolean gBlink = false;
static unsigned long gNextBlink = 0;

/* ---- speech driver ---- */
static short   gSpeechRef = 0;          /* .SPEECH driver refNum, 0 = none */
static short   gMacinTalkResFile = -1;
static Boolean gCanSpeak = false;

/* parser owns these (talk_rx.inc, included after callbacks) */
static short gRxState;
#define TRX_IDLE 0

/* ---- globals ---- */
static WindowPtr gWin;
static MenuHandle gAppleM, gFileM, gEditM, gConnM, gTalkM;
static Boolean gDone = false;

static short gInRef, gOutRef;
static Boolean gPortOpen = false, gConnected = false;
static char gSerRing[4096], gSerBuf[2048];
static unsigned char gCap[1024];
static char gStatusMsg[100];

typedef struct { const char *name; short config; } BaudEntry;
static const BaudEntry kBaudTab[] = {
    { "1200",  baud1200  + data8 + noParity + stop10 },
    { "2400",  baud2400  + data8 + noParity + stop10 },
    { "9600",  baud9600  + data8 + noParity + stop10 },
    { "19200", baud19200 + data8 + noParity + stop10 },
};
#define NBAUD 4

/* ================= string helpers ================= */

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
static void CatStr(char *buf, short *len, const char *s) { short i; for (i = 0; s[i]; i++) buf[(*len)++] = s[i]; }
static void P2C(ConstStr255Param p, char *c) { short i, n = p[0]; for (i = 0; i < n; i++) c[i] = (char)p[i + 1]; c[n] = 0; }
static void C2P(const char *c, Str255 p) { short n = 0; while (c[n] && n < 255) { p[n + 1] = (unsigned char)c[n]; n++; } p[0] = (unsigned char)n; }

static Boolean Contains(const unsigned char *buf, short len, const char *needle)
{
    short i; long nl; StrLen(needle, &nl);
    if (nl == 0 || len < (short)nl) return false;
    for (i = 0; i + (short)nl <= len; i++) {
        short j; Boolean hit = true;
        for (j = 0; j < (short)nl; j++) if (buf[i + j] != (unsigned char)needle[j]) { hit = false; break; }
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
        for (j = 0; j < (short)nl; j++) if (buf[i + j] != (unsigned char)needle[j]) { hit = false; break; }
        if (hit) return (short)(i + (short)nl);
    }
    return -1;
}

static void SetStatus(const char *msg)
{
    Str255 t; short n = 0; char b[120];
    short i;
    for (i = 0; msg && msg[i] && i < 99; i++) gStatusMsg[i] = msg[i];
    gStatusMsg[i] = 0;
    CatStr(b, &n, "The Talking Plus");
    if (msg && msg[0]) { CatStr(b, &n, " - "); CatStr(b, &n, msg); if (n > 100) n = 100; }
    b[n] = 0; C2P(b, t);
    if (gWin) SetWTitle(gWin, t);
}

/* ================= the character ================= */

/* face geometry, centered in the lower portion of the window */
#define FACE_CX (WIN_W / 2)
#define FACE_TOP 150
#define HEAD_W 150
#define HEAD_H 120

static void DrawBubble(short highlightWord);

/* draw the character's head with the current mood + mouth + blink state */
static void DrawFace(void)
{
    Rect head, eyeL, eyeR, mouth, r;
    short hx = FACE_CX, hy = FACE_TOP + HEAD_H / 2;
    short ex = 30, ey = -14;

    SetPort(gWin);
    /* clear the face region */
    SetRect(&r, hx - HEAD_W / 2 - 12, FACE_TOP - 14, hx + HEAD_W / 2 + 12, FACE_TOP + HEAD_H + 26);
    EraseRect(&r);

    /* head: a chunky beige-box monitor with rounded screen */
    SetRect(&head, hx - HEAD_W / 2, FACE_TOP, hx + HEAD_W / 2, FACE_TOP + HEAD_H);
    PenSize(3, 3); FrameRoundRect(&head, 26, 26); PenSize(1, 1);
    /* little feet */
    SetRect(&r, hx - 30, FACE_TOP + HEAD_H, hx - 14, FACE_TOP + HEAD_H + 8); PaintRect(&r);
    SetRect(&r, hx + 14, FACE_TOP + HEAD_H, hx + 30, FACE_TOP + HEAD_H + 8); PaintRect(&r);

    /* eyes */
    if (gBlink) {
        MoveTo(hx - ex - 12, hy + ey); LineTo(hx - ex + 12, hy + ey);
        MoveTo(hx + ex - 12, hy + ey); LineTo(hx + ex + 12, hy + ey);
    } else {
        SetRect(&eyeL, hx - ex - 12, hy + ey - 12, hx - ex + 12, hy + ey + 12);
        SetRect(&eyeR, hx + ex - 12, hy + ey - 12, hx + ex + 12, hy + ey + 12);
        if (gMood == 4) { /* sleepy: half-lidded */
            FrameOval(&eyeL); FrameOval(&eyeR);
            SetRect(&r, eyeL.left, eyeL.top, eyeL.right, hy + ey); PaintRect(&r);
            SetRect(&r, eyeR.left, eyeR.top, eyeR.right, hy + ey); PaintRect(&r);
        } else {
            FrameOval(&eyeL); FrameOval(&eyeR);
            /* pupils */
            SetRect(&r, hx - ex - 4, hy + ey - 4, hx - ex + 4, hy + ey + 4); PaintOval(&r);
            SetRect(&r, hx + ex - 4, hy + ey - 4, hx + ex + 4, hy + ey + 4); PaintOval(&r);
        }
    }

    /* eyebrows by mood: 0 neutral 1 grumpy 2 excited 3 sly 4 sleepy */
    PenSize(2, 2);
    if (gMood == 1) {            /* grumpy: angled down toward center */
        MoveTo(hx - ex - 14, hy + ey - 20); LineTo(hx - ex + 10, hy + ey - 14);
        MoveTo(hx + ex + 14, hy + ey - 20); LineTo(hx + ex - 10, hy + ey - 14);
    } else if (gMood == 2) {     /* excited: raised arcs */
        MoveTo(hx - ex - 12, hy + ey - 20); LineTo(hx - ex + 12, hy + ey - 24);
        MoveTo(hx + ex - 12, hy + ey - 24); LineTo(hx + ex + 12, hy + ey - 20);
    } else if (gMood == 3) {     /* sly: one up, one flat */
        MoveTo(hx - ex - 12, hy + ey - 18); LineTo(hx - ex + 12, hy + ey - 24);
        MoveTo(hx + ex - 12, hy + ey - 18); LineTo(hx + ex + 12, hy + ey - 18);
    } else if (gMood != 4) {     /* neutral: flat */
        MoveTo(hx - ex - 12, hy + ey - 20); LineTo(hx - ex + 12, hy + ey - 20);
        MoveTo(hx + ex - 12, hy + ey - 20); LineTo(hx + ex + 12, hy + ey - 20);
    }
    PenSize(1, 1);

    /* mouth */
    {
        short my = FACE_TOP + HEAD_H - 30;
        if (gMouthOpen) {
            SetRect(&mouth, hx - 22, my - 10, hx + 22, my + 14);
            PaintRoundRect(&mouth, 14, 14);
        } else {
            PenSize(2, 2);
            if (gMood == 1) { /* grumpy: frown */
                MoveTo(hx - 20, my + 6); LineTo(hx - 6, my - 2);
                LineTo(hx + 6, my - 2); LineTo(hx + 20, my + 6);
            } else if (gMood == 2 || gMood == 3) { /* smile / smirk */
                MoveTo(hx - 20, my - 2); LineTo(hx - 6, my + 8);
                LineTo(hx + 6, my + 8); LineTo(hx + (gMood == 3 ? 22 : 20), my - 2);
            } else {
                MoveTo(hx - 20, my + 2); LineTo(hx + 20, my + 2);
            }
            PenSize(1, 1);
        }
    }
}

/* ================= speech bubble ================= */

#define BUB_L 24
#define BUB_T 18
#define BUB_R (WIN_W - 24)
#define BUB_B 132
#define BUB_PAD 12
#define BUB_LH 16

/* wrap gBubble into bubble lines, and record each word's screen rect for
 * highlighting. Words in gBubble are separated by single spaces and appear in
 * the same order as gWords[].disp (best effort: we re-walk by word index). */
static void LayoutBubble(void)
{
    short maxw = BUB_R - BUB_L - 2 * BUB_PAD;
    short i, lineStart = 0, x;
    short wi = 0;
    SetPort(gWin);
    TextFont(geneva); TextSize(12); TextFace(0);
    gNBubLines = 0;

    /* simple greedy wrap over gBubble characters at spaces */
    {
        short start = 0, lastSpace = -1, k;
        for (k = 0; k <= gBubbleLen; k++) {
            Boolean brk = (k == gBubbleLen);
            if (!brk && gBubble[k] == ' ') lastSpace = k;
            if (!brk) {
                if (TextWidth(gBubble, start, k - start) > maxw && lastSpace > start) {
                    if (gNBubLines < BUB_MAXLINES) {
                        gBubLines[gNBubLines].off = start;
                        gBubLines[gNBubLines].len = lastSpace - start;
                        gNBubLines++;
                    }
                    start = lastSpace + 1;
                    lastSpace = -1;
                }
            } else {
                if (gNBubLines < BUB_MAXLINES && k > start) {
                    gBubLines[gNBubLines].off = start;
                    gBubLines[gNBubLines].len = k - start;
                    gNBubLines++;
                }
            }
        }
    }
    (void)lineStart; (void)x; (void)i; (void)wi;

    /* map each word index to its rect by walking lines + word tokens in order */
    {
        short ln, pos, w = 0;
        for (ln = 0; ln < gNBubLines && w < gNWords; ln++) {
            short off = gBubLines[ln].off, len = gBubLines[ln].len;
            short cx = BUB_L + BUB_PAD;
            short tstart = off;
            for (pos = off; pos <= off + len && w < gNWords; pos++) {
                Boolean end = (pos == off + len) || gBubble[pos] == ' ';
                if (end && pos > tstart) {
                    short tw = TextWidth(gBubble, tstart, pos - tstart);
                    gWordLine[w] = ln;
                    gWordX0[w] = cx;
                    gWordX1[w] = cx + tw;
                    cx += tw + TextWidth(" ", 0, 1);
                    w++;
                    tstart = pos + 1;
                } else if (end) {
                    tstart = pos + 1;
                }
            }
        }
        /* any leftover words (count mismatch) get no highlight rect */
        for (; w < gNWords; w++) { gWordLine[w] = -1; }
    }
}

static void DrawBubble(short highlightWord)
{
    Rect b, r;
    short ln, y;
    SetPort(gWin);
    SetRect(&b, BUB_L, BUB_T, BUB_R, BUB_B);
    EraseRect(&b);
    PenSize(2, 2); FrameRoundRect(&b, 18, 18); PenSize(1, 1);
    /* tail pointing down toward the head */
    MoveTo(FACE_CX - 12, BUB_B); LineTo(FACE_CX, BUB_B + 12); LineTo(FACE_CX + 12, BUB_B);

    TextFont(geneva); TextSize(12); TextFace(0);
    y = BUB_T + BUB_PAD + 12;
    for (ln = 0; ln < gNBubLines; ln++) {
        MoveTo(BUB_L + BUB_PAD, y);
        DrawText(gBubble, gBubLines[ln].off, gBubLines[ln].len);
        y += BUB_LH;
    }
    /* highlight the current word */
    if (highlightWord >= 0 && highlightWord < gNWords && gWordLine[highlightWord] >= 0) {
        short hl = gWordLine[highlightWord];
        short hy = BUB_T + BUB_PAD + hl * BUB_LH;
        SetRect(&r, gWordX0[highlightWord] - 1, hy - 1, gWordX1[highlightWord] + 1, hy + 14);
        InvertRect(&r);
    }
}

static void DrawAll(short highlightWord)
{
    DrawBubble(highlightWord);
    DrawFace();
}

/* idle screen when no utterance yet */
static void DrawIdle(void)
{
    Rect r;
    SetPort(gWin);
    SetRect(&r, 0, 0, WIN_W, WIN_H);
    EraseRect(&r);
    gBubbleLen = 0; gNBubLines = 0;
    {
        const char *l1 = "...";
        short n = strlenC(l1);
        gBubbleLen = 0;
        { short i; for (i = 0; i < n; i++) gBubble[i] = l1[i]; gBubbleLen = n; }
    }
    gNWords = 0;
    LayoutBubble();
    DrawBubble(-1);
    DrawFace();
    TextFont(geneva); TextSize(9); TextFace(0);
    if (gStatusMsg[0]) {
        Str255 p; C2P(gStatusMsg, p);
        MoveTo((WIN_W - StringWidth(p)) / 2, WIN_H - 14);
        DrawString(p);
    }
}

/* ================= MacinTalk speech ================= */

/* Open the MacinTalk file's .SPEECH driver if the file is on the disk. */
static void OpenSpeech(void)
{
    short ref;
    OSErr err;
    gCanSpeak = false;
    gSpeechRef = 0;
    /* put MacinTalk's resources in the chain so OpenDriver can find ".SPEECH" */
    gMacinTalkResFile = OpenResFile("\pMacinTalk");
    err = OpenDriver("\p.SPEECH", &ref);
    if (err == noErr) { gSpeechRef = ref; gCanSpeak = true; }
}

static void CloseSpeech(void)
{
    if (gSpeechRef) { CloseDriver(gSpeechRef); gSpeechRef = 0; }
    if (gMacinTalkResFile >= 0) { CloseResFile(gMacinTalkResFile); gMacinTalkResFile = -1; }
    gCanSpeak = false;
}

/* Speak one phoneme C-string synchronously (PBWrite to .SPEECH). Blocks until
 * the word finishes - the documented MacinTalk calling convention. */
static void SpeakPhonemes(const char *ph)
{
    ParamBlockRec pb;
    long len;
    StrLen(ph, &len);
    if (!gCanSpeak || len == 0) return;
    pb.ioParam.ioCompletion = 0;
    pb.ioParam.ioRefNum = gSpeechRef;
    pb.ioParam.ioBuffer = (Ptr)ph;
    pb.ioParam.ioReqCount = len;
    pb.ioParam.ioPosMode = 0;
    pb.ioParam.ioPosOffset = 0;
    PBWriteSync(&pb);
}

/* ================= performance ================= */

static void StartPerforming(void)
{
    if (!gHaveUtt || gNWords == 0) return;
    gSpeaking = true;
    gSpeakIdx = 0;
    gMouthOpen = false;
    gNextStep = TickCount();
    SetStatus("speaking...");
}

static void StopPerforming(void)
{
    if (!gSpeaking) return;
    gSpeaking = false;
    gMouthOpen = false;
    DrawAll(-1);
    SetStatus(gCanSpeak ? "" : "(no MacinTalk file - miming)");
}

/* one step of the performance, called from the event loop */
static void PumpPerform(void)
{
    if (!gSpeaking) return;
    if (gSpeakIdx >= gNWords) { StopPerforming(); return; }
    if ((long)(TickCount() - gNextStep) < 0) return;

    /* open mouth + highlight this word */
    gMouthOpen = true;
    DrawAll(gSpeakIdx);

    if (gCanSpeak) {
        /* speak the word - this blocks while the speaker plays it */
        SpeakPhonemes(gWords[gSpeakIdx].ph);
        gMouthOpen = false;
        DrawFace();
        gNextStep = TickCount();          /* next word immediately */
    } else {
        /* silent mime: hold the open mouth a few ticks, then close + pause */
        long t;
        Delay(7, &t);
        gMouthOpen = false;
        DrawFace();
        gNextStep = TickCount() + 5;
    }
    gSpeakIdx++;
    if (gSpeakIdx >= gNWords) StopPerforming();
}

/* idle blink */
static void PumpBlink(void)
{
    if (gSpeaking) return;
    if ((long)(TickCount() - gNextBlink) < 0) return;
    if (!gBlink) {
        gBlink = true; DrawFace();
        gNextBlink = TickCount() + 8;     /* eyes shut ~1/8 s */
    } else {
        gBlink = false; DrawFace();
        gNextBlink = TickCount() + 120 + (Random() & 127);  /* 2-4 s */
    }
}

/* ================= rx callbacks (talk_rx.inc contract) ================= */

static void RxLog(const char *msg) { SetStatus(msg); DrawIdle(); }
static void RxFail(const char *msg) { SetStatus(msg); SysBeep(1); DrawIdle(); }

static void UttBegin(short nWords, short mood)
{
    (void)nWords;
    StopPerforming();
    gHaveUtt = false;
    gNWords = 0;
    gBubbleLen = 0;
    gMood = mood;
    SetStatus("listening...");
}

static void UttText(const char *chunk, short first)
{
    short i;
    if (!first && gBubbleLen < BUBBLE_CHARS - 1) gBubble[gBubbleLen++] = ' ';
    for (i = 0; chunk[i] && gBubbleLen < BUBBLE_CHARS - 1; i++) gBubble[gBubbleLen++] = chunk[i];
    gBubble[gBubbleLen] = 0;
}

static void UttWord(short idx, const char *phonemes, const char *display)
{
    short i;
    if (idx >= MAX_WORDS) return;
    for (i = 0; i < WORD_CHARS - 1 && display[i]; i++) gWords[idx].disp[i] = display[i];
    gWords[idx].disp[i] = 0;
    for (i = 0; i < PH_CHARS - 1 && phonemes[i]; i++) gWords[idx].ph[i] = phonemes[i];
    gWords[idx].ph[i] = 0;
    if (idx >= gNWords) gNWords = idx + 1;
}

static void UttDone(void)
{
    gHaveUtt = true;
    LayoutBubble();
    StartPerforming();
}

#include "talk_rx.inc"

/* ================= serial plumbing ================= */

static void ConfigPort(short config)
{
    SerShk shk;
    SerReset(gOutRef, config); SerReset(gInRef, config);
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
    CloseDriver(gInRef); CloseDriver(gOutRef);
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
static void SendBytes(const char *s, long n) { long cnt = n; if (gPortOpen) FSWrite(gOutRef, &cnt, (Ptr)s); }
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
                for (i = 0; i < (short)cnt; i++) if (total < cap) out[total++] = (unsigned char)gSerBuf[i];
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
        if (gRxState != TRX_IDLE && (long)(TickCount() - gRxDeadline) > 0)
            TrxAbort("timed out waiting for the agent");
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
    if (SysEnvirons(curSysEnvVers, &env) == noErr) gPrefVRef = env.sysVRefNum; else gPrefVRef = 0;
}
static void SetDefaults(void)
{
    short i;
    gCfg.magic = kPrefMagic; gCfg.version = kPrefVersion; gCfg.baudIdx = 2;
    gCfg.tcpPort = 2329;
    { const char *h = "192.168.7.50"; gCfg.host[0] = 12; for (i = 0; i < 12; i++) gCfg.host[i + 1] = (unsigned char)h[i]; }
    gCfg.ssid[0] = 0; gCfg.pass[0] = 0; gCfg.wifiSaved = false;
}
static Boolean LoadPrefs(void)
{
    short refNum; long count;
    if (FSOpen(kPrefName, gPrefVRef, &refNum) != noErr) return false;
    count = sizeof(Config); SetFPos(refNum, fsFromStart, 0);
    if (FSRead(refNum, &count, (Ptr)&gCfg) != noErr || count != (long)sizeof(Config)) { FSClose(refNum); return false; }
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
    count = sizeof(Config); SetFPos(refNum, fsFromStart, 0);
    FSWrite(refNum, &count, (Ptr)&gCfg); SetEOF(refNum, (long)sizeof(Config));
    FSClose(refNum); FlushVol(NULL, gPrefVRef);
}

/* ================= modem ================= */

static Boolean ModemAlive(void)
{
    short tries, got;
    for (tries = 0; tries < 3; tries++) {
        DrainInput(); SendStr("AT\r");
        got = CaptureFor(90, gCap, sizeof(gCap));
        if (Contains(gCap, got, "OK")) return true;
    }
    return false;
}
static Boolean JoinWiFi(void)
{
    char cmd[600]; short n, got; char ssidC[256], passC[256];
    if (gCfg.ssid[0] == 0) { SetStatus("no SSID set"); return false; }
    if (!OpenSerPort()) return false;
    SetStatus("joining WiFi...");
    if (!ModemAlive()) { SetStatus("modem did not answer AT - check cable/power"); return false; }
    P2C(gCfg.ssid, ssidC); P2C(gCfg.pass, passC);
    n = 0; CatStr(cmd, &n, "ATW\""); CatStr(cmd, &n, ssidC); CatStr(cmd, &n, ","); CatStr(cmd, &n, passC); CatStr(cmd, &n, "\"\r"); cmd[n] = 0;
    DrainInput(); SendStr(cmd);
    got = CaptureFor(900, gCap, sizeof(gCap));
    if (Contains(gCap, got, "ERROR") || got == 0) { SetStatus("WiFi join failed - check SSID/password"); return false; }
    DrainInput(); SendStr("AT&W\r"); CaptureFor(90, gCap, sizeof(gCap));
    gCfg.wifiSaved = true; SetStatus("WiFi joined and saved"); return true;
}
static Boolean DialAgent(void)
{
    char cmd[320]; short n, got = 0; char hostC[256]; unsigned long deadline;
    if (!OpenSerPort()) return false;
    SetStatus("connecting...");
    if (!ModemAlive()) { SetStatus("modem did not answer AT @ this baud"); return false; }
    P2C(gCfg.host, hostC);
    SetStatus("dialing...");
    n = 0; CatStr(cmd, &n, "ATDT\""); CatStr(cmd, &n, hostC); CatStr(cmd, &n, ":"); CatLong(cmd, &n, (long)gCfg.tcpPort); CatStr(cmd, &n, "\"\r"); cmd[n] = 0;
    DrainInput(); SendStr(cmd);
    deadline = TickCount() + 600;
    while ((long)(TickCount() - deadline) < 0) {
        long avail, cnt;
        if (SerGetBuf(gInRef, &avail) == noErr && avail > 0) {
            cnt = avail; if (cnt > (long)sizeof(gSerBuf)) cnt = sizeof(gSerBuf);
            if (FSRead(gInRef, &cnt, gSerBuf) == noErr) {
                short i; for (i = 0; i < (short)cnt; i++) if (got < (short)sizeof(gCap)) gCap[got++] = (unsigned char)gSerBuf[i];
            }
        }
        { short past = FindEnd(gCap, got, "CONNECT");
          if (past >= 0) {
              short i;
              gConnected = true; gRxState = TRX_IDLE; gRxDeadline = TickCount() + 60L * 60L;
              SetStatus("connected"); gRxLineLen = 0;
              for (i = past; i < got; i++) FeedRxByte(gCap[i]);
              return true;
          } }
        if (Contains(gCap, got, "BUSY")) { SetStatus("BUSY - agent listener may be down"); return false; }
        if (Contains(gCap, got, "NO CARRIER") || Contains(gCap, got, "NO ANSWER")) { SetStatus("no answer - is the agent up?"); return false; }
    }
    if (got == 0) SetStatus("silence - WiFi not joined? try Settings");
    else SetStatus("unexpected reply from modem");
    return false;
}
static void Disconnect(void)
{
    if (!gPortOpen) { gConnected = false; return; }
    if (gConnected) { SendStr("+++"); CaptureFor(90, gCap, sizeof(gCap)); SendStr("ATH\r"); CaptureFor(60, gCap, sizeof(gCap)); }
    gConnected = false; gRxState = TRX_IDLE; SetStatus("disconnected");
}

/* ================= sending ================= */

#ifdef TKM_TEST
#include "test_utterance.h"   /* gTestUtterance[] - a real TKM frame */
static void LoadTestUtterance(void)
{
    long i, n; StrLen(gTestUtterance, &n);
    for (i = 0; i < n; i++) FeedRxByte((unsigned char)gTestUtterance[i]);
}
#endif

static void SendCmd(const char *cmd)
{
#ifdef TKM_TEST
    (void)cmd;
    LoadTestUtterance();
    return;
#else
    if (!gConnected) { SetStatus("not connected - use Connection > Connect"); SysBeep(1); return; }
    StopPerforming();
    SendStr(cmd); SendStr("\r");
    gRxDeadline = TickCount() + 180L * 60L;
    SetStatus("asking...");
#endif
}

/* ================= dialogs (the proven set) ================= */

static void SetDlgText(DialogPtr d, short item, ConstStr255Param s) { short t; Handle h; Rect b; GetDialogItem(d, item, &t, &h, &b); SetDialogItemText(h, s); }
static void GetDlgText(DialogPtr d, short item, Str255 s) { short t; Handle h; Rect b; GetDialogItem(d, item, &t, &h, &b); GetDialogItemText(h, s); }
static ControlHandle DlgCtl(DialogPtr d, short item) { short t; Handle h; Rect b; GetDialogItem(d, item, &t, &h, &b); return (ControlHandle)h; }

static void ScrapFromTE(TEHandle te)
{
    short s = (*te)->selStart, e = (*te)->selEnd;
    if (e > s) { Handle ht = (*te)->hText; HLock(ht); ZeroScrap(); PutScrap((long)(e - s), 'TEXT', (Ptr)(*ht + s)); HUnlock(ht); }
}
static void ScrapIntoTE(TEHandle te)
{
    Handle h; long n, off = 0; h = NewHandle(0); if (!h) return;
    n = GetScrap(h, 'TEXT', &off);
    if (n > 0) { if ((*te)->selEnd > (*te)->selStart) TEDelete(te); HLock(h); TEInsert((Ptr)*h, n, te); HUnlock(h); } else SysBeep(1);
    DisposeHandle(h);
}
static short gFrameItem = kSave;
static pascal void FrameDefault(DialogPtr dlg, short itemNo)
{
    short t; Handle h; Rect box; (void)itemNo;
    GetDialogItem(dlg, gFrameItem, &t, &h, &box);
    InsetRect(&box, -4, -4); PenSize(3, 3); FrameRoundRect(&box, 16, 16); PenSize(1, 1);
}
static short gDefItem = kSave, gCanItem = kCancel;
static pascal Boolean KeyFilter(DialogPtr dlg, EventRecord *ev, short *itemHit)
{
    char ch, lc; DialogPeek dp = (DialogPeek)dlg; TEHandle te = dp->textH;
    if (ev->what != keyDown && ev->what != autoKey) return false;
    ch = ev->message & charCodeMask;
    if (ev->modifiers & cmdKey) {
        lc = ch; if (lc >= 'A' && lc <= 'Z') lc += 32;
        if (te && dp->editField >= 0) {
            if (lc == 'v') { ScrapIntoTE(te); ev->what = nullEvent; return false; }
            if (lc == 'c') { ScrapFromTE(te); ev->what = nullEvent; return false; }
            if (lc == 'x') { ScrapFromTE(te); if ((*te)->selEnd > (*te)->selStart) TEDelete(te); ev->what = nullEvent; return false; }
        }
        return false;
    }
    if (ch == 13 || ch == 3) { *itemHit = gDefItem; return true; }
    if (ch == 27) { *itemHit = gCanItem; return true; }
    return false;
}
static void SyncBaudRadios(DialogPtr d, short sel)
{
    SetControlValue(DlgCtl(d, kRB1200), sel == 0); SetControlValue(DlgCtl(d, kRB2400), sel == 1);
    SetControlValue(DlgCtl(d, kRB9600), sel == 2); SetControlValue(DlgCtl(d, kRB19200), sel == 3);
}
static Boolean DoSettingsDialog(void)
{
    DialogPtr dlg; short item, baudSel; Str255 num; short t; Handle h; Rect box; Boolean saved = false; ModalFilterUPP filt;
    dlg = GetNewDialog(kDlgSettings, 0L, (WindowPtr)-1L);
    if (!dlg) { SetStatus("could not open Settings dialog"); return false; }
    gDefItem = kSave; gCanItem = kCancel; gFrameItem = kSave;
    filt = NewModalFilterUPP(KeyFilter);
    GetDialogItem(dlg, kFrame, &t, &h, &box); SetDialogItem(dlg, kFrame, t, (Handle)NewUserItemUPP(&FrameDefault), &box);
    SetDlgText(dlg, kSSID, gCfg.ssid); SetDlgText(dlg, kPass, gCfg.pass); SetDlgText(dlg, kHost, gCfg.host);
    NumToString((long)gCfg.tcpPort, num); SetDlgText(dlg, kPortF, num);
    baudSel = gCfg.baudIdx; SyncBaudRadios(dlg, baudSel);
    SelectDialogItemText(dlg, kSSID, 0, 32767);
    for (;;) {
        ModalDialog(filt, &item);
        if (item == kSave) {
            long pv; GetDlgText(dlg, kSSID, gCfg.ssid); GetDlgText(dlg, kPass, gCfg.pass); GetDlgText(dlg, kHost, gCfg.host);
            GetDlgText(dlg, kPortF, num); StringToNum(num, &pv); if (pv < 1) pv = 2329;
            gCfg.tcpPort = (unsigned short)pv; gCfg.baudIdx = baudSel; gCfg.magic = kPrefMagic; gCfg.version = kPrefVersion;
            saved = true; break;
        } else if (item == kCancel) break;
        else if (item >= kRB1200 && item <= kRB19200) { baudSel = item - kRB1200; SyncBaudRadios(dlg, baudSel); }
    }
    DisposeModalFilterUPP(filt); DisposeDialog(dlg); return saved;
}
static void DoSettings(void)
{
    if (gConnected) Disconnect();
    if (DoSettingsDialog()) {
        SavePrefs(); gHaveCfg = true; SetStatus("settings saved");
        if (gPortOpen) ConfigPort(kBaudTab[gCfg.baudIdx].config);
        if (gCfg.ssid[0] != 0) { if (JoinWiFi()) SavePrefs(); }
    }
}
static Boolean DoPromptDialog(char *out, short cap)
{
    DialogPtr dlg; short item; short t; Handle h; Rect box; Boolean go = false; Str255 p; ModalFilterUPP filt;
    dlg = GetNewDialog(kDlgPrompt, 0L, (WindowPtr)-1L);
    if (!dlg) { SetStatus("could not open dialog"); return false; }
    gDefItem = kPromptGo; gCanItem = kPromptCancel; gFrameItem = kPromptGo;
    filt = NewModalFilterUPP(KeyFilter);
    GetDialogItem(dlg, kPromptFrame, &t, &h, &box); SetDialogItem(dlg, kPromptFrame, t, (Handle)NewUserItemUPP(&FrameDefault), &box);
    SetDlgText(dlg, kPromptEdit, "\p"); SelectDialogItemText(dlg, kPromptEdit, 0, 32767);
    for (;;) {
        ModalDialog(filt, &item);
        if (item == kPromptGo) { GetDlgText(dlg, kPromptEdit, p); if (p[0] == 0) { SysBeep(1); continue; } P2C(p, out); if ((short)p[0] >= cap) out[cap - 1] = 0; go = true; break; }
        else if (item == kPromptCancel) break;
    }
    DisposeModalFilterUPP(filt); DisposeDialog(dlg); return go;
}
static void DoTellHim(void)
{
    char topic[200]; char cmd[210]; short n = 0;
    if (!DoPromptDialog(topic, sizeof(topic))) return;
    CatStr(cmd, &n, "SAY "); CatStr(cmd, &n, topic); cmd[n] = 0;
    SendCmd(cmd);
}

/* ================= menus / events ================= */

static void SyncMenus(void)
{
    Boolean up = gConnected;
#ifdef TKM_TEST
    up = true;
#endif
    if (up) { DisableItem(gConnM, kConnConnect); EnableItem(gConnM, kConnDisconnect); EnableItem(gTalkM, kTalkWake); EnableItem(gTalkM, kTalkNews); EnableItem(gTalkM, kTalkSay); }
    else { EnableItem(gConnM, kConnConnect); DisableItem(gConnM, kConnDisconnect); DisableItem(gTalkM, kTalkWake); DisableItem(gTalkM, kTalkNews); DisableItem(gTalkM, kTalkSay); }
}
static void DoAbout(void)
{
    UttBegin(0, 3);
    gBubbleLen = 0;
    UttText("I am a small sarcastic ghost in a beige box. Claude writes my lines; I have been awake since 1986.", 1);
    gNWords = 0; LayoutBubble(); gHaveUtt = false; DrawBubble(-1); DrawFace();
}
static void DoMenu(long sel)
{
    short menu = HiWord(sel), item = LoWord(sel); Str255 name;
    switch (menu) {
        case kAppleMenu: if (item == 1) DoAbout(); else { GetMenuItemText(gAppleM, item, name); OpenDeskAcc(name); } break;
        case kFileMenu: if (item == kFileQuit) gDone = true; break;
        case kEditMenu: SystemEdit(item - 1); break;
        case kConnMenu:
            switch (item) { case kConnConnect: if (!gConnected) DialAgent(); break; case kConnDisconnect: Disconnect(); break; case kConnSettings: DoSettings(); break; }
            break;
        case kTalkMenu:
            switch (item) {
                case kTalkWake: SendCmd("WAKE"); break;
                case kTalkNews: SendCmd("NEWS"); break;
                case kTalkSay:  DoTellHim(); break;
#ifdef TKM_TEST
                case kTalkTest: LoadTestUtterance(); break;
#else
                case kTalkTest: SetStatus("(test line is a Mini vMac build thing)"); break;
#endif
            }
            break;
    }
    SyncMenus(); HiliteMenu(0);
}
static void HandleMouseDown(EventRecord *ev)
{
    WindowPtr win; short part = FindWindow(ev->where, &win);
    switch (part) {
        case inMenuBar: DoMenu(MenuSelect(ev->where)); break;
        case inSysWindow: SystemClick(ev, win); break;
        case inDrag: DragWindow(win, ev->where, &qd.screenBits.bounds); break;
        case inContent: if (win != FrontWindow()) SelectWindow(win); break;
    }
}
static void HandleEvent(EventRecord *ev)
{
    char ch;
    switch (ev->what) {
        case mouseDown: HandleMouseDown(ev); break;
        case keyDown: case autoKey:
            ch = ev->message & charCodeMask;
            if (ev->modifiers & cmdKey) { if (ev->what == keyDown) { long sel = MenuKey(ch); if (HiWord(sel)) DoMenu(sel); } }
            break;
        case updateEvt: {
            WindowPtr w = (WindowPtr)ev->message;
            BeginUpdate(w);
            if (w == gWin) { if (gHaveUtt) { DrawBubble(gSpeaking ? gSpeakIdx : -1); DrawFace(); } else DrawIdle(); }
            EndUpdate(w);
            break;
        }
        case activateEvt: break;
    }
}

/* ================= setup / splash ================= */

static void SetUpMenus(void)
{
    Str255 appleTitle; appleTitle[0] = 1; appleTitle[1] = 0x14;
    gAppleM = NewMenu(kAppleMenu, appleTitle);
    AppendMenu(gAppleM, "\pAbout The Talking Plus"); AppendMenu(gAppleM, "\p(-"); AppendResMenu(gAppleM, 'DRVR'); InsertMenu(gAppleM, 0);
    gFileM = NewMenu(kFileMenu, "\pFile"); AppendMenu(gFileM, "\pQuit/Q"); InsertMenu(gFileM, 0);
    gEditM = NewMenu(kEditMenu, "\pEdit"); AppendMenu(gEditM, "\pUndo/Z;(-;Cut/X;Copy/C;Paste/V;Clear"); InsertMenu(gEditM, 0);
    gConnM = NewMenu(kConnMenu, "\pConnection"); AppendMenu(gConnM, "\pConnect/K;Disconnect;(-;Settings..."); InsertMenu(gConnM, 0);
    gTalkM = NewMenu(kTalkMenu, "\pTalk"); AppendMenu(gTalkM, "\pWake Him Up/W;Read the News/J;Tell Him Something.../T;(-;Say Test Line"); InsertMenu(gTalkM, 0);
    DrawMenuBar();
}
static void SetUpWindow(void)
{
    Rect r; short left = (qd.screenBits.bounds.right - WIN_W) / 2; short top = qd.screenBits.bounds.top + 40;
    SetRect(&r, left, top, left + WIN_W, top + WIN_H);
    gWin = NewWindow(0L, &r, "\pThe Talking Plus", true, documentProc, (WindowPtr)-1L, false, 0);
    SetPort(gWin);
}
static void InitToolbox(void)
{
    InitGraf(&qd.thePort); InitFonts(); InitWindows(); InitMenus(); TEInit(); InitDialogs(0L); InitCursor();
    FlushEvents(everyEvent, 0);
    qd.randSeed = TickCount();
}
static void CenterPStr(short y, ConstStr255Param s) { MoveTo((WIN_W - StringWidth(s)) / 2, y); DrawString(s); }
static void ShowSplash(void)
{
    Rect rp; long t;
    SetPort(gWin); SetRect(&rp, 0, 0, WIN_W, WIN_H); EraseRect(&rp);
    /* a little talking head with sound waves */
    gMood = 3; gMouthOpen = true; DrawFace(); gMouthOpen = false;
    {
        short cx = FACE_CX + HEAD_W / 2 + 8, cy = FACE_TOP + HEAD_H / 2;
        short k;
        PenSize(2, 2);
        for (k = 1; k <= 3; k++) {
            Rect a; SetRect(&a, cx + k * 8 - 6, cy - k * 8, cx + k * 8 + 6, cy + k * 8);
            FrameArc(&a, 300, 120);
        }
        PenSize(1, 1);
    }
    TextFont(systemFont); TextFace(bold); TextSize(20);
    CenterPStr(52, "\pTHE TALKING PLUS");
    TextFace(0); TextSize(12);
    CenterPStr(78, "\phe speaks. he knows things. he was awake before you.");
    Delay(110, &t);
    EraseRect(&rp);
}

int main(void)
{
    EventRecord ev;
    InitToolbox(); SetUpMenus(); SetUpWindow();
    ShowSplash(); PrefsLocate();
    OpenSpeech();
    gNextBlink = TickCount() + 120;

    gHaveCfg = LoadPrefs();
#ifdef TKM_TEST
    (void)gHaveCfg;
    gConnected = true;
    SetStatus(gCanSpeak ? "TEST BUILD" : "TEST BUILD (no MacinTalk file - he will mime)");
    DrawIdle();
    LoadTestUtterance();
#else
    if (!gHaveCfg) {
        SetDefaults(); SetStatus("first run - set things up");
        if (DoSettingsDialog()) { SavePrefs(); gHaveCfg = true; if (gCfg.ssid[0] != 0 && JoinWiFi()) SavePrefs(); }
        else SetStatus("setup cancelled - use Connection > Settings");
    }
    DrawIdle();
    if (gHaveCfg) DialAgent();
#endif
    SyncMenus();

    while (!gDone) {
        long sleep = (gSpeaking || (gConnected && gRxState != TRX_IDLE)) ? 1L : 10L;
        if (WaitNextEvent(everyEvent, &ev, sleep, 0L)) HandleEvent(&ev);
        PumpPerform();
        PumpBlink();
#ifndef TKM_TEST
        if (gConnected) PumpReceive();
#endif
    }
    StopPerforming();
    CloseSpeech();
    if (gConnected) Disconnect();
    if (gPortOpen) CloseSerPort();
    return 0;
}
