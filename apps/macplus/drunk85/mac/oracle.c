/*
 * THE ORACLE — a mind from 1985, running on the Macintosh Plus.
 * System 6.0.8, 68000, black & white. Built with Retro68.
 *
 * A tiny language model trained from scratch on 1985 Usenet runs *locally* on
 * the Plus: you type a line, it answers in the voice of a cranky Usenet nerd.
 * No network, no cloud — the machine is thinking by itself.
 *
 * v2 (2026-07-04) — the "it must feel alive" pass, after the first hardware
 * run looked frozen (it wasn't: it was prefilling the prompt with no feedback
 * at -O0 speeds). What changed here:
 *   - the prompt is sent as "<line>\n\n": the training docs are
 *     "subject\n\nbody", so the model writes the body of a post whose
 *     subject is your question instead of continuing your sentence.
 *   - progress is visible always: loading dots at launch, one dot per prompt
 *     word while it reads (deleted before the reply streams in), then
 *     word-by-word streaming.
 *   - the event loop is pumped between tokens: the window drags/redraws,
 *     Cmd-. cancels a reply, Cmd-Q quits cleanly.
 *   - replies stop at a sentence end after ~20 tokens (cap 56) instead of
 *     grinding out 100 tokens (= many minutes).
 *   - AppLog streams launched/loaded/ask/reply events (+ timings) to the
 *     mini's all.log, so "crashed or just slow?" is answerable remotely.
 *   - Oracle menu gains Benchmark: prints measured s/token in the transcript
 *     (TickCount is emulated time in Mini vMac, so the number is REAL Plus
 *     seconds even when the emulator runs at 8x).
 *
 * Layout (full-screen window, close + zoom):
 *   [ inverted header band: THE ORACLE ]
 *   [ transcript (TextEdit, read-only, scrolls) : YOU: / ORACLE: ]
 *   ------------------------------------------------ separator
 *   [ >  input line (TextEdit, Return submits)      ]
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
#include <Resources.h>
#include <Files.h>         /* prefs file: remember local/remote across quits */

#include <stdio.h>         /* sprintf for the timing lines */

#include "winfull.inc"     /* full-screen window + close/zoom box */
#include "gpt.h"           /* the local inference engine (ported llama2.c)   */
#include "nettcp.h"        /* MacTCP to the mini -- for analytics only        */
#include "applog.inc"      /* per-reply stats -> mini ~/macplus-logs/all.log  */
/* Networking is for ANALYTICS ONLY and is brought up LAZILY (first idle,
 * AFTER the model loads) so it can never block or crash the load again -- the
 * earlier crash was MacTCP being touched during the ~18s load. */

/* The int8 model + tokenizer are embedded in the app as resources (see
 * oracle.r), so THE ORACLE is a single self-contained file -- no data files to
 * ship. If the resources are missing, we fall back to the demo voice. */
#define kModelType 'MODL'
#define kTokType   'TOKN'
#define kResID     128

/* Bump this every build so Bart can confirm which one is running (shown on the
 * load line and sent to the mini log). */
#define ORACLE_VER "v12"

/* Font IDs (classic constants not always exposed by the interfaces). */
#ifndef systemFont
#define systemFont 0       /* Chicago */
#endif
#ifndef geneva
#define geneva 3
#endif

/* ---- geometry (computed from the live full-screen portRect at run time) ---- */
static short WIN_W = 502, WIN_H = 300;   /* set for real in CreateTE/Relayout */
#define HEADER_H 22        /* inverted title band at the very top            */
#define TE_PAD   6         /* margin around the transcript                   */
#define INPUT_H  30        /* input strip: separator + one comfortable line  */
#define PROMPT_W 18        /* room for the "> " prompt left of the field     */

/* per-character streaming delay for the DEMO voice, in ticks (60/sec). */
#define STREAM_DELAY 2

/* reply shape: stop at a sentence end once past kMinReply, hard cap kMaxReply.
 * At ~2.7 chars/token that is a 50..150 char reply — a real post, not a saga. */
#define kMinReply 12
#define kMaxReply 30

