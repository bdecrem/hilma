/*
 * Quote of the Day — a Macinclaude app that gets online through the shared
 * MacTCP library (nettcp.h), not the old WiFi system service and not by dialing
 * the modem itself. It opens a direct TCP socket to the mini's quote agent,
 * asks for today's quote, and shows it word-wrapped with the author beneath.
 * Quote menu: Today's Quote / Surprise Me.
 *
 * Transport: NetConnect(&gConn, NetParseIP("192.168.7.50"), 2332); then send
 * "TODAY\r" / "RANDOM\r" with NetSend and read the "QUOTE ..." / "BY ..." reply
 * with NetAvailable + NetRecv. The request/response protocol is unchanged from
 * the WiFi-service version — only the wire underneath it changed.
 */
#include <Quickdraw.h>
#include <Windows.h>
#include <Fonts.h>
#include <Events.h>
#include <Menus.h>
#include <TextEdit.h>
#include <Dialogs.h>
#include <OSUtils.h>
#include "nettcp.h"        /* direct TCP via MacTCP (BlueSCSI DaynaPORT) */
#include "applog.inc"            /* key-event logging to the mini's shared logs */

#define QUOTE_IP   "192.168.7.50"
#define QUOTE_PORT 2332

#ifndef geneva
#define geneva 3
#endif
#ifndef italic
#define italic 2
#endif

#define kAppleMenu 128
#define kFileMenu  129
#define kQuoteMenu 130
#define kFileQuit  1
#define kQToday    1
#define kQRandom   2

static WindowPtr  gWin;
static MenuHandle gAppleM, gFileM, gQuoteM;
static char  gQuote[256];
static char  gAuthor[80];
static char  gStatus[80];
static NetConn gConn;
static Boolean gConnected = false;
static Boolean gHaveQuote = false;

/* incoming line accumulator for the connection */
static char  gLine[300];
static short gLineLen = 0;

static short slen(const char *s) { short n = 0; while (s[n]) n++; return n; }
static void  scopy(char *d, const char *s, short cap) { short i = 0; while (s[i] && i < cap - 1) { d[i] = s[i]; i++; } d[i] = 0; }

/* draw a C string word-wrapped inside [left,right], starting at v; return the
 * v BELOW the last line drawn */
static short DrawWrapped(const char *s, short left, short right, short v, short lineH)
{
    short width = right - left;
    short i = 0, n = slen(s);
    char line[256]; short ll = 0;
    while (i < n) {
        /* take the next word */
        short ws = i; while (i < n && s[i] != ' ') i++;
        { short k; char cand[256]; short cl = ll;
          /* candidate = line + (space?) + word */
          for (k = 0; k < ll; k++) cand[k] = line[k];
          if (ll > 0) cand[cl++] = ' ';
          { short w; for (w = ws; w < i; w++) cand[cl++] = s[w]; }
          cand[cl] = 0;
          if (TextWidth(cand, 0, cl) <= width || ll == 0) {
              scopy(line, cand, sizeof(line)); ll = cl;
          } else {
              MoveTo(left, v); DrawText(line, 0, ll); v += lineH;
              { short w; ll = 0; for (w = ws; w < i; w++) line[ll++] = s[w]; line[ll] = 0; }
          }
        }
        while (i < n && s[i] == ' ') i++;
    }
    if (ll > 0) { MoveTo(left, v); DrawText(line, 0, ll); v += lineH; }
    return v;
}

static void DrawScreen(void)
{
    Rect r; short v;
    SetPort(gWin);
    EraseRect(&gWin->portRect);
    r = gWin->portRect;

    if (gHaveQuote) {
        char by[100]; short n = 0, k;
        TextFont(geneva); TextSize(12); TextFace(0);
        v = DrawWrapped(gQuote, r.left + 40, r.right - 40, r.top + 70, 18);
        /* author, italic, a line below */
        TextFace(italic);
        by[n++] = '-'; by[n++] = '-'; by[n++] = ' ';
        for (k = 0; gAuthor[k] && n < 96; k++) by[n++] = gAuthor[k];
        by[n] = 0;
        MoveTo(r.right - 40 - TextWidth(by, 0, n), v + 16);
        DrawText(by, 0, n);
        TextFace(0);
    } else {
        TextFont(geneva); TextSize(12);
        MoveTo(r.left + 40, r.top + 90);
        DrawText(gStatus, 0, slen(gStatus));
    }
}

/* a completed line (QUOTE ... / BY ...) */
static void HandleLine(void)
{
    gLine[gLineLen] = 0;
    if (gLineLen >= 6 && gLine[0]=='Q'&&gLine[1]=='U'&&gLine[2]=='O'&&gLine[3]=='T'&&gLine[4]=='E'&&gLine[5]==' ') {
        scopy(gQuote, gLine + 6, sizeof(gQuote));
    } else if (gLineLen >= 3 && gLine[0]=='B'&&gLine[1]=='Y'&&gLine[2]==' ') {
        scopy(gAuthor, gLine + 3, sizeof(gAuthor));
        gHaveQuote = true;                 /* BY arrives after QUOTE -> render */
        DrawScreen();
    }
}

