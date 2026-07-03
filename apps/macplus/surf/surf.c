/*
 * Macinclaude Surf - a reader-mode web browser for the Macintosh Plus.
 * (System 6.0.8, 68000.) Built with Retro68.
 *
 * The Plus is a thin client: the Mac mini fetches the page, Claude distills it
 * to a compact reader-mode markup (see agent-surf/README.md), and this app
 * renders it - styled text, numbered links you click, a real scrollbar -
 * progressively as the bytes arrive over the 9600-baud serial link.
 *
 * Two halves of one product:
 *   - Plus side (this file): settings + serial transport + modem connect
 *     (ported from Atkinson/Macinclaude), the SRF page receiver
 *     (surf_rx.inc, shared with the host test rxtest.c), a word-wrap layout
 *     engine over QuickDraw, and the browse UI.
 *   - Mini side (agent-surf/): fetch -> extract -> Claude -> SRF frame.
 *
 * Commands the Plus sends (one line + \r):
 *   GO <url-or-words> / LINK <n> / BACK / SUM / ASK <question>
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

#include "nettcp.h"       /* WiFi/TCP transport (BlueSCSI DaynaPORT + MacTCP) */
#include "applog.inc"            /* key-event logging to the mini's shared logs */
#include "winfull.inc"           /* full-screen window + close/zoom (maximize) box */

#ifndef geneva
#define geneva 3
#endif
#ifndef systemFont
#define systemFont 0
#endif

/* ---- menus ---- */
#define kAppleMenu  128
#define kFileMenu   129
#define kEditMenu   130
#define kConnMenu   131
#define kBrowseMenu 132

#define kFileQuit 1

#define kConnConnect    1
#define kConnDisconnect 2
/* 3 separator */
#define kConnSettings   4

#define kBrowseOpen 1
#define kBrowseBack 2
/* 3 separator */
#define kBrowseSum  4
#define kBrowseAsk  5
/* 6 separator */
#define kBrowseTest 7

/* ---- Settings dialog (surf.r DLOG/DITL 128) ---- */
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

/* ---- one-field prompt dialog (surf.r DLOG/DITL 129): Open Location & Ask ---- */
#define kDlgPrompt  129
#define kPromptGo     1
#define kPromptCancel 2
#define kPromptLabel  3
#define kPromptEdit   4
#define kPromptFrame  5

/* ---- prefs ---- */
#define kPrefMagic   0x5346      /* 'SF' */
#define kPrefVersion 1
#define kPrefName    "\pSurf Prefs"
#define kPrefCreator 'SURF'
#define kPrefType    'pref'

typedef struct {
    short          magic;
    short          version;
    short          baudIdx;
    unsigned short tcpPort;       /* 2326 = the surf agent */
    Str255         host;
    Str255         ssid;
    Str255         pass;
    Boolean        wifiSaved;
    Boolean        pad;
} Config;

static Config gCfg;
static Boolean gHaveCfg = false;
static short   gPrefVRef = 0;

/* ---- window geometry (WIN_W/WIN_H set from the full-screen window at open) ---- */
static short WIN_W = 496, WIN_H = 300;
#define SBAR_W 16                       /* scrollbar */
#define VIEW_W (WIN_W - SBAR_W)
#define MARG_L 10
#define MARG_R 8
#define MARG_TOP 8

/* ---- page model ---- */
#define TEXT_POOL 16384
#define MAX_PLINES 1400

typedef struct {
    long  off;                     /* into gText */
    short len;
    short y;                       /* doc coords, top of line */
    unsigned char style;           /* 'T','H','P','Q','-','L' */
    unsigned char link;            /* link number for 'L', else 0 */
} PLine;

static char  gText[TEXT_POOL];
static long  gTextLen = 0;
static PLine gPL[MAX_PLINES];
static short gNPL = 0;
static short gDocY = MARG_TOP;     /* layout cursor (doc coords) */
static short gScrollY = 0;
static char  gPageTitle[80];

/* cached font metrics (Geneva 9 plain / Geneva 12 bold) */
static short gAsc9, gLh9, gAsc12, gLh12;

/* ---- globals ---- */
static WindowPtr     gWin;
static ControlHandle gScroll;
static MenuHandle    gAppleM, gFileM, gEditM, gConnM, gBrowseM;
static Boolean       gDone = false;

static NetConn gConn;                   /* the TCP connection to the agent */
static Boolean gConnected = false;      /* in a live session with the agent */

static char gSerBuf[2048];              /* receive scratch (TCP -> parser) */

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
static void CatStr(char *buf, short *len, const char *s)
{
    short i; for (i = 0; s[i]; i++) buf[(*len)++] = s[i];
}

