/*
 * Sudoku for the Macintosh Plus (System 6.0.8, 68000)
 * Built with Retro68. Black & white, mouse + keyboard, no color, low memory.
 *
 * Geometry is computed (not eyeballed) to fit the 512x342 Plus screen below
 * the 20px menu bar:
 *   9 cells * 27px = 243px grid.  A double-line border frames it.
 *   Window 275 x 294, centered.
 *
 * Screens (gMode):
 *   0 game   1 about (animated)   2 enter initials   3 high-score table
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
#define GRID_TOP    36
#define GRID_PX     (CELL * 9)               /* 243 */
#define BORD_PAD    5                         /* inner frame gap from grid */
#define WIN_W       (GRID_LEFT * 2 + GRID_PX)/* 275 */
#define WIN_H       294

/* ---- about-box mini board ---- */
#define MINI_CELL   13
#define MINI_PX     (MINI_CELL * 9)          /* 117 */
#define MINI_X      ((WIN_W - MINI_PX) / 2)  /* 79  */
#define MINI_Y      72

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
/* item 7 = separator */
#define kScores     8

/* ---- high scores ---- */
#define MAXSCORE    8
typedef struct { char ini[3]; long score; short diff; } Score;

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
static short      gMode      = 0;   /* see header */

static unsigned long gStartTicks = 0;
static long       gScore     = 0;
static long       gElapsed   = 0;

static Score      gScores[MAXSCORE];
static short      gScoreN    = 0;
static short      gLastRank  = -1;  /* highlighted row on the table */

static char       gInit[3]   = {' ', ' ', ' '};
static short      gInitPos   = 0;
static short      gSweep      = 0;   /* about-box scanner cell 0..80 */
static Boolean    gBlink      = true;

/* decorative givens for the about-box mini board */
static const char *kAboutPuzzle =
    "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";

/* ---- small text helpers ---- */
static void MakePStr(Str255 s, const char *c)
{
    short i;
    for (i = 0; c[i] && i < 255; i++) s[i + 1] = c[i];
    s[0] = i;
}

static void DrawCStr(short x, short y, const char *c, short font, short size, Style face)
{
    Str255 s;
    MakePStr(s, c);
    TextFont(font); TextSize(size); TextFace(face);
    MoveTo(x, y); DrawString(s);
    TextFace(normal);
}

static void DrawCStrC(short y, const char *c, short font, short size, Style face)
{
    Str255 s;
    MakePStr(s, c);
    TextFont(font); TextSize(size); TextFace(face);
    MoveTo((WIN_W - StringWidth(s)) / 2, y); DrawString(s);
    TextFace(normal);
}

static void AppendLong(char *buf, short *len, long v)
{
    char tmp[12]; short n = 0;
    if (v < 0) { buf[(*len)++] = '-'; v = -v; }
    if (v == 0) tmp[n++] = '0';
    while (v > 0) { tmp[n++] = (char)('0' + (v % 10)); v /= 10; }
    while (n > 0) buf[(*len)++] = tmp[--n];
}

static const char *DiffName(short d)
{
    return (d == 0) ? "Easy" : (d == 1) ? "Medium" : "Hard";
}

static void Pause(short ticks)
{
    unsigned long t;
    Delay((unsigned long)ticks, &t);
}

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
    gStartTicks = TickCount();
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

/* ---- scoring + leaderboard ---- */
static long ScoreFor(short diff, long elapsedSec)
{
    long base = (diff == 0) ? 10000L : (diff == 1) ? 20000L : 30000L;
    long s = base - elapsedSec * 10L;
    if (s < 1000L) s = 1000L;
    return s;
}

/* insert into the descending table; returns the rank (0-based) or -1 */
static short InsertScore(const char ini[3], long score, short diff)
{
    short i, pos;
    if (gScoreN == MAXSCORE && score <= gScores[gScoreN - 1].score) return -1;
    if (gScoreN < MAXSCORE) gScoreN++;
    pos = gScoreN - 1;
    for (i = 0; i < gScoreN - 1; i++)
        if (score > gScores[i].score) { pos = i; break; }
    for (i = gScoreN - 1; i > pos; i--) gScores[i] = gScores[i - 1];
    gScores[pos].ini[0] = ini[0];
    gScores[pos].ini[1] = ini[1];
    gScores[pos].ini[2] = ini[2];
    gScores[pos].score  = score;
    gScores[pos].diff   = diff;
    return pos;
}

