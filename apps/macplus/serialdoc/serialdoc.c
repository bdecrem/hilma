/*
 * SerialDoc - a serial-port diagnostic tool for the Macintosh Plus
 * (System 6.0.8, 68000). Built with Retro68. Black & white, low memory.
 *
 * Purpose: bring up a RetroWiFi modem over the Plus serial port. ZTerm hides
 * what's actually on the wire; this shows it. Every test reports bytes sent,
 * bytes received, and (in Hex View) the raw byte values, so "garbage" becomes
 * reportable numbers and "nothing" is unambiguous.
 *
 * Interface: one scrolling console window (Monaco 9, monospaced) + a menu bar.
 *   Port menu     - Modem/Printer port, baud 1200/2400/9600/19200, Open, Close.
 *                   Opens with hardware flow control FORCED OFF, so a cable
 *                   missing the CTS line can't silently hang transmit.
 *   Tests menu    - AT Probe, Baud Sweep, RX Monitor (10s), Loopback,
 *                   Modem Info (ATI), Clear Log.
 *   Terminal menu - Terminal Mode (type AT live), Local Echo, Hex View.
 *
 * Serial I/O uses the built-in drivers: modem port = .AOut/.AIn,
 * printer port = .BOut/.BIn. Reads are non-blocking: SerGetBuf reports how many
 * bytes are waiting, and we FSRead only that many (FSRead on a serial driver
 * blocks until the requested count arrives, so we never ask for more).
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

/* Font IDs (classic constants not always provided by the interfaces). */
#ifndef monaco
#define monaco 4        /* Monaco - monospaced, good for hex columns */
#endif
#ifndef systemFont
#define systemFont 0    /* Chicago */
#endif
#ifndef geneva
#define geneva 3
#endif

/* ---- window geometry (512x342 screen, 20px menu bar) ---- */
#define WIN_W   480
#define WIN_H   292
#define TE_PAD  4

/* ---- menus ---- */
#define kAppleMenu  128
#define kFileMenu   129
#define kPortMenu   130
#define kTestMenu   131
#define kTermMenu   132

/* Port menu items */
#define kPortModem   1
#define kPortPrinter 2
/* 3 = separator */
#define kBaud1200    4
#define kBaud2400    5
#define kBaud9600    6
#define kBaud19200   7
/* 8 = separator */
#define kPortOpen    9
#define kPortClose   10

/* Tests menu items */
#define kTestAT      1
#define kTestSweep   2
#define kTestRX      3
#define kTestLoop    4
#define kTestInfo    5
/* 6 = separator */
#define kTestClear   7

/* Terminal menu items */
#define kTermMode    1
#define kTermEcho    2
#define kTermHex     3

/* ---- globals ---- */
static WindowPtr  gWin;
static TEHandle   gTE;
static MenuHandle gAppleM, gFileM, gPortM, gTestM, gTermM;
static Boolean    gDone = false;

static short      gInRef, gOutRef;          /* serial driver refnums */
static Boolean    gPortOpen = false;
static short      gPortSel  = 0;            /* 0 = modem, 1 = printer */
static short      gBaudIdx  = 2;            /* index into kBaudTab; 2 = 9600 */

static Boolean    gTermMode = false;
static Boolean    gLocalEcho = true;
static Boolean    gHexView  = false;

/* a roomy input buffer so bursts don't overrun the 64-byte default */
static char       gSerBuf[2048];

/* ---- baud table ---- */
typedef struct { const char *name; short config; } BaudEntry;
static const BaudEntry kBaudTab[] = {
    { "1200",  baud1200  + data8 + noParity + stop10 },
    { "2400",  baud2400  + data8 + noParity + stop10 },
    { "9600",  baud9600  + data8 + noParity + stop10 },
    { "19200", baud19200 + data8 + noParity + stop10 },
};
#define NBAUD 4

/* the full sweep list (wider than the menu) */
static const BaudEntry kSweepTab[] = {
    { "300",   baud300   + data8 + noParity + stop10 },
    { "1200",  baud1200  + data8 + noParity + stop10 },
    { "2400",  baud2400  + data8 + noParity + stop10 },
    { "4800",  baud4800  + data8 + noParity + stop10 },
    { "9600",  baud9600  + data8 + noParity + stop10 },
    { "19200", baud19200 + data8 + noParity + stop10 },
};
#define NSWEEP 6

