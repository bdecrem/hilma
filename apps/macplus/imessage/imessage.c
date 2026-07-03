/*
 * Macinclaude iMessage - an iMessage client for the Macintosh Plus.
 * (System 6.0.8, 68000.) Built with Retro68.
 *
 * The Plus is a thin client: the Mac mini reads ~/Library/Messages/chat.db and
 * sends through Messages.app (AppleScript); this app shows a conversation list
 * on the left, the selected thread on the right, and composes replies with a
 * modal "Reply..." box.
 *
 * Transport: a direct TCP socket via the shared MacTCP library (net/nettcp.c,
 * over the BlueSCSI DaynaPORT Ethernet emulation). The app opens one connection
 * straight to the mini's iMessage agent at 192.168.7.50:2328 — no modem, no MUX
 * channel. (This replaced the old RetroWiFi-SI serial / WiFi-system-service path.)
 *
 * Two halves of one product:
 *   - Plus side (this file): TCP transport (nettcp), the IM payload receiver
 *     (im_rx.inc, shared with rxtest.c), a two-pane browse/compose UI.
 *   - Mini side (agent-imessage/): chat.db read + AppleScript send.
 *
 * Commands the Plus sends on the socket (one line + \r):
 *   LIST / OPEN <idx> / SEND <idx> <text>
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
#include <Serial.h>
#include <SegLoad.h>
#include "nettcp.h"              /* direct TCP via MacTCP (BlueSCSI DaynaPORT) */
#include "applog.inc"            /* key-event logging to the mini's shared logs */
#include "winfull.inc"           /* full-screen window + close/zoom (maximize) box */

#define IMESSAGE_IP   "192.168.7.50"
#define IMESSAGE_PORT 2328

#ifndef geneva
#define geneva 3
#endif
#ifndef systemFont
#define systemFont 0
#endif

/* ---- menus ---- */
#define kAppleMenu 128
#define kFileMenu  129
#define kEditMenu  130
#define kConnMenu  131
#define kMsgMenu   132

#define kFileQuit 1

#define kConnConnect    1
#define kConnDisconnect 2
/* 3 separator */
#define kConnSettings   4

#define kMsgRefresh 1
#define kMsgCheck   2
/* Reply removed — replies are the inline compose bar now */

/* ---- Settings dialog (imessage.r DLOG/DITL 128) ---- */
#define kDlgSettings 128
#define kSave    1
#define kCancel  2
#define kSSID    4
#define kPass    6
#define kHost    8
#define kPortF   10
#define kRB1200  12
#define kRB2400  13
#define kRB9600  14
#define kRB19200 15
#define kFrame   17

/* ---- one-field prompt dialog (imessage.r DLOG/DITL 129): Reply ---- */
#define kDlgPrompt  129
#define kPromptGo     1
#define kPromptCancel 2
#define kPromptLabel  3
#define kPromptEdit   4
#define kPromptFrame  5

/* ---- New Message dialog (imessage.r DLOG/DITL 130): To + Message ---- */
#define kDlgNew     130
#define kNewSend      1
#define kNewCancel    2
#define kNewToLabel   3
#define kNewTo        4
#define kNewMsgLabel  5
#define kNewMsg       6
#define kNewFrame     7

/* ---- prefs ---- */
#define kPrefMagic   0x494D      /* 'IM' */
#define kPrefVersion 1
#define kPrefName    "\pMacinclaude iMessage Prefs"
#define kPrefCreator 'IMSG'
#define kPrefType    'pref'

typedef struct {
    short          magic;
    short          version;
    short          baudIdx;
    unsigned short tcpPort;       /* 2330 = the MUX multiplexer */
    Str255         host;
    Str255         ssid;
    Str255         pass;
    Boolean        wifiSaved;
    Boolean        pad;
} Config;

static Config gCfg;
static Boolean gHaveCfg = false;
static short   gPrefVRef = 0;

/* ---- window geometry ---- */
/* The Plus screen is 512x342 with a 20px menu bar. The window opens at top=40
 * (title bar fills 20-40). Keep clear margin so it fits real hardware (slight
 * CRT overscan), not just the pixel-exact emulator: content 6..506 x 40..330. */
static short WIN_W = 500, WIN_H = 290;  /* set from the full-screen window at open */
#define LIST_W 150                      /* conversation list pane width */
#define SBAR_W 16                       /* thread scrollbar */
#define DIV_X  LIST_W                    /* divider between panes */
#define VIEW_R (WIN_W - SBAR_W)          /* right edge of thread text */
#define TX0    (LIST_W + 8)              /* thread left margin */
#define TXR    (VIEW_R - 6)              /* thread right margin */
#define TXW    (TXR - TX0)               /* thread wrap width (px) */
#define MARG_TOP 6
#define ROW_H 16                         /* a conversation-list row */
#define LBAR_X (DIV_X - SBAR_W)           /* left edge of the list scrollbar */
#define LIST_ROWS (WIN_H / ROW_H)         /* conversation rows that fit at once */
#define COMPOSE_H 24                      /* inline reply bar at the thread pane bottom */
#define THREAD_H (WIN_H - COMPOSE_H)      /* thread text + scrollbar height (above the bar) */
#define SENDBTN_W 46                      /* the Send button */
#define NEWBTN_W  40                      /* the "New" (compose to a new recipient) button */

/* ---- conversation list ---- */
#define MAX_CONV 24
#define CONV_NAMEW 48
static short gConvN = 0;
static char  gConvName[MAX_CONV][CONV_NAMEW];
static short gConvUnread[MAX_CONV];
static short gSel = -1;
static char  gThreadName[CONV_NAMEW];

/* ---- thread (right pane) text model — word-wrapped lines, like surf ---- */
#define TEXT_POOL 16384
#define MAX_PLINES 1200
typedef struct {
    long  off;
    short len;
    short y;
    unsigned char style;   /* 'H' in-label,'h' out-label,'P' in-body,'O' out-body */
} PLine;
static char  gText[TEXT_POOL];
static long  gTextLen = 0;
static PLine gPL[MAX_PLINES];
static short gNPL = 0;
static short gDocY = MARG_TOP;
static short gScrollY = 0;

/* font metrics (Geneva 9 plain / Geneva 9 bold share height) */
static short gAsc9, gLh9;

