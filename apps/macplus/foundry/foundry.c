/*
 * Macinclaude Foundry - "describe an app, receive an app" for the Mac Plus.
 * (System 6.0.8, 68000.) Built with Retro68.
 *
 * The Plus sends one line ("MAKE <wish>"); on the modern side Claude writes
 * the Toolbox C, Retro68 cross-compiles it, and the resulting MacBinary is
 * streamed back over a TCP socket (FND frames, see foundry_rx.inc). This
 * app shows the build log as it happens, then decodes the MacBinary ON THE
 * FLY - writing the data and resource forks straight to the boot disk - so
 * when the transfer ends there is a real, double-clickable application
 * sitting in the Finder that did not exist three minutes earlier.
 *
 * UI: a build-log console window + one dialog ("What should the app do?").
 * The transport is the shared MacTCP client (net/nettcp): the Plus opens a
 * real TCP socket to the agent through the BlueSCSI DaynaPORT + MacTCP - no
 * RetroWiFi AT/ATDT modem dialing anymore (mirrors atkinson.c).
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

#include "nettcp.h"       /* WiFi/TCP transport (BlueSCSI DaynaPORT + MacTCP) */

#ifndef monaco
#define monaco 4
#endif
#ifndef geneva
#define geneva 3
#endif
#ifndef systemFont
#define systemFont 0
#endif

/* ---- menus ---- */
#define kAppleMenu   128
#define kFileMenu    129
#define kEditMenu    130
#define kConnMenu    131
#define kFoundryMenu 132

#define kFileQuit 1

#define kConnConnect    1
#define kConnDisconnect 2
/* 3 separator */
#define kConnSettings   4

#define kFndNew  1
/* 2 separator */
#define kFndTest 3

/* ---- Settings dialog (foundry.r DLOG/DITL 128) ---- */
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

/* ---- prompt dialog (foundry.r DLOG/DITL 129) ---- */
#define kDlgPrompt  129
#define kPromptGo     1
#define kPromptCancel 2
#define kPromptLabel  3
#define kPromptEdit   4
#define kPromptFrame  5

/* ---- prefs ---- */
#define kPrefMagic   0x4659      /* 'FY' */
#define kPrefVersion 1
#define kPrefName    "\pFoundry Prefs"
#define kPrefCreator 'FNDY'
#define kPrefType    'pref'

typedef struct {
    short          magic;
    short          version;
    short          baudIdx;
    unsigned short tcpPort;       /* 2327 = the foundry agent */
    Str255         host;
    Str255         ssid;
    Str255         pass;
    Boolean        wifiSaved;
    Boolean        pad;
} Config;

static Config gCfg;
static Boolean gHaveCfg = false;
static short   gPrefVRef = 0;

/* ---- window / console ---- */
#define WIN_W 496
#define WIN_H 300
#define LOG_LINES 100
#define LOG_COLS  82

/* the parser (foundry_rx.inc, included below the callbacks) owns these;
 * tentative definition + macro so the callbacks can reset parser state */
static short gRxState;
#define FRX_IDLE 0

static short strlenC(const char *s) { short n = 0; while (s[n]) n++; return n; }

static char  gLog[LOG_LINES][LOG_COLS + 1];
static short gLogHead = 0;       /* next slot */
static short gLogCount = 0;

/* ---- globals ---- */
static WindowPtr  gWin;
static MenuHandle gAppleM, gFileM, gEditM, gConnM, gFndM;
static Boolean    gDone = false;

static NetConn gConn;                  /* the TCP connection to the agent */
static Boolean gConnected = false;     /* in a live session with the agent */

/* Receive scratch: apps stream large, so drain a big chunk per pump pass over
 * fast TCP (mirrors bridge.c's PumpBridge). */
static unsigned char gNetBuf[4096];

/* ---- baud table ---- */
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

/* ================= status line (window title) ================= */

static void SetStatus(const char *msg)
{
    Str255 t; short n = 0; char b[120];
    CatStr(b, &n, "Macinclaude Foundry");
    if (msg && msg[0]) { CatStr(b, &n, " - "); CatStr(b, &n, msg); if (n > 100) n = 100; }
    b[n] = 0;
    C2P(b, t);
    if (gWin) SetWTitle(gWin, t);
}

