/*
 * Sudoku for the Macintosh Plus (System 6.0.8, 68000)
 * Built with Retro68. Black & white, mouse + keyboard, no color, low memory.
 *
 * Geometry is computed (not eyeballed) to fit the 512x342 Plus screen below
 * the 20px menu bar:
 *   9 cells * 27px = 243px grid.  Window 275 x 295, centered.
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
#include <SegLoad.h>

#include "puzzles.h"

/* Font IDs (classic constants not always provided by the interfaces). */
#ifndef geneva
#define geneva 3        /* Geneva  */
#endif
#ifndef systemFont
#define systemFont 0    /* Chicago */
#endif

/* ---- geometry ---- */
#define CELL        27
#define GRID_LEFT   16
#define GRID_TOP    28
#define GRID_PX     (CELL * 9)               /* 243 */
#define WIN_W       (GRID_LEFT * 2 + GRID_PX)/* 275 */
#define STATUS_TOP  (GRID_TOP + GRID_PX + 8) /* 279 */
#define WIN_H       (STATUS_TOP + 16)        /* 295 */

/* ---- menus ---- */
#define kAppleMenu  128
#define kFileMenu   129
#define kGameMenu   130

/* Game menu item numbers */
#define kNewEasy    1
#define kNewMedium  2
#define kNewHard    3
/* item 4 = separator */
#define kCheck      5
#define kClear      6

/* ---- globals ---- */
static WindowPtr  gWin;
static MenuHandle gAppleM, gFileM, gGameM;
static Boolean    gDone        = false;
static Boolean    gHasWNE      = false;

static short      gBoard[9][9];     /* 0 = empty, else 1..9 */
static Boolean    gGiven[9][9];     /* true = fixed clue */
static Boolean    gConflict[9][9];  /* recomputed before each draw */
static short      gSelR = 0, gSelC = 0;
static short      gCurDiff = 0;     /* 0 easy, 1 medium, 2 hard */
static short      gNextIdx[3] = {0, 0, 0};
static short      gShownNum = 1;    /* puzzle # shown in header (1-based) */
static Boolean    gWon       = false;
static short      gMode      = 0;   /* 0 = game, 1 = about */

/* ---- puzzle access ---- */
static const char *PuzzleAt(short diff, short idx)
{
    switch (diff) {
        case 0: return gEasy[idx % GEASY_COUNT];
        case 1: return gMedium[idx % GMEDIUM_COUNT];
        default: return gHard[idx % GHARD_COUNT];
    }
}
static short PuzzleCount(short diff)
{
    switch (diff) {
        case 0: return GEASY_COUNT;
        case 1: return GMEDIUM_COUNT;
        default: return GHARD_COUNT;
    }
}

static void LoadPuzzle(short diff, short idx)
{
    const char *s = PuzzleAt(diff, idx);
    short r, c, i;
    for (i = 0; i < 81; i++) {
        r = i / 9; c = i % 9;
        if (s[i] == '.') { gBoard[r][c] = 0; gGiven[r][c] = false; }
        else             { gBoard[r][c] = s[i] - '0'; gGiven[r][c] = true; }
    }
    gCurDiff  = diff;
    gShownNum = (idx % PuzzleCount(diff)) + 1;
    gSelR = gSelC = 0;
    gWon = false;
}

static void NewGame(short diff)
{
    short idx = gNextIdx[diff];
    LoadPuzzle(diff, idx);
    gNextIdx[diff] = (idx + 1) % PuzzleCount(diff);
}

/* ---- logic ---- */
static void RecomputeConflicts(void)
{
    short r, c, k, br, bc, dr, dc, v;
    for (r = 0; r < 9; r++)
        for (c = 0; c < 9; c++)
            gConflict[r][c] = false;

    for (r = 0; r < 9; r++) {
        for (c = 0; c < 9; c++) {
            v = gBoard[r][c];
            if (v == 0) continue;
            /* row + column */
            for (k = 0; k < 9; k++) {
                if (k != c && gBoard[r][k] == v) gConflict[r][c] = true;
                if (k != r && gBoard[k][c] == v) gConflict[r][c] = true;
            }
            /* 3x3 box */
            br = (r / 3) * 3; bc = (c / 3) * 3;
            for (dr = 0; dr < 3; dr++)
                for (dc = 0; dc < 3; dc++)
                    if ((br + dr != r || bc + dc != c) &&
                        gBoard[br + dr][bc + dc] == v)
                        gConflict[r][c] = true;
        }
    }
}