/* ================= console (TextEdit) ================= */

static void StrLen(const char *s, long *n) { long i = 0; while (s[i]) i++; *n = i; }

static void ScrollToBottom(void)
{
    short totalH, viewH, desiredTop, delta;
    totalH = (*gTE)->nLines * (*gTE)->lineHeight;
    viewH  = (*gTE)->viewRect.bottom - (*gTE)->viewRect.top;
    desiredTop = (*gTE)->viewRect.top - ((totalH > viewH) ? (totalH - viewH) : 0);
    delta = desiredTop - (*gTE)->destRect.top;
    if (delta != 0) TEScroll(0, delta, gTE);
}

/* append raw text (CR = newline, char 13) */
static void Emit(const char *s)
{
    long n; StrLen(s, &n);
    if (n <= 0) return;
    /* keep TE under its 32K ceiling: drop the oldest half when large */
    if ((*gTE)->teLength + n > 28000) {
        TESetSelect(0, 12000, gTE);
        TEDelete(gTE);
    }
    TESetSelect(32767, 32767, gTE);
    TEInsert((Ptr)s, n, gTE);
    ScrollToBottom();
}

static void EmitLine(const char *s) { Emit(s); Emit("\r"); }

/* decimal append into a C buffer */
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

static char gHexDigit(short v) { return (char)(v < 10 ? '0' + v : 'A' + v - 10); }

/* Format captured bytes into the console per the current view mode.
 * Text mode: printable bytes shown as-is, CR/LF collapsed to one newline,
 *            NUL dropped (line noise / idle), other control bytes shown as '.'.
 * Hex mode : 16 bytes per row as "HH HH ... | ascii" (shows every byte).
 * trailingNL: append a newline after the block. True for test-result dumps
 *   (which want a clean break before the verdict line); false for live
 *   terminal echo/pump, where line breaks must come only from real CR/LF in
 *   the stream (otherwise every poll injects a spurious newline). */
static void DumpCapture(const unsigned char *buf, short len, Boolean trailingNL)
{
    char line[200]; short k; short i;
    if (len <= 0) return;

    if (!gHexView) {
        k = 0;
        for (i = 0; i < len; i++) {
            unsigned char c = buf[i];
            if (c == 0) continue;            /* drop NULs: never AT content */
            if (c == 13) { line[k++] = '\r'; }
            else if (c == 10) {
                if (i == 0 || buf[i - 1] != 13) line[k++] = '\r';
            }
            else if (c >= 32 && c < 127) line[k++] = (char)c;
            else line[k++] = '.';
            if (k > 180) { line[k] = 0; Emit(line); k = 0; }
        }
        if (k > 0) { line[k] = 0; Emit(line); }
        if (trailingNL) Emit("\r");
        return;
    }

    /* hex view, 16 bytes per row */
    {
        short row;
        for (row = 0; row < len; row += 16) {
            short n = len - row; if (n > 16) n = 16;
            k = 0;
            for (i = 0; i < 16; i++) {
                if (i < n) {
                    unsigned char c = buf[row + i];
                    line[k++] = gHexDigit((c >> 4) & 0xF);
                    line[k++] = gHexDigit(c & 0xF);
                } else { line[k++] = ' '; line[k++] = ' '; }
                line[k++] = ' ';
            }
            line[k++] = '|'; line[k++] = ' ';
            for (i = 0; i < n; i++) {
                unsigned char c = buf[row + i];
                line[k++] = (c >= 32 && c < 127) ? (char)c : '.';
            }
            line[k] = 0;
            EmitLine(line);
        }
    }
}

/* ================= serial plumbing ================= */

static void ConfigPort(short config)
{
    SerShk shk;
    SerReset(gOutRef, config);
    SerReset(gInRef,  config);
    /* all-zero handshake = no XON/XOFF, no CTS gating: writes never stall on a
     * cable that doesn't carry the flow-control lines (the #1 silent hang). */
    shk.fXOn = 0; shk.fCTS = 0; shk.xOn = 0; shk.xOff = 0;
    shk.errs = 0; shk.evts = 0; shk.fInX = 0; shk.null = 0;
    SerHShake(gOutRef, &shk);
}