/* ---- globals ---- */
static WindowPtr     gWin;
static ControlHandle gScroll;       /* thread (right pane) scrollbar */
static ControlHandle gListScroll;   /* conversation list (left pane) scrollbar */
static short gListTop = 0;           /* index of the first visible conversation */
static TEHandle      gCompose;       /* inline reply field, bottom of the thread pane */
static ControlHandle gSendBtn;       /* the Send button */
static ControlHandle gNewBtn;        /* the "New" button (compose to a new recipient) */
static void DrawCompose(void);
static void SetComposeEnabled(Boolean on);
static void DoSend(void);
static void DoNewMessage(void);
static MenuHandle    gAppleM, gFileM, gEditM, gConnM, gMsgM;
static Boolean       gDone = false;

static Boolean gConnected = false;   /* the TCP connection to the mini is open */
static NetConn gConn;                /* the one MacTCP stream (zero-init) */

/* ---- receive assembly state ---- */
#define RX_NONE 0
#define RX_LIST 1
#define RX_CONV 2
static short gRxMode = RX_NONE;
static char  gMsgBuf[1200];     /* the message currently being assembled */
static short gMsgLen = 0;
static char  gMsgDir = 0;
static char  gLastDir = 0;       /* last sender drawn — group consecutive msgs */
#define CH_IM 0                  /* our one logical channel */

/* ---- baud table ---- */
typedef struct { const char *name; short config; } BaudEntry;
static const BaudEntry kBaudTab[] = {
    { "1200",  baud1200  + data8 + noParity + stop10 },
    { "2400",  baud2400  + data8 + noParity + stop10 },
    { "9600",  baud9600  + data8 + noParity + stop10 },
    { "19200", baud19200 + data8 + noParity + stop10 },
};
#define NBAUD 4

/* ================= small string helpers ================= */

static void StrLen(const char *s, long *n) { long i = 0; while (s[i]) i++; *n = i; }
static void CatLong(char *buf, short *len, long v)
{
    char tmp[12]; short n = 0;
    if (v < 0) { buf[(*len)++] = '-'; v = -v; }
    if (v == 0) tmp[n++] = '0';
    while (v > 0) { tmp[n++] = (char)('0' + (v % 10)); v /= 10; }
    while (n > 0) buf[(*len)++] = tmp[--n];
}
static void CatStr(char *buf, short *len, const char *s) { short i; for (i = 0; s[i]; i++) buf[(*len)++] = s[i]; }
static void P2C(ConstStr255Param p, char *c) { short i, n = p[0]; for (i = 0; i < n; i++) c[i] = (char)p[i + 1]; c[n] = 0; }
static void C2P(const char *c, Str255 p) { short n = 0; while (c[n] && n < 255) { p[n + 1] = (unsigned char)c[n]; n++; } p[0] = (unsigned char)n; }
static Boolean Contains(const unsigned char *buf, short len, const char *needle)
{
    short i; long nl; StrLen(needle, &nl);
    if (nl == 0 || len < (short)nl) return false;
    for (i = 0; i + (short)nl <= len; i++) {
        short j; Boolean hit = true;
        for (j = 0; j < (short)nl; j++) if (buf[i + j] != (unsigned char)needle[j]) { hit = false; break; }
        if (hit) return true;
    }
    return false;
}
static short FindEnd(const unsigned char *buf, short len, const char *needle)
{
    short i; long nl; StrLen(needle, &nl);
    if (nl == 0 || len < (short)nl) return -1;
    for (i = 0; i + (short)nl <= len; i++) {
        short j; Boolean hit = true;
        for (j = 0; j < (short)nl; j++) if (buf[i + j] != (unsigned char)needle[j]) { hit = false; break; }
        if (hit) return (short)(i + (short)nl);
    }
    return -1;
}

/* ================= status line (window title) ================= */

static void SetStatus(const char *msg)
{
    Str255 t; short n = 0; char b[120];
    CatStr(b, &n, "Macinclaude iMessage");
    if (msg && msg[0]) { CatStr(b, &n, " - "); CatStr(b, &n, msg); if (n > 110) n = 110; }
    b[n] = 0; C2P(b, t);
    if (gWin) SetWTitle(gWin, t);
}

/* ================= thread layout (right pane) ================= */

static short DocHeight(void) { return gDocY + 12; }

static void SyncScrollbar(void)
{
    short max = DocHeight() - THREAD_H;
    if (max < 0) max = 0;
    if (gScroll) {
        SetControlMaximum(gScroll, max);
        if (gScrollY > max) gScrollY = max;
        SetControlValue(gScroll, gScrollY);
    }
}

static void StyleFont(unsigned char st)
{
    TextFont(geneva); TextSize(9);
    TextFace((st == 'H' || st == 'h') ? bold : 0);
}
static Boolean StyleRight(unsigned char st) { return st == 'h' || st == 'O'; }

static void DrawThread(void)
{
    Rect view; short i;
    SetPort(gWin);
    SetRect(&view, DIV_X + 1, 0, VIEW_R, THREAD_H);
    EraseRect(&view);
    for (i = 0; i < gNPL; i++) {
        short top = gPL[i].y - gScrollY;
        short w;
        if (top > THREAD_H) break;
        if (top + gLh9 < 0) continue;
        StyleFont(gPL[i].style);
        if (StyleRight(gPL[i].style)) {
            w = TextWidth(gText, gPL[i].off, gPL[i].len);
            MoveTo(TXR - w, top + gAsc9);
        } else {
            MoveTo(TX0, top + gAsc9);
        }
        DrawText(gText, gPL[i].off, gPL[i].len);
    }
    TextFont(geneva); TextSize(9); TextFace(0);
}

/* Lay out one styled block: copy into the pool, word-wrap to TXW, append PLines. */
static void LayoutBlock(unsigned char st, const char *text, short len)
{
    long base; short start;
    if (len <= 0) return;
    if (gTextLen + len > TEXT_POOL || gNPL >= MAX_PLINES) return;
    base = gTextLen;
    BlockMoveData((Ptr)text, (Ptr)(gText + base), (long)len);
    gTextLen += len;

    SetPort(gWin);
    StyleFont(st);
    if (st == 'H' || st == 'h') gDocY += 5; else gDocY += 1;

    start = 0;
    while (start < len && gNPL < MAX_PLINES) {
        short remain = len - start;
        short fit = remain;
        if (TextWidth(gText, (short)(base + start), remain) > TXW) {
            short lo = 1, hi = remain;
            while (lo < hi) {
                short mid = (short)((lo + hi + 1) >> 1);
                if (TextWidth(gText, (short)(base + start), mid) <= TXW) lo = mid;
                else hi = (short)(mid - 1);
            }
            fit = lo;
            if (fit < remain) {
                short k = fit;
                while (k > 0 && gText[base + start + k] != ' ' && gText[base + start + k - 1] != ' ') k--;
                if (k > 0) fit = k;
            }
            if (fit <= 0) fit = 1;
        }
        {
            short l = fit;
            while (l > 0 && gText[base + start + l - 1] == ' ') l--;
            if (l > 0) {
                gPL[gNPL].off = base + start;
                gPL[gNPL].len = l;
                gPL[gNPL].y = gDocY;
                gPL[gNPL].style = st;
                gNPL++;
                gDocY += gLh9;
            }
        }
        start += fit;
        while (start < len && gText[base + start] == ' ') start++;
    }
}