static Boolean IsSolved(void)
{
    short r, c;
    for (r = 0; r < 9; r++)
        for (c = 0; c < 9; c++) {
            if (gBoard[r][c] == 0) return false;
            if (gConflict[r][c])   return false;
        }
    return true;
}

/* ---- drawing ---- */
static void DrawCenteredDigit(short r, short c, short v, Style face)
{
    Str255  s;
    short   left = GRID_LEFT + c * CELL;
    short   top  = GRID_TOP  + r * CELL;
    short   w;
    FontInfo fi;

    s[0] = 1; s[1] = '0' + v;
    TextFont(geneva); TextSize(18); TextFace(face);
    GetFontInfo(&fi);
    w = StringWidth(s);
    MoveTo(left + (CELL - w) / 2,
           top  + (CELL + fi.ascent - fi.descent) / 2);
    DrawString(s);
    TextFace(normal);
}

static void DrawGridLines(void)
{
    short i, x, y;
    PenNormal();
    /* thin cell lines */
    for (i = 0; i <= 9; i++) {
        x = GRID_LEFT + i * CELL;
        y = GRID_TOP  + i * CELL;
        MoveTo(x, GRID_TOP);          LineTo(x, GRID_TOP + GRID_PX);
        MoveTo(GRID_LEFT, y);         LineTo(GRID_LEFT + GRID_PX, y);
    }
    /* thick 3x3 box boundaries (overdraw 2px) */
    PenSize(2, 2);
    for (i = 0; i <= 9; i += 3) {
        x = GRID_LEFT + i * CELL;
        y = GRID_TOP  + i * CELL;
        MoveTo(x, GRID_TOP);          LineTo(x, GRID_TOP + GRID_PX);
        MoveTo(GRID_LEFT, y);         LineTo(GRID_LEFT + GRID_PX, y);
    }
    PenNormal();
}

static void DrawSelection(void)
{
    Rect rr;
    short left = GRID_LEFT + gSelC * CELL;
    short top  = GRID_TOP  + gSelR * CELL;
    SetRect(&rr, left + 2, top + 2, left + CELL - 1, top + CELL - 1);
    PenSize(2, 2);
    FrameRect(&rr);
    PenNormal();
}

static void DrawHeader(void)
{
    Str255 s;
    const char *name;
    short len = 0, i;
    char buf[40];

    switch (gCurDiff) {
        case 0: name = "Easy";   break;
        case 1: name = "Medium"; break;
        default: name = "Hard";  break;
    }
    /* build "Sudoku  -  Medium #3" */
    {
        const char *p = "Sudoku  -  ";
        for (i = 0; p[i]; i++) buf[len++] = p[i];
        for (i = 0; name[i]; i++) buf[len++] = name[i];
        buf[len++] = ' '; buf[len++] = '#';
        if (gShownNum >= 10) buf[len++] = '0' + (gShownNum / 10);
        buf[len++] = '0' + (gShownNum % 10);
    }
    for (i = 0; i < len; i++) s[i + 1] = buf[i];
    s[0] = len;
    TextFont(0); TextSize(12); TextFace(bold);   /* Chicago */
    MoveTo(GRID_LEFT, 20);
    DrawString(s);
    TextFace(normal);
}

static void DrawStatus(void)
{
    Str255 s; const char *msg; short i;
    Rect clr;
    SetRect(&clr, 0, STATUS_TOP - 12, WIN_W, WIN_H);
    EraseRect(&clr);

    if (gWon)            msg = "Solved!  Game > New for another.";
    else                 msg = "Click a cell, type 1-9.  0/Del clears.";

    for (i = 0; msg[i]; i++) s[i + 1] = msg[i];
    s[0] = i;
    TextFont(geneva); TextSize(10); TextFace(gWon ? bold : normal);
    MoveTo(GRID_LEFT, STATUS_TOP);
    DrawString(s);
    TextFace(normal);
}