static Boolean OpenSerPort(void)
{
    OSErr err;
    if (gPortOpen) return true;
    if (gPortSel == 0) {
        err = OpenDriver("\p.AOut", &gOutRef);
        if (err == noErr) err = OpenDriver("\p.AIn", &gInRef);
    } else {
        err = OpenDriver("\p.BOut", &gOutRef);
        if (err == noErr) err = OpenDriver("\p.BIn", &gInRef);
    }
    if (err != noErr) {
        char b[64]; short n = 0;
        CatStr(b, &n, "*** OpenDriver failed, err "); CatLong(b, &n, err);
        b[n] = 0; EmitLine(b);
        return false;
    }
    SerSetBuf(gInRef, (Ptr)gSerBuf, (short)sizeof(gSerBuf));
    ConfigPort(kBaudTab[gBaudIdx].config);
    gPortOpen = true;
    {
        char b[80]; short n = 0;
        CatStr(b, &n, "--- Port open: ");
        CatStr(b, &n, gPortSel == 0 ? "Modem" : "Printer");
        CatStr(b, &n, ", "); CatStr(b, &n, kBaudTab[gBaudIdx].name);
        CatStr(b, &n, " 8-N-1, flow control OFF ---");
        b[n] = 0; EmitLine(b);
    }
    return true;
}

static void CloseSerPort(void)
{
    if (!gPortOpen) return;
    /* return the input buffer to the default before closing */
    SerSetBuf(gInRef, (Ptr)gSerBuf, 0);
    CloseDriver(gInRef);
    CloseDriver(gOutRef);
    gPortOpen = false;
    EmitLine("--- Port closed ---");
}

static Boolean EnsureOpen(void)
{
    if (gPortOpen) return true;
    return OpenSerPort();
}