static void PumpQuote(void)
{
    unsigned char buf[128]; long avail, got; short i;
    if (!gConnected) return;
    avail = NetAvailable(&gConn);
    if (avail <= 0) {
        if (avail < 0) { gConnected = false; }   /* connection gone */
        return;
    }
    if (avail > (long)sizeof(buf)) avail = sizeof(buf);
    got = NetRecv(&gConn, buf, (unsigned short)avail, 1);
    if (got <= 0) return;
    for (i = 0; i < (short)got; i++) {
        unsigned char c = buf[i];
        if (c == '\r') continue;
        if (c == '\n') { HandleLine(); gLineLen = 0; continue; }
        if (gLineLen < (short)sizeof(gLine) - 1) gLine[gLineLen++] = (char)c;
    }
}

static void Ask(const char *what)
{
    char cmd[16]; short n = 0;
    gHaveQuote = false; gLineLen = 0;
    scopy(gStatus, "fetching a quote...", sizeof(gStatus));
    DrawScreen();
    if (!gConnected) { scopy(gStatus, "not connected to the quote service", sizeof(gStatus)); DrawScreen(); return; }
    /* send "<what>\r" — same line the WiFi service used to put on the channel */
    while (what[n] && n < 14) { cmd[n] = what[n]; n++; }
    cmd[n++] = '\r';
    if (NetSend(&gConn, cmd, (unsigned short)n) != noErr) {
        scopy(gStatus, "could not send the request", sizeof(gStatus)); DrawScreen();
    }
}

static void SetUpMenus(void)
{
    gAppleM = NewMenu(kAppleMenu, "\p\024");
    AppendMenu(gAppleM, "\pAbout Quote of the Day"); AppendResMenu(gAppleM, 'DRVR');
    InsertMenu(gAppleM, 0);
    gFileM = NewMenu(kFileMenu, "\pFile"); AppendMenu(gFileM, "\pQuit/Q"); InsertMenu(gFileM, 0);
    gQuoteM = NewMenu(kQuoteMenu, "\pQuote");
    AppendMenu(gQuoteM, "\pToday's Quote/T;Surprise Me/R"); InsertMenu(gQuoteM, 0);
    DrawMenuBar();
}

static void DoMenu(long sel)
{
    short menu = HiWord(sel), item = LoWord(sel); Str255 nm;
    if (menu == kAppleMenu) {
        if (item == 1) { ParamText("\pQuote of the Day — over TCP, through MacTCP.", "\p", "\p", "\p"); NoteAlert(128, 0L); }
        else { GetMenuItemText(gAppleM, item, nm); OpenDeskAcc(nm); }
    } else if (menu == kFileMenu) { /* quit handled by caller via flag */
    } else if (menu == kQuoteMenu) {
        if (item == kQToday) Ask("TODAY");
        else if (item == kQRandom) Ask("RANDOM");
    }
    HiliteMenu(0);
}

int main(void)
{
    EventRecord ev; Rect bounds; Boolean done = false;
    InitGraf(&qd.thePort); InitFonts(); InitWindows(); InitMenus();
    TEInit(); InitDialogs(0L); InitCursor();
    SetUpMenus();
    SetRect(&bounds, 30, 60, 482, 300);
    gWin = NewWindow(0L, &bounds, "\pQuote of the Day", true, noGrowDocProc, (WindowPtr)-1L, true, 0);
    SetPort(gWin);

    AppLogOpen("Quote"); AppLog("launched");   /* key events -> mini shared log */

    scopy(gStatus, "connecting to the quote service...", sizeof(gStatus));
    DrawScreen();
    if (NetConnect(&gConn, NetParseIP(QUOTE_IP), QUOTE_PORT) == noErr) {
        gConnected = true;
        AppLog("connected");
        Ask("TODAY");
    } else {
        AppLog("connect failed");
        scopy(gStatus, "could not connect (is MacTCP up?)", sizeof(gStatus));
        DrawScreen();
    }

    while (!done) {
        AppLogTick();
        if (WaitNextEvent(everyEvent, &ev, 6L, 0L)) {
            switch (ev.what) {
                case updateEvt: BeginUpdate(gWin); DrawScreen(); EndUpdate(gWin); break;
                case mouseDown: {
                    WindowPtr w; short part = FindWindow(ev.where, &w);
                    if (part == inMenuBar) {
                        long s = MenuSelect(ev.where);
                        if (HiWord(s) == kFileMenu && LoWord(s) == kFileQuit) done = true;
                        else DoMenu(s);
                    } else if (part == inDrag) DragWindow(w, ev.where, &qd.screenBits.bounds);
                    else if (part == inGoAway) { if (TrackGoAway(w, ev.where)) done = true; }
                    break;
                }
                case keyDown:
                    if (ev.modifiers & cmdKey) {
                        long s = MenuKey(ev.message & charCodeMask);
                        if (HiWord(s) == kFileMenu && LoWord(s) == kFileQuit) done = true;
                        else if (HiWord(s)) DoMenu(s);
                    }
                    break;
            }
        }
        PumpQuote();
    }
    if (gConnected) NetClose(&gConn);
    AppLogClose();
    return 0;
}
