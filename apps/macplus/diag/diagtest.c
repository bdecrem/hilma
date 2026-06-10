/*
 * DiagTest - exercises the Macinclaude diagnostic logger (diag.inc) on all
 * three sinks at once, so the "no SD round-trip" loop is verifiable in Mini
 * vMac before any of it ships to the real Plus:
 *   SCREEN - the log is drawn live in the window (just look).
 *   WIRE   - lines stream to the mini diag-sink (dial it like any agent).
 *   FILE   - appended to "Macinclaude Diag.log" on the boot volume.
 *
 * It dials the diag-sink (default 192.168.7.50:2331) using the same proven
 * serial transport as the apps, sets diag's WIRE sink to push over that link,
 * turns on the FILE sink, then logs a scripted sequence (plus a "Log Now" menu
 * item for more). The on-screen panel shows everything as it happens.
 */

#include <Quickdraw.h>
#include <Windows.h>
#include <Menus.h>
#include <Fonts.h>
#include <Events.h>
#include <TextEdit.h>
#include <Dialogs.h>
#include <ToolUtils.h>
#include <Memory.h>
#include <OSUtils.h>
#include <Devices.h>
#include <Files.h>
#include <Serial.h>
#include <SegLoad.h>

#ifndef monaco
#define monaco 4
#endif
#ifndef systemFont
#define systemFont 0
#endif

#define kAppleMenu 128
#define kFileMenu  129
#define kDiagMenu  130
#define kFileQuit 1
#define kDiagLogNow  1
#define kDiagFlush   2

#define WIN_W 496
#define WIN_H 300

/* config: where the diag-sink lives, and baud */
#define DIAG_HOST "192.168.7.50"
#define DIAG_PORT 2331
static const short kBaudCfg = baud9600 + data8 + noParity + stop10;

static WindowPtr  gWin;
static MenuHandle gAppleM, gFileM, gDiagM;
static Boolean    gDone = false;

static short   gInRef, gOutRef;
static Boolean gPortOpen = false;
static Boolean gConnected = false;
static short   gBootVRef = 0;

static char gSerRing[2048], gSerBuf[1024];
static unsigned char gCap[1024];

/* ---- string helpers ---- */
static void SStrLen(const char *s, long *n) { long i = 0; while (s[i]) i++; *n = i; }
static void CatStr(char *b, short *n, const char *s) { short i; for (i = 0; s[i]; i++) b[(*n)++] = s[i]; }
static void CatLong(char *b, short *n, long v) { char t[12]; short k = 0; if (v == 0) t[k++] = '0'; while (v > 0) { t[k++] = (char)('0' + v % 10); v /= 10; } while (k) b[(*n)++] = t[--k]; }
static Boolean Contains(const unsigned char *b, short len, const char *nd)
{ short i; long nl; SStrLen(nd, &nl); if (nl == 0 || len < (short)nl) return false;
  for (i = 0; i + (short)nl <= len; i++) { short j; Boolean h = true; for (j = 0; j < (short)nl; j++) if (b[i+j] != (unsigned char)nd[j]) { h = false; break; } if (h) return true; } return false; }

/* ---- serial ---- */
static void SendBytes(const char *s, long n) { long c = n; if (gPortOpen) FSWrite(gOutRef, &c, (Ptr)s); }
static void SendStr(const char *s) { long n; SStrLen(s, &n); SendBytes(s, n); }
static void DrainInput(void) { long a, c; if (!gPortOpen) return; while (SerGetBuf(gInRef, &a) == noErr && a > 0) { c = a; if (c > (long)sizeof(gSerBuf)) c = sizeof(gSerBuf); FSRead(gInRef, &c, gSerBuf); } }
static short CaptureFor(short ticks, unsigned char *out, short cap)
{ unsigned long dl = TickCount() + (unsigned long)ticks; short tot = 0; long a, c;
  while ((long)(TickCount() - dl) < 0) { if (SerGetBuf(gInRef, &a) == noErr && a > 0) { c = a; if (c > (long)sizeof(gSerBuf)) c = sizeof(gSerBuf); if (FSRead(gInRef, &c, gSerBuf) == noErr) { short i; for (i = 0; i < (short)c; i++) if (tot < cap) out[tot++] = (unsigned char)gSerBuf[i]; } } } return tot; }

static Boolean OpenSerPort(void)
{
    SerShk shk;
    if (gPortOpen) return true;
    if (OpenDriver("\p.AOut", &gOutRef) != noErr) return false;
    if (OpenDriver("\p.AIn", &gInRef) != noErr) return false;
    SerSetBuf(gInRef, (Ptr)gSerRing, (short)sizeof(gSerRing));
    SerReset(gOutRef, kBaudCfg); SerReset(gInRef, kBaudCfg);
    shk.fXOn = 0; shk.fCTS = 0; shk.xOn = 0; shk.xOff = 0; shk.errs = 0; shk.evts = 0; shk.fInX = 0; shk.null = 0;
    SerHShake(gOutRef, &shk);
    gPortOpen = true;
    return true;
}

/* diag's WIRE sink: write bytes straight to the open serial link */
static void WireSink(const char *bytes, short n) { SendBytes(bytes, (long)n); }

#include "diag.inc"

static void SetTitle(const char *msg)
{
    Str255 t; short n = 0; char b[80];
    CatStr(b, &n, "DiagTest"); if (msg && msg[0]) { CatStr(b, &n, " - "); CatStr(b, &n, msg); } b[n] = 0;
    t[0] = (unsigned char)n; { short i; for (i = 0; i < n; i++) t[i+1] = (unsigned char)b[i]; }
    if (gWin) SetWTitle(gWin, t);
}