/* ---- menus ---- */
#define kAppleMenu 128
#define kFileMenu  129
#define kOracleMenu 130
#define kLabMenu   131
/* Oracle menu items */
#define kAskAgain   1
/* item 2 = separator */
#define kClearItem  3
/* item 4 = separator */
#define kBenchItem  5
/* Lab menu items: experiment toggles + analytics + remote model */
#define kLabLUT    1     /* multiply table on/off */
#define kLabExp    2     /* table exp on/off      */
#define kLabAttn   3     /* int8 attention on/off */
#define kLabRemote 4     /* use the mini's smarter model */
/* item 5 = separator */
#define kLabStats  6     /* send stats to the mini now */

/* ---- globals ---- */
static WindowPtr  gWin;
static MenuHandle gAppleM, gFileM, gOracleM, gLabM;
static Boolean    gLogOpened = false;   /* lazy analytics link, opened post-load */
static Boolean    gRemote    = false;   /* route replies to the mini's agent-oracle */
#define kRemoteIP   "192.168.7.50"
#define kRemotePort 2338
static TEHandle   gTE;          /* transcript (read-only, scrolls)  */
static TEHandle   gInputTE;     /* the native local input line      */
static Boolean    gDone   = false;
static Boolean    gBusy   = false;   /* true while the Oracle is "thinking" */
static Boolean    gModelLoaded = false; /* true once GptInit succeeds       */
static char       gLast[256];        /* last prompt, for Ask Again */
static short      gLastLen = 0;

/* generation bookkeeping (reset per reply) */
static Boolean       gAbort;         /* Cmd-. pressed                        */
static Boolean       gSawEnd;        /* last piece ended a sentence          */
static Boolean       gStopPara;      /* piece carried a paragraph break      */
static Boolean       gDotsCleared;   /* prefill dots removed from transcript */
static short         gDotCount;      /* prefill dots currently shown         */
static short         gGenCount;      /* reply tokens so far                  */
static short         gPromptToks;    /* prompt positions (from tick)         */
static unsigned long gT0;            /* TickCount at GptGenerate entry       */
static unsigned long gTPrefill;      /* TickCount at first generated token   */
static Boolean       gBenchReport;   /* print the timing line after reply    */
static char          gPrevOrig;      /* last raw char emitted (spans pieces) */

/* ---- forward decls ---- */
static void CreateTE(void);
static void LayoutTE(void);
static void Relayout(void);
static void DrawHeader(void);
static void DrawInputChrome(void);
static void DrawWindow(void);
static void SendLine(void);
static void Respond(const char *prompt, short len);
static void HandleEvent(EventRecord *ev);
static void SavePrefs(void);
static void LoadModelIfNeeded(void);

/* ================= small helpers ================= */

static void MakePStr(Str255 s, const char *c)
{
    short i;
    for (i = 0; c[i] && i < 255; i++) s[i + 1] = c[i];
    s[0] = (unsigned char)i;
}
static void StrLen(const char *s, long *n) { long i = 0; while (s[i]) i++; *n = i; }

/* clock hook for the engine's phase timers */
static unsigned long OracleClock(void) { return (unsigned long)TickCount(); }

/* Open the analytics link once, lazily, at the first idle after the model is
 * loaded -- never during the load (that is what crashed before). Best-effort. */
static void LazyLogOpen(void)
{
    if (gLogOpened) return;
    gLogOpened = true;              /* try once; applog is best-effort/safe */
    AppLogOpen("Oracle");
    AppLog(gModelLoaded ? ORACLE_VER " ready (analytics on)" : ORACLE_VER " ready (model FAILED)");
}

/* After a reply, stream the config + phase timing to the mini's all.log:
 *   Oracle: run lut=1 exp=0 ptoks=8 gtoks=20 total=1234t mm=1010t (per-tok ...)
 * ticks are 1/60 s. This is how experiments are read without the emulator. */
static void SendRunStats(short ptoks, short gtoks)
{
    char b[200];
    unsigned long tot = GptTicksTotal(), mm = GptTicksMatmul();
    unsigned long rms = GptTicksRms(), qz = GptTicksQuant();
    unsigned long at = GptTicksAttn(), si = GptTicksSilu();
    unsigned long other = tot;
    if (other > mm + rms + qz + at + si) other -= (mm + rms + qz + at + si); else other = 0;
    sprintf(b, ORACLE_VER " run lut=%d exp=%d a8=%d toks=%d/%d total=%lu mm=%lu attn=%lu rms=%lu quant=%lu silu=%lu other=%lu",
            gUseLUT, gFixExp, gFixAttn, (int)ptoks, (int)gtoks, tot, mm, at, rms, qz, si, other);
    AppLog(b);
}