static void ThreadClear(void)
{
    gTextLen = 0; gNPL = 0; gDocY = MARG_TOP; gScrollY = 0;
    gMsgLen = 0; gMsgDir = 0; gLastDir = 0;
    SyncScrollbar();
}

/* flush the message currently assembled in gMsgBuf into wrapped PLines */
static void FlushMsg(void)
{
    if (gMsgLen == 0) return;
    if (gMsgDir != gLastDir) {
        if (gMsgDir == '>') {
            LayoutBlock('h', "You", 3);
        } else {
            short ln = 0; while (gThreadName[ln]) ln++;
            LayoutBlock('H', gThreadName, ln);
        }
        gLastDir = gMsgDir;
    }
    LayoutBlock(gMsgDir == '>' ? 'O' : 'P', gMsgBuf, gMsgLen);
    gMsgLen = 0;
}

/* ================= im_rx.inc callbacks ================= */

static void ImListStart(void) { gRxMode = RX_LIST; gConvN = 0; gListTop = 0; }
static void ImListRow(short idx, short unread, const char *name)
{
    short i;
    if (gRxMode != RX_LIST) return;
    if (idx < 0 || idx >= MAX_CONV) return;
    if (idx + 1 > gConvN) gConvN = idx + 1;
    for (i = 0; name[i] && i < CONV_NAMEW - 1; i++) gConvName[idx][i] = name[i];
    gConvName[idx][i] = 0;
    gConvUnread[idx] = unread;
}
static void ImConvStart(short idx, const char *name)
{
    short i;
    gRxMode = RX_CONV;
    gSel = (idx >= 0 && idx < MAX_CONV) ? idx : -1;   /* never index out of range */
    for (i = 0; name[i] && i < CONV_NAMEW - 1; i++) gThreadName[i] = name[i];
    gThreadName[i] = 0;
    ThreadClear();
    if (gSel >= 0) SetComposeEnabled(true);   /* a thread is open — you can reply */
}
static void ImMsg(char dir, const char *text)
{
    short i;
    if (gRxMode != RX_CONV) return;
    FlushMsg();                         /* close out the previous message */
    gMsgDir = dir;
    gMsgLen = 0;
    for (i = 0; text[i] && gMsgLen < (short)sizeof(gMsgBuf) - 1; i++) gMsgBuf[gMsgLen++] = text[i];
    gMsgBuf[gMsgLen] = 0;
}
static void ImCont(const char *text)
{
    short i;
    if (gRxMode != RX_CONV || gMsgLen == 0) return;
    if (gMsgLen < (short)sizeof(gMsgBuf) - 2) gMsgBuf[gMsgLen++] = ' ';
    for (i = 0; text[i] && gMsgLen < (short)sizeof(gMsgBuf) - 1; i++) gMsgBuf[gMsgLen++] = text[i];
    gMsgBuf[gMsgLen] = 0;
}
static void DrawAll(void);
static void LayoutControls(void);
static void ImEnd(void)
{
    if (gRxMode == RX_CONV) {
        FlushMsg();
        SyncScrollbar();
        /* jump to newest on a fresh thread load */
        gScrollY = DocHeight() - THREAD_H; if (gScrollY < 0) gScrollY = 0;
        if (gScroll) SetControlValue(gScroll, gScrollY);
        SetStatus(gThreadName);
    }
    gRxMode = RX_NONE;
    if (gSel >= gConvN) gSel = -1;
    DrawAll();
}
static void ImStatus(const char *msg) { SetStatus(msg); }
static void ImError(const char *msg) { SetStatus(msg); SysBeep(1); }
static void ImSent(short idx) { (void)idx; SetStatus("sent"); }

/* ================= transport: direct TCP via MacTCP ================= */
/* nettcp.c owns the MacTCP stream to the mini (BlueSCSI DaynaPORT). We open one
 * socket to 192.168.7.50:2328, send the line commands (LIST/OPEN/SEND), and feed
 * whatever arrives into the IM payload parser. (This replaces the WiFi system
 * service / MUX channel wholesale.) */

/* the IM payload parser (its Im* callbacks are defined above); this also
 * defines the ImRx type, so gIm follows the include */
#include "im_rx.inc"
static ImRx  gIm;

/* Non-blocking pump: drain whatever has arrived on the socket and feed it to the
 * IM parser. Call every event-loop pass. */
static void PumpReceive(void)
{
    unsigned char buf[1024]; long avail, got;
    if (!gConnected) return;
    avail = NetAvailable(&gConn);
    if (avail <= 0) {
        if (avail < 0) { gConnected = false; SetStatus("connection dropped"); }
        return;
    }
    if (avail > (long)sizeof(buf)) avail = sizeof(buf);
    got = NetRecv(&gConn, buf, (unsigned short)avail, 1);
    if (got > 0) ImRxFeed(&gIm, buf, (short)got);
    else if (got == 0) { gConnected = false; SetStatus("connection closed"); }
}

/* ================= prefs ================= */

static void PrefsLocate(void)
{
    SysEnvRec env;
    if (SysEnvirons(curSysEnvVers, &env) == noErr) gPrefVRef = env.sysVRefNum; else gPrefVRef = 0;
}
static void SetDefaults(void)
{
    short i;
    gCfg.magic = kPrefMagic; gCfg.version = kPrefVersion;
    gCfg.baudIdx = 2;               /* 9600 */
    gCfg.tcpPort = 2330;            /* the MUX multiplexer on the mini */
    { const char *h = "192.168.7.50"; gCfg.host[0] = 12; for (i = 0; i < 12; i++) gCfg.host[i + 1] = (unsigned char)h[i]; }
    gCfg.ssid[0] = 0; gCfg.pass[0] = 0; gCfg.wifiSaved = false;
}
static Boolean LoadPrefs(void)
{
    short refNum; long count;
    if (FSOpen(kPrefName, gPrefVRef, &refNum) != noErr) return false;
    count = sizeof(Config); SetFPos(refNum, fsFromStart, 0);
    if (FSRead(refNum, &count, (Ptr)&gCfg) != noErr || count != (long)sizeof(Config)) { FSClose(refNum); return false; }
    FSClose(refNum);
    if (gCfg.magic != kPrefMagic || gCfg.version != kPrefVersion) return false;
    if (gCfg.baudIdx < 0 || gCfg.baudIdx >= NBAUD) gCfg.baudIdx = 2;
    return true;
}
static void SavePrefs(void)
{
    short refNum; long count;
    Create(kPrefName, gPrefVRef, kPrefCreator, kPrefType);
    if (FSOpen(kPrefName, gPrefVRef, &refNum) != noErr) { SetStatus("could not save prefs"); return; }
    count = sizeof(Config); SetFPos(refNum, fsFromStart, 0);
    FSWrite(refNum, &count, (Ptr)&gCfg);
    SetEOF(refNum, (long)sizeof(Config));
    FSClose(refNum); FlushVol(NULL, gPrefVRef);
}

