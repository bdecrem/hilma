/*
 * Porthole — a remote-framebuffer web browser for the Macintosh Plus.
 *
 * The mini (agent-porthole, port 2336) runs a real headless Chromium at the
 * Plus canvas size (512x300), dithers each rendered screen to 1-bit, zlib's it,
 * and streams a binary frame. The Plus decompresses (zlibss) and blits it, and
 * sends back URLs / clicks / scrolls / keys. Phase 1: display + Open Location.
 *
 *   Up:   GO <url> | CLICK <x> <y> | SCROLL <dy> | KEY <code> | TYPE <text> | BACK
 *   Down: 'F' frame (x,y,w,h,rb u16 BE + clen u32 BE + zlib 1-bit rows)
 *         'S' status (u16 len + text), 'T' title (u16 len + text)
 *
 * The receive/decode path lives in porthole_rx.inc (host-tested by rxtest.c).
 * Build PORT_TEST (-DPORT_TEST) for Mini vMac: renders the embedded test frame
 * offline (no network in the emulator).
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
#include <Files.h>
#include <SegLoad.h>
#include <string.h>

#include "nettcp.h"

#define CANVAS_W   512
#define CANVAS_H   300
#define CRB        (CANVAS_W / 8)        /* 64 bytes/row */
#define FRAME_BYTES (CRB * CANVAS_H)     /* 19200 */
#define ZCAP       26000                 /* max compressed frame we accept */

#ifdef PORT_TEST
#include "test_frame.h"
#endif
#include "porthole_rx.inc"               /* gImgBuf, FeedByte, RxBusy, RxReset */

#define MINI_IP    "192.168.7.50"
#define MINI_PORT  2336

#define kAppleMenu 128
#define kFileMenu  129
#define kGoMenu    130
#define kFileQuit  1
#define kGoOpen    1
#define kGoBack    2
#define kGoReload  3

#define kDlgPrompt 129
#define kPromptGo    1
#define kPromptCancel 2
#define kPromptEdit  4

/* ---- globals ---- */
static WindowPtr  gWin;
static MenuHandle gAppleM, gFileM, gGoM;
static Boolean    gDone = false;
static NetConn    gConn;
static Boolean    gConnected = false;
static unsigned char gRecv[2048];
static short gDefItem, gCanItem;

/* ---------- helpers ---------- */
static void C2P(const char *c, Str255 p) { short n = 0; while (c[n] && n < 255) { p[n + 1] = (unsigned char)c[n]; n++; } p[0] = (unsigned char)n; }

/* hooks called by porthole_rx.inc */
void PortStatus(const char *s) { Str255 p; C2P(s, p); if (gWin) SetWTitle(gWin, p); }
void PortBlit(short x, short y, short w, short h)
{
    BitMap bm; Rect r; GrafPtr gp = (GrafPtr)gWin;
    if (!gImgValid) return;
    bm.baseAddr = (Ptr)gImgBuf; bm.rowBytes = CRB; SetRect(&bm.bounds, 0, 0, CANVAS_W, CANVAS_H);
    SetRect(&r, x, y, x + w, y + h);
    SetPort(gWin);
    CopyBits(&bm, &gp->portBits, &r, &r, srcCopy, 0L);
}

/* ---------- networking ---------- */
static void SendCmd(const char *cmd)
{
    if (!gConnected) { PortStatus("not connected"); SysBeep(1); return; }
    NetSend(&gConn, cmd, (unsigned short)strlen(cmd));
    NetSend(&gConn, "\r", 1);
}

static Boolean Connect(void)
{
    unsigned long ip; OSErr err;
    if (gConnected) return true;
    PortStatus("Porthole - connecting...");
    ip = NetParseIP(MINI_IP);
    if (ip == 0) { PortStatus("bad mini IP"); return false; }
    err = NetConnect(&gConn, ip, MINI_PORT);
    if (err != noErr) { PortStatus("connect failed - is the agent up?"); return false; }
    gConnected = true; RxReset();
    PortStatus("Porthole - connected. Go > Open Location");
    return true;
}

static void PumpReceive(void)
{
    long avail, got; short i;
    if (!gConnected) return;
    avail = NetAvailable(&gConn);
    if (avail < 0) { gConnected = false; NetClose(&gConn); PortStatus("connection closed"); return; }
    if (avail == 0) return;
    if (avail > (long)sizeof(gRecv)) avail = sizeof(gRecv);
    got = NetRecv(&gConn, gRecv, (unsigned short)avail, 2);
    if (got <= 0) return;
    for (i = 0; i < (short)got; i++) FeedByte(gRecv[i]);
}

/* ---------- Open Location dialog ---------- */
static pascal Boolean KeyFilter(DialogPtr dlg, EventRecord *ev, short *itemHit)
{
    char ch;
    (void)dlg;
    if (ev->what != keyDown && ev->what != autoKey) return false;
    ch = ev->message & charCodeMask;
    if (ch == 13 || ch == 3) { *itemHit = gDefItem; return true; }
    if (ch == 27)            { *itemHit = gCanItem; return true; }
    return false;
}