/* ================= transcript (TextEdit) ================= */

static void ScrollToBottom(void)
{
    short totalH, viewH, desiredTop, delta;
    totalH = (*gTE)->nLines * (*gTE)->lineHeight;
    viewH  = (*gTE)->viewRect.bottom - (*gTE)->viewRect.top;
    desiredTop = (*gTE)->viewRect.top - ((totalH > viewH) ? (totalH - viewH) : 0);
    delta = desiredTop - (*gTE)->destRect.top;
    if (delta != 0) TEScroll(0, delta, gTE);
}

/* Insert raw text at the end of the transcript, capping total length. */
static void Emit(const char *s)
{
    long n; StrLen(s, &n);
    if (n <= 0) return;
    if ((*gTE)->teLength + n > 28000) {   /* trim from the top when it fills */
        TESetSelect(0, 12000, gTE);
        TEDelete(gTE);
    }
    TESetSelect(32767, 32767, gTE);
    TEInsert((Ptr)s, n, gTE);
    ScrollToBottom();
}
static void EmitLine(const char *s) { Emit(s); Emit("\r"); }

/* Stream text into the transcript one character at a time (demo voice). */
static void StreamText(const char *s)
{
    long i, n; StrLen(s, &n);
    char one[2]; one[1] = 0;
    unsigned long t;
    for (i = 0; i < n; i++) {
        one[0] = s[i];
        TESetSelect(32767, 32767, gTE);
        TEInsert((Ptr)one, 1, gTE);
        ScrollToBottom();
        Delay(STREAM_DELAY, &t);
    }
}

/* ================= "thinking" cursor ================= */

static void BusyOn(void)  { SetCursor(*GetCursor(watchCursor)); gBusy = true; }
static void BusyOff(void) { InitCursor(); gBusy = false; }

/* A short animated ellipsis so a pause reads as deliberation, not a hang. */
static void ThinkBeat(void)
{
    short k; unsigned long t;
    Emit("ORACLE: ");
    for (k = 0; k < 3; k++) { Emit("."); Delay(14, &t); }
    Emit(" ");
}

/* ================= demo voice (model missing) ================= */

static const char *kStub[] = {
    "well sure, but the Apple ][ did that in 1979 and nobody clapped. "
    "the IBM (sp?) crowd will tell you otherwise, they always do.",

    "i have been awake since 1986 and let me tell you, 512K is plenty "
    "if you are not running some bloated hog of a program.",

    "flame me all you want. the real problem is your terminal settings, "
    "it is ALWAYS the terminal settings. check your baud rate.",

    "funny you should ask. reminds me of a thread on net.flame where "
    "some poor soul lost a whole weekend to a missing semicolon.",
};
#define kStubN 4

/* ================= event pump (used BETWEEN tokens) =================
 * A forward pass takes seconds; without this the app looks dead and the
 * user can't cancel. Drains the queue: updates + drags work, Cmd-. aborts,
 * Cmd-Q aborts and quits. Content clicks and typing are swallowed (busy). */
static void PumpEvents(void)
{
    EventRecord ev;
    while (WaitNextEvent(everyEvent, &ev, 0L, 0L)) {
        if (ev.what == keyDown && (ev.modifiers & cmdKey)) {
            char c = ev.message & charCodeMask;
            if (c == '.')             { gAbort = true; }
            else if (c == 'q' || c == 'Q') { gAbort = true; gDone = true; }
            continue;                 /* other cmd keys: ignored while busy */
        }
        if (ev.what == mouseDown) {
            WindowPtr win;
            short part = FindWindow(ev.where, &win);
            if      (part == inDrag)      DragWindow(win, ev.where, &qd.screenBits.bounds);
            else if (part == inSysWindow) SystemClick(&ev, win);
            else if (part == inMenuBar)   SysBeep(1);   /* busy: no menus */
            continue;
        }
        if (ev.what == updateEvt) HandleEvent(&ev);
        /* plain keys while busy: swallowed */
    }
}

/* ================= the reply ================= */

/* Delete the prefill progress dots (they sit at the very end of the
 * transcript) before the first real reply text lands. */