/* ================= connect / disconnect (direct TCP) ================= */

/* Open a TCP socket to the mini's iMessage agent (192.168.7.50:2328) and ask for
 * the conversation list. nettcp.c owns the MacTCP stream — NetConnect blocks
 * until connected or it times out. (Kept the name DialMux so the menu/launch
 * call sites are unchanged.) */
static void SendChanLine(const char *line);
static Boolean DialMux(void)
{
    SetStatus("connecting to the mini...");
    if (NetConnect(&gConn, NetParseIP(IMESSAGE_IP), IMESSAGE_PORT) != noErr) {
        SetStatus("could not connect - is MacTCP up and the agent running?");
        AppLog("connect failed");
        return false;
    }
    ImRxInit(&gIm);
    gConnected = true;
    AppLog("connected");
    SetStatus("connected");
    SendChanLine("LIST");               /* ask for the conversation list */
    return true;
}

static void Disconnect(void)
{
    if (gConnected) { NetClose(&gConn); gConnected = false; }
    SetStatus("disconnected");
}

/* ================= sending commands ================= */

#ifdef IM_TEST
#include "test_thread.h"
static void LoadTestThread(void)
{
    long i, n; StrLen(gTestThread, &n);
    ImRxInit(&gIm);
    for (i = 0; i < n; i++) ImRxFeed(&gIm, (const unsigned char *)gTestThread + i, 1);
}
#endif

static void SendChanLine(const char *line)
{
#ifdef IM_TEST
    (void)line; return;
#else
    char buf[512]; short n = 0;
    if (!gConnected) { SetStatus("not connected - use Connection > Connect"); SysBeep(1); return; }
    while (line[n] && n < (short)sizeof(buf) - 1) { buf[n] = line[n]; n++; }
    buf[n++] = '\r';                    /* the agent is line-based (CR-terminated) */
    NetSend(&gConn, buf, (unsigned short)n);
#endif
}

static void RequestList(void) { SendChanLine("LIST"); SetStatus("refreshing..."); }

static void OpenConv(short idx)
{
    char cmd[24]; short n = 0;
    if (idx < 0 || idx >= gConvN) return;
    gConvUnread[idx] = 0;
    CatStr(cmd, &n, "OPEN "); CatLong(cmd, &n, (long)idx); cmd[n] = 0;
    SendChanLine(cmd);
    SetStatus("opening...");
}

/* ================= dialogs (ported from surf) ================= */

static void SetDlgText(DialogPtr d, short item, ConstStr255Param s) { short t; Handle h; Rect b; GetDialogItem(d, item, &t, &h, &b); SetDialogItemText(h, s); }
static void GetDlgText(DialogPtr d, short item, Str255 s) { short t; Handle h; Rect b; GetDialogItem(d, item, &t, &h, &b); GetDialogItemText(h, s); }
static ControlHandle DlgCtl(DialogPtr d, short item) { short t; Handle h; Rect b; GetDialogItem(d, item, &t, &h, &b); return (ControlHandle)h; }

static void ScrapFromTE(TEHandle te)
{
    short s = (*te)->selStart, e = (*te)->selEnd;
    if (e > s) { Handle ht = (*te)->hText; HLock(ht); ZeroScrap(); PutScrap((long)(e - s), 'TEXT', (Ptr)(*ht + s)); HUnlock(ht); }
}
static void ScrapIntoTE(TEHandle te)
{
    Handle h; long n, off = 0;
    h = NewHandle(0); if (!h) return;
    n = GetScrap(h, 'TEXT', &off);
    if (n > 0) { if ((*te)->selEnd > (*te)->selStart) TEDelete(te); HLock(h); TEInsert((Ptr)*h, n, te); HUnlock(h); }
    else SysBeep(1);
    DisposeHandle(h);
}

static short gFrameItem = kSave;
static pascal void FrameDefault(DialogPtr dlg, short itemNo)
{
    short t; Handle h; Rect box; (void)itemNo;
    GetDialogItem(dlg, gFrameItem, &t, &h, &box);
    InsetRect(&box, -4, -4); PenSize(3, 3); FrameRoundRect(&box, 16, 16); PenSize(1, 1);
}
static short gDefItem = kSave, gCanItem = kCancel;
static pascal Boolean KeyFilter(DialogPtr dlg, EventRecord *ev, short *itemHit)
{
    char ch, lc; DialogPeek dp = (DialogPeek)dlg; TEHandle te = dp->textH;
    if (ev->what != keyDown && ev->what != autoKey) return false;
    ch = ev->message & charCodeMask;
    if (ev->modifiers & cmdKey) {
        lc = ch; if (lc >= 'A' && lc <= 'Z') lc += 32;
        if (te && dp->editField >= 0) {
            if (lc == 'v') { ScrapIntoTE(te); ev->what = nullEvent; return false; }
            if (lc == 'c') { ScrapFromTE(te); ev->what = nullEvent; return false; }
            if (lc == 'x') { ScrapFromTE(te); if ((*te)->selEnd > (*te)->selStart) TEDelete(te); ev->what = nullEvent; return false; }
        }
        return false;
    }
    if (ch == 13 || ch == 3) { *itemHit = gDefItem; return true; }
    if (ch == 27)            { *itemHit = gCanItem; return true; }
    return false;
}

static void SyncBaudRadios(DialogPtr d, short sel)
{
    SetControlValue(DlgCtl(d, kRB1200),  sel == 0);
    SetControlValue(DlgCtl(d, kRB2400),  sel == 1);
    SetControlValue(DlgCtl(d, kRB9600),  sel == 2);
    SetControlValue(DlgCtl(d, kRB19200), sel == 3);
}