/* ================= console ================= */

static void DrawConsole(void)
{
    Rect r;
    short visible, i, y, idx, start;
    SetPort(gWin);
    SetRect(&r, 0, 0, WIN_W, WIN_H);
    EraseRect(&r);
    TextFont(monaco); TextSize(9); TextFace(0);
    visible = (WIN_H - 10) / 11;
    start = gLogCount > visible ? gLogCount - visible : 0;
    y = 16;
    for (i = start; i < gLogCount; i++) {
        idx = (gLogHead - gLogCount + i + LOG_LINES * 2) % LOG_LINES;
        MoveTo(8, y);
        DrawText(gLog[idx], 0, (short)strlenC(gLog[idx]));
        y += 11;
    }
}

static void AddLogRaw(const char *s)
{
    short i;
    for (i = 0; i < LOG_COLS && s[i]; i++) gLog[gLogHead][i] = s[i];
    gLog[gLogHead][i] = 0;
    gLogHead = (gLogHead + 1) % LOG_LINES;
    if (gLogCount < LOG_LINES) gLogCount++;
}

/* append a message, wrapping at the console width */
static void AddLog(const char *s)
{
    char chunk[LOG_COLS + 1];
    short i = 0, n;
    long total;
    StrLen(s, &total);
    if (total == 0) { AddLogRaw(""); DrawConsole(); return; }
    while (i < (short)total) {
        n = (short)(total - i) > LOG_COLS ? LOG_COLS : (short)(total - i);
        { short k; for (k = 0; k < n; k++) chunk[k] = s[i + k]; chunk[n] = 0; }
        AddLogRaw(chunk);
        i += n;
    }
    DrawConsole();
}

/* ================= MacBinary receive -> files on disk ================= */

static unsigned char gMBHead[128];
static long   gMBPos = 0;            /* position within the whole delivery */
static long   gMBDataLen = 0, gMBRsrcLen = 0, gMBDataPadded = 0;
static Str255 gMBName;
static short  gDataRef = 0, gRsrcRef = 0;
static Boolean gMBOpen = false;
static short  gLastPct = -1;
static long   gMBTotal = 0;

static void MBCloseFiles(void)
{
    if (gDataRef) { FSClose(gDataRef); gDataRef = 0; }
    if (gRsrcRef) { FSClose(gRsrcRef); gRsrcRef = 0; }
}

static void MBAbortFile(void)
{
    MBCloseFiles();
    if (gMBOpen) { FSDelete(gMBName, 0); gMBOpen = false; }
}

/* Read a 4-byte OSType out of the MacBinary header WITHOUT a misaligned long
 * read: gMBHead[65]/[69] land on odd addresses, and *(OSType*)oddAddr is an
 * address error (instant bomb) on the 68000. Assemble it big-endian by byte. */
static OSType MBHeadType(short off)
{
    return ((OSType)gMBHead[off] << 24) | ((OSType)gMBHead[off + 1] << 16) |
           ((OSType)gMBHead[off + 2] << 8) | (OSType)gMBHead[off + 3];
}

static OSErr MBCreateUnique(void)
{
    OSErr err;
    short tryN;
    Str255 base;
    short i;
    OSType creator = MBHeadType(69), ftype = MBHeadType(65);
    for (i = 0; i <= gMBName[0]; i++) base[i] = gMBName[i];
    for (tryN = 0; tryN <= 8; tryN++) {
        if (tryN > 0) {
            for (i = 0; i <= base[0]; i++) gMBName[i] = base[i];
            if (gMBName[0] < 31) {
                gMBName[0]++;
                gMBName[gMBName[0]] = (unsigned char)('1' + tryN);
            } else {
                gMBName[gMBName[0]] = (unsigned char)('1' + tryN);
            }
        }
        err = Create(gMBName, 0, creator, ftype);
        if (err == noErr) return noErr;
        if (err != dupFNErr) return err;
    }
    return dupFNErr;
}