static void ClearDots(void)
{
    long len;
    if (gDotCount <= 0) return;
    len = (*gTE)->teLength;
    TESetSelect(len - gDotCount, len, gTE);
    TEDelete(gTE);
    ScrollToBottom();
    gDotCount = 0;
}

/* Each decoded token from the engine lands here: translate newlines for
 * TextEdit, watch for a sentence end, append, keep the watch cursor up. */
static void OracleEmit(const char *piece, void *ctx)
{
    char buf[80]; short i, n = 0;
    (void)ctx;
    if (!gDotsCleared) { ClearDots(); gDotsCleared = true; }
    gSawEnd = false;
    for (i = 0; piece[i] && n < 78; i++) {
        char c = piece[i];
        if (c == '\n') {
            if (gPrevOrig == '\n') gStopPara = true;  /* blank line = post over */
            c = '\r';                                 /* TextEdit newline */
        }
        gPrevOrig = piece[i];
        buf[n++] = c;
    }
    buf[n] = 0;
    if (n > 0) {
        char lastc = buf[n - 1];
        if (lastc == '.' || lastc == '!' || lastc == '?') gSawEnd = true;
    }
    Emit(buf);
    SetCursor(*GetCursor(watchCursor));     /* re-assert: we are still busy */
}

/* Engine callback after every forward pass: show prefill progress, pump the
 * event loop, decide when the reply is done. Return 0 stops generation. */
static int OracleTick(int phase, int done, int total, void *ctx)
{
    (void)ctx;
    if (phase == 0) {
        gPromptToks = (short)total;
        while (gDotCount < done) { Emit("."); gDotCount++; }
    } else {
        if (gGenCount == 0) gTPrefill = TickCount();
        gGenCount = (short)done;
        if (gStopPara && done >= 8)       return 0;
        if (gSawEnd  && done >= kMinReply) return 0;
    }
    PumpEvents();
    AppLogTick();                /* heartbeat during the long reply, so the mini
                                 * does not flag a working app as "went silent" */
    if (gAbort) return 0;
    SetCursor(*GetCursor(watchCursor));
    return 1;
}

/* Route the prompt to the mini's agent-oracle (2338) and stream its reply into
 * the transcript. The mini runs the smarter/chat model; the Plus is a terminal.
 * Protocol: send "<prompt>\n", read reply text until EOT (0x04). */
static void RemoteRespond(const char *prompt, short len)
{
    NetConn c; char buf[260], rb[128]; short i, n, j; long got; Boolean done = false;
    BusyOn();
    Emit("ORACLE: ");
    if (NetConnect(&c, NetParseIP(kRemoteIP), kRemotePort) != noErr) {
        Emit("(can't reach the mini -- is agent-oracle running?)");
        EmitLine(""); EmitLine(""); BusyOff(); return;
    }
    n = 0; for (i = 0; i < len && n < 255; i++) buf[n++] = prompt[i]; buf[n++] = '\n';
    if (NetSend(&c, buf, (unsigned short)n) != noErr) { NetClose(&c); Emit("(send failed)");
        EmitLine(""); EmitLine(""); BusyOff(); return; }
    while (!done) {
        got = NetRecv(&c, rb, (unsigned short)(sizeof(rb) - 1), 40);
        if (got <= 0) break;                 /* closed or timeout */
        { char out[130]; short o = 0;
          for (j = 0; j < got; j++) {
              char ch = rb[j];
              if (ch == 4) { done = true; break; }      /* EOT: reply complete */
              out[o++] = (ch == '\n') ? '\r' : ch;
          }
          out[o] = 0; if (o) Emit(out);
        }
        SetCursor(*GetCursor(watchCursor));
        PumpEvents(); if (gAbort) break;
    }
    NetClose(&c);
    if (gAbort && !gDone) Emit(" [stopped]");
    EmitLine(""); EmitLine(""); BusyOff();
}