static void P2C(ConstStr255Param p, char *c)
{
    short i, n = p[0];
    for (i = 0; i < n; i++) c[i] = (char)p[i + 1];
    c[n] = 0;
}
static void C2P(const char *c, Str255 p)
{
    short n = 0;
    while (c[n] && n < 255) { p[n + 1] = (unsigned char)c[n]; n++; }
    p[0] = (unsigned char)n;
}

static Boolean Contains(const unsigned char *buf, short len, const char *needle)
{
    short i; long nl; StrLen(needle, &nl);
    if (nl == 0 || len < (short)nl) return false;
    for (i = 0; i + (short)nl <= len; i++) {
        short j; Boolean hit = true;
        for (j = 0; j < (short)nl; j++)
            if (buf[i + j] != (unsigned char)needle[j]) { hit = false; break; }
        if (hit) return true;
    }
    return false;
}

/* ================= status line (window title) ================= */

static void SetStatus(const char *msg)
{
    Str255 t; short n = 0; char b[120];
    CatStr(b, &n, "Macinclaude Surf");
    if (msg && msg[0]) { CatStr(b, &n, " - "); CatStr(b, &n, msg); if (n > 100) n = 100; }
    b[n] = 0;
    C2P(b, t);
    if (gWin) SetWTitle(gWin, t);
}

/* ================= page layout ================= */

static void StyleFont(unsigned char st)
{
    if (st == 'T' || st == 'H') { TextFont(geneva); TextSize(12); TextFace(bold); }
    else if (st == 'L')         { TextFont(geneva); TextSize(9);  TextFace(underline); }
    else if (st == 'Q')         { TextFont(geneva); TextSize(9);  TextFace(italic); }
    else                        { TextFont(geneva); TextSize(9);  TextFace(0); }
}

static short StyleIndent(unsigned char st)
{
    if (st == 'Q') return 20;
    if (st == '-') return 14;
    if (st == 'L') return 14;
    return 0;
}
static short StyleAscent(unsigned char st) { return (st == 'T' || st == 'H') ? gAsc12 : gAsc9; }
static short StyleLineH(unsigned char st)  { return (st == 'T' || st == 'H') ? gLh12 : gLh9; }
static short SpaceBefore(unsigned char st)
{
    if (st == 'T') return 4;
    if (st == 'H') return 10;
    if (st == 'L') return 3;
    if (st == '-') return 2;
    return 6;
}

static short DocHeight(void) { return gDocY + 12; }

static void SyncScrollbar(void)
{
    short max = DocHeight() - WIN_H;
    if (max < 0) max = 0;
    if (gScroll) {
        SetControlMaximum(gScroll, max);
        if (gScrollY > max) gScrollY = max;
        SetControlValue(gScroll, gScrollY);
    }
}

static void DrawPage(void)
{
    Rect view;
    short i;
    SetPort(gWin);
    SetRect(&view, 0, 0, VIEW_W, WIN_H);
    EraseRect(&view);
    for (i = 0; i < gNPL; i++) {
        short top = gPL[i].y - gScrollY;
        if (top > WIN_H) break;
        if (top + StyleLineH(gPL[i].style) < 0) continue;
        StyleFont(gPL[i].style);
        MoveTo(MARG_L + StyleIndent(gPL[i].style), top + StyleAscent(gPL[i].style));
        DrawText(gText, gPL[i].off, gPL[i].len);
    }
    TextFont(geneva); TextSize(9); TextFace(0);
}

static void Repaint(void)
{
    DrawPage();
    if (gScroll) {
        SetPort(gWin);
        Draw1Control(gScroll);
    }
}

