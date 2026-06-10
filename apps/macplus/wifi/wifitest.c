/*
 * wifitest.c — exercises the WiFi system service (wifi.c) end to end.
 *
 * On launch: WIFIConnect() brings up (or reuses) the shared link, opens an
 * "echo" channel, sends a ping, and waits for it to bounce back — drawing a
 * smiley if the round-trip works, a sad face if not. This is HelloWiFi's test,
 * but driven entirely through the shared manager API instead of the app dialing
 * the modem itself — proving an app can get WiFi via the service.
 */
#include <Quickdraw.h>
#include <Windows.h>
#include <Fonts.h>
#include <Events.h>
#include <Menus.h>
#include <TextEdit.h>
#include <Dialogs.h>
#include <OSUtils.h>
#include "wifi.h"

static WindowPtr gWin;
static short gVerdict = 0;      /* 1 = smiley, -1 = sad, 0 = working */
static Str255 gMsg;

static void SetMsg(const char *s) { short i = 0; while (s[i] && i < 254) { gMsg[i+1] = s[i]; i++; } gMsg[0] = (unsigned char)i; }

static void DrawScreen(void)
{
    Rect r; short cx = 256, cy = 150;
    SetPort(gWin);
    EraseRect(&gWin->portRect);
    /* face */
    SetRect(&r, cx-60, cy-60, cx+60, cy+60);
    FrameOval(&r);
    /* eyes */
    SetRect(&r, cx-30, cy-25, cx-18, cy-8); PaintOval(&r);
    SetRect(&r, cx+18, cy-25, cx+30, cy-8); PaintOval(&r);
    /* mouth */
    if (gVerdict > 0) { SetRect(&r, cx-30, cy+5, cx+30, cy+40); FrameArc(&r, 90, 180); }       /* smile (bottom arc, U) */
    else if (gVerdict < 0) { SetRect(&r, cx-30, cy+20, cx+30, cy+55); FrameArc(&r, 270, 180); }/* frown (top arc, ∩) */
    else { MoveTo(cx-25, cy+25); LineTo(cx+25, cy+25); }                                        /* working */
    /* status line */
    TextFont(3); TextSize(9);   /* 3 = Geneva */
    MoveTo(cx - (StringWidth(gMsg) / 2), cy + 90);
    DrawString(gMsg);
}

static void RunTest(void)
{
    short ch; unsigned long deadline; char buf[64];
    gVerdict = 0; SetMsg("connecting to the WiFi service..."); DrawScreen();

    if (!WIFIConnect()) { gVerdict = -1; SetMsg("WiFi service could not connect"); DrawScreen(); return; }

    SetMsg("link up - opening echo channel..."); DrawScreen();
    ch = WIFIOpen("echo");
    if (ch < 0) { gVerdict = -1; SetMsg("could not open a channel"); DrawScreen(); return; }

    WIFISendLine(ch, "PING-via-the-service");
    SetMsg("sent ping, waiting for echo..."); DrawScreen();

    deadline = TickCount() + 240;
    while ((long)(TickCount() - deadline) < 0) {
        WIFIIdle();
        if (WIFIRead(ch, buf, sizeof(buf)) > 0) {
            gVerdict = 1; SetMsg("echo came back - WiFi service works!"); DrawScreen();
            return;
        }
    }
    gVerdict = -1; SetMsg("no echo in 4s - is the mux up?"); DrawScreen();
}

int main(void)
{
    EventRecord ev; Rect bounds; Boolean done = false;
    InitGraf(&qd.thePort); InitFonts(); InitWindows(); InitMenus();
    TEInit(); InitDialogs(0L); InitCursor();
    SetRect(&bounds, 0, 40, 512, 342);
    gWin = NewWindow(0L, &bounds, "\pWiFi Service Test", true, noGrowDocProc, (WindowPtr)-1L, false, 0);
    SetPort(gWin);
    SetMsg("starting..."); DrawScreen();

    RunTest();

    while (!done) {
        if (WaitNextEvent(everyEvent, &ev, 6L, 0L)) {
            if (ev.what == updateEvt) { BeginUpdate(gWin); DrawScreen(); EndUpdate(gWin); }
            else if (ev.what == mouseDown) done = true;     /* click to quit */
            else if (ev.what == keyDown) done = true;
        }
        if (WIFIIsConnected()) WIFIIdle();      /* keep the shared link drained */
    }
    WIFIPark();   /* leave the link up for the next app */
    return 0;
}
