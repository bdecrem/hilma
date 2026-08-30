/*
 * Dodo for Macintosh — every conversation is a topic.
 *
 * One window, one chat. The topic's name is the window title. Transcript
 * above, one input line below; Return sends. Cmd-N starts a new topic from a
 * first question (Dodo names it); Cmd-L lists your topics, newest first.
 * Quizzes, cards and stars live on the phone — the Plus is where you explore.
 *
 * Transport: direct TCP (nettcp.h → MacTCP → BlueSCSI DaynaPORT) to the mini's
 * agent-dodo on :2339, which talks to feynd.cc as the signed-in user. Wire
 * protocol: see agent-dodo/server.mjs; the parser is dodo_rx.inc (shared with
 * rxtest.c). Build: ./build.sh (Retro68). `./build.sh test` builds a DODO_TEST
 * variant that replays canned frames offline for Mini vMac screenshots.
 */
#include <Quickdraw.h>
#include <Windows.h>
#include <Fonts.h>
#include <Events.h>
#include <Menus.h>
#include <TextEdit.h>
#include <Dialogs.h>
#include <OSUtils.h>
#include <ToolUtils.h>
#include <Devices.h>
#include <Serial.h>
#include <Files.h>
#include "nettcp.h"
#include "applog.inc"
#include "winfull.inc"

/* Transport: direct TCP (MacTCP) on the Plus; with DODO_SERIAL, the modem port
   (RetroWiFi SI, or Mini vMac's bridged port -> vmodem) with the same shape. */
#ifdef DODO_SERIAL
#include "serlink.inc"
#define LinkConnect()      SLConnect(DODO_IP, DODO_PORT)
#define LinkAvailable()    SLAvailable()
#define LinkRecv(b, n)     SLRecv((b), (n))
#define LinkSend(b, n)     SLSend((b), (n))
#define LinkClose()        SLClose()
#else
#define LinkConnect()      NetConnect(&gConn, NetParseIP(DODO_IP), DODO_PORT)
#define LinkAvailable()    NetAvailable(&gConn)
#define LinkRecv(b, n)     NetRecv(&gConn, (b), (n), 1)
#define LinkSend(b, n)     NetSend(&gConn, (b), (n))
#define LinkClose()        NetClose(&gConn)
#endif

#define DODO_IP   "192.168.7.50"
#define DODO_PORT 2339
#define WAIT_TICKS (240L * 60L)      /* give a reply 4 minutes */

#ifndef geneva
#define geneva 3
#endif
#ifndef chicago
#define chicago 0
#endif
#ifndef bold
#define bold 1
#endif
#ifndef italic
#define italic 2
#endif

#define kAppleMenu 128
#define kFileMenu  129
#define kEditMenu  130
#define kFileNew       1
#define kFileTopics    2
#define kFileReconnect 4
#define kFileQuit      6

/* ---- modes ---- */
enum { MODE_CHAT = 0, MODE_WAIT, MODE_LISTWAIT, MODE_LIST, MODE_NEW, MODE_OFFLINE };

/* ---- transcript: a ring of pre-wrapped lines ---- */
#define NLINES   600
#define LINE_CAP 120
#define ST_DODO  0
#define ST_USER  1
#define ST_BLANK 2
#define ST_NOTE  3
static char          gL[NLINES][LINE_CAP];
static unsigned char gLLen[NLINES];
static unsigned char gLSt[NLINES];
static unsigned char gLPre[NLINES];      /* chars of bold prefix at line start */
static short gHead = 0;                  /* index where the NEXT line goes */
static short gCount = 0;
static short gScroll = 0;                /* lines scrolled up from the bottom */

static char  gInput[400];
static short gInLen = 0;

/* ---- topics list (Cmd-L) ---- */
#define TOP_MAX 40
#define ROW_MAX 9
static char  gTopName[TOP_MAX][62];
static char  gTopDate[TOP_MAX][12];
static short gTopN = 0, gSel = 0, gListTop = 0;

/* ---- new topic (Cmd-N) ---- */
static char  gNew[300];
static short gNewLen = 0;