static void Respond(const char *prompt, short len)
{
    char pbuf[280]; short i, n;
    unsigned long t1;
    if (gRemote) { RemoteRespond(prompt, len); return; }
    BusyOn();
    gAbort = false; gSawEnd = false; gStopPara = false;
    gDotsCleared = false; gDotCount = 0; gGenCount = 0; gPromptToks = 0;
    gTPrefill = 0; gPrevOrig = 0;

    if (gModelLoaded) {
        Emit("ORACLE: ");
        /* "subject, blank line, body" is how every training doc is shaped,
         * so the model writes the body of a post titled with your line. */
        n = 0;
        for (i = 0; i < len && n < 250; i++) pbuf[n++] = prompt[i];
        pbuf[n++] = '\n'; pbuf[n++] = '\n'; pbuf[n] = 0;
        gT0 = TickCount();
        GptGenerate(pbuf, kMaxReply, OracleEmit, OracleTick, 0L);
        t1 = TickCount();
        if (!gDotsCleared) { ClearDots(); gDotsCleared = true; }
        if (gAbort && !gDone) Emit(" [stopped]");
        else if (gGenCount == 0) Emit("(the oracle is silent. ask again.)");
        if (gBenchReport) {
            char bb[120];
            long genTicks = (gTPrefill && t1 > gTPrefill) ? (long)(t1 - gTPrefill) : 0;
            long perTok = (gGenCount > 0) ? genTicks / gGenCount : 0;
            sprintf(bb, "\r[%d prompt toks in %ld.%lds; %d reply toks; %ld.%lds per token]",
                    (int)(gPromptToks > 0 ? gPromptToks : 0),
                    gTPrefill ? (long)(gTPrefill - gT0) / 60 : 0L,
                    gTPrefill ? ((long)(gTPrefill - gT0) % 60) / 6 : 0L,
                    (int)gGenCount, perTok / 60, (perTok % 60) / 6);
            Emit(bb);
        }
        gBenchReport = false;
        SendRunStats(gPromptToks, gGenCount);   /* stream this run to the mini */
    } else {
        /* demo voice when the model resources are missing */
        short which;
        (void)prompt; (void)len;
        ThinkBeat();                        /* "ORACLE: ..." animated ellipsis */
        which = (short)(TickCount() % kStubN);
        StreamText(kStub[which]);
    }
    EmitLine("");
    EmitLine("");
    BusyOff();
}

/* ================= input ================= */

static void SendLine(void)
{
    CharsHandle h; long n; short i;
    if (gBusy) { SysBeep(1); return; }
    n = (*gInputTE)->teLength;
    if (n <= 0) { SysBeep(1); return; }

    /* echo the user's line into the transcript */
    h = TEGetText(gInputTE);
    HLock((Handle)h);
    Emit("YOU: ");
    { long cap = n; char *p = *h;
      TESetSelect(32767, 32767, gTE);
      if ((*gTE)->teLength + cap <= 28000) TEInsert((Ptr)p, cap, gTE);
    }
    /* remember it for Ask Again */
    gLastLen = (short)((n < 255) ? n : 255);
    for (i = 0; i < gLastLen; i++) gLast[i] = (*h)[i];
    gLast[gLastLen] = 0;
    HUnlock((Handle)h);
    Emit("\r");

    /* clear the input field */
    TESetSelect(0, 32767, gInputTE);
    TEDelete(gInputTE);
    { Rect r = (*gInputTE)->viewRect; EraseRect(&r); TEUpdate(&r, gInputTE); }

    Respond(gLast, gLastLen);
}

/* ================= layout & drawing ================= */

static void CreateTE(void)
{
    Rect view; short sepY;
    WIN_W = gWin->portRect.right  - gWin->portRect.left;
    WIN_H = gWin->portRect.bottom - gWin->portRect.top;
    sepY  = WIN_H - INPUT_H;

    /* transcript sits below the header band */
    SetRect(&view, TE_PAD, HEADER_H + TE_PAD, WIN_W - TE_PAD, sepY - 2);
    gTE = TENew(&view, &view);
    TEAutoView(true, gTE);

    /* input line at the bottom, right of the "> " prompt */
    SetRect(&view, TE_PAD + PROMPT_W, sepY + 4, WIN_W - TE_PAD, WIN_H - 3);
    gInputTE = TENew(&view, &view);
    TEAutoView(true, gInputTE);
    TEActivate(gInputTE);            /* the input line owns the blinking caret */
}

