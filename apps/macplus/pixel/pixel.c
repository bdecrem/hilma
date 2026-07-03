/*
 * Daily Pixel — a collaborative 64x64 1-bit canvas for the Macintosh Plus.
 *
 * The canvas lives on the Mac mini (agent-pixel, :2337) and persists forever.
 * You paint pixels with the mouse; Claude visits the canvas once a day and
 * adds a few strokes of its own (or right now, via Canvas > Invite Claude).
 * Strokes from other contributors appear LIVE while the window is open, so
 * you can literally watch Claude draw. A drawing emerges over weeks.
 *
 * Transport: direct TCP through MacTCP/DaynaPORT (nettcp.h), same as Quote.
 * Protocol parser: px_rx.inc, shared verbatim with the host test rxtest.c.
 *
 * Rendering: the 64x64 canvas is shown at 4x (256x256) via an offscreen
 * 1-bit BitMap that CopyBits blits in one call — repainting 4096 cells with
 * PaintRect would crawl on an 8 MHz 68000. Single-pixel changes patch both
 * the offscreen bits and the window rect directly.
 */
#include <Quickdraw.h>
#include <Windows.h>
#include <Fonts.h>
#include <Events.h>
#include <Menus.h>
#include <TextEdit.h>
#include <Dialogs.h>
#include <OSUtils.h>
#include "nettcp.h"
#include "applog.inc"
#include "winfull.inc"
#include "px_rx.inc"
#include "pxbits.inc"     /* canvas + 4x offscreen bit logic (host-tested) */

#define PIXEL_IP   "192.168.7.50"
#define PIXEL_PORT 2337

#define SCALE 4                       /* canvas cell -> screen pixels */
#define CANV_LEFT 16
#define CANV_TOP  24
#define CANV_SIZE (PX_W * SCALE)      /* 256 */
#define PANEL_LEFT (CANV_LEFT + CANV_SIZE + 24)

#ifndef geneva
#define geneva 3
#endif
#ifndef bold
#define bold 1
#endif
#ifndef italic
#define italic 2
#endif

#define kAppleMenu  128
#define kFileMenu   129
#define kToolsMenu  130
#define kCanvasMenu 131
#define kFileQuit   1
#define kToolPen    1
#define kToolEraser 2
#define kCvSync     1
#define kCvInvite   2

static WindowPtr  gWin;
static MenuHandle gAppleM, gFileM, gToolsM, gCanvasM;
static NetConn gConn;
static Boolean gConnected = false;
static Boolean gLoaded = false;       /* full frame received at least once */
static short   gTool = 1;             /* 1 = pen (black), 0 = eraser */
static char    gStatus[100];
static char    gNote[110];

static BitMap  gOff;

static short slen(const char *s) { short n = 0; while (s[n]) n++; return n; }
static void  scopy(char *d, const char *s, short cap) { short i = 0; while (s[i] && i < cap - 1) { d[i] = s[i]; i++; } d[i] = 0; }

/* ------------------------------------------------ drawing */

static Rect CanvasRect(void)
{
    Rect r;
    r.top = CANV_TOP; r.left = CANV_LEFT;
    r.bottom = CANV_TOP + CANV_SIZE; r.right = CANV_LEFT + CANV_SIZE;
    return r;
}

static void DrawCanvas(void)
{
    Rect r = CanvasRect();
    Rect frame = r;
    InsetRect(&frame, -2, -2);
    FrameRect(&frame);
    CopyBits(&gOff, &gWin->portBits, &gOff.bounds, &r, srcCopy, 0L);
}

static void DrawPanel(void)
{
    Rect pr; short v;
    pr.top = CANV_TOP; pr.left = PANEL_LEFT;
    pr.bottom = CANV_TOP + CANV_SIZE; pr.right = gWin->portRect.right - 8;
    EraseRect(&pr);

    TextFont(geneva); TextSize(12); TextFace(bold);
    MoveTo(pr.left, pr.top + 12); DrawString("\pDAILY PIXEL");
    TextFace(0); TextSize(9);
    v = pr.top + 30;
    MoveTo(pr.left, v); DrawString("\pOne canvas, kept forever on"); v += 12;
    MoveTo(pr.left, v); DrawString("\pthe mini. Claude adds a few");  v += 12;
    MoveTo(pr.left, v); DrawString("\pstrokes every day.");           v += 20;

    MoveTo(pr.left, v);
    DrawString(gTool ? "\pTool: Pen (Cmd-E erases)" : "\pTool: Eraser (Cmd-P pens)");
    v += 20;

    TextFace(italic);
    /* the note, wrapped crudely at ~26 chars */
    {
        short i = 0, n = slen(gNote);
        while (i < n && v < pr.bottom - 20) {
            short take = n - i, k;
            if (take > 30) {
                take = 30;
                for (k = take; k > 10; k--) if (gNote[i + k] == ' ') { take = k; break; }
            }
            MoveTo(pr.left, v); DrawText(gNote + i, 0, take);
            i += take; while (gNote[i] == ' ') i++;
            v += 12;
        }
    }
    TextFace(0);

    MoveTo(pr.left, pr.bottom - 2);
    DrawText(gStatus, 0, slen(gStatus));
}