static WindowPtr  gWin;
static MenuHandle gAppleM, gFileM, gEditM;
static Boolean    gDone = false;
static NetConn    gConn;
static Boolean    gConnected = false;
static short      gMode = MODE_OFFLINE;
static unsigned long gWaitStart = 0;
static char       gStatus[100];          /* what the input row shows while waiting */
static char       gTitle[90] = "Dodo";
static Boolean    gDirty = true;         /* transcript needs redraw */
static Boolean    gInDirty = true;       /* input row needs redraw */
static short      gCurStyle = ST_DODO;   /* style of the message being received */

/* ---- tiny string helpers (no libc surprises on the 68000) ---- */
static short slen(const char *s) { short n = 0; while (s[n]) n++; return n; }
static void  scopy(char *d, const char *s, short cap) { short i = 0; while (s[i] && i < cap - 1) { d[i] = s[i]; i++; } d[i] = 0; }
static void  c2p(const char *c, Str255 p) { short n = 0; while (c[n] && n < 255) { p[n + 1] = (unsigned char)c[n]; n++; } p[0] = (unsigned char)n; }

/* ---- layout ---- */
#define MARGIN   14
#define INPUT_H  44
static short gLineH = 16, gAscent = 12;

static void UseChatFont(void) { TextFont(geneva); TextSize(12); TextFace(0); }

static void Metrics(void)
{
	FontInfo fi;
	SetPort(gWin); UseChatFont(); GetFontInfo(&fi);
	gLineH = fi.ascent + fi.descent + fi.leading + 2;
	gAscent = fi.ascent;
}

static short ContentWidth(void) { return (gWin->portRect.right - gWin->portRect.left) - 2 * MARGIN - 8; }
static short InputTop(void) { return gWin->portRect.bottom - INPUT_H; }
static short Rows(void) { short r = (InputTop() - gWin->portRect.top - 6) / gLineH; return r < 1 ? 1 : r; }

/* ---- transcript store ---- */
static void PushLine(const char *s, short n, short st, short pre)
{
	if (n > LINE_CAP - 1) n = LINE_CAP - 1;
	{ short i; for (i = 0; i < n; i++) gL[gHead][i] = s[i]; }
	gL[gHead][n] = 0;
	gLLen[gHead] = (unsigned char)n;
	gLSt[gHead] = (unsigned char)st;
	gLPre[gHead] = (unsigned char)pre;
	gHead = (gHead + 1) % NLINES;
	if (gCount < NLINES) gCount++;
	gDirty = true;
}

static void ClearTranscript(void) { gHead = 0; gCount = 0; gScroll = 0; gDirty = true; }

/* Word-wrap `text` (with an optional bold `prefix` on the first line) into the
   ring at the current content width. Measures with the real font. */
static void AddWrapped(const char *prefix, const char *text, short st)
{
	char line[LINE_CAP]; short ll = 0, pre = 0, width, i = 0, n = slen(text);
	SetPort(gWin); UseChatFont();
	width = ContentWidth();
	if (prefix && prefix[0]) { scopy(line, prefix, sizeof(line)); ll = pre = slen(line); }
	if (n == 0) { PushLine(line, ll, st, pre); return; }
	while (i < n) {
		short ws = i, wl, k, cl;
		char cand[LINE_CAP];
		while (i < n && text[i] != ' ') i++;
		wl = i - ws;
		/* candidate = line + (space?) + word */
		cl = ll;
		for (k = 0; k < ll; k++) cand[k] = line[k];
		if (ll > 0 && ll > pre) cand[cl++] = ' ';
		for (k = 0; k < wl && cl < LINE_CAP - 1; k++) cand[cl++] = text[ws + k];
		cand[cl] = 0;
		if (ll == pre && ll > 0 && cl == ll) { /* nothing appended */ }
		if (TextWidth(cand, 0, cl) + (pre ? 6 : 0) <= width || ll == pre) {
			for (k = 0; k < cl; k++) line[k] = cand[k];
			ll = cl; line[ll] = 0;
			if (cl >= LINE_CAP - 1) { PushLine(line, ll, st, pre); ll = 0; pre = 0; }
		} else {
			PushLine(line, ll, st, pre);
			ll = 0; pre = 0;
			for (k = 0; k < wl && ll < LINE_CAP - 1; k++) line[ll++] = text[ws + k];
			line[ll] = 0;
		}
		while (i < n && text[i] == ' ') i++;
	}
	if (ll > 0) PushLine(line, ll, st, pre);
}