/* scores persist to a small file on the default volume; failure is silent
 * (a write-locked disk shouldn't crash the game — scores stay in memory). */
#define kScoreFile "\pSudoku Scores"

static void SaveScores(void)
{
    short ref; long cnt; short n = gScoreN;
    Create(kScoreFile, 0, 'Sdku', 'SCOR');   /* ignore dupFNErr */
    if (FSOpen(kScoreFile, 0, &ref) != noErr) return;
    SetEOF(ref, 0);
    cnt = sizeof(short);              FSWrite(ref, &cnt, &n);
    if (n > 0) { cnt = (long)n * sizeof(Score); FSWrite(ref, &cnt, gScores); }
    FSClose(ref);
    FlushVol(0, 0);
}

static void LoadScores(void)
{
    short ref; long cnt; short n = 0;
    gScoreN = 0;
    if (FSOpen(kScoreFile, 0, &ref) != noErr) return;
    cnt = sizeof(short);
    if (FSRead(ref, &cnt, &n) != noErr) { FSClose(ref); return; }
    if (n < 0) n = 0; if (n > MAXSCORE) n = MAXSCORE;
    if (n > 0) { cnt = (long)n * sizeof(Score); FSRead(ref, &cnt, gScores); }
    gScoreN = n;
    FSClose(ref);
}

static void SeedDefaults(void)
{
    static const struct { const char *n; long s; short d; } seed[] = {
        { "CLD", 12000L, 2 }, { "BRT", 9000L, 2 }, { "MAC", 7000L, 1 },
        { "PLU", 5000L, 1 },  { "SYS", 3000L, 0 }
    };
    short i, j;
    gScoreN = 5;
    for (i = 0; i < 5; i++) {
        for (j = 0; j < 3; j++) gScores[i].ini[j] = seed[i].n[j];
        gScores[i].score = seed[i].s;
        gScores[i].diff  = seed[i].d;
    }
}

/* ---- drawing: game ---- */
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

static void GridBorderRect(Rect *fr)
{
    SetRect(fr, GRID_LEFT - BORD_PAD, GRID_TOP - BORD_PAD,
                GRID_LEFT + GRID_PX + BORD_PAD, GRID_TOP + GRID_PX + BORD_PAD);
}

static void DrawBorder(void)
{
    Rect fr;
    PenNormal();
    GridBorderRect(&fr);
    FrameRect(&fr);                 /* inner line */
    InsetRect(&fr, -3, -3);
    FrameRect(&fr);                 /* outer line — double-rule frame */
}

static void DrawGridLines(void)
{
    short i, x, y;
    PenNormal();
    for (i = 0; i <= 9; i++) {
        x = GRID_LEFT + i * CELL;
        y = GRID_TOP  + i * CELL;
        MoveTo(x, GRID_TOP);          LineTo(x, GRID_TOP + GRID_PX);
        MoveTo(GRID_LEFT, y);         LineTo(GRID_LEFT + GRID_PX, y);
    }
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
    char buf[40]; short len = 0, i;
    const char *name = DiffName(gCurDiff);
    const char *p = "Sudoku  -  ";
    for (i = 0; p[i]; i++)    buf[len++] = p[i];
    for (i = 0; name[i]; i++) buf[len++] = name[i];
    buf[len++] = ' '; buf[len++] = '#';
    if (gShownNum >= 10) buf[len++] = '0' + (gShownNum / 10);
    buf[len++] = '0' + (gShownNum % 10);
    buf[len] = 0;
    DrawCStr(GRID_LEFT, 24, buf, systemFont, 12, bold);
}