static void DoOpenLocation(void)
{
    DialogPtr dlg; short item; Str255 p; ModalFilterUPP filt;
    short kind; Handle h; Rect box; char url[256]; char cmd[264]; short n;
    dlg = GetNewDialog(kDlgPrompt, 0L, (WindowPtr)-1L);
    if (!dlg) return;
    gDefItem = kPromptGo; gCanItem = kPromptCancel;
    SelectDialogItemText(dlg, kPromptEdit, 0, 32767);
    filt = NewModalFilterUPP(KeyFilter);
    for (;;) {
        ModalDialog(filt, &item);
        if (item == kPromptGo) {
            GetDialogItem(dlg, kPromptEdit, &kind, &h, &box);
            GetDialogItemText(h, p);
            if (p[0] == 0) { SysBeep(1); continue; }
            { short k; for (k = 0; k < p[0] && k < 255; k++) url[k] = (char)p[k + 1]; url[k] = 0; }
            n = 0; { const char *g = "GO "; while (*g) cmd[n++] = *g++; }
            { short k = 0; while (url[k] && n < 262) cmd[n++] = url[k++]; } cmd[n] = 0;
            DisposeModalFilterUPP(filt); DisposeDialog(dlg);
            SendCmd(cmd);
            return;
        } else if (item == kPromptCancel) break;
    }
    DisposeModalFilterUPP(filt); DisposeDialog(dlg);
}

/* ---------- menus / about ---------- */
static void SetUpMenus(void)
{
    gAppleM = NewMenu(kAppleMenu, "\p\024"); AppendMenu(gAppleM, "\pAbout Porthole"); AppendResMenu(gAppleM, 'DRVR'); InsertMenu(gAppleM, 0);
    gFileM  = NewMenu(kFileMenu, "\pFile"); AppendMenu(gFileM, "\pQuit/Q"); InsertMenu(gFileM, 0);
    gGoM    = NewMenu(kGoMenu, "\pGo"); AppendMenu(gGoM, "\pOpen Location.../L;Back/[;Reload/R"); InsertMenu(gGoM, 0);
    DrawMenuBar();
}

static void DoAbout(void)
{ ParamText("\pPorthole - a window from 1986 onto the live web. The mini renders; the Plus displays.", "\p", "\p", "\p");
  NoteAlert(128, 0L); }

static void DoMenu(long sel)
{
    short menu = HiWord(sel), item = LoWord(sel);
    Str255 name;
    switch (menu) {
    case kAppleMenu:
        if (item == 1) DoAbout();
        else { GetMenuItemText(gAppleM, item, name); OpenDeskAcc(name); }
        break;
    case kFileMenu: if (item == kFileQuit) gDone = true; break;
    case kGoMenu:
        if (item == kGoOpen) DoOpenLocation();
        else if (item == kGoBack) SendCmd("BACK");
        else if (item == kGoReload) SendCmd("KEY F5");
        break;
    }
    HiliteMenu(0);
}

/* ---------- events ---------- */
static void HandleEvent(EventRecord *ev)
{
    char c; WindowPtr w; short part;
    switch (ev->what) {
    case mouseDown:
        part = FindWindow(ev->where, &w);
        if (part == inMenuBar) DoMenu(MenuSelect(ev->where));
        else if (part == inDrag) DragWindow(w, ev->where, &qd.screenBits.bounds);
        else if (part == inContent && w == gWin) { if (w != FrontWindow()) SelectWindow(w); }
        break;
    case keyDown:
    case autoKey:
        c = ev->message & charCodeMask;
        if (ev->modifiers & cmdKey) { if (ev->what == keyDown) DoMenu(MenuKey(c)); }
        break;
    case updateEvt:
        w = (WindowPtr)ev->message;
        BeginUpdate(w);
        if (w == gWin) { SetPort(gWin); if (gImgValid) PortBlit(0, 0, CANVAS_W, CANVAS_H); else EraseRect(&gWin->portRect); }
        EndUpdate(w);
        break;
    }
}

static void SetUpWindow(void)
{
    Rect r;
    short left = (qd.screenBits.bounds.right - CANVAS_W) / 2;
    short top  = qd.screenBits.bounds.top + 40;
    SetRect(&r, left, top, left + CANVAS_W, top + CANVAS_H);
    gWin = NewWindow(0L, &r, "\pPorthole", true, documentProc, (WindowPtr)-1L, false, 0);
    SetPort(gWin);
}

static void InitToolbox(void)
{
    InitGraf(&qd.thePort); InitFonts(); InitWindows(); InitMenus(); TEInit(); InitDialogs(0L); InitCursor();
    FlushEvents(everyEvent, 0);
}

int main(void)
{
    EventRecord ev;
    InitToolbox(); SetUpMenus(); SetUpWindow();

#ifdef PORT_TEST
    memcpy(gImgBuf, gTestFrame, FRAME_BYTES);
    gImgValid = 1;
    PortStatus("Porthole TEST BUILD (embedded frame)");
    PortBlit(0, 0, CANVAS_W, CANVAS_H);
#else
    Connect();
#endif

    while (!gDone) {
        long sleep = (gConnected && RxBusy()) ? 1L : 10L;
        if (WaitNextEvent(everyEvent, &ev, sleep, 0L)) HandleEvent(&ev);
        if (gConnected) PumpReceive();
    }
    if (gConnected) NetClose(&gConn);
    return 0;
}