static void Note(const char *s) { AddWrapped("", s, ST_NOTE); }

/* ---- drawing ---- */
static void DrawTranscript(void)
{
	Rect r; short rows, k, y, idx, last;
	SetPort(gWin);
	r = gWin->portRect; r.bottom = InputTop();
	EraseRect(&r);
	UseChatFont();
	rows = Rows();
	if (gScroll > gCount - 1) gScroll = gCount - 1;
	if (gScroll < 0) gScroll = 0;
	last = gCount - 1 - gScroll;                 /* logical index of the bottom row */
	y = r.top + 4 + gAscent + (rows - 1) * gLineH;
	for (k = 0; k < rows; k++) {
		short li = last - k;
		if (li < 0) break;
		idx = (gHead - gCount + li + NLINES) % NLINES;
		if (gLSt[idx] != ST_BLANK && gLLen[idx] > 0) {
			MoveTo(r.left + MARGIN, y);
			if (gLSt[idx] == ST_USER) TextFace(bold);
			else if (gLSt[idx] == ST_NOTE) TextFace(italic);
			else TextFace(0);
			if (gLPre[idx] > 0 && gLSt[idx] == ST_DODO) {
				TextFace(bold); DrawText(gL[idx], 0, gLPre[idx]);
				TextFace(0);    DrawText(gL[idx], gLPre[idx], gLLen[idx] - gLPre[idx]);
			} else {
				DrawText(gL[idx], 0, gLLen[idx]);
			}
			TextFace(0);
		}
		y -= gLineH;
	}
	gDirty = false;
}

static void DrawInput(void)
{
	Rect r; short y, w, start;
	SetPort(gWin);
	r = gWin->portRect; r.top = InputTop();
	EraseRect(&r);
	MoveTo(r.left, r.top); LineTo(r.right, r.top);
	UseChatFont();
	y = r.top + 8 + gAscent;
	if (gMode == MODE_WAIT || gMode == MODE_LISTWAIT) {
		TextFace(italic);
		MoveTo(r.left + MARGIN, y); DrawText(gStatus, 0, slen(gStatus));
		TextFace(0);
	} else if (gMode == MODE_OFFLINE) {
		TextFace(italic);
		MoveTo(r.left + MARGIN, y); DrawText(gStatus, 0, slen(gStatus));
		TextFace(0);
	} else {
		/* show the tail of the input that fits */
		w = ContentWidth() - 10; start = 0;
		while (start < gInLen && TextWidth(gInput + start, 0, gInLen - start) > w) start++;
		MoveTo(r.left + MARGIN, y);
		DrawText(gInput + start, 0, gInLen - start);
		/* cursor */
		{ Point p; GetPen(&p); MoveTo(p.h + 1, y + 2); LineTo(p.h + 1, y - gAscent + 1); }
	}
	/* scrolled up: say how far, at the right edge of the input row */
	if (gScroll > 0) {
		char b[24]; short n = 0, more = gScroll;
		if (more >= 100) b[n++] = (char)('0' + more / 100);
		if (more >= 10)  b[n++] = (char)('0' + (more / 10) % 10);
		b[n++] = (char)('0' + more % 10);
		{ const char *t = " lines below"; while (*t) b[n++] = *t++; }
		TextSize(9);
		MoveTo(r.right - MARGIN - TextWidth(b, 0, n), y);
		DrawText(b, 0, n);
		TextSize(12);
	}
	gInDirty = false;
}

/* a period dialog box drawn in the window: frame + drop shadow, white inside */
static void DrawBox(const Rect *b)
{
	Rect s = *b;
	OffsetRect(&s, 2, 2); PaintRect(&s);
	EraseRect(b); FrameRect(b);
}

