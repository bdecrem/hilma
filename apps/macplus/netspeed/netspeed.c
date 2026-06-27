/*
 * NetSpeed — a tiny "speedtest" for the Macintosh Plus over real TCP/IP.
 *
 * Connects to a bulk server on the mini (192.168.7.50:2334) through the
 * BlueSCSI DaynaPORT + MacTCP, downloads a fixed payload, and reports the
 * throughput (KB/s and kbit/s) with a live progress bar so you actually watch
 * the network move. This is the first app on the Plus to use the new WiFi/TCP
 * transport (apps/macplus/net/nettcp) instead of the RetroWiFi serial modem.
 *
 * Protocol: connect; the server streams a header line "SIZE <n>\n" followed by
 * exactly <n> bytes, then closes. We time only the byte stream (handshake is
 * excluded), so the number is honest data throughput.
 */
#include <Quickdraw.h>
#include <Windows.h>
#include <Menus.h>
#include <Events.h>
#include <Fonts.h>
#include <TextEdit.h>
#include <Dialogs.h>
#include <ToolUtils.h>
#include <OSUtils.h>
#include <Timer.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

#include "nettcp.h"

#define SERVER_IP	"192.168.7.50"
#define SERVER_PORT	2335		/* 2334 is the screen agent; 2335 is free */
#define CHUNK		2048		/* bytes per NetRecv — also the bar's update grain */

/* menu IDs */
#define mApple		128
#define mFile		129
#define mTest		130
#define iAbout		1
#define iQuit		1
#define iRunTest	1

static WindowPtr	gWin;
static Boolean		gDone = false;

/* layout (window content is 360 x 220) */
#define WIN_W	360
#define WIN_H	220
#define BAR_L	24
#define BAR_R	(WIN_W - 24)
#define BAR_T	120
#define BAR_H	20

static void InitToolbox(void)
{
	InitGraf(&qd.thePort);
	InitFonts();
	InitWindows();
	InitMenus();
	TEInit();
	InitDialogs(nil);
	InitCursor();
	FlushEvents(everyEvent, 0);
}

static void SetUpMenus(void)
{
	Handle mbar;
	MenuHandle m;

	m = NewMenu(mApple, "\p\024");		/* apple char */
	AppendMenu(m, "\pAbout NetSpeed\311");
	InsertMenu(m, 0);

	m = NewMenu(mFile, "\pFile");
	AppendMenu(m, "\pQuit/Q");
	InsertMenu(m, 0);

	m = NewMenu(mTest, "\pTest");
	AppendMenu(m, "\pRun Speed Test/T");
	InsertMenu(m, 0);

	DrawMenuBar();
}

/* draw a left-justified Pascal string at (h,v) */
static void DrawAt(short h, short v, ConstStr255Param s)
{
	MoveTo(h, v);
	DrawString(s);
}

/* "61.4 KB/s" style: value is tenths (614 -> "61.4") */
static void FmtTenths(long tenths, char *suffix, Str255 out)
{
	char buf[64];
	sprintf(buf, "%ld.%ld %s", tenths / 10, tenths % 10, suffix);
	out[0] = (unsigned char)strlen(buf);
	BlockMoveData(buf, &out[1], out[0]);
}

static void ClearContent(void)
{
	Rect r = gWin->portRect;
	EraseRect(&r);
}

static void DrawFrame(void)
{
	Rect bar;
	TextFont(applFont); TextSize(12); TextFace(bold);
	DrawAt(24, 28, "\pNetSpeed");
	TextFace(0); TextSize(9);
	DrawAt(24, 44, "\pTCP/IP over BlueSCSI DaynaPORT + MacTCP");
	DrawAt(24, 58, "\pServer " SERVER_IP ":2334");
	TextSize(12);

	/* progress bar outline */
	SetRect(&bar, BAR_L, BAR_T, BAR_R, BAR_T + BAR_H);
	FrameRect(&bar);

	TextFace(0); TextSize(9);
	DrawAt(24, WIN_H - 14, "\pTest menu \312 Run Speed Test  (\021T)");
	TextSize(12);
}

/* fill the progress bar to `frac` of full (frac 0..1000 = per-mille) */
static void DrawBar(long permille)
{
	Rect fill;
	long w = (long)(BAR_R - BAR_L - 2);
	long fw = (w * permille) / 1000;
	if (fw < 0) fw = 0;
	if (fw > w) fw = w;
	SetRect(&fill, BAR_L + 1, BAR_T + 1, BAR_L + 1 + (short)fw, BAR_T + BAR_H - 1);
	PaintRect(&fill);
}

static void DrawStatus(ConstStr255Param s)
{
	Rect r;
	SetRect(&r, 24, 70, WIN_W - 24, 88);
	EraseRect(&r);
	TextSize(12);
	DrawAt(24, 84, s);
}

/* show the three result lines */
static void DrawResult(long bytes, long ticks, long kbpsTenths, long kbitps)
{
	Str255 s;
	char buf[80];
	Rect r;

	SetRect(&r, 24, BAR_T + BAR_H + 8, WIN_W - 24, WIN_H - 24);
	EraseRect(&r);
	TextSize(12);

	sprintf(buf, "Downloaded %ld KB in %ld.%ld s",
			bytes / 1024, ticks / 60, ((ticks % 60) * 10) / 60);
	s[0] = (unsigned char)strlen(buf); BlockMoveData(buf, &s[1], s[0]);
	DrawAt(24, BAR_T + BAR_H + 24, s);

	TextFace(bold);
	FmtTenths(kbpsTenths, "KB/s", s);
	DrawAt(24, BAR_T + BAR_H + 44, s);
	TextFace(0);

	sprintf(buf, "(%ld kbit/s)", kbitps);
	s[0] = (unsigned char)strlen(buf); BlockMoveData(buf, &s[1], s[0]);
	DrawAt(140, BAR_T + BAR_H + 44, s);
}

