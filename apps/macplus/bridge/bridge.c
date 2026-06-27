/*
 * The Bridge — over-the-air app delivery to the Mac Plus.
 *
 * Keep this app running and the mini can push you new applications over WiFi:
 * drop a built MacBinary (.bin) into the mini's bridge outbox and it streams
 * here as an FND frame; the Bridge decodes it on the fly and writes both forks
 * to the boot disk, so a new (or updated, versioned) app appears in the Finder
 * with no SD-card shuttling.
 *
 * It rides the WiFi SYSTEM SERVICE (wifi.h) — opens a "bridge" channel, no
 * dialing — and reuses Foundry's proven MacBinary-to-disk writer + frame parser
 * (../foundry/foundry_rx.inc). The writer is the same one, including the
 * odd-address fix that stops the 68000 bus-error bomb.
 */
#include <Quickdraw.h>
#include <Windows.h>
#include <Fonts.h>
#include <Events.h>
#include <Menus.h>
#include <TextEdit.h>
#include <Dialogs.h>
#include <ToolUtils.h>
#include <Sound.h>
#include <Memory.h>
#include <OSUtils.h>
#include <Files.h>
#include "nettcp.h"        /* direct TCP via MacTCP (BlueSCSI DaynaPORT) */

#define BRIDGE_IP   "192.168.7.50"
#define BRIDGE_PORT 2333

#ifndef monaco
#define monaco 4
#endif
#ifndef geneva
#define geneva 3
#endif

#define kAppleMenu 128
#define kFileMenu  129
#define kFileQuit  1

#define WIN_H 300
#define LOG_LINES 100
#define LOG_COLS  82

static WindowPtr  gWin;
static MenuHandle gAppleM, gFileM;
static NetConn    gConn;
static Boolean    gConnected = false;
static long  gInstalled = 0;       /* count of apps received this session */

/* ---- small helpers (same as Foundry) ---- */
static short strlenC(const char *s) { short n = 0; while (s[n]) n++; return n; }
static void CatStr(char *buf, short *len, const char *s) { short i; for (i = 0; s[i]; i++) buf[(*len)++] = s[i]; }
static void CatLong(char *buf, short *len, long v) { char t[12]; short n = 0; if (v<0){buf[(*len)++]='-';v=-v;} if(v==0)t[n++]='0'; while(v>0){t[n++]=(char)('0'+v%10);v/=10;} while(n>0)buf[(*len)++]=t[--n]; }
static void P2C(ConstStr255Param p, char *c) { short i, n = p[0]; for (i = 0; i < n; i++) c[i] = (char)p[i+1]; c[n] = 0; }

/* ---- log console ---- */
static char  gLog[LOG_LINES][LOG_COLS + 1];
static short gLogHead = 0, gLogCount = 0;