static void DrawButton(const Rect *b, const char *label, Boolean isDefault)
{
	Rect o;
	EraseRoundRect(b, 10, 10); FrameRoundRect(b, 10, 10);
	if (isDefault) { o = *b; InsetRect(&o, -3, -3); PenSize(2, 2); FrameRoundRect(&o, 14, 14); PenSize(1, 1); }
	TextFont(chicago); TextSize(12); TextFace(0);
	MoveTo(b->left + ((b->right - b->left) - TextWidth(label, 0, slen(label))) / 2, b->bottom - 6);
	DrawText(label, 0, slen(label));
	UseChatFont();
}

static void ListBox(Rect *box, Rect *rowsR, Rect *cancelB, Rect *openB)
{
	Rect r = gWin->portRect; short w = 330, h = 44 + ROW_MAX * 16 + 44;
	SetRect(box, 0, 0, w, h);
	OffsetRect(box, r.left + ((r.right - r.left) - w) / 2, r.top + 34);
	SetRect(rowsR, box->left + 12, box->top + 34, box->right - 12, box->top + 34 + ROW_MAX * 16 + 2);
	SetRect(openB,   box->right - 12 - 66, box->bottom - 34, box->right - 12, box->bottom - 12);
	SetRect(cancelB, openB->left - 12 - 66, box->bottom - 34, openB->left - 12, box->bottom - 12);
}

static void DrawList(void)
{
	Rect box, rows, cancelB, openB, rr; short i, y;
	SetPort(gWin);
	ListBox(&box, &rows, &cancelB, &openB);
	DrawBox(&box);
	TextFont(chicago); TextSize(12);
	MoveTo(box.left + 12, box.top + 20); DrawString("\pTopics");
	FrameRect(&rows);
	UseChatFont();
	for (i = 0; i < ROW_MAX; i++) {
		short t = gListTop + i;
		if (t >= gTopN) break;
		SetRect(&rr, rows.left + 1, rows.top + 1 + i * 16, rows.right - 1, rows.top + 1 + (i + 1) * 16);
		y = rr.top + 12;
		MoveTo(rr.left + 5, y); DrawText(gTopName[t], 0, slen(gTopName[t]));
		MoveTo(rr.right - 5 - TextWidth(gTopDate[t], 0, slen(gTopDate[t])), y);
		DrawText(gTopDate[t], 0, slen(gTopDate[t]));
		if (t == gSel) InvertRect(&rr);
	}
	if (gTopN == 0) { MoveTo(rows.left + 8, rows.top + 20); DrawString("\pNo topics yet - Cmd-N starts one."); }
	DrawButton(&cancelB, "Cancel", false);
	DrawButton(&openB, "Open", true);
}

static void NewBox(Rect *box, Rect *field, Rect *cancelB, Rect *startB)
{
	Rect r = gWin->portRect; short w = 350, h = 140;
	SetRect(box, 0, 0, w, h);
	OffsetRect(box, r.left + ((r.right - r.left) - w) / 2, r.top + 70);
	SetRect(field, box->left + 12, box->top + 52, box->right - 12, box->top + 52 + 40);
	SetRect(startB,  box->right - 12 - 66, box->bottom - 34, box->right - 12, box->bottom - 12);
	SetRect(cancelB, startB->left - 12 - 66, box->bottom - 34, startB->left - 12, box->bottom - 12);
}

static void DrawNewTopic(void)
{
	Rect box, field, cancelB, startB; short start, w;
	SetPort(gWin);
	NewBox(&box, &field, &cancelB, &startB);
	DrawBox(&box);
	TextFont(chicago); TextSize(12);
	MoveTo(box.left + 12, box.top + 20); DrawString("\pNew topic");
	UseChatFont();
	MoveTo(box.left + 12, box.top + 40); DrawString("\pAsk your first question. Dodo names the topic.");
	FrameRect(&field);
	w = (field.right - field.left) - 14; start = 0;
	while (start < gNewLen && TextWidth(gNew + start, 0, gNewLen - start) > w) start++;
	MoveTo(field.left + 6, field.top + 8 + gAscent);
	DrawText(gNew + start, 0, gNewLen - start);
	{ Point p; GetPen(&p); MoveTo(p.h + 1, field.top + 10 + gAscent); LineTo(p.h + 1, field.top + 9); }
	DrawButton(&cancelB, "Cancel", false);
	DrawButton(&startB, "Start", true);
}