static void LayoutTE(void)
{
    Rect v; short sepY = WIN_H - INPUT_H;
    SetRect(&v, TE_PAD, HEADER_H + TE_PAD, WIN_W - TE_PAD, sepY - 2);
    (*gTE)->viewRect = v;
    (*gTE)->destRect.left = v.left; (*gTE)->destRect.right = v.right;
    TECalText(gTE);
    SetRect(&v, TE_PAD + PROMPT_W, sepY + 4, WIN_W - TE_PAD, WIN_H - 3);
    (*gInputTE)->viewRect = v;
    (*gInputTE)->destRect.left = v.left; (*gInputTE)->destRect.right = v.right;
    TECalText(gInputTE);
}

/* Inverted title band: white Chicago on a black bar. srcBic draws the glyphs
 * as white (clears) on the painted-black background. */
static void DrawHeader(void)
{
    Rect bar;
    Str255 s;
    short tw, x;
    SetRect(&bar, 0, 0, WIN_W, HEADER_H);
    PaintRect(&bar);                              /* solid black band */
    TextFont(systemFont); TextSize(12); TextFace(bold);
    TextMode(srcBic);                             /* -> white text on black */
    MakePStr(s, "THE ORACLE");
    tw = StringWidth(s);
    x = (WIN_W - tw) / 2;
    MoveTo(x, 15);
    DrawString(s);
    TextMode(srcOr); TextFace(normal);
}

static void DrawInputChrome(void)
{
    short sepY = WIN_H - INPUT_H;
    /* separator line above the input strip */
    MoveTo(TE_PAD, sepY); LineTo(WIN_W - TE_PAD, sepY);
    /* the "> " prompt marker */
    TextFont(systemFont); TextSize(12); TextFace(bold);
    MoveTo(TE_PAD, WIN_H - 9);
    DrawString("\p>");
    TextFace(normal);
}

static void DrawWindow(void)
{
    Rect r = gWin->portRect;
    EraseRect(&r);
    DrawHeader();
    DrawInputChrome();
    { Rect tv = (*gTE)->viewRect; TEUpdate(&tv, gTE); }
    { Rect iv = (*gInputTE)->viewRect; TEUpdate(&iv, gInputTE); }
}

static void Relayout(void)
{
    WIN_W = gWin->portRect.right  - gWin->portRect.left;
    WIN_H = gWin->portRect.bottom - gWin->portRect.top;
    LayoutTE();
    DrawWindow();
}

/* ================= menus ================= */

static void DoMenu(long sel)
{
    short menu = HiWord(sel);
    short item = LoWord(sel);
    Str255 name;
    switch (menu) {
        case kAppleMenu:
            if (item == 1) {
                ParamText("\pTHE ORACLE — a mind from 1985, thinking locally on your Macintosh Plus. Trained from scratch on Usenet. Ask it something.", "\p", "\p", "\p");
                NoteAlert(128, 0L);
            } else {
                GetMenuItemText(gAppleM, item, name);
                OpenDeskAcc(name);
            }
            break;
        case kFileMenu:
            gDone = true;
            break;
        case kOracleMenu:
            if (item == kAskAgain) {
                if (gLastLen > 0 && !gBusy) {
                    Emit("YOU: "); { char *p = gLast; long c = gLastLen;
                        TESetSelect(32767,32767,gTE); TEInsert((Ptr)p, c, gTE); }
                    Emit("\r");
                    Respond(gLast, gLastLen);
                } else SysBeep(1);
            } else if (item == kClearItem) {
                TESetSelect(0, (*gTE)->teLength, gTE);
                TEDelete(gTE); ScrollToBottom();
            } else if (item == kBenchItem) {
                if (!gBusy && gModelLoaded) {
                    gBenchReport = true;
                    EmitLine("YOU: [benchmark: the macintosh plus]");
                    Respond("the macintosh plus", 18);
                } else SysBeep(1);
            }
            break;
        case kLabMenu:
            if (gBusy) { SysBeep(1); break; }
            if (item == kLabLUT) {
                gUseLUT = !gUseLUT;
                CheckItem(gLabM, kLabLUT, gUseLUT != 0);
                AppLog(gUseLUT ? "toggle: multiply table ON" : "toggle: multiply table OFF");
            } else if (item == kLabExp) {
                gFixExp = !gFixExp;
                CheckItem(gLabM, kLabExp, gFixExp != 0);
                AppLog(gFixExp ? "toggle: table exp ON" : "toggle: table exp OFF");
            } else if (item == kLabAttn) {
                gFixAttn = !gFixAttn;
                CheckItem(gLabM, kLabAttn, gFixAttn != 0);
                AppLog(gFixAttn ? "toggle: int8 attention ON" : "toggle: int8 attention OFF");
            } else if (item == kLabRemote) {
                gRemote = !gRemote;
                CheckItem(gLabM, kLabRemote, gRemote != 0);
                SavePrefs();                 /* remembered across quits */
                AppLog(gRemote ? "toggle: REMOTE model ON" : "toggle: REMOTE model OFF");
                if (!gRemote) LoadModelIfNeeded();   /* switching to local: load now */
            } else if (item == kLabStats) {
                SendRunStats(gPromptToks, gGenCount);   /* last reply's numbers */
            }
            break;
    }
    HiliteMenu(0);
}