/* Lay out one block of text: copy into the pool, word-wrap, append PLines. */
static void LayoutBlock(unsigned char st, const char *text, short len, short link)
{
    long base;
    short wrapW, lh, start;
    Boolean grew = false;

    if (st == 'B') { gDocY += 8; return; }
    if (len <= 0) return;
    if (gTextLen + len > TEXT_POOL || gNPL >= MAX_PLINES) return;

    base = gTextLen;
    BlockMoveData((Ptr)text, (Ptr)(gText + base), (long)len);
    gTextLen += len;

    if (st == 'T' && gPageTitle[0] == 0) {
        short i, n = len < 78 ? len : 78;
        for (i = 0; i < n; i++) gPageTitle[i] = text[i];
        gPageTitle[n] = 0;
    }

    SetPort(gWin);
    StyleFont(st);
    lh = StyleLineH(st);
    wrapW = VIEW_W - MARG_L - MARG_R - StyleIndent(st);
    gDocY += SpaceBefore(st);

    start = 0;
    while (start < len && gNPL < MAX_PLINES) {
        short remain = len - start;
        short fit = remain;

        if (TextWidth(gText, (short)(base + start), remain) > wrapW) {
            /* binary search the largest count that fits */
            short lo = 1, hi = remain;
            while (lo < hi) {
                short mid = (short)((lo + hi + 1) >> 1);
                if (TextWidth(gText, (short)(base + start), mid) <= wrapW) lo = mid;
                else hi = (short)(mid - 1);
            }
            fit = lo;
            if (fit < remain) {
                /* back up to the last space so words stay whole */
                short k = fit;
                while (k > 0 && gText[base + start + k] != ' ' &&
                       gText[base + start + k - 1] != ' ') k--;
                if (k > 0) fit = k;
            }
            if (fit <= 0) fit = 1;
        }

        /* trim trailing spaces from the stored line */
        {
            short l = fit;
            while (l > 0 && gText[base + start + l - 1] == ' ') l--;
            if (l > 0) {
                gPL[gNPL].off = base + start;
                gPL[gNPL].len = l;
                gPL[gNPL].y = gDocY;
                gPL[gNPL].style = st;
                gPL[gNPL].link = (unsigned char)link;
                gNPL++;
                gDocY += lh;
                grew = true;
            }
        }
        start += fit;
        while (start < len && gText[base + start] == ' ') start++;
    }

    if (grew) {
        SyncScrollbar();
        /* progressive render: only newly visible lines matter; the cheap and
         * correct move is to redraw the view when the new block intersects it */
        if (gDocY - gScrollY > 0 && (gPL[gNPL - 1].y - gScrollY) < WIN_H)
            DrawPage();
    }
}

/* ================= rx callbacks (surf_rx.inc contract) ================= */

static void PageClear(void)
{
    gTextLen = 0;
    gNPL = 0;
    gDocY = MARG_TOP;
    gScrollY = 0;
    gPageTitle[0] = 0;
    SyncScrollbar();
    SetStatus("loading...");
    DrawPage();
}

static void BlockReady(char style, const char *text, short len, short link)
{
    LayoutBlock((unsigned char)style, text, len, link);
}

static void PageDone(void)
{
    SyncScrollbar();
    Repaint();
    SetStatus(gPageTitle[0] ? gPageTitle : "done");
}

static void RxStatus(const char *msg) { SetStatus(msg); }

static void RxError(const char *msg)
{
    SetStatus(msg);
    SysBeep(1);
}

#include "surf_rx.inc"

/* ================= TCP transport primitives =================
 * These replace the RetroWiFi serial-modem path. The Plus now opens a real TCP
 * socket to the agent through the BlueSCSI DaynaPORT + MacTCP (see net/nettcp).
 * The SRF wire protocol above is unchanged - only the pipe under it differs. */

/* Send a C string over the connection (used for the command lines). */
static void SendStr(const char *s)
{
    long n;
    if (!gConnected) return;
    StrLen(s, &n);
    if (n > 0) NetSend(&gConn, s, (unsigned short)n);
}

/* Discard any bytes already waiting on the socket (stale tail from a prior
   page), so a new command starts the parser on a clean stream. */
static void DrainInput(void)
{
    long avail;
    if (!gConnected) return;
    while ((avail = NetAvailable(&gConn)) > 0) {
        unsigned short cnt = (avail > (long)sizeof(gSerBuf))
                             ? (unsigned short)sizeof(gSerBuf) : (unsigned short)avail;
        if (NetRecv(&gConn, gSerBuf, cnt, 2) <= 0) break;
    }
}

/* Non-blocking pump: feed whatever TCP bytes have arrived into the SRF parser.
   Called every event-loop pass, so the page still develops as it streams in -
   now near-instantly over TCP instead of crawling at 9600 baud. */
static void PumpReceive(void)
{
    long avail, got; short i;
    if (!gConnected) return;
    avail = NetAvailable(&gConn);
    if (avail <= 0) {
        if (avail < 0) { SrxAbort("connection dropped"); gConnected = false; return; }
        if (gRxState != SRX_IDLE && (long)(TickCount() - gRxDeadline) > 0)
            SrxAbort("timed out waiting for the agent");
        return;
    }
    if (avail > (long)sizeof(gSerBuf)) avail = sizeof(gSerBuf);
    got = NetRecv(&gConn, gSerBuf, (unsigned short)avail, 5);
    if (got <= 0) return;
    for (i = 0; i < (short)got; i++) FeedRxByte((unsigned char)gSerBuf[i]);
    gRxDeadline = TickCount() + 120L * 60L;   /* 2 min of silence = give up */
}

/* ================= prefs ================= */

static void PrefsLocate(void)
{
    SysEnvRec env;
    if (SysEnvirons(curSysEnvVers, &env) == noErr) gPrefVRef = env.sysVRefNum;
    else gPrefVRef = 0;
}