static void DrawAll(void)
{
	DrawTranscript();
	DrawInput();
	if (gMode == MODE_LIST) DrawList();
	else if (gMode == MODE_NEW) DrawNewTopic();
}

static void Redraw(void)
{
	if (gMode == MODE_LIST || gMode == MODE_NEW) { DrawAll(); return; }
	if (gDirty) DrawTranscript();
	if (gInDirty) DrawInput();
}

static void SetTitle(const char *name)
{
	Str255 p;
	scopy(gTitle, name, sizeof(gTitle));
	c2p(gTitle, p);
	SetWTitle(gWin, p);
}

/* ---- network ---- */
static Boolean SendLine(const char *cmd, const char *arg)
{
	char buf[420]; short n = 0, i;
	if (!gConnected) return false;
	for (i = 0; cmd[i] && n < 400; i++) buf[n++] = cmd[i];
	if (arg && arg[0]) { buf[n++] = ' '; for (i = 0; arg[i] && n < 410; i++) buf[n++] = arg[i]; }
	buf[n++] = '\r'; buf[n++] = '\n';
	if (LinkSend(buf, (unsigned short)n) != noErr) {
		gConnected = false; gMode = MODE_OFFLINE;
		scopy(gStatus, "Connection lost. Cmd-R to reconnect.", sizeof(gStatus));
		gInDirty = true;
		return false;
	}
	return true;
}

static void StartWait(const char *what)
{
	gMode = MODE_WAIT; gWaitStart = TickCount();
	scopy(gStatus, what, sizeof(gStatus));
	gInDirty = true;
}

/* ---- parser callbacks (dodo_rx.inc) ---- */
static void RxTopic(const char *name)
{
	SetTitle(name);
	ClearTranscript();
	gCurStyle = ST_DODO;
}
static void RxMsg(char role, const char *text)
{
	gCurStyle = (role == 'U') ? ST_USER : ST_DODO;
	if (gCount > 0 && gLSt[(gHead - 1 + NLINES) % NLINES] != ST_BLANK) PushLine("", 0, ST_BLANK, 0);
	AddWrapped(role == 'U' ? "> " : "Dodo: ", text, gCurStyle);
}
static void RxCont(const char *text)
{
	if (text[0] == 0) PushLine("", 0, ST_BLANK, 0);
	else AddWrapped("", text, gCurStyle);
}
static void RxListStart(void) { gTopN = 0; gSel = 0; gListTop = 0; }
static void RxListItem(short n, const char *date, const char *name)
{
	if (n < 1 || n > TOP_MAX) return;
	scopy(gTopName[n - 1], name, sizeof(gTopName[0]));
	scopy(gTopDate[n - 1], date, sizeof(gTopDate[0]));
	if (n > gTopN) gTopN = n;
}
static void RxWait(const char *text) { scopy(gStatus, text, sizeof(gStatus)); gWaitStart = TickCount(); gInDirty = true; }
static void RxErr(const char *text)
{
	char b[220]; short n = 0, i;
	for (i = 0; i < 4; i++) b[n++] = "Oops"[i]; b[n++] = ':'; b[n++] = ' ';
	for (i = 0; text[i] && n < 210; i++) b[n++] = text[i];
	b[n] = 0;
	Note(b);
	if (gMode == MODE_WAIT) { gMode = MODE_CHAT; gInDirty = true; }
	if (gMode == MODE_LISTWAIT) { gMode = MODE_CHAT; gInDirty = true; }
	AppLog("agent error");
}
static void RxEnd(void)
{
	if (gMode == MODE_WAIT) { gMode = MODE_CHAT; gScroll = 0; gInDirty = true; }
	else if (gMode == MODE_LISTWAIT) { gMode = MODE_LIST; gDirty = true; }
	gDirty = true;
}
static void RxOk(void) {}

#include "dodo_rx.inc"

