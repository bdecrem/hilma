/*
 * Atkinson - "Claude draws, in 1-bit" for the Macintosh Plus.
 * (System 6.0.8, 68000.) Built with Retro68. The Plus is a thin client: the
 * Mac mini generates an image, Atkinson-dithers it to 1 bit, and streams the
 * packed bitmap; the Plus just paints the bytes - band by band, top to bottom,
 * so the picture develops like a Polaroid over the slow serial link.
 *
 * This file is the Plus-side RENDERER. The data path it draws from is pluggable:
 *   - embedded test image (test_image.h) - so the progressive blit can be
 *     verified in Mini vMac with no serial link (this milestone), and
 *   - (next) a framed 1bpp stream over the modem port, reusing Macinclaude's
 *     serial transport. Both end in the same SetImage()+DrawImageProgressive().
 *
 * Bitmap format (matches dither.py): 1bpp, MSB-first, a SET bit = black
 * (QuickDraw's convention), each row padded to a whole, EVEN byte count
 * (QuickDraw requires rowBytes even). 480x300 -> 60 bytes/row -> 18000 bytes.
 */

#include <Quickdraw.h>
#include <Windows.h>
#include <Menus.h>
#include <Fonts.h>
#include <Events.h>
#include <Dialogs.h>
#include <ToolUtils.h>
#include <Sound.h>
#include <Memory.h>
#include <OSUtils.h>
#include <SegLoad.h>

#include "test_image.h"   /* gTestImg[], gTestImg_W/_H/_ROWBYTES */

/* Font IDs */
#ifndef monaco
#define monaco 4
#endif

/* ---- menus ---- */
#define kAppleMenu 128
#define kFileMenu  129
#define kImageMenu 130

#define kFileQuit   1

#define kImgDrawTest 1   /* progressive reveal of the embedded test image */
#define kImgRedraw   2
#define kImgClear    3

/* ---- window geometry: content 480x300, centered, below menu+title bars ---- */
#define IMG_W 480
#define IMG_H 300
#define WIN_TOP   40
#define WIN_LEFT  16

/* ---- globals ---- */
static WindowPtr  gWin;
static MenuHandle gAppleM, gFileM, gImageM;
static Boolean    gDone = false;

/* current image descriptor (embedded now; a received buffer later) */
static const unsigned char *gImgBits = 0L;
static short gImgRB = 0, gImgW = 0, gImgH = 0;
static Boolean gImgValid = false;

/* ================= bitmap drawing ================= */

/* Build a QuickDraw BitMap over the current image's packed bytes. */
static void MakeBitMap(BitMap *bm)
{
    bm->baseAddr = (Ptr)gImgBits;
    bm->rowBytes = gImgRB;                 /* must be even; dither.py guarantees it */
    SetRect(&bm->bounds, 0, 0, gImgW, gImgH);
}

/* Copy rows [top, bottom) of the current image into the window (1:1, no scale). */
static void DrawBand(short top, short bottom)
{
    BitMap bm; Rect r; GrafPtr gp = (GrafPtr)gWin;
    if (!gImgValid) return;
    MakeBitMap(&bm);
    SetRect(&r, 0, top, gImgW, bottom);    /* same rect in src and dst (local) */
    SetPort(gWin);
    CopyBits(&bm, &gp->portBits, &r, &r, srcCopy, 0L);
}

static void DrawFull(void) { if (gImgValid) DrawBand(0, gImgH); }

/* Paint the image top-to-bottom in bands, with a small pause between each, so
 * it "develops". With a live serial feed the pacing comes from byte arrival;
 * here the Delay() stands in for that, to prove the progressive blit. */
static void DrawImageProgressive(void)
{
    short band = 20, y; long t;
    if (!gImgValid) return;
    /* clear the canvas first */
    SetPort(gWin);
    { Rect c; SetRect(&c, 0, 0, gImgW, gImgH); EraseRect(&c); }
    for (y = 0; y < gImgH; y += band) {
        short bottom = y + band; if (bottom > gImgH) bottom = gImgH;
        DrawBand(y, bottom);
        Delay(5, &t);          /* ~5 ticks ~= 1/12 s per band */
    }
}

static void SetImage(const unsigned char *bits, short rowBytes, short w, short h)
{
    gImgBits = bits; gImgRB = rowBytes; gImgW = w; gImgH = h; gImgValid = true;
}

static void ClearImage(void)
{
    Rect c;
    gImgValid = false;
    SetPort(gWin);
    SetRect(&c, 0, 0, IMG_W, IMG_H);
    EraseRect(&c);
}

/* ================= menus ================= */

static void DoAbout(void)
{
    /* A tiny modal-less note in an alert-style box would need a DLOG; keep it
     * light: just (re)draw the test image, which is the whole point. */
    SysBeep(1);
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
        case kImageMenu:
            switch (item) {
                case kImgDrawTest:
                    SetImage(gTestImg, gTestImg_ROWBYTES, gTestImg_W, gTestImg_H);
                    DrawImageProgressive();
                    break;
                case kImgRedraw: DrawFull(); break;
                case kImgClear:  ClearImage(); break;
            }
            break;
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
            ch = ev->message & charCodeMask;
            if (ev->modifiers & cmdKey) {
                long sel = MenuKey(ch);
                if (HiWord(sel)) DoMenu(sel);
            }
            break;
        case updateEvt: {
            WindowPtr w = (WindowPtr)ev->message;
            BeginUpdate(w);
            SetPort(w);
            { Rect r = w->portRect; EraseRect(&r); }
            DrawFull();
            EndUpdate(w);
            break;
        }
    }
}

/* ================= setup ================= */

static void SetUpMenus(void)
{
    Str255 appleTitle;
    appleTitle[0] = 1; appleTitle[1] = 0x14;

    gAppleM = NewMenu(kAppleMenu, appleTitle);
    AppendMenu(gAppleM, "\pAbout Atkinson");
    AppendMenu(gAppleM, "\p(-");
    AppendResMenu(gAppleM, 'DRVR');
    InsertMenu(gAppleM, 0);

    gFileM = NewMenu(kFileMenu, "\pFile");
    AppendMenu(gFileM, "\pQuit/Q");
    InsertMenu(gFileM, 0);

    gImageM = NewMenu(kImageMenu, "\pImage");
    AppendMenu(gImageM, "\pDraw Test Image/D;Redraw/R;Clear/K");
    InsertMenu(gImageM, 0);

    DrawMenuBar();
}

static void SetUpWindow(void)
{
    Rect r;
    SetRect(&r, WIN_LEFT, WIN_TOP, WIN_LEFT + IMG_W, WIN_TOP + IMG_H);
    gWin = NewWindow(0L, &r, "\puntitled", true, documentProc,
                     (WindowPtr)-1L, true, 0);
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

int main(void)
{
    EventRecord ev;

    InitToolbox();
    SetUpMenus();
    SetUpWindow();

    /* Auto-reveal the embedded test image on launch, so the progressive blit
     * is the first thing you see (the demo). Image menu re-runs it. */
    SetImage(gTestImg, gTestImg_ROWBYTES, gTestImg_W, gTestImg_H);
    DrawImageProgressive();

    while (!gDone) {
        if (WaitNextEvent(everyEvent, &ev, 15L, 0L))
            HandleEvent(&ev);
    }
    return 0;
}