static void SetDefaults(void)
{
    short i;
    gCfg.magic = kPrefMagic;
    gCfg.version = kPrefVersion;
    gCfg.baudIdx = 2;               /* 9600 */
    gCfg.tcpPort = 2326;            /* the surf agent on the mini */
    { const char *h = "192.168.7.50"; gCfg.host[0] = 12;
      for (i = 0; i < 12; i++) gCfg.host[i + 1] = (unsigned char)h[i]; }
    gCfg.ssid[0] = 0;
    gCfg.pass[0] = 0;
    gCfg.wifiSaved = false;
}

static Boolean LoadPrefs(void)
{
    short refNum; long count;
    if (FSOpen(kPrefName, gPrefVRef, &refNum) != noErr) return false;
    count = sizeof(Config);
    SetFPos(refNum, fsFromStart, 0);
    if (FSRead(refNum, &count, (Ptr)&gCfg) != noErr || count != (long)sizeof(Config)) {
        FSClose(refNum); return false;
    }
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
    count = sizeof(Config);
    SetFPos(refNum, fsFromStart, 0);
    FSWrite(refNum, &count, (Ptr)&gCfg);
    SetEOF(refNum, (long)sizeof(Config));
    FSClose(refNum);
    FlushVol(NULL, gPrefVRef);
}

/* ================= connection ================= */

/* Open a TCP connection to the agent (host:port from prefs). WiFi itself is
   now brought up by the BlueSCSI (DaynaPORT), not by this app - so there is no
   AT/ATDT/AT&W handshake anymore, just a socket. The agent pushes its welcome
   page right after the connect, and those bytes flow straight into the SRF
   parser via PumpReceive. */
static Boolean DialAgent(void)
{
    char hostC[256];
    unsigned long ip;
    OSErr err;

    if (gConnected) return true;

    SetStatus("connecting...");
    P2C(gCfg.host, hostC);
    ip = NetParseIP(hostC);
    if (ip == 0) { SetStatus("bad server IP - check Settings"); return false; }

    err = NetConnect(&gConn, ip, gCfg.tcpPort);
    if (err != noErr) {
        char msg[80]; short n = 0;
        CatStr(msg, &n, "connect failed: ");
        CatStr(msg, &n, (char *)NetErrStr(err));
        msg[n] = 0;
        SetStatus(msg);
        AppLog("connect failed");
        return false;
    }

    gConnected = true;
    AppLog("connected");
    gRxState = SRX_WAIT;
    gRxDeadline = TickCount() + 60L * 60L;
    gRxLineLen = 0;
    SetStatus("connected");
    return true;
}

static void Disconnect(void)
{
    if (gConnected) NetClose(&gConn);
    gConnected = false;
    gRxState = SRX_IDLE;
    SetStatus("disconnected");
}

/* ================= sending commands ================= */

#ifdef SURF_TEST
#include "test_page.h"   /* gTestPage[] - a complete SRF frame */
static void LoadTestPage(void)
{
    long i, n;
    StrLen(gTestPage, &n);
    for (i = 0; i < n; i++) FeedRxByte((unsigned char)gTestPage[i]);
}
#endif

static void SendCmd(const char *cmd)
{
#ifdef SURF_TEST
    (void)cmd;
    LoadTestPage();
    return;
#else
    if (!gConnected) { SetStatus("not connected - use Connection > Connect"); SysBeep(1); return; }
    if (gRxState == SRX_PAGE) { SetStatus("still loading - wait a moment"); SysBeep(1); return; }
    SendStr(cmd);
    SendStr("\r");
    gRxState = SRX_WAIT;
    gRxDeadline = TickCount() + 120L * 60L;
    SetStatus("sent...");
#endif
}

/* ================= dialogs (ported from Atkinson) ================= */

static void SetDlgText(DialogPtr d, short item, ConstStr255Param s)
{
    short t; Handle h; Rect b;
    GetDialogItem(d, item, &t, &h, &b);
    SetDialogItemText(h, s);
}
static void GetDlgText(DialogPtr d, short item, Str255 s)
{
    short t; Handle h; Rect b;
    GetDialogItem(d, item, &t, &h, &b);
    GetDialogItemText(h, s);
}
static ControlHandle DlgCtl(DialogPtr d, short item)
{
    short t; Handle h; Rect b;
    GetDialogItem(d, item, &t, &h, &b);
    return (ControlHandle)h;
}

static void ScrapFromTE(TEHandle te)
{
    short s = (*te)->selStart, e = (*te)->selEnd;
    if (e > s) {
        Handle ht = (*te)->hText;
        HLock(ht);
        ZeroScrap();
        PutScrap((long)(e - s), 'TEXT', (Ptr)(*ht + s));
        HUnlock(ht);
    }
}