static void DrawScreen(void)
{
    SetPort(gWin);
    EraseRect(&gWin->portRect);
    DrawCanvas();
    DrawPanel();
}

static void SetStatus(const char *s)
{
    scopy(gStatus, s, sizeof(gStatus));
    SetPort(gWin);
    DrawPanel();
}

/* set one cell (pxbits) and paint its 4x4 block in the window */
static void SetCell(short x, short y, short v, Boolean paint)
{
    SetCellBits(x, y, v);
    if (paint) {
        Rect c;
        c.top = CANV_TOP + y * SCALE; c.left = CANV_LEFT + x * SCALE;
        c.bottom = c.top + SCALE; c.right = c.left + SCALE;
        if (v) PaintRect(&c); else EraseRect(&c);
    }
}

/* ------------------------------------------------ protocol hooks */

static void PxOnFrameStart(void)
{
    short y, j;
    for (y = 0; y < PX_H; y++) for (j = 0; j < PX_RB; j++) gCanvas[y][j] = 0;
}

static void PxOnRow(short row, const unsigned char *b8)
{
    short j;
    for (j = 0; j < PX_RB; j++) gCanvas[row][j] = b8[j];
}

static void PxOnFrameEnd(void)
{
    gLoaded = true;
    RebuildOffscreen();
    SetPort(gWin);
    DrawCanvas();
    SetStatus("connected -- draw!");
}

static void PxOnPixel(short x, short y, short v)
{
    SetPort(gWin);
    SetCell(x, y, v, true);
}

static void PxOnNote(const char *s)
{
    scopy(gNote, s, sizeof(gNote));
    SetPort(gWin);
    DrawPanel();
}

/* ------------------------------------------------ network */

static void SendLine(const char *s)
{
    char buf[40]; short n = 0;
    if (!gConnected) return;
    while (s[n] && n < 38) { buf[n] = s[n]; n++; }
    buf[n++] = '\r';
    if (NetSend(&gConn, buf, (unsigned short)n) != noErr) {
        gConnected = false;
        AppLog("send failed - link lost");
        SetStatus("link lost -- Canvas > Sync to retry");
    }
}

static void SendSet(short x, short y, short v)
{
    char cmd[32]; short n = 0, t;
    char num[8]; short nn;
    cmd[n++]='S'; cmd[n++]='E'; cmd[n++]='T'; cmd[n++]=' ';
    t = x; nn = 0; do { num[nn++] = (char)('0' + t % 10); t /= 10; } while (t);
    while (nn) cmd[n++] = num[--nn];
    cmd[n++] = ' ';
    t = y; nn = 0; do { num[nn++] = (char)('0' + t % 10); t /= 10; } while (t);
    while (nn) cmd[n++] = num[--nn];
    cmd[n++] = ' '; cmd[n++] = (char)('0' + v);
    cmd[n] = 0;
    SendLine(cmd);
}

static void Pump(void)
{
    unsigned char buf[256]; long avail, got;
    if (!gConnected) return;
    avail = NetAvailable(&gConn);
    if (avail <= 0) {
        if (avail < 0) {
            gConnected = false;
            AppLog("connection gone");
            SetStatus("link lost -- Canvas > Sync to retry");
        }
        return;
    }
    if (avail > (long)sizeof(buf)) avail = sizeof(buf);
    got = NetRecv(&gConn, buf, (unsigned short)avail, 1);
    if (got > 0) PxFeed(buf, (short)got);
}

static void Connect(void)
{
    SetStatus("connecting to the canvas...");
    if (gConnected) { NetClose(&gConn); gConnected = false; }
    if (NetConnect(&gConn, NetParseIP(PIXEL_IP), PIXEL_PORT) == noErr) {
        gConnected = true;
        AppLog("connected");
        SetStatus("loading canvas...");
        /* server sends the full frame on connect; Pump() will render it */
    } else {
        AppLog("connect failed");
        SetStatus("no connection (is MacTCP up?)");
    }
}

/* ------------------------------------------------ input */

static void DoCanvasClick(Point where)
{
    Rect r = CanvasRect();
    short lastX = -1, lastY = -1;
    if (!gLoaded) return;
    while (1) {
        Point p = where;
        if (PtInRect(p, &r)) {
            short x = (p.h - CANV_LEFT) / SCALE;
            short y = (p.v - CANV_TOP) / SCALE;
            if (x >= 0 && x < PX_W && y >= 0 && y < PX_H && (x != lastX || y != lastY)) {
                lastX = x; lastY = y;
                if (GetCell(x, y) != gTool) {
                    SetCell(x, y, gTool, true);
                    SendSet(x, y, gTool);
                }
            }
        }
        if (!StillDown()) break;
        GetMouse(&where);
    }
}