static void Pump(void)
{
	unsigned char buf[256]; long avail, got;
#ifdef DODO_TEST
	return;                                  /* offline: nothing to pump */
#endif
	if (!gConnected) return;
	avail = LinkAvailable();
	if (avail < 0) {
		gConnected = false; gMode = MODE_OFFLINE;
		scopy(gStatus, "Connection lost. Cmd-R to reconnect.", sizeof(gStatus));
		Note("[connection lost]");
		gInDirty = true; AppLog("link lost");
		return;
	}
	if (avail == 0) {
		if (gMode == MODE_WAIT && TickCount() - gWaitStart > WAIT_TICKS) {
			Note("Dodo took too long. Try again.");
			gMode = MODE_CHAT; gInDirty = true;
		}
		return;
	}
	if (avail > (long)sizeof(buf)) avail = sizeof(buf);
	got = LinkRecv(buf, (unsigned short)avail);
	if (got > 0) RxFeed(buf, (short)got);
}

static void Connect(void)
{
	scopy(gStatus, "Connecting to Dodo...", sizeof(gStatus));
	gMode = MODE_OFFLINE; DrawInput();
	if (LinkConnect() == noErr) {
		gConnected = true; AppLog("connected");
		gMode = MODE_LISTWAIT;   /* LAST answers with a transcript; reuse the wait path */
		gMode = MODE_WAIT;
		scopy(gStatus, "Opening your last topic...", sizeof(gStatus));
		gWaitStart = TickCount();
		SendLine("LAST", 0);
	} else {
		AppLog("connect failed");
		gConnected = false; gMode = MODE_OFFLINE;
		scopy(gStatus, "Couldn't reach the mini. Cmd-R to retry.", sizeof(gStatus));
	}
	gInDirty = true;
}

/* ---- actions ---- */
static void SendChat(void)
{
	char text[400];
	if (gInLen == 0 || gMode != MODE_CHAT) return;
	scopy(text, gInput, sizeof(text));
	gInLen = 0; gInput[0] = 0;
	if (gCount > 0) PushLine("", 0, ST_BLANK, 0);
	AddWrapped("> ", text, ST_USER);
	gScroll = 0;
	StartWait("Dodo is thinking...");
	AppLog("say");
	SendLine("SAY", text);
	gDirty = true;
}

static void StartNewTopic(void)
{
	char text[300];
	if (gNewLen == 0) return;
	scopy(text, gNew, sizeof(text));
	gNewLen = 0; gNew[0] = 0;
	ClearTranscript();
	SetTitle("New topic");
	StartWait("Dodo is thinking...");
	AppLog("new topic");
	SendLine("NEW", text);
	DrawAll();
}

static void OpenSelected(void)
{
	char num[8]; short n = gSel + 1, i = 0;
	if (gTopN == 0) { gMode = MODE_CHAT; DrawAll(); return; }
	if (n >= 10) num[i++] = (char)('0' + n / 10);
	num[i++] = (char)('0' + n % 10); num[i] = 0;
	StartWait("Opening...");
	AppLog("open topic");
	SendLine("OPEN", num);
	DrawAll();
}

static void AskList(void)
{
	if (!gConnected || gMode == MODE_WAIT) return;
	gMode = MODE_LISTWAIT; gWaitStart = TickCount();
	scopy(gStatus, "Fetching your topics...", sizeof(gStatus));
	gInDirty = true; DrawInput();
	SendLine("LIST", 0);
}

static void BeginNew(void)
{
	if (!gConnected || gMode == MODE_WAIT) return;
	gMode = MODE_NEW; gNewLen = 0; gNew[0] = 0;
	DrawAll();
}

/* ---- keys ---- */
static void KeyChat(char c, Boolean cmd)
{
	if (c == 30 || c == 31) {            /* up / down arrows scroll the transcript */
		short step = cmd ? Rows() : 3;
		if (c == 30) gScroll += step; else gScroll -= step;
		if (gScroll < 0) gScroll = 0;
		if (gScroll > gCount - 1) gScroll = gCount - 1;
		gDirty = gInDirty = true; return;
	}
	if (c == 11) { gScroll += Rows(); if (gScroll > gCount - 1) gScroll = gCount - 1; gDirty = gInDirty = true; return; }   /* page up */
	if (c == 12) { gScroll -= Rows(); if (gScroll < 0) gScroll = 0; gDirty = gInDirty = true; return; }                     /* page down */
	if (gMode != MODE_CHAT) return;
	if (c == 13 || c == 3) { SendChat(); return; }
	if (c == 8) { if (gInLen > 0) gInLen--; gInput[gInLen] = 0; gInDirty = true; return; }
	if (c < 32) return;
	if (gInLen < (short)sizeof(gInput) - 1) { gInput[gInLen++] = c; gInput[gInLen] = 0; gInDirty = true; }
}