static void DrainInput(void)
{
    long avail; long cnt;
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

/* Poll the port for `ticks`, copying bytes into out[] (capped at cap).
 * Returns total bytes seen; *truncated set if more arrived than cap held. */
static short CaptureFor(short ticks, unsigned char *out, short cap, Boolean *truncated)
{
    unsigned long deadline = TickCount() + (unsigned long)ticks;
    short total = 0; long avail, cnt;
    *truncated = false;
    while ((long)(TickCount() - deadline) < 0) {
        if (SerGetBuf(gInRef, &avail) == noErr && avail > 0) {
            cnt = avail; if (cnt > (long)sizeof(gSerBuf)) cnt = sizeof(gSerBuf);
            if (FSRead(gInRef, &cnt, gSerBuf) == noErr) {
                short i;
                for (i = 0; i < (short)cnt; i++) {
                    if (total < cap) out[total] = (unsigned char)gSerBuf[i];
                    else *truncated = true;
                    total++;
                }
            }
        }
    }
    return total;
}

/* true if "OK" appears anywhere in the buffer */
static Boolean HasOK(const unsigned char *buf, short len)
{
    short i;
    for (i = 0; i + 1 < len; i++)
        if (buf[i] == 'O' && buf[i + 1] == 'K') return true;
    return false;
}

/* ================= tests ================= */

static unsigned char gCap[1024];

static void TestATProbe(void)
{
    short got; Boolean trunc; char b[80]; short n;
    if (!EnsureOpen()) return;
    EmitLine("");
    { n = 0; CatStr(b, &n, "AT Probe @ ");
      CatStr(b, &n, kBaudTab[gBaudIdx].name); CatStr(b, &n, " ...");
      b[n] = 0; EmitLine(b); }
    DrainInput();
    SendStr("AT\r");
    got = CaptureFor(120, gCap, sizeof(gCap), &trunc);   /* ~2 s */

    n = 0; CatStr(b, &n, "  sent 3 bytes, received "); CatLong(b, &n, got);
    CatStr(b, &n, " bytes"); b[n] = 0; EmitLine(b);
    if (got > 0) DumpCapture(gCap, (got > (short)sizeof(gCap)) ? sizeof(gCap) : got, true);

    if (HasOK(gCap, (got > (short)sizeof(gCap)) ? sizeof(gCap) : got))
        EmitLine("  RESULT: PASS - modem answered OK");
    else if (got > 0)
        EmitLine("  RESULT: bytes came back but no OK (baud? local echo?)");
    else
        EmitLine("  RESULT: FAIL - nothing. Wrong wiring/baud/port, or modem off.");
}

static void TestBaudSweep(void)
{
    short i;
    if (!EnsureOpen()) return;
    EmitLine("");
    EmitLine("Baud Sweep - sending AT at each rate (~1.5s each):");
    for (i = 0; i < NSWEEP; i++) {
        short got; Boolean trunc; char b[96]; short n;
        ConfigPort(kSweepTab[i].config);
        DrainInput();
        SendStr("AT\r");
        got = CaptureFor(90, gCap, sizeof(gCap), &trunc);
        n = 0;
        CatStr(b, &n, "  ");
        CatStr(b, &n, kSweepTab[i].name);
        while (n < 9) b[n++] = ' ';
        CatStr(b, &n, ": "); CatLong(b, &n, got); CatStr(b, &n, " bytes");
        if (HasOK(gCap, (got > (short)sizeof(gCap)) ? sizeof(gCap) : got))
            CatStr(b, &n, "  <= OK");
        else if (got > 0)
            CatStr(b, &n, "  (no OK)");
        b[n] = 0; EmitLine(b);
        if (got > 0 && gHexView)
            DumpCapture(gCap, (got > 64) ? 64 : got, true);
    }
    /* leave the port at the menu-selected baud */
    ConfigPort(kBaudTab[gBaudIdx].config);
    EmitLine("Sweep done. A rate with <= OK is your setting; any bytes at all");
    EmitLine("means the cable carries data. Zero everywhere => swap the adapter.");
}

static void TestRXMonitor(void)
{
    short got; Boolean trunc; char b[80]; short n;
    if (!EnsureOpen()) return;
    EmitLine("");
    EmitLine("RX Monitor - listening 10 s (touch nothing)...");
    DrainInput();
    got = CaptureFor(600, gCap, sizeof(gCap), &trunc);
    n = 0; CatStr(b, &n, "  received "); CatLong(b, &n, got);
    CatStr(b, &n, " bytes"); if (trunc) CatStr(b, &n, " (showing first 1024)");
    b[n] = 0; EmitLine(b);
    if (got > 0) DumpCapture(gCap, (got > (short)sizeof(gCap)) ? sizeof(gCap) : got, true);
    else EmitLine("  quiet line (normal unless something should be talking).");
}

static void TestLoopback(void)
{
    short got; Boolean trunc; char b[80]; short n;
    static const char *probe = "LOOPBACK-TEST-12345\r";
    if (!EnsureOpen()) return;
    EmitLine("");
    EmitLine("Loopback - sending a known string, watching for it to return.");
    EmitLine("  (Needs TXD-RXD jumpered, OR modem echo on.)");
    DrainInput();
    SendStr(probe);
    got = CaptureFor(90, gCap, sizeof(gCap), &trunc);
    n = 0; CatStr(b, &n, "  received "); CatLong(b, &n, got);
    CatStr(b, &n, " bytes"); b[n] = 0; EmitLine(b);
    if (got > 0) DumpCapture(gCap, (got > (short)sizeof(gCap)) ? sizeof(gCap) : got, true);
    if (got >= 5) EmitLine("  Bytes returned: TX and RX are both alive.");
    else EmitLine("  Nothing back: no echo path (expected without a jumper).");
}

static void TestModemInfo(void)
{
    short got; Boolean trunc;
    if (!EnsureOpen()) return;
    EmitLine("");
    EmitLine("Modem Info - ATI ...");
    DrainInput();
    SendStr("ATI\r");
    got = CaptureFor(120, gCap, sizeof(gCap), &trunc);
    if (got > 0) DumpCapture(gCap, (got > (short)sizeof(gCap)) ? sizeof(gCap) : got, true);
    else EmitLine("  no response.");
}

/* ================= terminal mode ================= */

/* drain whatever's waiting and echo it to the console (live) */
static void PumpTerminal(void)
{
    long avail, cnt;
    if (!gPortOpen) return;
    if (SerGetBuf(gInRef, &avail) != noErr || avail <= 0) return;
    cnt = avail; if (cnt > (long)sizeof(gSerBuf)) cnt = sizeof(gSerBuf);
    if (FSRead(gInRef, &cnt, gSerBuf) != noErr) return;
    DumpCapture((unsigned char *)gSerBuf, (short)cnt, false);
}

static void TerminalKey(char ch)
{
    char out[2];
    if (!gPortOpen) { SysBeep(1); return; }
    out[0] = ch;
    SendBytes(out, 1);
    if (gLocalEcho) {
        unsigned char one = (unsigned char)ch;
        DumpCapture(&one, 1, false);
    }
}

/* ================= menus ================= */

static void SyncMarks(void)
{
    SetItemMark(gPortM, kPortModem,   gPortSel == 0 ? checkMark : noMark);
    SetItemMark(gPortM, kPortPrinter, gPortSel == 1 ? checkMark : noMark);
    SetItemMark(gPortM, kBaud1200,  gBaudIdx == 0 ? checkMark : noMark);
    SetItemMark(gPortM, kBaud2400,  gBaudIdx == 1 ? checkMark : noMark);
    SetItemMark(gPortM, kBaud9600,  gBaudIdx == 2 ? checkMark : noMark);
    SetItemMark(gPortM, kBaud19200, gBaudIdx == 3 ? checkMark : noMark);
    SetItemMark(gTermM, kTermMode, gTermMode  ? checkMark : noMark);
    SetItemMark(gTermM, kTermEcho, gLocalEcho ? checkMark : noMark);
    SetItemMark(gTermM, kTermHex,  gHexView   ? checkMark : noMark);
}

static void DoAbout(void)
{
    EmitLine("");
    EmitLine("================ SerialDoc ================");
    EmitLine(" Serial-port diagnostics for the Macintosh Plus");
    EmitLine(" code by Claude Code, for Bart Decrem");
    EmitLine("");
    EmitLine(" Quick start:");
    EmitLine("  1. Port > Open Port  (defaults: Modem, 9600)");
    EmitLine("  2. Tests > Baud Sweep   <- find cable + baud");
    EmitLine("  3. Tests > AT Probe     <- expect PASS / OK");
    EmitLine("  Stuck? Terminal menu > Hex View, then re-run.");
    EmitLine("===========================================");
}

static void DoPortMenu(short item)
{
    switch (item) {
        case kPortModem:
            if (gPortSel != 0) { CloseSerPort(); gPortSel = 0; }
            break;
        case kPortPrinter:
            if (gPortSel != 1) { CloseSerPort(); gPortSel = 1; }
            break;
        case kBaud1200:  gBaudIdx = 0; if (gPortOpen) ConfigPort(kBaudTab[0].config); break;
        case kBaud2400:  gBaudIdx = 1; if (gPortOpen) ConfigPort(kBaudTab[1].config); break;
        case kBaud9600:  gBaudIdx = 2; if (gPortOpen) ConfigPort(kBaudTab[2].config); break;
        case kBaud19200: gBaudIdx = 3; if (gPortOpen) ConfigPort(kBaudTab[3].config); break;
        case kPortOpen:  OpenSerPort();  break;
        case kPortClose: CloseSerPort(); break;
    }
    if (item >= kBaud1200 && item <= kBaud19200 && gPortOpen) {
        char b[48]; short n = 0;
        CatStr(b, &n, "--- baud now "); CatStr(b, &n, kBaudTab[gBaudIdx].name);
        CatStr(b, &n, " ---"); b[n] = 0; EmitLine(b);
    }
    SyncMarks();
}

static void DoTestMenu(short item)
{
    switch (item) {
        case kTestAT:    TestATProbe();   break;
        case kTestSweep: TestBaudSweep(); break;
        case kTestRX:    TestRXMonitor(); break;
        case kTestLoop:  TestLoopback();  break;
        case kTestInfo:  TestModemInfo(); break;
        case kTestClear:
            TESetSelect(0, (*gTE)->teLength, gTE);
            TEDelete(gTE);
            ScrollToBottom();
            break;
    }
}

static void DoTermMenu(short item)
{
    switch (item) {
        case kTermMode:
            gTermMode = !gTermMode;
            if (gTermMode) {
                EnsureOpen();
                EmitLine("");
                EmitLine("--- Terminal Mode ON: type to send (Return = CR) ---");
                TEActivate(gTE);
            } else {
                EmitLine("--- Terminal Mode OFF ---");
            }
            break;
        case kTermEcho: gLocalEcho = !gLocalEcho; break;
        case kTermHex:  gHexView   = !gHexView;   break;
    }
    SyncMarks();
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
        case kFileMenu: gDone = true; break;
        case kPortMenu: DoPortMenu(item); break;
        case kTestMenu: DoTestMenu(item); break;
        case kTermMenu: DoTermMenu(item); break;
    }
    HiliteMenu(0);
}