static void CheckTools(void)
{
    CheckItem(gToolsM, kToolPen, gTool == 1);
    CheckItem(gToolsM, kToolEraser, gTool == 0);
}

static void SetUpMenus(void)
{
    gAppleM = NewMenu(kAppleMenu, "\p\024");
    AppendMenu(gAppleM, "\pAbout Daily Pixel"); AppendResMenu(gAppleM, 'DRVR');
    InsertMenu(gAppleM, 0);
    gFileM = NewMenu(kFileMenu, "\pFile"); AppendMenu(gFileM, "\pQuit/Q"); InsertMenu(gFileM, 0);
    gToolsM = NewMenu(kToolsMenu, "\pTools");
    AppendMenu(gToolsM, "\pPen/P;Eraser/E"); InsertMenu(gToolsM, 0);
    gCanvasM = NewMenu(kCanvasMenu, "\pCanvas");
    AppendMenu(gCanvasM, "\pSync/S;Invite Claude/K"); InsertMenu(gCanvasM, 0);
    DrawMenuBar();
    CheckTools();
}

static Boolean DoMenu(long sel)   /* returns true = quit */
{
    short menu = HiWord(sel), item = LoWord(sel); Str255 nm;
    if (menu == kAppleMenu) {
        if (item == 1) {
            ParamText("\pDaily Pixel - one shared 64x64 canvas, kept on the mini. You draw with the mouse; Claude adds strokes daily. A picture emerges over weeks.", "\p", "\p", "\p");
            NoteAlert(128, 0L);
        } else { GetMenuItemText(gAppleM, item, nm); OpenDeskAcc(nm); }
    } else if (menu == kFileMenu) {
        if (item == kFileQuit) { HiliteMenu(0); return true; }
    } else if (menu == kToolsMenu) {
        gTool = (item == kToolPen) ? 1 : 0;
        CheckTools();
        SetPort(gWin); DrawPanel();
    } else if (menu == kCanvasMenu) {
        if (item == kCvSync) {
            if (gConnected) { SetStatus("syncing..."); SendLine("SYNC"); }
            else Connect();
        } else if (item == kCvInvite) {
            if (gConnected) { AppLog("invited claude"); SetStatus("inviting claude..."); SendLine("CLAUDE"); }
            else SetStatus("not connected");
        }
    }
    HiliteMenu(0);
    return false;
}

int main(void)
{
    EventRecord ev; Boolean done = false;
    InitGraf(&qd.thePort); InitFonts(); InitWindows(); InitMenus();
    TEInit(); InitDialogs(0L); InitCursor();
    SetUpMenus();
    BuildExpandTable();

    gOff.baseAddr = (Ptr)&gOffBits[0][0];
    gOff.rowBytes = PX_W * SCALE / 8;
    SetRect(&gOff.bounds, 0, 0, PX_W * SCALE, PX_H * SCALE);
    RebuildOffscreen();

    gWin = WFNew("\pDaily Pixel");
    SetPort(gWin);
    scopy(gNote, "", sizeof(gNote));
    scopy(gStatus, "starting...", sizeof(gStatus));

    AppLogOpen("Pixel"); AppLog("launched");
    DrawScreen();
    Connect();

    while (!done) {
        AppLogTick();
        if (WaitNextEvent(everyEvent, &ev, 4L, 0L)) {
            switch (ev.what) {
                case updateEvt:
                    BeginUpdate(gWin); DrawScreen(); EndUpdate(gWin);
                    break;
                case mouseDown: {
                    WindowPtr w; short part = FindWindow(ev.where, &w);
                    if (part == inMenuBar) {
                        done = DoMenu(MenuSelect(ev.where));
                    } else if (part == inDrag) {
                        DragWindow(w, ev.where, &qd.screenBits.bounds);
                    } else if (part == inGoAway) {
                        if (TrackGoAway(w, ev.where)) done = true;
                    } else if (part == inZoomIn || part == inZoomOut) {
                        if (WFZoom(w, part, ev.where)) DrawScreen();
                    } else if (part == inContent && w == gWin) {
                        Point p = ev.where;
                        SetPort(gWin);
                        GlobalToLocal(&p);
                        DoCanvasClick(p);
                    }
                    break;
                }
                case keyDown:
                    if (ev.modifiers & cmdKey)
                        done = DoMenu(MenuKey((char)(ev.message & charCodeMask)));
                    break;
            }
        }
        Pump();
    }
    if (gConnected) NetClose(&gConn);
    AppLogClose();
    return 0;
}