static void KeyList(char c)
{
	if (c == 27 || c == '.') { gMode = MODE_CHAT; DrawAll(); return; }
	if (c == 13 || c == 3) { OpenSelected(); return; }
	if (c == 30 && gSel > 0) gSel--;
	if (c == 31 && gSel < gTopN - 1) gSel++;
	if (gSel < gListTop) gListTop = gSel;
	if (gSel >= gListTop + ROW_MAX) gListTop = gSel - ROW_MAX + 1;
	DrawList();
}

static void KeyNew(char c)
{
	if (c == 27) { gMode = MODE_CHAT; DrawAll(); return; }
	if (c == 13 || c == 3) { StartNewTopic(); return; }
	if (c == 8) { if (gNewLen > 0) gNewLen--; gNew[gNewLen] = 0; DrawNewTopic(); return; }
	if (c < 32) return;
	if (gNewLen < (short)sizeof(gNew) - 1) { gNew[gNewLen++] = c; gNew[gNewLen] = 0; DrawNewTopic(); }
}

/* ---- mouse in the overlays ---- */
static void ClickList(Point where)
{
	Rect box, rows, cancelB, openB;
	ListBox(&box, &rows, &cancelB, &openB);
	if (PtInRect(where, &cancelB)) { gMode = MODE_CHAT; DrawAll(); return; }
	if (PtInRect(where, &openB)) { OpenSelected(); return; }
	if (PtInRect(where, &rows)) {
		short row = (where.v - rows.top - 1) / 16;
		if (row >= 0 && gListTop + row < gTopN) {
			if (gListTop + row == gSel) { OpenSelected(); return; }   /* second click opens */
			gSel = gListTop + row; DrawList();
		}
	}
}

static void ClickNew(Point where)
{
	Rect box, field, cancelB, startB;
	NewBox(&box, &field, &cancelB, &startB);
	if (PtInRect(where, &cancelB)) { gMode = MODE_CHAT; DrawAll(); return; }
	if (PtInRect(where, &startB)) { StartNewTopic(); return; }
}

/* ---- menus ---- */
static void SetUpMenus(void)
{
	gAppleM = NewMenu(kAppleMenu, "\p\024");
	AppendMenu(gAppleM, "\pAbout Dodo"); AppendResMenu(gAppleM, 'DRVR'); InsertMenu(gAppleM, 0);
	gFileM = NewMenu(kFileMenu, "\pFile");
	AppendMenu(gFileM, "\pNew Topic/N;Topics.../L;(-;Reconnect/R;(-;Quit/Q"); InsertMenu(gFileM, 0);
	gEditM = NewMenu(kEditMenu, "\pEdit");
	AppendMenu(gEditM, "\pUndo/Z;(-;Cut/X;Copy/C;Paste/V;Clear"); InsertMenu(gEditM, 0);
	DrawMenuBar();
}

static void DoMenu(long sel)
{
	short menu = HiWord(sel), item = LoWord(sel); Str255 nm;
	if (menu == kAppleMenu) {
		if (item == 1) { ParamText("\pDodo for Macintosh. Every conversation is a topic. Cmd-N asks a first question; Cmd-L lists your topics.", "\p", "\p", "\p"); NoteAlert(128, 0L); }
		else { GetMenuItemText(gAppleM, item, nm); OpenDeskAcc(nm); }
	} else if (menu == kFileMenu) {
		if (item == kFileNew) BeginNew();
		else if (item == kFileTopics) AskList();
		else if (item == kFileReconnect) { if (gConnected) LinkClose(); gConnected = false; Connect(); }
		else if (item == kFileQuit) gDone = true;
	} else if (menu == kEditMenu) {
		SystemEdit(item - 1);
	}
	HiliteMenu(0);
}