/* ================= events ================= */

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
            } else if (gTermMode) {
                TerminalKey(ch);
            }
            break;
        case updateEvt: {
            WindowPtr w = (WindowPtr)ev->message;
            BeginUpdate(w);
            SetPort(w);
            { Rect r = (*gTE)->viewRect; EraseRect(&r); TEUpdate(&r, gTE); }
            EndUpdate(w);
            break;
        }
        case activateEvt: break;
    }
}

/* ================= setup ================= */

static void SetUpMenus(void)
{
    Str255 appleTitle;
    appleTitle[0] = 1; appleTitle[1] = 0x14;     /* apple symbol */

    gAppleM = NewMenu(kAppleMenu, appleTitle);
    AppendMenu(gAppleM, "\pAbout SerialDoc");
    AppendMenu(gAppleM, "\p(-");
    AppendResMenu(gAppleM, 'DRVR');
    InsertMenu(gAppleM, 0);

    gFileM = NewMenu(kFileMenu, "\pFile");
    AppendMenu(gFileM, "\pQuit/Q");
    InsertMenu(gFileM, 0);

    gPortM = NewMenu(kPortMenu, "\pPort");
    AppendMenu(gPortM,
        "\pModem Port;Printer Port;(-;1200 baud;2400 baud;9600 baud;19200 baud;(-;Open Port/O;Close Port/W");
    InsertMenu(gPortM, 0);

    gTestM = NewMenu(kTestMenu, "\pTests");
    AppendMenu(gTestM,
        "\pAT Probe/T;Baud Sweep/B;RX Monitor (10s)/R;Loopback Test/L;Modem Info (ATI)/I;(-;Clear Log/K");
    InsertMenu(gTestM, 0);

    gTermM = NewMenu(kTermMenu, "\pTerminal");
    AppendMenu(gTermM, "\pTerminal Mode/M;Local Echo;Hex View/H");
    InsertMenu(gTermM, 0);

    DrawMenuBar();
}