static void DrawConsole(void)
{
    short visible, start, i, idx, y;
    Rect r;
    SetPort(gWin);
    r = gWin->portRect;
    EraseRect(&r);
    TextFont(monaco); TextSize(9);
    visible = (r.bottom - r.top - 8) / 12;
    start = gLogCount > visible ? gLogCount - visible : 0;
    y = r.top + 14;
    for (i = start; i < gLogCount; i++) {
        idx = (gLogHead - gLogCount + i + LOG_LINES * 2) % LOG_LINES;
        MoveTo(r.left + 6, y);
        DrawText(gLog[idx], 0, strlenC(gLog[idx]));
        y += 12;
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

static void AddLog(const char *s)
{
    char chunk[LOG_COLS + 1];
    short i = 0, n; long total;
    total = strlenC(s);
    if (total == 0) { AddLogRaw(""); DrawConsole(); return; }
    while (i < (short)total) {
        n = (short)(total - i) > LOG_COLS ? LOG_COLS : (short)(total - i);
        { short k; for (k = 0; k < n; k++) chunk[k] = s[i + k]; chunk[n] = 0; }
        AddLogRaw(chunk);
        i += n;
    }
    DrawConsole();
}

static void SetTitle(const char *s) { Str255 p; short i = 0; while (s[i] && i < 254) { p[i+1] = s[i]; i++; } p[0] = (unsigned char)i; SetWTitle(gWin, p); }

/* the parser (foundry_rx.inc, included below the callbacks) owns gRxState;
 * tentative decl + macro so the callbacks can reset it */
static short gRxState;
#define FRX_IDLE 0

/* ================= MacBinary receive -> files on disk (from Foundry) ======= */
static unsigned char gMBHead[128];
static long   gMBPos = 0;
static long   gMBDataLen = 0, gMBRsrcLen = 0, gMBDataPadded = 0;
static Str255 gMBName;
static short  gDataRef = 0, gRsrcRef = 0;
static Boolean gMBOpen = false;
static long   gMBTotal = 0;
static short  gLastPct = -1;

static void MBCloseFiles(void) { if (gDataRef) { FSClose(gDataRef); gDataRef = 0; } if (gRsrcRef) { FSClose(gRsrcRef); gRsrcRef = 0; } }
static void MBAbortFile(void) { MBCloseFiles(); if (gMBOpen) { FSDelete(gMBName, 0); gMBOpen = false; } }

/* odd-address-safe OSType read (gMBHead[65]/[69] are odd -> a long read there
 * is a 68000 bus error). Assemble big-endian by byte. */
static OSType MBHeadType(short off) { return ((OSType)gMBHead[off]<<24)|((OSType)gMBHead[off+1]<<16)|((OSType)gMBHead[off+2]<<8)|(OSType)gMBHead[off+3]; }

static OSErr MBCreateUnique(void)
{
    OSErr err; short tryN; Str255 base; short i;
    OSType creator = MBHeadType(69), ftype = MBHeadType(65);
    for (i = 0; i <= gMBName[0]; i++) base[i] = gMBName[i];
    for (tryN = 0; tryN <= 8; tryN++) {
        if (tryN > 0) {
            for (i = 0; i <= base[0]; i++) gMBName[i] = base[i];
            if (gMBName[0] < 31) { gMBName[0]++; gMBName[gMBName[0]] = (unsigned char)('1' + tryN); }
            else { gMBName[gMBName[0]] = (unsigned char)('1' + tryN); }
        }
        err = Create(gMBName, 0, creator, ftype);
        if (err == noErr) return noErr;
        if (err != dupFNErr) return err;
    }
    return dupFNErr;
}

static Boolean MBParseHeader(void)
{
    long dlen, rlen; short nameLen = gMBHead[1]; char cname[64]; short i;
    if (gMBHead[0] != 0 || nameLen < 1 || nameLen > 31) return false;
    gMBName[0] = (unsigned char)nameLen;
    for (i = 0; i < nameLen; i++) gMBName[i + 1] = gMBHead[2 + i];
    dlen = ((long)gMBHead[83]<<24)|((long)gMBHead[84]<<16)|((long)gMBHead[85]<<8)|(long)gMBHead[86];
    rlen = ((long)gMBHead[87]<<24)|((long)gMBHead[88]<<16)|((long)gMBHead[89]<<8)|(long)gMBHead[90];
    if (dlen < 0 || rlen < 0 || dlen + rlen > 850000L) return false;
    gMBDataLen = dlen; gMBRsrcLen = rlen; gMBDataPadded = ((dlen + 127L) / 128L) * 128L;
    if (MBCreateUnique() != noErr) return false;
    gMBOpen = true;
    if (FSOpen(gMBName, 0, &gDataRef) != noErr) { MBAbortFile(); return false; }
    if (OpenRF(gMBName, 0, &gRsrcRef) != noErr) { MBAbortFile(); return false; }
    P2C(gMBName, cname);
    { char b[120]; short n = 0; CatStr(b,&n,"incoming app: "); CatStr(b,&n,cname); CatStr(b,&n," ("); CatLong(b,&n,gMBDataLen+gMBRsrcLen); CatStr(b,&n," bytes)"); b[n]=0; AddLog(b); }
    return true;
}

static Boolean MBConsume(const unsigned char *b, short n)
{
    short i = 0;
    while (i < n) {
        if (gMBPos < 128) {
            gMBHead[gMBPos] = b[i]; gMBPos++; i++;
            if (gMBPos == 128) { if (!MBParseHeader()) return false; }
            continue;
        }
        {
            long off = gMBPos - 128, want, cnt;
            if (off < gMBDataPadded) {
                if (off < gMBDataLen) { want = gMBDataLen - off; cnt = (long)(n-i) < want ? (long)(n-i) : want; if (FSWrite(gDataRef,&cnt,(Ptr)(b+i)) != noErr) return false; }
                else { want = gMBDataPadded - off; cnt = (long)(n-i) < want ? (long)(n-i) : want; }
                gMBPos += cnt; i += (short)cnt;
            } else {
                long roff = off - gMBDataPadded;
                if (roff < gMBRsrcLen) { want = gMBRsrcLen - roff; cnt = (long)(n-i) < want ? (long)(n-i) : want; if (FSWrite(gRsrcRef,&cnt,(Ptr)(b+i)) != noErr) return false; }
                else { cnt = n - i; }
                gMBPos += cnt; i += (short)cnt;
            }
        }
    }
    return true;
}

/* ================= frame parser callbacks (foundry_rx.inc contract) ========= */
static void RxLog(const char *msg) { AddLog(msg); }

static void RxFail(const char *msg)
{
    char b[220]; short n = 0;
    MBAbortFile(); gMBPos = 0;
    CatStr(b,&n,"FAILED: "); CatStr(b,&n,msg); b[n]=0;
    AddLog(b); SetTitle("The Bridge - error"); SysBeep(1);
}

static void BinBegin(long total)
{
    gMBPos = 0; gMBTotal = total; gLastPct = -1;
    gMBDataLen = gMBRsrcLen = gMBDataPadded = 0; gMBOpen = false;
    AddLog("push starting...");
    SetTitle("The Bridge - receiving");
}

static void BinBytes(const unsigned char *b, short n)
{
    short pct;
    if (!MBConsume(b, n)) {
        MBAbortFile(); gMBPos = 0;
        AddLog("FAILED: could not write the app to disk");
        SetTitle("The Bridge - disk error"); SysBeep(1);
        gRxState = FRX_IDLE; return;
    }
    if (gMBTotal > 0) {
        pct = (short)((gMBPos * 100L) / gMBTotal);
        if (pct >= gLastPct + 10) { char b2[40]; short n2=0; gLastPct = pct; CatStr(b2,&n2,"The Bridge - "); CatLong(b2,&n2,(long)pct); CatStr(b2,&n2,"%"); b2[n2]=0; SetTitle(b2); }
    }
}

static void BinDone(void)
{
    char cname[64];
    MBCloseFiles(); gMBOpen = false; gMBPos = 0;
    FlushVol(NULL, 0);
    P2C(gMBName, cname);
    { char b[140]; short n = 0; CatStr(b,&n,"INSTALLED: '"); CatStr(b,&n,cname); CatStr(b,&n,"' is on your disk"); b[n]=0; AddLog(b); }
    AddLog("(find it in the Finder; relaunch to run it)");
    gInstalled++;
    SetTitle("The Bridge - ready"); SysBeep(1);
}

#include "../foundry/foundry_rx.inc"

/* ================= app ================= */
static unsigned char gNetBuf[4096];   /* drain a big chunk per pass over fast TCP */
static void PumpBridge(void)
{
    long avail, got; short i;
    if (!gConnected) return;
    avail = NetAvailable(&gConn);
    if (avail <= 0) {
        if (avail < 0) { AddLog("connection dropped - relaunch to reconnect"); gConnected = false; }
        return;
    }
    if (avail > (long)sizeof(gNetBuf)) avail = sizeof(gNetBuf);
    got = NetRecv(&gConn, gNetBuf, (unsigned short)avail, 1);
    if (got <= 0) return;
    for (i = 0; i < (short)got; i++) FeedRxByte(gNetBuf[i]);
}

static void SetUpMenus(void)
{
    gAppleM = NewMenu(kAppleMenu, "\p\024"); AppendMenu(gAppleM, "\pAbout The Bridge"); AppendResMenu(gAppleM, 'DRVR'); InsertMenu(gAppleM, 0);
    gFileM  = NewMenu(kFileMenu, "\pFile"); AppendMenu(gFileM, "\pQuit/Q"); InsertMenu(gFileM, 0);
    DrawMenuBar();
}

int main(void)
{
    EventRecord ev; Rect bounds; Boolean done = false;
    InitGraf(&qd.thePort); InitFonts(); InitWindows(); InitMenus();
    TEInit(); InitDialogs(0L); InitCursor();
    SetUpMenus();
    SetRect(&bounds, 20, 50, 492, 50 + WIN_H);
    gWin = NewWindow(0L, &bounds, "\pThe Bridge", true, noGrowDocProc, (WindowPtr)-1L, false, 0);
    SetPort(gWin);

    AddLog("The Bridge - over-the-air app delivery.");
    AddLog("step 1: window up");
    DrawConsole();                       /* paint before any network, so a hang/crash is visible */
    { EventRecord e0; WaitNextEvent(everyEvent, &e0, 1L, 0L); }   /* let the window draw */
    AddLog("step 2: opening MacTCP...");
    DrawConsole();
    if (NetInit() != noErr) {            /* explicit, so a driver problem is logged not a bomb */
        AddLog("MacTCP (.IPP) not available - is the DaynaPORT/WiFi up?");
    } else {
        AddLog("step 3: connecting to 192.168.7.50:2333...");
        DrawConsole();
        if (NetConnect(&gConn, NetParseIP(BRIDGE_IP), BRIDGE_PORT) == noErr) {
            gConnected = true;
            AddLog("connected. waiting for the mini to push apps...");
            SetTitle("The Bridge - ready");
        } else {
            AddLog("could not connect to the bridge (192.168.7.50:2333).");
            AddLog("is the mini bridge agent running?");
        }
    }

    while (!done) {
        if (WaitNextEvent(everyEvent, &ev, 4L, 0L)) {
            switch (ev.what) {
                case updateEvt: BeginUpdate(gWin); DrawConsole(); EndUpdate(gWin); break;
                case mouseDown: {
                    WindowPtr w; short part = FindWindow(ev.where, &w);
                    if (part == inMenuBar) {
                        long s = MenuSelect(ev.where); Str255 nm;
                        if (HiWord(s) == kFileMenu && LoWord(s) == kFileQuit) done = true;
                        else if (HiWord(s) == kAppleMenu) {
                            if (LoWord(s) == 1) { ParamText("\pThe Bridge: drop a .bin into the mini's outbox and it lands here over WiFi.", "\p","\p","\p"); NoteAlert(128, 0L); }
                            else { GetMenuItemText(gAppleM, LoWord(s), nm); OpenDeskAcc(nm); }
                        }
                        HiliteMenu(0);
                    } else if (part == inDrag) DragWindow(w, ev.where, &qd.screenBits.bounds);
                    break;
                }
                case keyDown:
                    if (ev.modifiers & cmdKey) { long s = MenuKey(ev.message & charCodeMask); if (HiWord(s)==kFileMenu && LoWord(s)==kFileQuit) done = true; }
                    break;
            }
        }
        PumpBridge();
    }
    if (gConnected) NetClose(&gConn);
    return 0;
}