static Boolean MBParseHeader(void)
{
    long dlen, rlen;
    short nameLen = gMBHead[1];
    char cname[64];
    short i;

    if (gMBHead[0] != 0 || nameLen < 1 || nameLen > 31) return false;
    gMBName[0] = (unsigned char)nameLen;
    for (i = 0; i < nameLen; i++) gMBName[i + 1] = gMBHead[2 + i];

    dlen = ((long)gMBHead[83] << 24) | ((long)gMBHead[84] << 16) |
           ((long)gMBHead[85] << 8) | (long)gMBHead[86];
    rlen = ((long)gMBHead[87] << 24) | ((long)gMBHead[88] << 16) |
           ((long)gMBHead[89] << 8) | (long)gMBHead[90];
    if (dlen < 0 || rlen < 0 || dlen + rlen > 850000L) return false;
    gMBDataLen = dlen;
    gMBRsrcLen = rlen;
    gMBDataPadded = ((dlen + 127L) / 128L) * 128L;

    if (MBCreateUnique() != noErr) return false;
    gMBOpen = true;
    if (FSOpen(gMBName, 0, &gDataRef) != noErr) { MBAbortFile(); return false; }
    if (OpenRF(gMBName, 0, &gRsrcRef) != noErr) { MBAbortFile(); return false; }

    P2C(gMBName, cname);
    {
        char b[120]; short n = 0;
        CatStr(b, &n, "incoming app: ");
        CatStr(b, &n, cname);
        CatStr(b, &n, " (");
        CatLong(b, &n, gMBDataLen + gMBRsrcLen);
        CatStr(b, &n, " bytes of forks)");
        b[n] = 0;
        AddLog(b);
    }
    return true;
}

/* route decoded delivery bytes: header -> data fork -> padding -> rsrc fork */
static Boolean MBConsume(const unsigned char *b, short n)
{
    short i = 0;
    while (i < n) {
        if (gMBPos < 128) {
            gMBHead[gMBPos] = b[i];
            gMBPos++; i++;
            if (gMBPos == 128) {
                if (!MBParseHeader()) return false;
            }
            continue;
        }
        {
            long off = gMBPos - 128;
            long want, cnt;
            if (off < gMBDataPadded) {
                /* data fork region (with padding to skip) */
                if (off < gMBDataLen) {
                    want = gMBDataLen - off;
                    cnt = (long)(n - i) < want ? (long)(n - i) : want;
                    if (FSWrite(gDataRef, &cnt, (Ptr)(b + i)) != noErr) return false;
                } else {
                    want = gMBDataPadded - off;          /* padding */
                    cnt = (long)(n - i) < want ? (long)(n - i) : want;
                }
                gMBPos += cnt; i += (short)cnt;
            } else {
                long roff = off - gMBDataPadded;
                if (roff < gMBRsrcLen) {
                    want = gMBRsrcLen - roff;
                    cnt = (long)(n - i) < want ? (long)(n - i) : want;
                    if (FSWrite(gRsrcRef, &cnt, (Ptr)(b + i)) != noErr) return false;
                } else {
                    cnt = n - i;                          /* trailing padding */
                }
                gMBPos += cnt; i += (short)cnt;
            }
        }
    }
    return true;
}

/* ================= rx callbacks (foundry_rx.inc contract) ================= */

static void RxLog(const char *msg) { AddLog(msg); SetStatus("building..."); }

static void RxFail(const char *msg)
{
    char b[220]; short n = 0;
    MBAbortFile();
    gMBPos = 0;
    CatStr(b, &n, "FAILED: ");
    CatStr(b, &n, msg);
    b[n] = 0;
    AddLog(b);
    SetStatus("failed");
    SysBeep(1);
}

static void BinBegin(long total)
{
    gMBPos = 0;
    gMBTotal = total;
    gLastPct = -1;
    gMBDataLen = gMBRsrcLen = gMBDataPadded = 0;
    gMBOpen = false;
    AddLog("delivery starting...");
}