static void DrawBoard(void)
{
    short r, c, v;
    RecomputeConflicts();
    DrawBorder();
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

/* ---- drawing: about (animated) ---- */
static void AboutCellRect(short idx, Rect *rr)
{
    short r = idx / 9, c = idx % 9;
    short l = MINI_X + c * MINI_CELL, t = MINI_Y + r * MINI_CELL;
    SetRect(rr, l + 1, t + 1, l + MINI_CELL, t + MINI_CELL);
}

static void DrawAboutBoard(void)
{
    short i, x, y, r, c;
    Rect fr;
    PenNormal();
    /* frame */
    SetRect(&fr, MINI_X - 2, MINI_Y - 2, MINI_X + MINI_PX + 2, MINI_Y + MINI_PX + 2);
    FrameRect(&fr);
    for (i = 0; i <= 9; i++) {
        x = MINI_X + i * MINI_CELL;
        y = MINI_Y + i * MINI_CELL;
        MoveTo(x, MINI_Y);            LineTo(x, MINI_Y + MINI_PX);
        MoveTo(MINI_X, y);            LineTo(MINI_X + MINI_PX, y);
    }
    PenSize(2, 2);
    for (i = 0; i <= 9; i += 3) {
        x = MINI_X + i * MINI_CELL;
        y = MINI_Y + i * MINI_CELL;
        MoveTo(x, MINI_Y);            LineTo(x, MINI_Y + MINI_PX);
        MoveTo(MINI_X, y);            LineTo(MINI_X + MINI_PX, y);
    }
    PenNormal();
    /* decorative givens */
    TextFont(geneva); TextSize(9); TextFace(bold);
    for (i = 0; i < 81; i++) {
        if (kAboutPuzzle[i] == '.') continue;
        r = i / 9; c = i % 9;
        {
            Str255 s; short w;
            s[0] = 1; s[1] = kAboutPuzzle[i];
            w = StringWidth(s);
            MoveTo(MINI_X + c * MINI_CELL + (MINI_CELL - w) / 2,
                   MINI_Y + r * MINI_CELL + MINI_CELL - 3);
            DrawString(s);
        }
    }
    TextFace(normal);
}

static void DrawAbout(void)
{
    Rect all, sweep;
    SetRect(&all, 0, 0, WIN_W, WIN_H);
    EraseRect(&all);

    DrawCStrC(48, "Sudoku", systemFont, 18, bold);
    DrawAboutBoard();
    DrawCStrC(MINI_Y + MINI_PX + 26, "by Bart Decrem", geneva, 12, bold);
    DrawCStrC(MINI_Y + MINI_PX + 44, "code by Claude Code", geneva, 12, normal);
    DrawCStrC(MINI_Y + MINI_PX + 66, "Macintosh Plus  -  68000", geneva, 9, normal);
    DrawCStrC(WIN_H - 14, "Click to return", geneva, 9, italic);

    AboutCellRect(gSweep, &sweep);
    InvertRect(&sweep);
}

static void AboutTick(void)
{
    Rect old, nw;
    AboutCellRect(gSweep, &old);
    InvertRect(&old);                       /* turn current off */
    gSweep = (short)((gSweep + 1) % 81);
    AboutCellRect(gSweep, &nw);
    InvertRect(&nw);                         /* turn next on */
}

/* ---- drawing: enter initials ---- */
#define SLOT_W   38
#define SLOT_Y   200
static void DrawInitialSlots(void)
{
    short i;
    short total = SLOT_W * 3;
    short x0 = (WIN_W - total) / 2;
    Rect row;
    SetRect(&row, 0, SLOT_Y - 34, WIN_W, SLOT_Y + 10);
    EraseRect(&row);
    for (i = 0; i < 3; i++) {
        short cx = x0 + i * SLOT_W + SLOT_W / 2;
        char  ch = gInit[i];
        Str255 s; short w;
        /* baseline rule under each slot */
        MoveTo(x0 + i * SLOT_W + 6, SLOT_Y + 4);
        LineTo(x0 + i * SLOT_W + SLOT_W - 6, SLOT_Y + 4);
        if (ch != ' ') {
            s[0] = 1; s[1] = ch;
            TextFont(systemFont); TextSize(24); TextFace(bold);
            w = StringWidth(s);
            MoveTo(cx - w / 2, SLOT_Y);
            DrawString(s);
            TextFace(normal);
        }
        /* blinking caret on the active slot */
        if (i == gInitPos && gBlink) {
            Rect car;
            SetRect(&car, x0 + i * SLOT_W + 6, SLOT_Y - 30,
                          x0 + i * SLOT_W + SLOT_W - 6, SLOT_Y + 2);
            InvertRect(&car);
        }
    }
}

static void DrawInitials(void)
{
    Rect all; char buf[40]; short len;
    SetRect(&all, 0, 0, WIN_W, WIN_H);
    EraseRect(&all);

    DrawCStrC(60, "YOU SOLVED IT!", systemFont, 18, bold);

    len = 0;
    { const char *p = "Score  "; short i; for (i = 0; p[i]; i++) buf[len++] = p[i]; }
    AppendLong(buf, &len, gScore);
    buf[len] = 0;
    DrawCStrC(92, buf, geneva, 12, bold);

    len = 0;
    { const char *p = ""; (void)p; }
    {
        const char *d = DiffName(gCurDiff); short i; len = 0;
        for (i = 0; d[i]; i++) buf[len++] = d[i];
        { const char *p = "  -  "; for (i = 0; p[i]; i++) buf[len++] = p[i]; }
        AppendLong(buf, &len, gElapsed);
        { const char *p = " sec"; for (i = 0; p[i]; i++) buf[len++] = p[i]; }
        buf[len] = 0;
    }
    DrawCStrC(112, buf, geneva, 10, normal);

    DrawCStrC(150, "Enter your initials", geneva, 12, normal);
    DrawInitialSlots();
    DrawCStrC(WIN_H - 26, "Type 3 letters, Return to confirm", geneva, 9, italic);
}

/* ---- drawing: leaderboard ---- */
static void DrawLeaderboard(short hl)
{
    Rect all; short i, y;
    SetRect(&all, 0, 0, WIN_W, WIN_H);
    EraseRect(&all);

    DrawCStrC(44, "HIGH SCORES", systemFont, 18, bold);
    { Rect rule; SetRect(&rule, 40, 54, WIN_W - 40, 56); PaintRect(&rule); }

    if (gScoreN == 0) {
        DrawCStrC(140, "No scores yet.", geneva, 12, normal);
    } else {
        y = 84;
        for (i = 0; i < gScoreN; i++) {
            char buf[48]; short len = 0; short j;
            Boolean me = (i == hl);
            AppendLong(buf, &len, (long)(i + 1));
            buf[len++] = '.'; buf[len++] = ' '; buf[len++] = ' ';
            for (j = 0; j < 3; j++)
                buf[len++] = (gScores[i].ini[j] == ' ') ? '-' : gScores[i].ini[j];
            buf[len] = 0;
            DrawCStr(54, y, buf, geneva, 12, me ? bold : normal);

            len = 0;
            AppendLong(buf, &len, gScores[i].score);
            buf[len] = 0;
            {   /* right-align the score column */
                Str255 s; MakePStr(s, buf);
                TextFont(geneva); TextSize(12); TextFace(me ? bold : normal);
                MoveTo(176 - StringWidth(s), y); DrawString(s);
                TextFace(normal);
            }
            DrawCStr(192, y, DiffName(gScores[i].diff), geneva, 9, me ? bold : normal);
            if (me) {
                Rect bar; SetRect(&bar, 48, y - 12, WIN_W - 44, y + 4);
                InvertRect(&bar);
            }
            y += 22;
        }
    }
    DrawCStrC(WIN_H - 16, "Click to continue", geneva, 9, italic);
}

/* ---- dispatch draw ---- */
static void DrawWindow(void)
{
    Rect all;
    SetRect(&all, 0, 0, WIN_W, WIN_H);
    if (gMode == 1) { DrawAbout(); return; }
    if (gMode == 2) { DrawInitials(); return; }
    if (gMode == 3) { DrawLeaderboard(gLastRank); return; }
    EraseRect(&all);
    DrawHeader();
    DrawBoard();
}

/* ---- win flow ---- */
static void VictoryFlash(void)
{
    Rect fr; short i;
    GridBorderRect(&fr);
    InsetRect(&fr, -3, -3);
    for (i = 0; i < 6; i++) {
        InvertRect(&fr);
        if (i < 3) SysBeep(1);
        Pause(7);
    }   /* even count -> ends back to normal */
}

static void TriggerWin(void)
{
    gWon = true;
    gElapsed = (long)((TickCount() - gStartTicks) / 60L);
    gScore   = ScoreFor(gCurDiff, gElapsed);
    DrawWindow();           /* make sure the solved board is shown first */
    VictoryFlash();
    gInit[0] = gInit[1] = gInit[2] = ' ';
    gInitPos = 0;
    gBlink   = true;
    gMode    = 2;
    DrawWindow();
}

static void CommitInitials(void)
{
    char ini[3];
    ini[0] = gInit[0]; ini[1] = gInit[1]; ini[2] = gInit[2];
    gLastRank = InsertScore(ini, gScore, gCurDiff);
    SaveScores();
    gMode = 3;
    DrawWindow();
}

/* ---- input ---- */
static void SetValue(short v)   /* v in 0..9 ; 0 = clear */
{
    if (gGiven[gSelR][gSelC]) { SysBeep(2); return; }
    gBoard[gSelR][gSelC] = v;
    RecomputeConflicts();
    if (v != 0 && gConflict[gSelR][gSelC]) SysBeep(1);
    if (IsSolved()) {
        if (!gWon) { TriggerWin(); return; }
    } else {
        gWon = false;
    }
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
    if (gMode == 3) { gMode = 0; DrawWindow(); return; }
    if (gMode == 2) {
        if (ch >= 'a' && ch <= 'z') ch = (char)(ch - 32);
        if (ch >= 'A' && ch <= 'Z') {
            if (gInitPos < 3) { gInit[gInitPos++] = ch; }
            gBlink = true; DrawInitialSlots(); return;
        }
        if (ch == 8 || ch == 127) {              /* backspace/delete */
            if (gInitPos > 0) { gInit[--gInitPos] = ' '; }
            gBlink = true; DrawInitialSlots(); return;
        }
        if (ch == 13 || ch == 3) { CommitInitials(); }   /* Return/Enter */
        return;
    }

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
    if (gMode == 3) { gMode = 0; DrawWindow(); return; }
    if (gMode == 2) { return; }              /* must type initials */
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
static void DoAbout(void) { gMode = 1; gSweep = 0; DrawWindow(); }

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
                case kCheck:
                    RecomputeConflicts();
                    if (IsSolved()) {
                        if (!gWon) { TriggerWin(); }
                        else { gMode = 0; DrawWindow(); }
                    } else {
                        SysBeep(1); gMode = 0; DrawWindow();
                    }
                    break;
                case kClear: {
                    short r, c;
                    for (r = 0; r < 9; r++)
                        for (c = 0; c < 9; c++)
                            if (!gGiven[r][c]) gBoard[r][c] = 0;
                    gWon = false; gMode = 0; DrawWindow();
                    break;
                }
                case kScores: gLastRank = -1; gMode = 3; DrawWindow(); break;
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

static void IdleTick(void)
{
    if (gMode == 1) { AboutTick(); }
    else if (gMode == 2) { gBlink = !gBlink; DrawInitialSlots(); }
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
    AppendMenu(gGameM,
        "\pNew Easy/E;New Medium/M;New Hard/H;(-;Check/K;Clear Entries;(-;High Scores/S");
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

    LoadScores();
    if (gScoreN == 0) SeedDefaults();

    NewGame(0);          /* start on first Easy puzzle */
    DrawWindow();

    while (!gDone) {
        long sleep = (gMode == 1 || gMode == 2) ? 8L : 15L;
        if (WaitNextEvent(everyEvent, &ev, sleep, 0L)) {
            if (ev.what != nullEvent) HandleEvent(&ev);
            else IdleTick();
        } else {
            IdleTick();
        }
    }
    return 0;
}