static void Redraw(void)
{
    Rect r; SetPort(gWin); SetRect(&r, 0, 0, WIN_W, WIN_H); EraseRect(&r);
    TextFont(systemFont); TextFace(bold); TextSize(12);
    MoveTo(10, 18); DrawString("\pMacinclaude Diagnostics - screen + wire + SD");
    DiagDraw(8, 40, 22);
}

static Boolean DialDiag(void)
{
    char cmd[64]; short n = 0, got, tries;
    if (!OpenSerPort()) { SetTitle("no serial port"); return false; }
    SetTitle("connecting...");
    for (tries = 0; tries < 3; tries++) { DrainInput(); SendStr("AT\r"); got = CaptureFor(90, gCap, sizeof(gCap)); if (Contains(gCap, got, "OK")) break; }
    if (tries == 3) { SetTitle("modem no OK"); return false; }
    CatStr(cmd, &n, "ATDT\""); CatStr(cmd, &n, DIAG_HOST); CatStr(cmd, &n, ":"); CatLong(cmd, &n, (long)DIAG_PORT); CatStr(cmd, &n, "\"\r"); cmd[n] = 0;
    DrainInput(); SendStr(cmd);
    got = CaptureFor(600, gCap, sizeof(gCap));
    if (Contains(gCap, got, "CONNECT")) { gConnected = true; SetTitle("connected - logging"); return true; }
    SetTitle("no answer from diag-sink"); return false;
}

static void RunScript(void)
{
    DiagLog("BOOT", "DiagTest starting");
    DiagLogNum("SER", "baud", 9600);
    DiagLog("NET", gConnected ? "wire sink live" : "wire sink OFF (no link)");
    DiagLog("SD", gDiagFileOn ? "file sink open" : "file sink OFF");
    DiagLogNum("RX", "serbuf size", (long)sizeof(gSerRing));
    DiagLog("TEST", "three sinks should all show this line");
    DiagLogNum("CALC", "answer", 42);
    DiagLog("DONE", "scripted sequence complete");
    Redraw();
}

static void DoMenu(long sel)
{
    short menu = HiWord(sel), item = LoWord(sel); Str255 nm;
    if (menu == kAppleMenu) { if (item != 1) { GetMenuItemText(gAppleM, item, nm); OpenDeskAcc(nm); } }
    else if (menu == kFileMenu) { if (item == kFileQuit) gDone = true; }
    else if (menu == kDiagMenu) {
        if (item == kDiagLogNow) { DiagLogNum("TICK", "manual log at tick", (long)TickCount()); Redraw(); }
        else if (item == kDiagFlush) { DiagFlush(); DiagLog("SD", "flushed to disk"); Redraw(); }
    }
    HiliteMenu(0);
}

static void HandleEvent(EventRecord *ev)
{
    WindowPtr w; char ch;
    switch (ev->what) {
        case mouseDown:
            switch (FindWindow(ev->where, &w)) {
                case inMenuBar: DoMenu(MenuSelect(ev->where)); break;
                case inSysWindow: SystemClick(ev, w); break;
                case inDrag: DragWindow(w, ev->where, &qd.screenBits.bounds); break;
            }
            break;
        case keyDown:
            ch = ev->message & charCodeMask;
            if (ev->modifiers & cmdKey) { long s = MenuKey(ch); if (HiWord(s)) DoMenu(s); }
            break;
        case updateEvt: { WindowPtr u = (WindowPtr)ev->message; BeginUpdate(u); if (u == gWin) Redraw(); EndUpdate(u); break; }
    }
}

static void SetUp(void)
{
    Str255 at; Rect r; SysEnvRec env; short left;
    InitGraf(&qd.thePort); InitFonts(); InitWindows(); InitMenus(); TEInit(); InitDialogs(0L); InitCursor();
    FlushEvents(everyEvent, 0);
    at[0] = 1; at[1] = 0x14;
    gAppleM = NewMenu(kAppleMenu, at); AppendMenu(gAppleM, "\pAbout DiagTest"); AppendMenu(gAppleM, "\p(-"); AppendResMenu(gAppleM, 'DRVR'); InsertMenu(gAppleM, 0);
    gFileM = NewMenu(kFileMenu, "\pFile"); AppendMenu(gFileM, "\pQuit/Q"); InsertMenu(gFileM, 0);
    gDiagM = NewMenu(kDiagMenu, "\pDiag"); AppendMenu(gDiagM, "\pLog Now/L;Flush to SD/F"); InsertMenu(gDiagM, 0);
    DrawMenuBar();
    left = (qd.screenBits.bounds.right - WIN_W) / 2;
    SetRect(&r, left, 40, left + WIN_W, 40 + WIN_H);
    gWin = NewWindow(0L, &r, "\pDiagTest", true, documentProc, (WindowPtr)-1L, false, 0);
    SetPort(gWin);
    if (SysEnvirons(curSysEnvVers, &env) == noErr) gBootVRef = env.sysVRefNum;
}

int main(void)
{
    EventRecord ev;
    SetUp();
    DiagInit();
    DiagSetFile(gBootVRef);          /* SD sink */
    DialDiag();                      /* wire sink (best effort) */
    if (gConnected) DiagSetWire(WireSink);
    RunScript();
    while (!gDone) {
        if (WaitNextEvent(everyEvent, &ev, 15L, 0L)) HandleEvent(&ev);
    }
    DiagCloseFile();
    if (gPortOpen) { CloseDriver(gInRef); CloseDriver(gOutRef); }
    return 0;
}