static void SetUpWindow(void)
{
    Rect r, view;
    short left = (qd.screenBits.bounds.right - WIN_W) / 2;
    short top  = qd.screenBits.bounds.top + 24;
    SetRect(&r, left, top, left + WIN_W, top + WIN_H);
    gWin = NewWindow(0L, &r, "\pSerialDoc", true, documentProc,
                     (WindowPtr)-1L, false, 0);
    SetPort(gWin);
    TextFont(monaco); TextSize(9);          /* TE inherits this monospaced font */

    SetRect(&view, TE_PAD, TE_PAD, WIN_W - TE_PAD, WIN_H - TE_PAD);
    gTE = TENew(&view, &view);
    TEAutoView(true, gTE);
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

int main(void)
{
    EventRecord ev;

    InitToolbox();
    SetUpMenus();
    SetUpWindow();
    SyncMarks();

    EmitLine("SerialDoc ready.  Apple menu > About for a 3-step quick start.");
    EmitLine("Port > Open Port, then Tests > Baud Sweep.");

    while (!gDone) {
        long sleep = (gTermMode && gPortOpen) ? 2L : 15L;
        if (WaitNextEvent(everyEvent, &ev, sleep, 0L)) {
            HandleEvent(&ev);
        }
        if (gTermMode && gPortOpen) { PumpTerminal(); TEIdle(gTE); }
    }
    if (gPortOpen) CloseSerPort();
    return 0;
}