static Boolean DoSettingsDialog(void)
{
    DialogPtr dlg; short item, baudSel; Str255 num; short t; Handle h; Rect box;
    Boolean saved = false; ModalFilterUPP filt;
    dlg = GetNewDialog(kDlgSettings, 0L, (WindowPtr)-1L);
    if (!dlg) { SetStatus("could not open Settings dialog"); return false; }
    gDefItem = kSave; gCanItem = kCancel; gFrameItem = kSave;
    filt = NewModalFilterUPP(KeyFilter);
    GetDialogItem(dlg, kFrame, &t, &h, &box);
    SetDialogItem(dlg, kFrame, t, (Handle)NewUserItemUPP(&FrameDefault), &box);
    SetDlgText(dlg, kSSID, gCfg.ssid);
    SetDlgText(dlg, kPass, gCfg.pass);
    SetDlgText(dlg, kHost, gCfg.host);
    NumToString((long)gCfg.tcpPort, num);
    SetDlgText(dlg, kPortF, num);
    baudSel = gCfg.baudIdx; SyncBaudRadios(dlg, baudSel);
    SelectDialogItemText(dlg, kSSID, 0, 32767);
    for (;;) {
        ModalDialog(filt, &item);
        if (item == kSave) {
            long pv;
            GetDlgText(dlg, kSSID, gCfg.ssid); GetDlgText(dlg, kPass, gCfg.pass); GetDlgText(dlg, kHost, gCfg.host);
            GetDlgText(dlg, kPortF, num); StringToNum(num, &pv); if (pv < 1) pv = 2330;
            gCfg.tcpPort = (unsigned short)pv; gCfg.baudIdx = baudSel;
            gCfg.magic = kPrefMagic; gCfg.version = kPrefVersion; saved = true; break;
        } else if (item == kCancel) break;
        else if (item >= kRB1200 && item <= kRB19200) { baudSel = item - kRB1200; SyncBaudRadios(dlg, baudSel); }
    }
    DisposeModalFilterUPP(filt); DisposeDialog(dlg);
    return saved;
}
static void DoSettings(void)
{
    if (gConnected) Disconnect();
    if (DoSettingsDialog()) {
        SavePrefs(); gHaveCfg = true; SetStatus("settings saved");
        /* WiFi join + baud are the service's job now — nothing to do here */
    }
}

/* One-field prompt (Reply). Returns true + fills out[]. */
static Boolean DoPromptDialog(const char *label, const char *button, char *out, short cap)
{
    DialogPtr dlg; short item; short t; Handle h; Rect box; Boolean go = false; Str255 p; ModalFilterUPP filt;
    dlg = GetNewDialog(kDlgPrompt, 0L, (WindowPtr)-1L);
    if (!dlg) { SetStatus("could not open dialog"); return false; }
    gDefItem = kPromptGo; gCanItem = kPromptCancel; gFrameItem = kPromptGo;
    filt = NewModalFilterUPP(KeyFilter);
    GetDialogItem(dlg, kPromptFrame, &t, &h, &box);
    SetDialogItem(dlg, kPromptFrame, t, (Handle)NewUserItemUPP(&FrameDefault), &box);
    C2P(label, p); SetDlgText(dlg, kPromptLabel, p);
    { ControlHandle btn = DlgCtl(dlg, kPromptGo); C2P(button, p); SetControlTitle(btn, p); }
    SetDlgText(dlg, kPromptEdit, "\p");
    SelectDialogItemText(dlg, kPromptEdit, 0, 32767);
    for (;;) {
        ModalDialog(filt, &item);
        if (item == kPromptGo) {
            GetDlgText(dlg, kPromptEdit, p);
            if (p[0] == 0) { SysBeep(1); continue; }
            P2C(p, out); if ((short)p[0] >= cap) out[cap - 1] = 0; go = true; break;
        } else if (item == kPromptCancel) break;
    }
    DisposeModalFilterUPP(filt); DisposeDialog(dlg);
    return go;
}

/* ---- inline reply bar (bottom of the thread pane) ---- */

static void SetComposeEnabled(Boolean on)
{
    if (gCompose) { if (on) TEActivate(gCompose); else TEDeactivate(gCompose); }
    if (gSendBtn) HiliteControl(gSendBtn, (unsigned char)(on ? 0 : 255));
}

static void DrawCompose(void)
{
    Rect box;
    SetPort(gWin);
    MoveTo(DIV_X + 1, THREAD_H); LineTo(WIN_W, THREAD_H);            /* separator above the bar */
    if (gNewBtn) Draw1Control(gNewBtn);
    SetRect(&box, DIV_X + NEWBTN_W + 6, THREAD_H + 2, WIN_W - SENDBTN_W - 4, WIN_H - 3);
    EraseRect(&box);
    FrameRect(&box);
    if (gCompose) TEUpdate(&(**gCompose).viewRect, gCompose);
    if (gSendBtn) Draw1Control(gSendBtn);
}

static void DoSend(void)
{
    char text[300]; char cmd[340]; short n, len; Handle h;
    if (!gCompose) return;
    if (gSel < 0 || gSel >= gConvN) { SetStatus("select a conversation first"); SysBeep(1); return; }
    len = (**gCompose).teLength;
    if (len <= 0) { SysBeep(1); return; }
    if (len > (short)sizeof(text) - 1) len = sizeof(text) - 1;
    h = (Handle)(**gCompose).hText;
    HLock(h); BlockMoveData(*h, text, len); HUnlock(h); text[len] = 0;
    n = 0; CatStr(cmd, &n, "SEND "); CatLong(cmd, &n, (long)gSel); CatStr(cmd, &n, " "); CatStr(cmd, &n, text); cmd[n] = 0;
    SendChanLine(cmd);
    TESetText("", 0L, gCompose);
    DrawCompose();
    SetStatus("sending...");
}

/* ---- "New" — compose a message to a recipient with no existing thread ----
 * Opens a two-field modal (To + Message); on Send, fires SENDTO <handle> <text>
 * up the channel. The agent sends it via Messages.app, which routes blue/green
 * automatically. Replying to an existing thread still uses the inline bar above. */