static void DrawBoard(void)
{
    short r, c, v;
    RecomputeConflicts();
    DrawGridLines();
    for (r = 0; r < 9; r++) {
        for (c = 0; c < 9; c++) {
            v = gBoard[r][c];
            if (v == 0) continue;
            if (gGiven[r][c])
                DrawCenteredDigit(r, c, v, bold);          /* clue */
            else if (gConflict[r][c])
                DrawCenteredDigit(r, c, v, underline);     /* bad entry */
            else
                DrawCenteredDigit(r, c, v, normal);        /* user entry */
        }
    }
    DrawSelection();
}

static void DrawAbout(void)
{
    static const char *lines[] = {
        "Sudoku",
        "",
        "for the Macintosh Plus",
        "System 6.0.8, 68000",
        "",
        "Click a cell and type 1-9.",
        "0, Delete or Backspace clears.",
        "Arrow keys move the selection.",
        "Bold = given clue.",
        "Underline = conflict.",
        "",
        "Game menu: New (Easy/Medium/Hard),",
        "Check, Clear.",
        "",
        "Click anywhere to return.",
        0
    };
    short i, y = 22;
    Str255 s; short j;
    Rect all;
    SetRect(&all, 0, 0, WIN_W, WIN_H);
    EraseRect(&all);
    for (i = 0; lines[i]; i++) {
        const char *ln = lines[i];
        for (j = 0; ln[j]; j++) s[j + 1] = ln[j];
        s[0] = j;
        TextFont(geneva); TextSize(10);
        TextFace(i == 0 ? bold : normal);
        if (i == 0) { TextFont(0); TextSize(12); }
        MoveTo(GRID_LEFT, y);
        DrawString(s);
        y += 17;
    }
    TextFace(normal);
}

static void DrawWindow(void)
{
    Rect all;
    SetRect(&all, 0, 0, WIN_W, WIN_H);
    EraseRect(&all);
    if (gMode == 1) { DrawAbout(); return; }
    DrawHeader();
    DrawBoard();
    DrawStatus();
}

/* ---- input ---- */
static void SetValue(short v)   /* v in 0..9 ; 0 = clear */
{
    if (gGiven[gSelR][gSelC]) { SysBeep(2); return; }
    gBoard[gSelR][gSelC] = v;
    RecomputeConflicts();
    if (v != 0 && gConflict[gSelR][gSelC]) SysBeep(1);
    if (IsSolved()) { gWon = true; SysBeep(1); }
    DrawWindow();
}

static void MoveSel(short dr, short dc)
{
    short nr = gSelR + dr, nc = gSelC + dc;
    if (nr < 0) nr = 0; if (nr > 8) nr = 8;
    if (nc < 0) nc = 0; if (nc > 8) nc = 8;
    gSelR = nr; gSelC = nc;
    DrawWindow();
}

static void HandleKey(char ch)
{
    if (gMode == 1) { gMode = 0; DrawWindow(); return; }

    if (ch >= '1' && ch <= '9') { SetValue(ch - '0'); return; }
    if (ch == '0' || ch == 8 || ch == 127) { SetValue(0); return; } /* bs/del */

    switch (ch) {
        case 0x1C: MoveSel(0, -1); break;  /* left  */
        case 0x1D: MoveSel(0,  1); break;  /* right */
        case 0x1E: MoveSel(-1, 0); break;  /* up    */
        case 0x1F: MoveSel(1,  0); break;  /* down  */
    }
}

static void HandleContentClick(Point where)
{
    short c, r;
    if (gMode == 1) { gMode = 0; DrawWindow(); return; }
    GlobalToLocal(&where);
    if (where.h < GRID_LEFT || where.h >= GRID_LEFT + GRID_PX) return;
    if (where.v < GRID_TOP  || where.v >= GRID_TOP  + GRID_PX) return;
    c = (where.h - GRID_LEFT) / CELL;
    r = (where.v - GRID_TOP)  / CELL;
    if (r >= 0 && r < 9 && c >= 0 && c < 9) {
        gSelR = r; gSelC = c;
        DrawWindow();
    }
}