#ifdef DODO_TEST
/* Offline replay for Mini vMac screenshots: a canned transcript + list. */
static void TestFeed(const char *s) { RxFeed((const unsigned char *)s, slen(s)); }
static void TestSeed(void)
{
	gConnected = true;
	TestFeed("DTOPIC Sumerian\n");
	TestFeed("DU who actually invented writing and what did they write down first\n");
	TestFeed("DA Nobody sat down to invent it. Around 3300 BC, temple accountants in Uruk were pressing tokens into clay to track grain and sheep. The tokens became marks, the marks became signs - and for the first few centuries that's all cuneiform was: receipts. The earliest tablets are lists. Barley, beer rations, workers.\n");
	TestFeed("DU so no stories for centuries?\n");
	TestFeed("DA Right. Literature shows up around 2600 BC, and even then it's mostly hymns and king lists. Gilgamesh as we know it is a thousand years after the first receipt.\n");
	TestFeed("DEND\n");
	TestFeed("DLIST\nDT 1 today|Sumerian\nDT 2 today|Fresco\nDT 3 Aug 24|French Belgium US Revolutions\nDT 4 Aug 22|Superintelligence - Bostrom\nDT 5 Aug 19|Manifold\nDT 6 Aug 18|Unit Distance problem\nDT 7 Aug 12|Einstein - Isaacson\nDEND\n");
	gMode = MODE_CHAT;
	scopy(gInput, "how did they teach it", sizeof(gInput)); gInLen = slen(gInput);
}
#endif

int main(void)
{
	EventRecord ev;
	InitGraf(&qd.thePort); InitFonts(); InitWindows(); InitMenus();
	TEInit(); InitDialogs(0L); InitCursor();
	SetUpMenus();
	gWin = WFNew("\pDodo");
	SetPort(gWin);
	Metrics();
	AppLogOpen("Dodo"); AppLog("launched");

#ifdef DODO_TEST
	TestSeed();
	DrawAll();
#else
	DrawAll();
	Connect();
#endif

	while (!gDone) {
		AppLogTick();
		if (WaitNextEvent(everyEvent, &ev, (gMode == MODE_WAIT || gMode == MODE_LISTWAIT) ? 2L : 10L, 0L)) {
			switch (ev.what) {
				case updateEvt: BeginUpdate(gWin); DrawAll(); EndUpdate(gWin); break;
				case keyDown:
				case autoKey: {
					char c = (char)(ev.message & charCodeMask);
					Boolean cmd = (ev.modifiers & cmdKey) != 0;
					if (cmd && c == '.' && (gMode == MODE_LIST || gMode == MODE_NEW)) {   /* Cmd-. cancels (no Esc on a Plus keyboard) */
						gMode = MODE_CHAT; DrawAll(); break;
					}
					if (cmd && c != 30 && c != 31) {
						long s = MenuKey(c);
						if (HiWord(s)) DoMenu(s);
						break;
					}
					if (gMode == MODE_LIST) KeyList(c);
					else if (gMode == MODE_NEW) KeyNew(c);
					else KeyChat(c, cmd);
					break;
				}
				case mouseDown: {
					WindowPtr w; short part = FindWindow(ev.where, &w);
					if (part == inMenuBar) DoMenu(MenuSelect(ev.where));
					else if (part == inDrag) DragWindow(w, ev.where, &qd.screenBits.bounds);
					else if (part == inGoAway) { if (TrackGoAway(w, ev.where)) gDone = true; }
					else if (part == inZoomIn || part == inZoomOut) { if (WFZoom(w, part, ev.where)) { Metrics(); gDirty = gInDirty = true; DrawAll(); } }
					else if (part == inContent) {
						Point p = ev.where; GlobalToLocal(&p);
						if (gMode == MODE_LIST) ClickList(p);
						else if (gMode == MODE_NEW) ClickNew(p);
					}
					break;
				}
			}
		}
		Pump();
		Redraw();
	}
	if (gConnected) LinkClose();
	AppLogClose();
	return 0;
}