static Boolean DoNewMessageDialog(char *toOut, short toCap, char *msgOut, short msgCap)
{
    DialogPtr dlg; short item; short t; Handle h; Rect box; Boolean go = false;
    Str255 pto, pmsg; ModalFilterUPP filt;
    dlg = GetNewDialog(kDlgNew, 0L, (WindowPtr)-1L);
    if (!dlg) { SetStatus("could not open New Message dialog"); return false; }
    gDefItem = kNewSend; gCanItem = kNewCancel; gFrameItem = kNewSend;
    filt = NewModalFilterUPP(KeyFilter);
    GetDialogItem(dlg, kNewFrame, &t, &h, &box);
    SetDialogItem(dlg, kNewFrame, t, (Handle)NewUserItemUPP(&FrameDefault), &box);
    SetDlgText(dlg, kNewTo, "\p");
    SetDlgText(dlg, kNewMsg, "\p");
    SelectDialogItemText(dlg, kNewTo, 0, 32767);
    for (;;) {
        ModalDialog(filt, &item);
        if (item == kNewSend) {
            GetDlgText(dlg, kNewTo, pto);
            GetDlgText(dlg, kNewMsg, pmsg);
            if (pto[0] == 0 || pmsg[0] == 0) { SysBeep(1); continue; }   /* both required */
            P2C(pto, toOut);   if ((short)pto[0]  >= toCap)  toOut[toCap - 1]   = 0;
            P2C(pmsg, msgOut); if ((short)pmsg[0] >= msgCap) msgOut[msgCap - 1] = 0;
            go = true; break;
        } else if (item == kNewCancel) break;
    }
    DisposeModalFilterUPP(filt); DisposeDialog(dlg);
    return go;
}

static void DoNewMessage(void)
{
    char to[128], msg[300], cmd[460]; short n = 0;
    if (!gConnected) { SetStatus("connect first (Connection > Connect)"); SysBeep(1); return; }
    if (!DoNewMessageDialog(to, sizeof(to), msg, sizeof(msg))) return;
    CatStr(cmd, &n, "SENDTO "); CatStr(cmd, &n, to); CatStr(cmd, &n, " "); CatStr(cmd, &n, msg); cmd[n] = 0;
    SendChanLine(cmd);
    SetStatus("sending...");
}

/* ================= conversation list (left pane) ================= */

static void DrawConvName(short x, short y, const char *name, short maxw)
{
    Str255 p; short n = 0; short i;
    for (i = 0; name[i] && i < 254; i++) p[i + 1] = (unsigned char)name[i];
    p[0] = (unsigned char)i;
    while (p[0] > 1 && StringWidth(p) > maxw) p[0]--;     /* truncate to fit */
    MoveTo(x, y); DrawString(p); (void)n;
}

static void DrawList(void)
{
    Rect pane; short i, lmax;
    SetPort(gWin);
    lmax = gConvN - LIST_ROWS; if (lmax < 0) lmax = 0;      /* clamp scroll range */
    if (gListTop > lmax) gListTop = lmax;
    if (gListTop < 0) gListTop = 0;
    SetRect(&pane, 0, 0, LBAR_X, WIN_H);                    /* text area only, not the bar */
    EraseRect(&pane);
    TextFont(geneva); TextSize(9);
    for (i = gListTop; i < gConvN; i++) {
        short y = (i - gListTop) * ROW_H;
        if (y >= WIN_H) break;
        TextFace(gConvUnread[i] > 0 ? bold : 0);
        if (gConvUnread[i] > 0) { MoveTo(4, y + 12); DrawString("\p>"); }
        DrawConvName(12, y + 12, gConvName[i], LBAR_X - 16);
        if (i == gSel) { Rect rr; SetRect(&rr, 0, y, LBAR_X, y + ROW_H); InvertRect(&rr); }
    }
    TextFace(0);
    if (gListScroll) {
        SetControlMaximum(gListScroll, lmax);
        SetControlValue(gListScroll, gListTop);
        Draw1Control(gListScroll);
    }
}

static void DrawDivider(void)
{
    SetPort(gWin);
    MoveTo(DIV_X, 0); LineTo(DIV_X, WIN_H);
}

static void DrawAll(void)
{
    DrawList();
    DrawThread();
    DrawDivider();
    DrawCompose();
    if (gScroll) { SetPort(gWin); Draw1Control(gScroll); }
}

/* ================= scrolling (thread pane) ================= */

static void ScrollTo(short v)
{
    short max = DocHeight() - THREAD_H;
    if (max < 0) max = 0;
    if (v < 0) v = 0;
    if (v > max) v = max;
    if (v == gScrollY) return;
    gScrollY = v;
    if (gScroll) SetControlValue(gScroll, v);
    DrawThread();
}
static pascal void ScrollAction(ControlHandle c, short part)
{
    short d = 0;
    switch (part) {
        case inUpButton:   d = -gLh9; break;
        case inDownButton: d = gLh9;  break;
        case inPageUp:     d = -(THREAD_H - gLh9 * 2); break;
        case inPageDown:   d = THREAD_H - gLh9 * 2;    break;
        default: return;
    }
    ScrollTo(GetControlValue(c) + d);
}

/* ================= scrolling (conversation list) ================= */

static void ListScrollTo(short v)
{
    short lmax = gConvN - LIST_ROWS; if (lmax < 0) lmax = 0;
    if (v < 0) v = 0; if (v > lmax) v = lmax;
    if (v == gListTop) return;
    gListTop = v;
    DrawList();
}
static pascal void ListScrollAction(ControlHandle c, short part)
{
    short d = 0;
    switch (part) {
        case inUpButton:   d = -1; break;
        case inDownButton: d = 1;  break;
        case inPageUp:     d = -(LIST_ROWS - 1); break;
        case inPageDown:   d = LIST_ROWS - 1;    break;
        default: return;
    }
    ListScrollTo(GetControlValue(c) + d);
}

/* ================= events ================= */

static void ContentClick(EventRecord *ev)
{
    Point pt = ev->where; ControlHandle c; short part;
    SetPort(gWin); GlobalToLocal(&pt);

    part = FindControl(pt, gWin, &c);          /* a scrollbar or the Send button? */
    if (part != 0 && c != 0) {
        if (c == gScroll) {
            if (part == inThumb) { TrackControl(c, pt, 0L); ScrollTo(GetControlValue(c)); }
            else TrackControl(c, pt, (ControlActionUPP)ScrollAction);
        } else if (c == gListScroll) {
            if (part == inThumb) { TrackControl(c, pt, 0L); ListScrollTo(GetControlValue(c)); }
            else TrackControl(c, pt, (ControlActionUPP)ListScrollAction);
        } else if (c == gSendBtn) {
            if (TrackControl(c, pt, 0L)) DoSend();
        } else if (c == gNewBtn) {
            if (TrackControl(c, pt, 0L)) DoNewMessage();
        }
        return;
    }
    if (gCompose && PtInRect(pt, &(**gCompose).viewRect)) {   /* click into the reply field */
        TEClick(pt, (Boolean)((ev->modifiers & shiftKey) != 0), gCompose);
        return;
    }
    if (pt.h < LBAR_X) {                        /* conversation list (text area) */
        short row = gListTop + pt.v / ROW_H;
        if (row >= 0 && row < gConvN) {
            if (row != gSel) { gSel = row; DrawList(); }
            OpenConv(row);
        }
    }
}