static void BinBytes(const unsigned char *b, short n)
{
    short pct;
    if (!MBConsume(b, n)) {
        /* turn a local failure into a parser abort so state resets */
        MBAbortFile();
        gMBPos = 0;
        AddLog("FAILED: could not write the app to disk");
        SetStatus("disk error");
        SysBeep(1);
        gRxState = FRX_IDLE;
        return;
    }
    if (gMBTotal > 0) {
        pct = (short)((gMBPos * 100L) / gMBTotal);
        if (pct >= gLastPct + 5) {
            char b2[40]; short n2 = 0;
            gLastPct = pct;
            CatStr(b2, &n2, "receiving ");
            CatLong(b2, &n2, (long)pct);
            CatStr(b2, &n2, "%");
            b2[n2] = 0;
            SetStatus(b2);
        }
    }
}

static void BinDone(void)
{
    char cname[64];
    MBCloseFiles();
    gMBOpen = false;
    gMBPos = 0;
    FlushVol(NULL, 0);
    P2C(gMBName, cname);
    {
        char b[140]; short n = 0;
        CatStr(b, &n, "DONE - '");
        CatStr(b, &n, cname);
        CatStr(b, &n, "' is on the startup disk.");
        b[n] = 0;
        AddLog(b);
    }
    AddLog("quit Foundry (Cmd-Q), then double-click it in the Finder.");
    SetStatus(cname);
    SysBeep(1);
}

#include "foundry_rx.inc"

/* ================= TCP transport primitives =================
 * These replace the RetroWiFi serial-modem path. The Plus now opens a real TCP
 * socket to the agent through the BlueSCSI DaynaPORT + MacTCP (see net/nettcp).
 * The FND wire protocol on top of it is unchanged - only the pipe is. */

/* Send a C string over the connection (the one "MAKE <wish>" line + its \r). */
static void SendStr(const char *s)
{
    long n;
    if (!gConnected) return;
    StrLen(s, &n);
    if (n > 0) NetSend(&gConn, s, (unsigned short)n);
}

/* Discard any bytes already waiting on the socket (stale tail from a prior
   delivery), so a new MAKE starts the parser on a clean stream. */
static void DrainInput(void)
{
    long avail;
    if (!gConnected) return;
    while ((avail = NetAvailable(&gConn)) > 0) {
        unsigned short cnt = (avail > (long)sizeof(gNetBuf))
                             ? (unsigned short)sizeof(gNetBuf) : (unsigned short)avail;
        if (NetRecv(&gConn, gNetBuf, cnt, 2) <= 0) break;
    }
}

/* Non-blocking: drain whatever TCP bytes have arrived into the FND parser.
   Called every event-loop pass, so the build log + MacBinary delivery develop
   as data streams in - now near-instantly over TCP. Apps stream large, so we
   pull up to a 4096-byte chunk per pass (mirrors bridge.c's PumpBridge). */