/* ---- menus ---- */
static void DoAbout(void) { gMode = 1; DrawWindow(); }

static void DoMenu(long sel)
{
    short menu = HiWord(sel);
    short item = LoWord(sel);
    Str255 name;

    switch (menu) {
        case kAppleMenu:
            if (item == 1) DoAbout();
            else {
                GetMenuItemText(gAppleM, item, name);
                OpenDeskAcc(name);
            }
            break;
        case kFileMenu:
            gDone = true;          /* only item is Quit */
            break;
        case kGameMenu:
            switch (item) {
                case kNewEasy:   NewGame(0); gMode = 0; DrawWindow(); break;
                case kNewMedium: NewGame(1); gMode = 0; DrawWindow(); break;
                case kNewHard:   NewGame(2); gMode = 0; DrawWindow(); break;
                case kCheck:     RecomputeConflicts();
                                 if (IsSolved()) { gWon = true; }
                                 SysBeep(1); gMode = 0; DrawWindow(); break;
                case kClear: {
                    short r, c;
                    for (r = 0; r < 9; r++)
                        for (c = 0; c < 9; c++)
                            if (!gGiven[r][c]) gBoard[r][c] = 0;
                    gWon = false; gMode = 0; DrawWindow();
                    break;
                }
            }
            break;
    }
    HiliteMenu(0);
}

/* ---- event handling ---- */
static void HandleMouseDown(EventRecord *ev)
{
    WindowPtr win;
    short part = FindWindow(ev->where, &win);
    switch (part) {
        case inMenuBar:  DoMenu(MenuSelect(ev->where)); break;
        case inSysWindow: SystemClick(ev, win); break;
        case inDrag:
            DragWindow(win, ev->where, &qd.screenBits.bounds);
            break;
        case inGoAway:
            if (TrackGoAway(win, ev->where)) gDone = true;
            break;
        case inContent:
            if (win != FrontWindow()) SelectWindow(win);
            else HandleContentClick(ev->where);
            break;
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
            if (ev->modifiers & cmdKey) {          /* Command-key menu shortcut */
                if (ev->what == keyDown) {
                    long sel = MenuKey(ch);
                    if (HiWord(sel)) DoMenu(sel);
                }
            } else {
                HandleKey(ch);
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
        case activateEvt:
            break;
    }
}

/* ---- setup ---- */
static void SetUpMenus(void)
{
    Str255 appleTitle;
    appleTitle[0] = 1; appleTitle[1] = 0x14;     /* apple symbol */

    gAppleM = NewMenu(kAppleMenu, appleTitle);
    AppendMenu(gAppleM, "\pAbout Sudoku...");
    AppendMenu(gAppleM, "\p(-");
    AppendResMenu(gAppleM, 'DRVR');
    InsertMenu(gAppleM, 0);

    gFileM = NewMenu(kFileMenu, "\pFile");
    AppendMenu(gFileM, "\pQuit/Q");
    InsertMenu(gFileM, 0);

    gGameM = NewMenu(kGameMenu, "\pGame");
    AppendMenu(gGameM, "\pNew Easy/E;New Medium/M;New Hard/H;(-;Check/K;Clear Entries");
    InsertMenu(gGameM, 0);

    DrawMenuBar();
}

static void SetUpWindow(void)
{
    Rect r;
    short left = (qd.screenBits.bounds.right - WIN_W) / 2;
    short top  = qd.screenBits.bounds.top + 44;
    SetRect(&r, left, top, left + WIN_W, top + WIN_H);
    gWin = NewWindow(0L, &r, "\pSudoku", true, documentProc,
                     (WindowPtr)-1L, true, 0);
    SetPort(gWin);
    TextFont(geneva);
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

    NewGame(0);          /* start on first Easy puzzle */
    DrawWindow();

    while (!gDone) {
        if (WaitNextEvent(everyEvent, &ev, 15L, 0L))
            HandleEvent(&ev);
    }
    return 0;
}