static void ScrapIntoTE(TEHandle te)
{
    Handle h; long n, off = 0;
    h = NewHandle(0);
    if (!h) return;
    n = GetScrap(h, 'TEXT', &off);
    if (n > 0) {
        if ((*te)->selEnd > (*te)->selStart) TEDelete(te);
        HLock(h);
        TEInsert((Ptr)*h, n, te);
        HUnlock(h);
    } else {
        SysBeep(1);
    }
    DisposeHandle(h);
}

static short gFrameItem = kSave;
static pascal void FrameDefault(DialogPtr dlg, short itemNo)
{
    short t; Handle h; Rect box;
    (void)itemNo;
    GetDialogItem(dlg, gFrameItem, &t, &h, &box);
    InsetRect(&box, -4, -4);
    PenSize(3, 3);
    FrameRoundRect(&box, 16, 16);
    PenSize(1, 1);
}

static short gDefItem = kSave, gCanItem = kCancel;
static pascal Boolean KeyFilter(DialogPtr dlg, EventRecord *ev, short *itemHit)
{
    char ch, lc;
    DialogPeek dp = (DialogPeek)dlg;
    TEHandle te = dp->textH;
    if (ev->what != keyDown && ev->what != autoKey) return false;
    ch = ev->message & charCodeMask;
    if (ev->modifiers & cmdKey) {
        lc = ch;
        if (lc >= 'A' && lc <= 'Z') lc += 32;
        if (te && dp->editField >= 0) {
            if (lc == 'v') { ScrapIntoTE(te); ev->what = nullEvent; return false; }
            if (lc == 'c') { ScrapFromTE(te); ev->what = nullEvent; return false; }
            if (lc == 'x') {
                ScrapFromTE(te);
                if ((*te)->selEnd > (*te)->selStart) TEDelete(te);
                ev->what = nullEvent; return false;
            }
        }
        return false;
    }
    if (ch == 13 || ch == 3)  { *itemHit = gDefItem; return true; }
    if (ch == 27)             { *itemHit = gCanItem; return true; }
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
    DialogPtr dlg;
    short item, baudSel;
    Str255 num;
    short t; Handle h; Rect box;
    Boolean saved = false;
    ModalFilterUPP filt;

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
    baudSel = gCfg.baudIdx;
    SyncBaudRadios(dlg, baudSel);
    SelectDialogItemText(dlg, kSSID, 0, 32767);

    for (;;) {
        ModalDialog(filt, &item);
        if (item == kSave) {
            long pv;
            GetDlgText(dlg, kSSID, gCfg.ssid);
            GetDlgText(dlg, kPass, gCfg.pass);
            GetDlgText(dlg, kHost, gCfg.host);
            GetDlgText(dlg, kPortF, num);
            StringToNum(num, &pv);
            if (pv < 1) pv = 2326;
            gCfg.tcpPort = (unsigned short)pv;
            gCfg.baudIdx = baudSel;
            gCfg.magic = kPrefMagic;
            gCfg.version = kPrefVersion;
            saved = true;
            break;
        } else if (item == kCancel) {
            break;
        } else if (item >= kRB1200 && item <= kRB19200) {
            baudSel = item - kRB1200;
            SyncBaudRadios(dlg, baudSel);
        }
    }
    DisposeModalFilterUPP(filt);
    DisposeDialog(dlg);
    return saved;
}

static void DoSettings(void)
{
    if (gConnected) Disconnect();
    if (DoSettingsDialog()) {
        SavePrefs();
        gHaveCfg = true;
        SetStatus("settings saved - Connection > Connect");
    }
}

/* One-field prompt (Open Location / Ask). Returns true + fills out[]. */
static Boolean DoPromptDialog(const char *label, const char *button, char *out, short cap)
{
    DialogPtr dlg;
    short item;
    short t; Handle h; Rect box;
    Boolean go = false;
    Str255 p;
    ModalFilterUPP filt;

    dlg = GetNewDialog(kDlgPrompt, 0L, (WindowPtr)-1L);
    if (!dlg) { SetStatus("could not open dialog"); return false; }
    gDefItem = kPromptGo; gCanItem = kPromptCancel; gFrameItem = kPromptGo;
    filt = NewModalFilterUPP(KeyFilter);

    GetDialogItem(dlg, kPromptFrame, &t, &h, &box);
    SetDialogItem(dlg, kPromptFrame, t, (Handle)NewUserItemUPP(&FrameDefault), &box);

    C2P(label, p);
    SetDlgText(dlg, kPromptLabel, p);
    {
        ControlHandle btn = DlgCtl(dlg, kPromptGo);
        C2P(button, p);
        SetControlTitle(btn, p);
    }
    SetDlgText(dlg, kPromptEdit, "\p");
    SelectDialogItemText(dlg, kPromptEdit, 0, 32767);

    for (;;) {
        ModalDialog(filt, &item);
        if (item == kPromptGo) {
            GetDlgText(dlg, kPromptEdit, p);
            if (p[0] == 0) { SysBeep(1); continue; }
            P2C(p, out);
            if ((short)p[0] >= cap) out[cap - 1] = 0;
            go = true; break;
        } else if (item == kPromptCancel) {
            break;
        }
    }
    DisposeModalFilterUPP(filt);
    DisposeDialog(dlg);
    return go;
}