static void SetUpMenus(void)
{
    Str255 appleTitle;
    appleTitle[0] = 1; appleTitle[1] = 0x14;      /* apple symbol */

    gAppleM = NewMenu(kAppleMenu, appleTitle);
    AppendMenu(gAppleM, "\pAbout The Oracle...");
    AppendMenu(gAppleM, "\p(-");
    AppendResMenu(gAppleM, 'DRVR');
    InsertMenu(gAppleM, 0);

    gFileM = NewMenu(kFileMenu, "\pFile");
    AppendMenu(gFileM, "\pQuit/Q");
    InsertMenu(gFileM, 0);

    gOracleM = NewMenu(kOracleMenu, "\pOracle");
    AppendMenu(gOracleM, "\pAsk Again/R;(-;Clear/K;(-;Benchmark/B");
    InsertMenu(gOracleM, 0);

    gLabM = NewMenu(kLabMenu, "\pLab");
    AppendMenu(gLabM, "\pMultiply Table;Table Exp;Int8 Attention;Use Mini Model;(-;Send Stats Now");
    CheckItem(gLabM, kLabLUT,    gUseLUT != 0);   /* reflect current toggle state */
    CheckItem(gLabM, kLabExp,    gFixExp != 0);
    CheckItem(gLabM, kLabAttn,   gFixAttn != 0);
    CheckItem(gLabM, kLabRemote, gRemote != 0);
    InsertMenu(gLabM, 0);

    DrawMenuBar();
}

/* ================= events ================= */

static void HandleMouseDown(EventRecord *ev)
{
    WindowPtr win;
    short part = FindWindow(ev->where, &win);
    switch (part) {
        case inMenuBar: DoMenu(MenuSelect(ev->where)); break;
        case inSysWindow: SystemClick(ev, win); break;
        case inDrag: DragWindow(win, ev->where, &qd.screenBits.bounds); break;
        case inGoAway: if (TrackGoAway(win, ev->where)) gDone = true; break;
        case inZoomIn:
        case inZoomOut: if (WFZoom(win, part, ev->where)) Relayout(); break;
        case inContent: {
            Point pt = ev->where;
            if (win != FrontWindow()) { SelectWindow(win); break; }
            GlobalToLocal(&pt);
            if (PtInRect(pt, &(*gInputTE)->viewRect))
                TEClick(pt, (ev->modifiers & shiftKey) != 0, gInputTE);
            else if (PtInRect(pt, &(*gTE)->viewRect))
                TEClick(pt, (ev->modifiers & shiftKey) != 0, gTE);
            break;
        }
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
            } else if (!gBusy) {
                if (ch == '\r' || ch == 0x03) SendLine();   /* Return / Enter */
                else { TEKey(ch, gInputTE); }               /* local editing  */
            }
            break;
        case updateEvt: {
            WindowPtr w = (WindowPtr)ev->message;
            BeginUpdate(w);
            SetPort(w);
            DrawWindow();
            EndUpdate(w);
            break;
        }
        case activateEvt: break;
    }
}

/* ================= setup ================= */