static void PumpReceive(void)
{
    long avail, got; short i;
    if (!gConnected) return;
    avail = NetAvailable(&gConn);
    if (avail <= 0) {
        if (avail < 0) { FrxAbort("connection dropped"); gConnected = false; return; }
        if (gRxState != FRX_IDLE && (long)(TickCount() - gRxDeadline) > 0)
            FrxAbort("timed out waiting for the agent");
        return;
    }
    if (avail > (long)sizeof(gNetBuf)) avail = sizeof(gNetBuf);
    got = NetRecv(&gConn, gNetBuf, (unsigned short)avail, 5);
    if (got <= 0) return;
    for (i = 0; i < (short)got; i++) FeedRxByte(gNetBuf[i]);
    gRxDeadline = TickCount() + 180L * 60L;   /* codegen can be slow; 3 min of silence */
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
    gCfg.baudIdx = 2;               /* 9600 */
    gCfg.tcpPort = 2327;            /* the foundry agent */
    /* default host: the machine with the Retro68 toolchain (the iMac today;
     * becomes the mini once the toolchain lands there - Settings can change it) */
    { const char *h = "192.168.7.189"; gCfg.host[0] = 13;
      for (i = 0; i < 13; i++) gCfg.host[i + 1] = (unsigned char)h[i]; }
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

/* ================= connection ================= */

/* Open a TCP connection to the agent (host:port from prefs). WiFi itself is
   now brought up by the BlueSCSI (DaynaPORT), not by this app - so there is no
   AT/ATDT/AT&W handshake anymore, just a socket. */
static Boolean DialAgent(void)
{
    char hostC[256];
    unsigned long ip;
    OSErr err;

    if (gConnected) return true;

    SetStatus("connecting...");
    P2C(gCfg.host, hostC);
    ip = NetParseIP(hostC);
    if (ip == 0) { SetStatus("bad server IP - check Settings"); return false; }

    err = NetConnect(&gConn, ip, gCfg.tcpPort);
    if (err != noErr) {
        char msg[80]; short n = 0;
        CatStr(msg, &n, "connect failed: ");
        CatStr(msg, &n, (char *)NetErrStr(err));
        msg[n] = 0;
        SetStatus(msg);
        return false;
    }

    gConnected = true;
    gRxState = FRX_IDLE;
    gRxLineLen = 0;
    gRxDeadline = TickCount() + 60L * 60L;
    SetStatus("connected - Foundry > New App to build");
    AddLog("connected to the foundry agent.");
    return true;
}

static void Disconnect(void)
{
    if (gConnected) NetClose(&gConn);
    gConnected = false;
    gRxState = FRX_IDLE;
    SetStatus("disconnected");
}

/* ================= sending ================= */

#ifdef FOUNDRY_TEST
#include "test_frame.h"   /* gTestFrame[] - a real FND frame delivering Hello */
static void LoadTestFrame(void)
{
    long i, n;
    StrLen(gTestFrame, &n);
    AddLog("(test build: replaying the embedded delivery)");
    for (i = 0; i < n; i++) FeedRxByte((unsigned char)gTestFrame[i]);
}
#endif

static void SendMake(const char *wish)
{
#ifdef FOUNDRY_TEST
    (void)wish;
    LoadTestFrame();
    return;
#else
    static char cmd[280]; short n = 0;
    if (!gConnected) { SetStatus("not connected - use Connection > Connect"); SysBeep(1); return; }
    if (gRxState == FRX_BIN) { SetStatus("still receiving - wait"); SysBeep(1); return; }
    CatStr(cmd, &n, "MAKE ");
    CatStr(cmd, &n, wish);
    cmd[n] = 0;
    AddLog("");
    {
        static char b[280]; short n2 = 0;
        CatStr(b, &n2, "> ");
        CatStr(b, &n2, wish);
        b[n2] = 0;
        AddLog(b);
    }
    DrainInput();
    gRxLineLen = 0;
    SendStr(cmd);
    SendStr("\r");
    gRxDeadline = TickCount() + 180L * 60L;
    SetStatus("sent...");
#endif
}

/* ================= dialogs (the proven Atkinson/Surf set) ================= */

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
            if (pv < 1) pv = 2327;
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
        SetStatus("settings saved - Connection > Connect");
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

static void DoNewApp(void)
{
    static char wish[240];
    if (!DoPromptDialog(wish, sizeof(wish))) return;
    SendMake(wish);
}

/* ================= menus / events ================= */

static void SyncMenus(void)
{
    Boolean up = gConnected;
#ifdef FOUNDRY_TEST
    up = true;
#endif
    if (up) {
        DisableItem(gConnM, kConnConnect);
        EnableItem(gConnM, kConnDisconnect);
        EnableItem(gFndM, kFndNew);
    } else {
        EnableItem(gConnM, kConnConnect);
        DisableItem(gConnM, kConnDisconnect);
        DisableItem(gFndM, kFndNew);
    }
}

static void DoAbout(void)
{
    AddLog("macinclaude foundry - describe an app, receive an app.");
    AddLog("claude writes the C, a 68000 cross-compiler builds it, and the");
    AddLog("binary arrives over the phone line. software, freshly forged.");
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
        case kFoundryMenu:
            switch (item) {
                case kFndNew:  DoNewApp(); break;
#ifdef FOUNDRY_TEST
                case kFndTest: LoadTestFrame(); break;
#else
                case kFndTest: AddLog("(test delivery is a Mini vMac build thing)"); break;
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
            if (w == gWin) DrawConsole();
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
    AppendMenu(gAppleM, "\pAbout Macinclaude Foundry");
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

    gFndM = NewMenu(kFoundryMenu, "\pFoundry");
    AppendMenu(gFndM, "\pNew App.../N;(-;Load Test Delivery");
    InsertMenu(gFndM, 0);

    DrawMenuBar();
}

static void SetUpWindow(void)
{
    Rect r;
    short left = (qd.screenBits.bounds.right - WIN_W) / 2;
    short top  = qd.screenBits.bounds.top + 40;
    SetRect(&r, left, top, left + WIN_W, top + WIN_H);
    gWin = NewWindow(0L, &r, "\pMacinclaude Foundry", true, documentProc,
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

static void CenterText(short winW, short y, ConstStr255Param s)
{
    MoveTo((winW - StringWidth(s)) / 2, y); DrawString(s);
}

/* an anvil with the Claude spark rising off it */
static void DrawAnvil(short cx, short topY)
{
    Rect r;
    /* horn + face */
    SetRect(&r, cx - 52, topY + 24, cx + 40, topY + 44); PaintRect(&r);
    SetRect(&r, cx + 36, topY + 26, cx + 56, topY + 38); PaintRect(&r);
    /* waist */
    SetRect(&r, cx - 18, topY + 44, cx + 14, topY + 58); PaintRect(&r);
    /* base */
    SetRect(&r, cx - 34, topY + 58, cx + 30, topY + 70); PaintRect(&r);
    /* spark above the face */
    {
        static const short ux[12] = {100,87,50,0,-50,-87,-100,-87,-50,0,50,87};
        static const short uy[12] = {0,50,87,100,87,50,0,-50,-87,-100,-87,-50};
        short i, len; Rect d;
        short sx = cx - 6, sy = topY + 6;
        PenSize(2, 2);
        for (i = 0; i < 12; i++) {
            len = (i & 1) ? 8 : 13;
            MoveTo(sx, sy);
            Line(ux[i] * len / 100, uy[i] * len / 100);
        }
        PenSize(1, 1);
        SetRect(&d, sx - 2, sy - 2, sx + 3, sy + 3); PaintOval(&d);
    }
}

static void ShowSplash(void)
{
    Rect rp, bar, fill; short bx; long t;
    SetPort(gWin);
    SetRect(&rp, 0, 0, WIN_W, WIN_H); EraseRect(&rp);
    DrawAnvil(WIN_W / 2, 26);
    TextFont(systemFont); TextFace(bold); TextSize(20);
    CenterText(WIN_W, 140, "\pMACINCLAUDE");
    CenterText(WIN_W, 162, "\pFOUNDRY");
    TextFace(0); TextSize(12);
    CenterText(WIN_W, 192, "\pdescribe an app. receive an app.");
    bx = (WIN_W - 240) / 2;
    SetRect(&bar, bx, 208, bx + 240, 226);
    PenSize(2, 2); FrameRoundRect(&bar, 12, 12); PenSize(1, 1);
    SetRect(&fill, bx + 4, 212, bx + 4 + 232 * 38 / 100, 222); PaintRoundRect(&fill, 8, 8);
    TextSize(9);
    CenterText(WIN_W, 252, "\pclaude writes it. the cross-compiler forges it. the wire delivers it.");
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

    gHaveCfg = LoadPrefs();
#ifdef FOUNDRY_TEST
    (void)gHaveCfg;
    gConnected = true;
    SetStatus("TEST BUILD");
    AddLog("TEST BUILD - Foundry > New App (or Load Test Delivery) replays an");
    AddLog("embedded delivery and writes a real app to the startup disk.");
#else
    if (!gHaveCfg) {
        SetDefaults();
        SetStatus("first run - set things up");
        if (DoSettingsDialog()) {
            SavePrefs();
            gHaveCfg = true;
        } else {
            SetStatus("setup cancelled - use Connection > Settings");
        }
    }
    if (gHaveCfg) DialAgent();
#endif
    SyncMenus();

    while (!gDone) {
        long sleep = (gConnected && gRxState != FRX_IDLE) ? 1L : 15L;
        if (WaitNextEvent(everyEvent, &ev, sleep, 0L))
            HandleEvent(&ev);
#ifndef FOUNDRY_TEST
        if (gConnected) PumpReceive();
#endif
    }
    if (gConnected) Disconnect();
    return 0;
}