static void DoOpenLocation(void)
{
    char where[240]; char cmd[248]; short n;
    if (!DoPromptDialog("Type a URL, or words to search the web:", "Go", where, sizeof(where)))
        return;
    n = 0; CatStr(cmd, &n, "GO "); CatStr(cmd, &n, where); cmd[n] = 0;
    SendCmd(cmd);
}

static void DoAsk(void)
{
    char q[240]; char cmd[248]; short n;
    if (!DoPromptDialog("Ask a question about this page:", "Ask", q, sizeof(q)))
        return;
    n = 0; CatStr(cmd, &n, "ASK "); CatStr(cmd, &n, q); cmd[n] = 0;
    SendCmd(cmd);
}

/* ================= scrolling ================= */

static void ScrollTo(short v)
{
    short max = DocHeight() - WIN_H;
    if (max < 0) max = 0;
    if (v < 0) v = 0;
    if (v > max) v = max;
    if (v == gScrollY) return;
    gScrollY = v;
    if (gScroll) SetControlValue(gScroll, v);
    DrawPage();
}

static pascal void ScrollAction(ControlHandle c, short part)
{
    short d = 0;
    switch (part) {
        case inUpButton:   d = -gLh9; break;
        case inDownButton: d = gLh9;  break;
        case inPageUp:     d = -(WIN_H - gLh9 * 2); break;
        case inPageDown:   d = WIN_H - gLh9 * 2;    break;
        default: return;
    }
    ScrollTo(GetControlValue(c) + d);
}

/* ================= events ================= */

static void ContentClick(EventRecord *ev)
{
    Point pt = ev->where;
    ControlHandle c;
    short part;

    SetPort(gWin);
    GlobalToLocal(&pt);

    part = FindControl(pt, gWin, &c);
    if (c == gScroll && part != 0) {
        if (part == inThumb) {
            TrackControl(c, pt, 0L);
            ScrollTo(GetControlValue(c));
        } else {
            TrackControl(c, pt, (ControlActionUPP)ScrollAction);
        }
        return;
    }

    /* link hit-test */
    if (pt.h < VIEW_W) {
        short i, docY = pt.v + gScrollY;
        for (i = 0; i < gNPL; i++) {
            if (gPL[i].style != 'L' || gPL[i].link == 0) continue;
            if (docY >= gPL[i].y && docY < gPL[i].y + gLh9) {
                char cmd[24]; short n = 0;
                /* flash the line inverted, the classic acknowledgement */
                Rect r;
                SetRect(&r, MARG_L + StyleIndent('L') - 2, gPL[i].y - gScrollY - 1,
                        VIEW_W - MARG_R, gPL[i].y - gScrollY + gLh9);
                InvertRect(&r);
                CatStr(cmd, &n, "LINK ");
                CatLong(cmd, &n, (long)gPL[i].link);
                cmd[n] = 0;
                SendCmd(cmd);
                return;
            }
        }
    }
}

static void DoKey(char ch)
{
    switch (ch) {
        case 0x1E: ScrollTo(gScrollY - gLh9); break;          /* up arrow */
        case 0x1F: ScrollTo(gScrollY + gLh9); break;          /* down arrow */
        case 0x0B: ScrollTo(gScrollY - (WIN_H - gLh9 * 2)); break;  /* page up */
        case 0x0C:
        case ' ':  ScrollTo(gScrollY + (WIN_H - gLh9 * 2)); break;  /* page down / space */
        case 0x01: ScrollTo(0); break;                        /* home */
        case 0x04: ScrollTo(32000); break;                    /* end */
    }
}

static void SyncMenus(void)
{
    Boolean up = gConnected;
#ifdef SURF_TEST
    up = true;
#endif
    if (up) {
        DisableItem(gConnM, kConnConnect);
        EnableItem(gConnM, kConnDisconnect);
        EnableItem(gBrowseM, kBrowseOpen);
        EnableItem(gBrowseM, kBrowseBack);
        EnableItem(gBrowseM, kBrowseSum);
        EnableItem(gBrowseM, kBrowseAsk);
    } else {
        EnableItem(gConnM, kConnConnect);
        DisableItem(gConnM, kConnDisconnect);
        DisableItem(gBrowseM, kBrowseOpen);
        DisableItem(gBrowseM, kBrowseBack);
        DisableItem(gBrowseM, kBrowseSum);
        DisableItem(gBrowseM, kBrowseAsk);
    }
}