static void SetUpWindow(void)
{
    gWin = WFNew("\pThe Oracle");
    SetPort(gWin);
    TextFont(systemFont); TextSize(12);
    CreateTE();
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

/* Loading progress: gpt.c calls this at each init stage (1..7). A dot per
 * stage after the "waking" line, so a slow load reads as work, not a hang. */
static void LoadProg(int step)
{
    (void)step;
    Emit(".");
}

/* ================= prefs (remember local/remote across quits) =================
 * A 2-byte "Oracle Prefs" file in the System Folder: ['O'][gRemote]. Remembering
 * remote mode lets launch SKIP the ~minute model load entirely. */
static short PrefsVol(void)
{
    SysEnvRec env;
    if (SysEnvirons(1, &env) == noErr) return env.sysVRefNum;
    return 0;
}
static void SavePrefs(void)
{
    Str255 nm; short ref; long cnt; char b[2];
    MakePStr(nm, "Oracle Prefs");
    Create(nm, PrefsVol(), 'ORCL', 'pref');      /* ok if it already exists */
    if (FSOpen(nm, PrefsVol(), &ref) == noErr) {
        b[0] = 'O'; b[1] = gRemote ? 1 : 0; cnt = 2;
        FSWrite(ref, &cnt, b); FSClose(ref);
    }
}
static void LoadPrefs(void)
{
    Str255 nm; short ref; long cnt; char b[2];
    MakePStr(nm, "Oracle Prefs");
    if (FSOpen(nm, PrefsVol(), &ref) == noErr) {
        cnt = 2;
        if (FSRead(ref, &cnt, b) == noErr && cnt >= 2 && b[0] == 'O')
            gRemote = (b[1] != 0);
        FSClose(ref);
    }
}

/* Load the embedded model on demand (skipped entirely in remote mode, which is
 * why remote launch is instant). Safe to call more than once. */
static void LoadModelIfNeeded(void)
{
    unsigned long t0, t1;
    if (gModelLoaded) return;
    SetCursor(*GetCursor(watchCursor));
    EmitLine("waking the mind of 1985 -- give me a minute.");
    Emit("loading ");
    gGptProgress = LoadProg;
    t0 = TickCount();
    {
        Handle modelH = GetResource(kModelType, kResID);
        Handle tokH   = GetResource(kTokType,   kResID);
        if (modelH && tokH) {
            HLock(modelH); HLock(tokH);
            gModelLoaded = (GptInitMem(*modelH, GetHandleSize(modelH),
                                       *tokH,   GetHandleSize(tokH),
                                       0.8f, 0.9f, (unsigned long)TickCount()) == 0);
        }
    }
    t1 = TickCount();
    gGptProgress = 0L;
    { char lb[64]; long lt = (long)(t1 - t0);
      sprintf(lb, " %s (%ld.%lds)", gModelLoaded ? "awake." : "LOAD FAILED (try Use Mini Model).",
              lt / 60, (lt % 60) / 6);
      EmitLine(lb); }
    EmitLine("");
    InitCursor();
}

static void Greeting(void)
{
    EmitLine("ORACLE: ask, and i will answer.");
    EmitLine("        i remember only 1986.");
    if (gRemote)
        EmitLine("        (using the mini's smarter model. Lab menu to switch.)");
    else if (gModelLoaded)
        EmitLine("        (i think slowly. each word costs seconds. Cmd-. shuts me up.)");
    else
        EmitLine("        (demo voice - model not loaded.)");
    EmitLine("");
}

int main(void)
{
    EventRecord ev;

    InitToolbox();
    gGptClock = OracleClock;   /* engine phase timers use TickCount */

    SetUpMenus();
    SetUpWindow();
    DrawWindow();

    LoadPrefs();                       /* remembers local vs Use Mini Model */
    CheckItem(gLabM, kLabRemote, gRemote != 0);
    EmitLine("THE ORACLE " ORACLE_VER);
    if (gRemote) {
        /* remote mode: the mini does the thinking, so DON'T load the local
         * model -- that is what makes this launch instant. */
        EmitLine("remote mode (mini). ready instantly.");
        EmitLine("");
    } else {
        LoadModelIfNeeded();
    }

    Greeting();

    /* WaitNextEvent is present on System 6 (used by every app here); calling it
     * directly avoids Gestalt, which is an unimplemented trap on the Plus ROM. */
    while (!gDone) {
        if (WaitNextEvent(everyEvent, &ev, 15L, 0L)) HandleEvent(&ev);
        if (!gBusy) {
            TEIdle(gInputTE);             /* blink the input caret */
            LazyLogOpen();                /* bring up analytics AFTER the load */
            AppLogTick();
        }
    }
    AppLog("quit");
    AppLogClose();
    return 0;
}