/* read and discard the "SIZE <n>\n" header from the front of the stream,
   returning any leftover payload bytes already pulled in `first`/`firstLen`. */
static long ReadHeader(NetConn *c, unsigned long *outSize,
                       char *spill, long *spillLen)
{
	char line[64];
	long n = 0, got;
	char ch;
	*spillLen = 0;
	*outSize = 0;
	/* read one byte at a time until newline (header is tiny) */
	while (n < (long)sizeof(line) - 1) {
		got = NetRecv(c, &ch, 1, 20);
		if (got <= 0) return -1;
		if (ch == '\n') break;
		line[n++] = ch;
	}
	line[n] = '\0';
	if (strncmp(line, "SIZE ", 5) != 0) return -1;
	*outSize = (unsigned long)atol(line + 5);
	return 0;
}

static void RunSpeedTest(void)
{
	NetConn conn;
	unsigned long host, payload = 0;
	long ticks0, ticks1, total = 0, got, spillLen = 0;
	char buf[CHUNK];
	char spill[8];
	OSErr err;
	long lastPermille = -1, permille;
	long kbpsTenths, kbitps, secsTicks;

	SetCursor(*GetCursor(watchCursor));
	ClearContent();
	DrawFrame();
	DrawStatus("\pConnecting\311");

	host = NetParseIP(SERVER_IP);
	err = NetConnect(&conn, host, SERVER_PORT);
	if (err != noErr) {
		Str255 s; char b[80];
		sprintf(b, "Connect failed: %s (%d)", NetErrStr(err), err);
		s[0] = (unsigned char)strlen(b); BlockMoveData(b, &s[1], s[0]);
		DrawStatus(s);
		InitCursor();
		return;
	}

	DrawStatus("\pDownloading\311");

	if (ReadHeader(&conn, &payload, spill, &spillLen) != 0 || payload == 0) {
		DrawStatus("\pBad server response");
		NetClose(&conn);
		InitCursor();
		return;
	}

	ticks0 = TickCount();
	while (total < (long)payload) {
		unsigned short want = CHUNK;
		if ((long)payload - total < CHUNK)
			want = (unsigned short)(payload - total);
		got = NetRecv(&conn, buf, want, 20);
		if (got < 0) {
			DrawStatus("\pTransfer error");
			break;
		}
		if (got == 0)
			break;			/* server closed early */
		total += got;

		permille = (total * 1000L) / (long)payload;
		if (permille != lastPermille) {
			DrawBar(permille);
			lastPermille = permille;
		}
	}
	ticks1 = TickCount();
	NetClose(&conn);

	secsTicks = ticks1 - ticks0;
	if (secsTicks < 1) secsTicks = 1;	/* guard div0 on sub-tick transfers */

	/* KB/s in tenths:  bytes/1024 per (ticks/60) sec  = bytes*60*10 / (1024*ticks) */
	kbpsTenths = (total * 600L) / (1024L * secsTicks);
	/* kbit/s: bytes*8 bits / 1000 per sec = bytes*60*8 / (1000*ticks) */
	kbitps = (total * 480L) / (1000L * secsTicks);

	DrawStatus("\pDone");
	DrawResult(total, secsTicks, kbpsTenths, kbitps);
	InitCursor();
}

static void DoMenu(long sel)
{
	short menu = HiWord(sel);
	short item = LoWord(sel);

	switch (menu) {
		case mApple:
			if (item == iAbout) {
				ClearContent();
				DrawFrame();
				DrawStatus("\pTCP/IP speed test \320 BlueSCSI DaynaPORT + MacTCP");
			}
			break;
		case mFile:
			if (item == iQuit) gDone = true;
			break;
		case mTest:
			if (item == iRunTest) RunSpeedTest();
			break;
	}
	HiliteMenu(0);
}

int main(void)
{
	Rect r;
	EventRecord ev;
	short part;
	WindowPtr win;

	InitToolbox();
	SetUpMenus();

	SetRect(&r, 0, 0, WIN_W, WIN_H);
	OffsetRect(&r, (qd.screenBits.bounds.right - WIN_W) / 2, 60);
	gWin = NewWindow(nil, &r, "\pNetSpeed", true, noGrowDocProc,
					 (WindowPtr)-1L, true, 0);
	SetPort(gWin);
	DrawFrame();

	while (!gDone) {
		if (WaitNextEvent(everyEvent, &ev, 30L, nil)) {
			switch (ev.what) {
				case mouseDown:
					part = FindWindow(ev.where, &win);
					if (part == inMenuBar)
						DoMenu(MenuSelect(ev.where));
					else if (part == inDrag)
						DragWindow(win, ev.where, &qd.screenBits.bounds);
					else if (part == inGoAway && TrackGoAway(win, ev.where))
						gDone = true;
					else if (part == inContent && win != FrontWindow())
						SelectWindow(win);
					break;
				case keyDown:
					if (ev.modifiers & cmdKey)
						DoMenu(MenuKey((char)(ev.message & charCodeMask)));
					break;
				case updateEvt:
					BeginUpdate((WindowPtr)ev.message);
					DrawFrame();
					EndUpdate((WindowPtr)ev.message);
					break;
			}
		}
	}
	return 0;
}
