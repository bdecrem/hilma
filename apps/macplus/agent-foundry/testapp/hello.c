/*
 * hello.c - the canonical Macinclaude Foundry app skeleton.
 *
 * Two jobs:
 *   1. selftest fixture: compiled by the foundry pipeline without Claude, so
 *      the compile + frame + deliver path is testable offline.
 *   2. the example embedded in the codegen system prompt - generated apps
 *      follow this exact shape (toolbox init, code-built menus, WaitNextEvent
 *      loop, QuickDraw-only UI, clean quit).
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
#include <SegLoad.h>

#define kAppleMenu 128
#define kFileMenu  129

#define WIN_W 320
#define WIN_H 180

static WindowPtr  gWin;
static MenuHandle gAppleM, gFileM;
static Boolean    gDone = false;
static long       gClicks = 0;

static void DrawContent(void)
{
    Rect r = gWin->portRect;
    Str255 num;
    SetPort(gWin);
    EraseRect(&r);
    TextFont(0); TextFace(bold); TextSize(12);
    MoveTo(40, 60);
    DrawString("\pHELLO FROM THE FOUNDRY");
    TextFace(0); TextSize(12);
    MoveTo(40, 100);
    DrawString("\pclicks: ");
    NumToString(gClicks, num);
    DrawString(num);
    MoveTo(40, 140);
    TextFont(3); TextSize(9);
    DrawString("\pclick anywhere - Cmd-Q quits");
}

static void DoMenu(long sel)
{
    short menu = HiWord(sel), item = LoWord(sel);
    Str255 name;
    if (menu == kAppleMenu) {
        if (item == 1) SysBeep(1);                 /* About */
        else { GetMenuItemText(gAppleM, item, name); OpenDeskAcc(name); }
    } else if (menu == kFileMenu) {
        if (item == 1) gDone = true;               /* Quit */
    }
    HiliteMenu(0);
}

static void HandleEvent(EventRecord *ev)
{
    WindowPtr win;
    switch (ev->what) {
        case mouseDown:
            switch (FindWindow(ev->where, &win)) {
                case inMenuBar:   DoMenu(MenuSelect(ev->where)); break;
                case inSysWindow: SystemClick(ev, win); break;
                case inDrag:      DragWindow(win, ev->where, &qd.screenBits.bounds); break;
                case inGoAway:    if (TrackGoAway(win, ev->where)) gDone = true; break;
                case inContent:
                    if (win != FrontWindow()) SelectWindow(win);
                    else { gClicks++; DrawContent(); }
                    break;
            }
            break;
        case keyDown:
            if ((ev->modifiers & cmdKey) != 0) {
                long sel = MenuKey((char)(ev->message & charCodeMask));
                if (HiWord(sel)) DoMenu(sel);
            }
            break;
        case updateEvt:
            BeginUpdate((WindowPtr)ev->message);
            DrawContent();
            EndUpdate((WindowPtr)ev->message);
            break;
    }
}

int main(void)
{
    EventRecord ev;
    Rect r;
    Str255 appleTitle;

    InitGraf(&qd.thePort);
    InitFonts();
    InitWindows();
    InitMenus();
    TEInit();
    InitDialogs(0L);
    InitCursor();
    FlushEvents(everyEvent, 0);

    appleTitle[0] = 1; appleTitle[1] = 0x14;       /* apple symbol */
    gAppleM = NewMenu(kAppleMenu, appleTitle);
    AppendMenu(gAppleM, "\pAbout Hello");
    AppendMenu(gAppleM, "\p(-");
    AppendResMenu(gAppleM, 'DRVR');
    InsertMenu(gAppleM, 0);
    gFileM = NewMenu(kFileMenu, "\pFile");
    AppendMenu(gFileM, "\pQuit/Q");
    InsertMenu(gFileM, 0);
    DrawMenuBar();

    SetRect(&r, (512 - WIN_W) / 2, 60, (512 + WIN_W) / 2, 60 + WIN_H);
    gWin = NewWindow(0L, &r, "\pHello", true, noGrowDocProc, (WindowPtr)-1L, true, 0);
    SetPort(gWin);

    while (!gDone) {
        if (WaitNextEvent(everyEvent, &ev, 15L, 0L))
            HandleEvent(&ev);
    }
    return 0;
}