static void DoAbout(void) { SetStatus("the web, distilled to 1 bit"); SysBeep(1); }

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
        case kEditMenu:
            SystemEdit(item - 1);
            break;
        case kConnMenu:
            switch (item) {
                case kConnConnect:    if (!gConnected) DialAgent(); break;
                case kConnDisconnect: Disconnect();                 break;
                case kConnSettings:   DoSettings();                 break;
            }
            break;
        case kBrowseMenu:
            switch (item) {
                case kBrowseOpen: DoOpenLocation();   break;
                case kBrowseBack: SendCmd("BACK");    break;
                case kBrowseSum:  SendCmd("SUM");     break;
                case kBrowseAsk:  DoAsk();            break;
#ifdef SURF_TEST
                case kBrowseTest: LoadTestPage();     break;
#else
                case kBrowseTest: SetStatus("test page is a Mini vMac build thing"); break;
#endif
            }
            break;
    }
    SyncMenus();
    HiliteMenu(0);
}

static void HandleMouseDown(EventRecord *ev)
{
    WindowPtr win;
    short part = FindWindow(ev->where, &win);
    switch (part) {
        case inMenuBar:   DoMenu(MenuSelect(ev->where)); break;
        case inSysWindow: SystemClick(ev, win); break;
        case inDrag:      DragWindow(win, ev->where, &qd.screenBits.bounds); break;
        case inGoAway:    if (TrackGoAway(win, ev->where)) gDone = true; break;
        case inZoomIn:
        case inZoomOut:   if (WFZoom(win, part, ev->where)) {
                              WIN_W = win->portRect.right  - win->portRect.left;
                              WIN_H = win->portRect.bottom - win->portRect.top;
                              MoveControl(gScroll, WIN_W - SBAR_W, -1);
                              SizeControl(gScroll, SBAR_W + 1, WIN_H + 2);
                              InvalRect(&win->portRect);
                          } break;
        case inContent:
            if (win != FrontWindow()) SelectWindow(win);
            else if (win == gWin) ContentClick(ev);
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
            if (ev->modifiers & cmdKey) {
                if (ev->what == keyDown) {
                    long sel = MenuKey(ch);
                    if (HiWord(sel)) DoMenu(sel);
                }
            } else {
                DoKey(ch);
            }
            break;
        case updateEvt: {
            WindowPtr w = (WindowPtr)ev->message;
            BeginUpdate(w);
            if (w == gWin) Repaint();
            EndUpdate(w);
            break;
        }
        case activateEvt:
            if ((WindowPtr)ev->message == gWin && gScroll)
                HiliteControl(gScroll, (ev->modifiers & activeFlag) ? 0 : 255);
            break;
    }
}

/* ================= setup ================= */

static void SetUpMenus(void)
{
    Str255 appleTitle;
    appleTitle[0] = 1; appleTitle[1] = 0x14;

    gAppleM = NewMenu(kAppleMenu, appleTitle);
    AppendMenu(gAppleM, "\pAbout Macinclaude Surf");
    AppendMenu(gAppleM, "\p(-");
    AppendResMenu(gAppleM, 'DRVR');
    InsertMenu(gAppleM, 0);

    gFileM = NewMenu(kFileMenu, "\pFile");
    AppendMenu(gFileM, "\pQuit/Q");
    InsertMenu(gFileM, 0);

    gEditM = NewMenu(kEditMenu, "\pEdit");
    AppendMenu(gEditM, "\pUndo/Z;(-;Cut/X;Copy/C;Paste/V;Clear");
    InsertMenu(gEditM, 0);

    gConnM = NewMenu(kConnMenu, "\pConnection");
    AppendMenu(gConnM, "\pConnect/K;Disconnect;(-;Settings...");
    InsertMenu(gConnM, 0);

    gBrowseM = NewMenu(kBrowseMenu, "\pBrowse");
    AppendMenu(gBrowseM, "\pOpen Location.../L;Back/B;(-;Summarize/U;Ask About Page.../A;(-;Load Test Page");
    InsertMenu(gBrowseM, 0);

    DrawMenuBar();
}