static void DoKey(char ch)
{
    switch (ch) {
        case 0x1E: ScrollTo(gScrollY - gLh9); break;
        case 0x1F: ScrollTo(gScrollY + gLh9); break;
        case 0x0B: ScrollTo(gScrollY - (THREAD_H - gLh9 * 2)); break;
        case 0x0C: case ' ': ScrollTo(gScrollY + (THREAD_H - gLh9 * 2)); break;
        case 0x01: ScrollTo(0); break;
        case 0x04: ScrollTo(32000); break;
    }
}

static void SyncMenus(void)
{
    Boolean up = gConnected;
#ifdef IM_TEST
    up = true;
#endif
    if (up) {
        DisableItem(gConnM, kConnConnect); EnableItem(gConnM, kConnDisconnect);
        EnableItem(gMsgM, kMsgRefresh); EnableItem(gMsgM, kMsgCheck);
    } else {
        EnableItem(gConnM, kConnConnect); DisableItem(gConnM, kConnDisconnect);
        DisableItem(gMsgM, kMsgRefresh); DisableItem(gMsgM, kMsgCheck);
    }
    if (gNewBtn) HiliteControl(gNewBtn, (unsigned char)(up ? 0 : 255));   /* New needs only a live link */
}

static void DoAbout(void) { SetStatus("your texts, on a 1986 Macintosh"); SysBeep(1); }

static void DoMenu(long sel)
{
    short menu = HiWord(sel), item = LoWord(sel); Str255 name;
    switch (menu) {
        case kAppleMenu: if (item == 1) DoAbout(); else { GetMenuItemText(gAppleM, item, name); OpenDeskAcc(name); } break;
        case kFileMenu:  if (item == kFileQuit) gDone = true; break;
        case kEditMenu:
            if (gCompose && gSel >= 0) {
                switch (item) {            /* Undo 1, sep 2, Cut 3, Copy 4, Paste 5, Clear 6 */
                    case 3: TECut(gCompose);  break;
                    case 4: TECopy(gCompose); break;
                    case 5: TEPaste(gCompose); break;
                    case 6: TEDelete(gCompose); break;
                    default: break;
                }
                DrawCompose();
            } else SystemEdit(item - 1);
            break;
        case kConnMenu:
            switch (item) {
                case kConnConnect:    if (!gConnected) DialMux(); break;
                case kConnDisconnect: Disconnect(); break;
                case kConnSettings:   DoSettings(); break;
            }
            break;
        case kMsgMenu:
            switch (item) {
                case kMsgRefresh: RequestList(); break;
                case kMsgCheck:   RequestList(); break;
            }
            break;
    }
    SyncMenus(); HiliteMenu(0);
}

static void HandleMouseDown(EventRecord *ev)
{
    WindowPtr win; short part = FindWindow(ev->where, &win);
    switch (part) {
        case inMenuBar:   DoMenu(MenuSelect(ev->where)); break;
        case inSysWindow: SystemClick(ev, win); break;
        case inDrag:      DragWindow(win, ev->where, &qd.screenBits.bounds); break;
        case inGoAway:    if (TrackGoAway(win, ev->where)) gDone = true; break;
        case inZoomIn:
        case inZoomOut:   if (WFZoom(win, part, ev->where)) {
                              WIN_W = win->portRect.right  - win->portRect.left;
                              WIN_H = win->portRect.bottom - win->portRect.top;
                              LayoutControls(); InvalRect(&win->portRect);
                          } break;
        case inContent:   if (win != FrontWindow()) SelectWindow(win); else if (win == gWin) ContentClick(ev); break;
    }
}

static void HandleEvent(EventRecord *ev)
{
    char ch;
    switch (ev->what) {
        case mouseDown: HandleMouseDown(ev); break;
        case keyDown: case autoKey:
            ch = ev->message & charCodeMask;
            if (ev->modifiers & cmdKey) { if (ev->what == keyDown) { long s = MenuKey(ch); if (HiWord(s)) DoMenu(s); } }
            else if (gCompose && gSel >= 0 && gConnected) {   /* type into the reply field */
                if (ch == 0x0D || ch == 0x03) DoSend();        /* Return / Enter = send */
                else TEKey(ch, gCompose);
            }
            else DoKey(ch);
            break;
        case updateEvt: { WindowPtr w = (WindowPtr)ev->message; BeginUpdate(w); if (w == gWin) DrawAll(); EndUpdate(w); break; }
        case activateEvt: if ((WindowPtr)ev->message == gWin) {
                short h = (ev->modifiers & activeFlag) ? 0 : 255;
                if (gScroll) HiliteControl(gScroll, h);
                if (gListScroll) HiliteControl(gListScroll, h);
                if (gSendBtn) HiliteControl(gSendBtn, gSel >= 0 ? h : 255);
                if (gNewBtn) HiliteControl(gNewBtn, gConnected ? h : 255);
                if (gCompose) { if ((ev->modifiers & activeFlag) && gSel >= 0) TEActivate(gCompose); else TEDeactivate(gCompose); }
            } break;
    }
}

/* ================= setup ================= */

static void SetUpMenus(void)
{
    Str255 appleTitle; appleTitle[0] = 1; appleTitle[1] = 0x14;
    gAppleM = NewMenu(kAppleMenu, appleTitle);
    AppendMenu(gAppleM, "\pAbout Macinclaude iMessage"); AppendMenu(gAppleM, "\p(-"); AppendResMenu(gAppleM, 'DRVR'); InsertMenu(gAppleM, 0);
    gFileM = NewMenu(kFileMenu, "\pFile"); AppendMenu(gFileM, "\pQuit/Q"); InsertMenu(gFileM, 0);
    gEditM = NewMenu(kEditMenu, "\pEdit"); AppendMenu(gEditM, "\pUndo/Z;(-;Cut/X;Copy/C;Paste/V;Clear"); InsertMenu(gEditM, 0);
    gConnM = NewMenu(kConnMenu, "\pConnection"); AppendMenu(gConnM, "\pConnect/K;Disconnect"); InsertMenu(gConnM, 0);
    gMsgM = NewMenu(kMsgMenu, "\pMessages"); AppendMenu(gMsgM, "\pRefresh List/L;Check for New/Y"); InsertMenu(gMsgM, 0);
    DrawMenuBar();
}

static void SetUpWindow(void)
{
    Rect r;
    gWin = WFNew("\pMacinclaude iMessage");   /* fills the screen; close + zoom boxes */
    SetPort(gWin);
    WIN_W = gWin->portRect.right  - gWin->portRect.left;
    WIN_H = gWin->portRect.bottom - gWin->portRect.top;
    SetRect(&r, WIN_W - SBAR_W, -1, WIN_W + 1, THREAD_H + 1);   /* thread scrollbar stops above the compose bar */
    gScroll = NewControl(gWin, &r, "\p", true, 0, 0, 0, scrollBarProc, 0);
    SetRect(&r, LBAR_X, -1, DIV_X + 1, WIN_H + 1);
    gListScroll = NewControl(gWin, &r, "\p", true, 0, 0, 0, scrollBarProc, 0);
    { FontInfo fi; TextFont(geneva); TextSize(9); TextFace(0); GetFontInfo(&fi); gAsc9 = fi.ascent; gLh9 = fi.ascent + fi.descent + fi.leading; }
    /* "New" button at the left of the bar, then the inline reply field, then Send */
    SetRect(&r, DIV_X + 3, THREAD_H + 2, DIV_X + 3 + NEWBTN_W, WIN_H - 2);
    gNewBtn = NewControl(gWin, &r, "\pNew", true, 0, 0, 0, pushButProc, 0);
    { Rect tr; SetRect(&tr, DIV_X + NEWBTN_W + 9, THREAD_H + 4, WIN_W - SENDBTN_W - 7, WIN_H - 4);
      TextFont(geneva); TextSize(9); TextFace(0);
      gCompose = TENew(&tr, &tr); }
    SetRect(&r, WIN_W - SENDBTN_W - 3, THREAD_H + 2, WIN_W - 3, WIN_H - 2);
    gSendBtn = NewControl(gWin, &r, "\pSend", true, 0, 0, 0, pushButProc, 0);
}

/* reposition the panes' controls after a zoom: thread scrollbar to the new right
 * edge, the compose bar (New / field / Send) across the bottom of the thread pane. */
static void LayoutControls(void)
{
    Rect tr;
    MoveControl(gScroll,     WIN_W - SBAR_W, -1);                   SizeControl(gScroll,     SBAR_W + 1, THREAD_H + 2);
    MoveControl(gListScroll, LBAR_X, -1);                          SizeControl(gListScroll, SBAR_W + 1, WIN_H + 2);
    MoveControl(gNewBtn,     DIV_X + 3, THREAD_H + 2);             SizeControl(gNewBtn,     NEWBTN_W,  COMPOSE_H - 4);
    MoveControl(gSendBtn,    WIN_W - SENDBTN_W - 3, THREAD_H + 2);  SizeControl(gSendBtn,    SENDBTN_W, COMPOSE_H - 4);
    SetRect(&tr, DIV_X + NEWBTN_W + 9, THREAD_H + 4, WIN_W - SENDBTN_W - 7, WIN_H - 4);
    (*gCompose)->viewRect = tr;
    (*gCompose)->destRect.left = tr.left; (*gCompose)->destRect.right = tr.right;
    TECalText(gCompose);
}

static void InitToolbox(void)
{
    InitGraf(&qd.thePort); InitFonts(); InitWindows(); InitMenus(); TEInit(); InitDialogs(0L); InitCursor(); FlushEvents(everyEvent, 0);
}

/* ================= splash ================= */

static void CenterText(short winW, short y, ConstStr255Param s) { MoveTo((winW - StringWidth(s)) / 2, y); DrawString(s); }

/* a speech-bubble mark */
static void DrawBubble(short cx, short cy, short w, short h)
{
    Rect b; SetRect(&b, cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);
    PenSize(2, 2); FrameRoundRect(&b, 16, 16);
    MoveTo(cx - w / 6, cy + h / 2 - 1); Line(-8, 12); Line(14, -12);
    PenSize(1, 1);
}

static void ShowSplash(void)
{
    Rect rp; long t;
    SetPort(gWin); SetRect(&rp, 0, 0, WIN_W, WIN_H); EraseRect(&rp);
    DrawBubble(WIN_W / 2, 96, 120, 64);
    TextFont(systemFont); TextFace(bold); TextSize(20);
    CenterText(WIN_W, 168, "\pMACINCLAUDE");
    CenterText(WIN_W, 190, "\piMESSAGE");
    TextFace(0); TextSize(12);
    CenterText(WIN_W, 220, "\pyour texts, on a 1986 Macintosh");
    TextSize(9);
    CenterText(WIN_W, 250, "\pthe mini bridges Messages.app over the always-on WiFi link");
    Delay(110, &t);
    EraseRect(&rp);
    TextFont(geneva); TextSize(9); TextFace(0);
}

int main(void)
{
    EventRecord ev;
    InitToolbox();
    SetUpMenus();
    SetUpWindow();
    /* paint + breadcrumb BEFORE any network (same pattern as the Bridge), so a
     * MacTCP/driver hang shows exactly where it stopped instead of a freeze on
     * a blank window. The 2026-07-02 startup freeze had no log line at all —
     * these on-screen steps work even when the network never comes up. */
    DrawAll();
    SetStatus("starting up...");
    { EventRecord e0; WaitNextEvent(everyEvent, &e0, 1L, 0L); }   /* let it draw */
#ifndef IM_TEST
    SetStatus("step 1: opening MacTCP...");
    if (NetInit() != noErr) {
        SetStatus("MacTCP (.IPP) not available - is the DaynaPORT/WiFi up?");
    } else {
        SetStatus("step 2: opening the log link...");
        AppLogOpen("IMessage"); AppLog("launched");   /* key events -> mini shared log */
        SetStatus("step 2: log link done");
    }
#endif
    ShowSplash();
    PrefsLocate();
    gHaveCfg = LoadPrefs();

#ifdef IM_TEST
    (void)gHaveCfg;
    gConnected = true;
    SetStatus("TEST BUILD - showing the embedded sample thread");
    LoadTestThread();
    DrawAll();
#else
    if (!gHaveCfg) { SetDefaults(); gHaveCfg = true; }   /* nothing to ask — the WiFi service owns the link */
    DrawAll();
    SetStatus("step 3: connecting to the agent...");
    DialMux();                    /* launch = connect; list streams in */
#endif
    SyncMenus();

    while (!gDone) {
        AppLogTick();
        long sleep = gConnected ? 2L : 15L;
        if (WaitNextEvent(everyEvent, &ev, sleep, 0L)) HandleEvent(&ev);
        if (gCompose) TEIdle(gCompose);     /* blink the reply caret */
#ifndef IM_TEST
        if (gConnected) PumpReceive();
#endif
    }
    if (gConnected) Disconnect();   /* close the TCP stream on quit */
    AppLogClose();
    return 0;
}