static void SetUpWindow(void)
{
    Rect r;
    gWin = WFNew("\pMacinclaude Surf");   /* fills the screen; close + zoom boxes */
    SetPort(gWin);
    WIN_W = gWin->portRect.right  - gWin->portRect.left;
    WIN_H = gWin->portRect.bottom - gWin->portRect.top;

    SetRect(&r, WIN_W - SBAR_W, -1, WIN_W + 1, WIN_H + 1);
    gScroll = NewControl(gWin, &r, "\p", true, 0, 0, 0, scrollBarProc, 0);

    /* cache font metrics once */
    {
        FontInfo fi;
        TextFont(geneva); TextSize(9); TextFace(0);
        GetFontInfo(&fi);
        gAsc9 = fi.ascent; gLh9 = fi.ascent + fi.descent + fi.leading;
        TextFont(geneva); TextSize(12); TextFace(bold);
        GetFontInfo(&fi);
        gAsc12 = fi.ascent; gLh12 = fi.ascent + fi.descent + fi.leading;
        TextFace(0); TextSize(9);
    }
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

/* ================= splash ================= */

static void CenterText(short winW, short y, ConstStr255Param s)
{
    MoveTo((winW - StringWidth(s)) / 2, y); DrawString(s);
}

/* a wireframe globe with a Claude spark rising off it */
static void DrawGlobe(short cx, short cy, short r)
{
    Rect o;
    PenSize(2, 2);
    SetRect(&o, cx - r, cy - r, cx + r, cy + r);
    FrameOval(&o);
    PenSize(1, 1);
    SetRect(&o, cx - r / 3, cy - r, cx + r / 3, cy + r);     /* meridian */
    FrameOval(&o);
    SetRect(&o, cx - r, cy - r / 3, cx + r, cy + r / 3);     /* parallel */
    FrameOval(&o);
    MoveTo(cx - r, cy); LineTo(cx + r, cy);                  /* equator */
}

static void DrawSpark(short cx, short cy, short rad)
{
    static const short ux[12] = {100,87,50,0,-50,-87,-100,-87,-50,0,50,87};
    static const short uy[12] = {0,50,87,100,87,50,0,-50,-87,-100,-87,-50};
    short i, len; Rect d;
    PenSize(2, 2);
    for (i = 0; i < 12; i++) {
        len = (i & 1) ? (short)(rad * 6 / 10) : rad;
        MoveTo(cx, cy);
        Line(ux[i] * len / 100, uy[i] * len / 100);
    }
    PenSize(1, 1);
    SetRect(&d, cx - 2, cy - 2, cx + 3, cy + 3); PaintOval(&d);
}

static void ShowSplash(void)
{
    Rect rp, bar, fill; short bx; long t;
    SetPort(gWin);
    SetRect(&rp, 0, 0, WIN_W, WIN_H); EraseRect(&rp);
    DrawGlobe(WIN_W / 2 - 26, 76, 44);
    DrawSpark(WIN_W / 2 + 44, 38, 14);
    TextFont(systemFont); TextFace(bold); TextSize(20);
    CenterText(WIN_W, 160, "\pMACINCLAUDE");
    CenterText(WIN_W, 182, "\pSURF");
    TextFace(0); TextSize(12);
    CenterText(WIN_W, 212, "\pthe web, distilled to 1 bit");
    bx = (WIN_W - 240) / 2;
    SetRect(&bar, bx, 226, bx + 240, 244);
    PenSize(2, 2); FrameRoundRect(&bar, 12, 12); PenSize(1, 1);
    SetRect(&fill, bx + 4, 230, bx + 4 + 232 * 38 / 100, 240); PaintRoundRect(&fill, 8, 8);
    TextSize(9);
    CenterText(WIN_W, 266, "\pthe mini reads the web, claude trims it, 9600 baud delivers it");
    Delay(120, &t);
    EraseRect(&rp);
    TextFont(geneva); TextSize(9); TextFace(0);
}

int main(void)
{
    EventRecord ev;

    InitToolbox();
    SetUpMenus();
    SetUpWindow();

    AppLogOpen("Surf"); AppLog("launched");   /* key events -> mini shared log */

    ShowSplash();
    PrefsLocate();

    gHaveCfg = LoadPrefs();
#ifdef SURF_TEST
    /* Offline test build for Mini vMac: no serial; commands load the embedded
     * test page so the whole render/scroll/link UI is exercisable. */
    (void)gHaveCfg;
    gConnected = true;
    SetStatus("TEST BUILD - Browse menu loads the test page");
    LoadTestPage();
#else
    if (!gHaveCfg) {
        SetDefaults();
        SetStatus("first run - set things up");
        if (DoSettingsDialog()) {
            SavePrefs();
            gHaveCfg = true;
        } else {
            SetStatus("setup cancelled - use Connection > Settings");
        }
    }
    if (gHaveCfg) DialAgent();      /* launch = connected; welcome page streams in */
#endif
    SyncMenus();

    while (!gDone) {
        AppLogTick();
        long sleep = (gConnected && gRxState != SRX_IDLE) ? 1L : 15L;
        if (WaitNextEvent(everyEvent, &ev, sleep, 0L))
            HandleEvent(&ev);
#ifndef SURF_TEST
        if (gConnected) PumpReceive();
#endif
    }
    if (gConnected) Disconnect();
    AppLogClose();
    return 0;
}
