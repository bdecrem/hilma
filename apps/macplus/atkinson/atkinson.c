/*
 * Atkinson - "Claude draws, in 1-bit" for the Macintosh Plus.
 * (System 6.0.8, 68000.) Built with Retro68. The Plus is a thin client: the
 * Mac mini generates an image, Atkinson-dithers it to 1 bit, and streams the
 * packed bitmap; the Plus just paints the bytes - band by band, top to bottom,
 * so the picture develops like a Polaroid over the slow serial link.
 *
 * Two halves of one product:
 *   - Plus side (this file): connects to the agent (settings + serial transport
 *     borrowed from Macinclaude), prompts the user for an image idea, sends it,
 *     and renders the 1bpp frame the agent streams back.
 *   - Mini side (agent-atkinson/): takes the prompt, generates an image,
 *     Atkinson-dithers it, and streams the frame.
 *
 * Wire protocol (Plus <-> agent, over the raw TCP/serial link):
 *   Plus -> agent:  "<prompt text>\r"
 *   agent -> Plus:  optional status lines, then a frame:
 *       "ATKIMG <w> <h> <rowbytes>\r\n"
 *       <h lines, each rowbytes*2 hex chars + \r\n>   (one image row per line)
 *       "ATKEND\r\n"
 *     or on failure  "ATKERR <message>\r\n"
 *   Hex (not raw binary) so the bytes survive the modem's telnet layer (a raw
 *   0xFF would be read as a telnet IAC) and so the 68000 parser stays trivial.
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
#include "test_image.h"   /* gTestImg[], gTestImg_W/_H/_ROWBYTES */

/* Font IDs (classic constants not always provided by the interfaces). */
#ifndef monaco
#define monaco 4
#endif
#ifndef systemFont
#define systemFont 0
#endif

/* ---- menus ---- */
#define kAppleMenu 128
#define kFileMenu  129
#define kConnMenu  130
#define kImageMenu 131
#define kEditMenu  132

/* File menu items */
#define kFileQuit    1

/* Edit menu items (standard layout so desk accessories + dialog editing work) */
#define kEditUndo    1
/* 2 = separator */
#define kEditCut     3
#define kEditCopy    4
#define kEditPaste   5
#define kEditClear   6

/* Connection menu items */
#define kConnConnect    1
#define kConnDisconnect 2
/* 3 = separator */
#define kConnSettings   4

/* Image menu items */
#define kImgNew      1
/* 2 = separator */
#define kImgTest     3
#define kImgRedraw   4
#define kImgClear    5

/* ---- Settings dialog (see atkinson.r) ---- */
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

/* ---- New Image dialog (see atkinson.r) ---- */
#define kDlgNewImage 129
#define kNewCreate  1
#define kNewCancel  2
#define kNewPrompt  4
#define kNewFrame   6

/* ---- config / prefs ---- */
#define kPrefMagic   0x414B      /* 'AK' */
#define kPrefVersion 1
#define kPrefName    "\pAtkinson Prefs"
#define kPrefCreator 'ATKN'
#define kPrefType    'pref'

typedef struct {
    short          magic;
    short          version;
    short          baudIdx;      /* index into kBaudTab (0..3) */
    unsigned short tcpPort;       /* e.g. 2325 */
    Str255         host;          /* e.g. "192.168.7.50" */
    Str255         ssid;
    Str255         pass;
    Boolean        wifiSaved;     /* creds already written to the modem */
    Boolean        pad;
} Config;

static Config gCfg;
static Boolean gHaveCfg = false;
static short   gPrefVRef = 0;

/* ---- window geometry: content 480x300, centered, below menu+title bars ---- */
#define IMG_W 480
#define IMG_H 300
#define WIN_LEFT 16

/* ---- globals ---- */
static WindowPtr  gWin;
static MenuHandle gAppleM, gFileM, gEditM, gConnM, gImageM;
static Boolean    gDone = false;

static NetConn    gConn;                    /* the TCP connection to the agent */
static Boolean    gConnected = false;       /* in a live session with the agent */

static char       gSerBuf[2048];            /* receive scratch (TCP -> parser)   */

/* the current image: 480x300 1bpp packed bytes (set bit = black) */
static unsigned char gImgBuf[IMG_W / 8 * IMG_H];   /* 18000 bytes */
static short gImgRB = 0, gImgW = 0, gImgH = 0;
static Boolean gImgValid = false;

/* ---- baud table (matches SerialDoc/Macinclaude) ---- */
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

/* C string -> Pascal Str255 (truncates at 255) */
static void C2P(const char *c, Str255 p)
{
    short n = 0;
    while (c[n] && n < 255) { p[n + 1] = (unsigned char)c[n]; n++; }
    p[0] = (unsigned char)n;
}

/* true if needle (C string) appears anywhere in buf */
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

/* The image is the whole canvas, so transient status lives in the title bar:
 * "Atkinson - connecting...", "Atkinson - generating", "Atkinson - 42%", etc. */
static void SetStatus(const char *msg)
{
    Str255 t; short n = 0; char b[80];
    CatStr(b, &n, "Macinclaude Paint");
    if (msg && msg[0]) { CatStr(b, &n, " - "); CatStr(b, &n, msg); }
    b[n] = 0;
    C2P(b, t);
    if (gWin) SetWTitle(gWin, t);
}

static void SetStatusPct(const char *msg, short pct)
{
    char b[80]; short n = 0;
    CatStr(b, &n, msg); CatStr(b, &n, " "); CatLong(b, &n, (long)pct); CatStr(b, &n, "%");
    b[n] = 0; SetStatus(b);
}

/* ================= bitmap drawing ================= */

static void MakeBitMap(BitMap *bm)
{
    bm->baseAddr = (Ptr)gImgBuf;
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

static void ClearCanvas(void)
{
    Rect c; SetPort(gWin); SetRect(&c, 0, 0, IMG_W, IMG_H); EraseRect(&c);
}

/* Paint the current image top-to-bottom in bands with a small pause, so it
 * "develops". Used for the embedded test image (offline). The live path renders
 * each band as its row arrives, so it doesn't need this Delay-based pacing. */
static void DrawImageProgressive(void)
{
    short band = 20, y; long t;
    if (!gImgValid) return;
    ClearCanvas();
    for (y = 0; y < gImgH; y += band) {
        short bottom = y + band; if (bottom > gImgH) bottom = gImgH;
        DrawBand(y, bottom);
        Delay(5, &t);          /* ~5 ticks ~= 1/12 s per band */
    }
}

/* Copy embedded bytes into our buffer and reveal them (offline demo/self-test). */
static void DrawTestImage(void)
{
    short i;
    for (i = 0; i < (short)sizeof(gImgBuf) && i < (short)sizeof(gTestImg); i++)
        gImgBuf[i] = gTestImg[i];
    gImgRB = gTestImg_ROWBYTES; gImgW = gTestImg_W; gImgH = gTestImg_H;
    gImgValid = true;
    SetStatus("test image");
    DrawImageProgressive();
}

static void ClearImage(void)
{
    gImgValid = false;
    ClearCanvas();
    SetStatus("");
}

/* ================= serial plumbing (mirrors Macinclaude/SerialDoc) ================= */

/* ================= TCP transport primitives =================
 * These replace the RetroWiFi serial-modem path. The Plus now opens a real TCP
 * socket to the agent through the BlueSCSI DaynaPORT + MacTCP (see net/nettcp).
 * The wire protocol above is unchanged - only the pipe under it is different. */

/* Send a C string over the connection (used for the one prompt line). */
static void SendStr(const char *s)
{
    long n;
    if (!gConnected) return;
    StrLen(s, &n);
    if (n > 0) NetSend(&gConn, s, (unsigned short)n);
}

/* Discard any bytes already waiting on the socket (stale tail from a prior
   image), so a new prompt starts the parser on a clean stream. */
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

/* ================= prefs persistence ================= */

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
    gCfg.tcpPort = 2325;            /* the Atkinson agent on the mini */
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
    Create(kPrefName, gPrefVRef, kPrefCreator, kPrefType);   /* ok if it exists */
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
   AT/ATDT/AT&W handshake anymore, just a socket. */
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
    SetStatus("connected - Image > New Image to draw");
    return true;
}

static void Disconnect(void)
{
    if (gConnected) NetClose(&gConn);
    gConnected = false;
    SetStatus("disconnected");
}

/* ================= frame receive state machine ================= */

/* The parser lives in atkinson_rx.inc so the host test (rxtest.c) exercises the
 * exact same code against a real agent frame. It needs the image globals (above)
 * and these four callbacks (DrawBand/ClearCanvas/SetStatus/SetStatusPct, also
 * above). PumpReceive (below) is the Mac-serial feeder and stays here. */
#include "atkinson_rx.inc"

/* Non-blocking: drain whatever TCP bytes have arrived into the parser. Called
   every event-loop pass, so the image still develops band-by-band as data
   streams in - now near-instantly over TCP instead of crawling at 9600 baud. */
static void PumpReceive(void)
{
    long avail, got; short i;
    if (!gConnected) return;
    avail = NetAvailable(&gConn);
    if (avail <= 0) {
        if (avail < 0) { RxAbort("connection dropped"); gConnected = false; return; }
        if (gRxState != RX_IDLE && (long)(TickCount() - gRxDeadline) > 0)
            RxAbort("timed out waiting for the agent");
        return;
    }
    if (avail > (long)sizeof(gSerBuf)) avail = sizeof(gSerBuf);
    got = NetRecv(&gConn, gSerBuf, (unsigned short)avail, 5);
    if (got <= 0) return;
    for (i = 0; i < (short)got; i++) FeedRxByte((unsigned char)gSerBuf[i]);
    gRxDeadline = TickCount() + 60 * 60;     /* 60s of silence = give up */
}

/* ================= dialogs ================= */

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

/* Copy a TE's current selection to the desk scrap. We write the substring with
 * PutScrap directly rather than TECopy+TEToScrap, because TEToScrap is a glue
 * routine Retro68 doesn't link by default (PutScrap/GetScrap are real traps). */
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

/* Insert the desk-scrap text into a TE at the current selection (replacing it).
 * Same reason as above: avoids the TEFromScrap glue. */
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
        SysBeep(1);                /* nothing on the clipboard */
    }
    DisposeHandle(h);
}

/* default-button frame drawn around a button's box (UserItem proc) */
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

/* Modal filter shared by both dialogs: map Return->default, Esc->cancel, and
 * wire Cmd-X/C/V into the active edit field (SSID/password/host, or the New
 * Image prompt). Without Cmd-V a long prompt has to be typed by hand on the
 * Plus keyboard, and a dead key (e.g. a stuck 'L') can't be worked around. */
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
    if (ch == 13 || ch == 3)  { *itemHit = gDefItem; return true; }   /* Return/Enter */
    if (ch == 27)             { *itemHit = gCanItem; return true; }   /* Esc */
    return false;
}

static void SyncBaudRadios(DialogPtr d, short sel)
{
    SetControlValue(DlgCtl(d, kRB1200),  sel == 0);
    SetControlValue(DlgCtl(d, kRB2400),  sel == 1);
    SetControlValue(DlgCtl(d, kRB9600),  sel == 2);
    SetControlValue(DlgCtl(d, kRB19200), sel == 3);
}

/* returns true if the user saved */
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
            if (pv < 1) pv = 2325;
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

/* Open Settings, then (if saved) persist + re-join WiFi + reconfigure port. */
static void DoSettings(void)
{
    if (gConnected) Disconnect();
    if (DoSettingsDialog()) {
        SavePrefs();
        gHaveCfg = true;
        SetStatus("settings saved - Connection > Connect");
    }
}

/* Prompt for an image idea; returns true + fills prompt[] (C string) if Create. */
static Boolean DoNewImageDialog(char *prompt, short cap)
{
    DialogPtr dlg;
    short item;
    short t; Handle h; Rect box;
    Boolean go = false;
    Str255 p;
    ModalFilterUPP filt;

    dlg = GetNewDialog(kDlgNewImage, 0L, (WindowPtr)-1L);
    if (!dlg) { SetStatus("could not open New Image dialog"); return false; }
    gDefItem = kNewCreate; gCanItem = kNewCancel; gFrameItem = kNewCreate;
    filt = NewModalFilterUPP(KeyFilter);

    GetDialogItem(dlg, kNewFrame, &t, &h, &box);
    SetDialogItem(dlg, kNewFrame, t, (Handle)NewUserItemUPP(&FrameDefault), &box);

    SetDlgText(dlg, kNewPrompt, "\p");
    SelectDialogItemText(dlg, kNewPrompt, 0, 32767);

    for (;;) {
        ModalDialog(filt, &item);
        if (item == kNewCreate) {
            GetDlgText(dlg, kNewPrompt, p);
            if (p[0] == 0) { SysBeep(1); continue; }   /* empty -> stay open */
            P2C(p, prompt);
            if ((short)p[0] >= cap) prompt[cap - 1] = 0;
            go = true; break;
        } else if (item == kNewCancel) {
            break;
        }
    }
    DisposeModalFilterUPP(filt);
    DisposeDialog(dlg);
    return go;
}

/* The whole point: ask for an idea, send it, let the frame stream in. */
static void DoNewImage(void)
{
    char prompt[256];
#ifdef ATK_TEST
    /* Offline test build (Mini vMac, no serial): the dialog + prompt entry are
     * real, but instead of round-tripping to the agent we just develop the
     * embedded test image, so the whole New Image -> develop path is exercisable
     * in the emulator. */
    if (!DoNewImageDialog(prompt, sizeof(prompt))) return;
    SetStatus("test draw");
    DrawTestImage();
    return;
#endif
    if (!gConnected) { SetStatus("not connected - use Connection > Connect"); SysBeep(1); return; }
    if (gRxState != RX_IDLE) { SetStatus("still receiving - wait"); SysBeep(1); return; }
    if (!DoNewImageDialog(prompt, sizeof(prompt))) return;

    /* send the prompt as one line */
    DrainInput();
    gRxLineLen = 0;
    SendStr(prompt);
    SendStr("\r");

    gRxState = RX_WAIT_HEADER;
    gRxRow = 0;
    gRxDeadline = TickCount() + 60 * 60;     /* generation can take a while */
    SetStatus("generating...");
}

/* ================= menus ================= */

static void SyncMenus(void)
{
    if (gConnected) {
        DisableItem(gConnM, kConnConnect);
        EnableItem(gConnM, kConnDisconnect);
        EnableItem(gImageM, kImgNew);
    } else {
        EnableItem(gConnM, kConnConnect);
        DisableItem(gConnM, kConnDisconnect);
        DisableItem(gImageM, kImgNew);
    }
}

static void DoAbout(void) { SetStatus("Claude draws, in 1-bit"); SysBeep(1); }

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
            /* Standard edit menu: let a desk accessory handle Cut/Copy/Paste.
             * The image window itself has no editable text; dialog-field editing
             * is handled in KeyFilter (Cmd-X/C/V), since the menu bar is disabled
             * while a modal dialog is up. */
            SystemEdit(item - 1);
            break;
        case kConnMenu:
            switch (item) {
                case kConnConnect:    if (!gConnected) DialAgent(); break;
                case kConnDisconnect: Disconnect();                 break;
                case kConnSettings:   DoSettings();                 break;
            }
            break;
        case kImageMenu:
            switch (item) {
                case kImgNew:    DoNewImage();           break;
                case kImgTest:   DrawTestImage();        break;
                case kImgRedraw: DrawFull();             break;
                case kImgClear:  ClearImage();           break;
            }
            break;
    }
    SyncMenus();
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
        case autoKey:
            ch = ev->message & charCodeMask;
            if (ev->modifiers & cmdKey) {
                if (ev->what == keyDown) {
                    long sel = MenuKey(ch);
                    if (HiWord(sel)) DoMenu(sel);
                }
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
        case activateEvt: break;
    }
}

/* ================= setup ================= */

static void SetUpMenus(void)
{
    Str255 appleTitle;
    appleTitle[0] = 1; appleTitle[1] = 0x14;     /* apple symbol */

    gAppleM = NewMenu(kAppleMenu, appleTitle);
    AppendMenu(gAppleM, "\pAbout Atkinson");
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

    gImageM = NewMenu(kImageMenu, "\pImage");
    AppendMenu(gImageM, "\pNew Image.../N;(-;Draw Test Image/D;Redraw/R;Clear");
    InsertMenu(gImageM, 0);

    DrawMenuBar();
}

static void SetUpWindow(void)
{
    Rect r;
    short left = (qd.screenBits.bounds.right - IMG_W) / 2;
    short top  = qd.screenBits.bounds.top + 40;
    SetRect(&r, left, top, left + IMG_W, top + IMG_H);
    gWin = NewWindow(0L, &r, "\pMacinclaude Paint", true, documentProc,
                     (WindowPtr)-1L, false, 0);
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

/* ================= splash ================= */

/* The Claude spark: 12 rays around (cx,cy), alternating long/short. */
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

/* an artist's easel holding a canvas with a Claude spark painted on it. */
static void DrawEasel(short cx, short topY)
{
    Rect canvas;
    short spread = 44, legH = 104, apexX = cx, apexY = topY;
    PenSize(2, 2);
    MoveTo(apexX, apexY); LineTo(apexX - spread, apexY + legH);            /* left leg */
    MoveTo(apexX, apexY); LineTo(apexX + spread, apexY + legH);            /* right leg */
    MoveTo(apexX + 5, apexY + 6); LineTo(apexX + spread - 10, apexY + legH); /* back leg */
    MoveTo(apexX - spread + 8, apexY + legH - 16);
    LineTo(apexX + spread - 8, apexY + legH - 16);                         /* tray bar */
    SetRect(&canvas, cx - 30, apexY + 16, cx + 30, apexY + 66);
    EraseRect(&canvas); FrameRect(&canvas);                               /* canvas over legs */
    PenSize(1, 1);
    DrawSpark((canvas.left + canvas.right) / 2, (canvas.top + canvas.bottom) / 2, 14);
}

static void CenterText(short winW, short y, ConstStr255Param s)
{
    MoveTo((winW - StringWidth(s)) / 2, y); DrawString(s);
}

/* Startup splash: easel hero + Chicago title + loading line + bar. Held briefly,
 * then cleared so the canvas takes over. */
static void ShowSplash(void)
{
    Rect rp, bar, fill; short bx; long t;
    SetPort(gWin);
    SetRect(&rp, 0, 0, IMG_W, IMG_H); EraseRect(&rp);
    DrawEasel(IMG_W / 2, 20);
    TextFont(systemFont); TextFace(bold); TextSize(20);
    CenterText(IMG_W, 168, "\pMACINCLAUDE");
    CenterText(IMG_W, 190, "\pPAINT");
    TextFace(0); TextSize(12);
    CenterText(IMG_W, 222, "\pmixing the 1-bit paint");
    bx = (IMG_W - 240) / 2;
    SetRect(&bar, bx, 234, bx + 240, 252);
    PenSize(2, 2); FrameRoundRect(&bar, 12, 12); PenSize(1, 1);
    SetRect(&fill, bx + 4, 238, bx + 4 + 232 * 38 / 100, 248); PaintRoundRect(&fill, 8, 8);
    TextSize(9);
    CenterText(IMG_W, 274, "\pclaude draws, you watch it develop");
    Delay(120, &t);
    EraseRect(&rp);
}

int main(void)
{
    EventRecord ev;

    InitToolbox();
    SetUpMenus();
    SetUpWindow();

    AppLogOpen("Atkinson"); AppLog("launched");   /* key events -> mini shared log */

    ShowSplash();
    PrefsLocate();

    gHaveCfg = LoadPrefs();
#ifdef ATK_TEST
    /* Offline test build for Mini vMac (build.sh test / -DATK_TEST). There is no
     * serial in the emulator, so skip first-run setup and the modem dial, force
     * the connected state (which enables New Image), and let New Image develop
     * the embedded test image instead of talking to the agent (see DoNewImage).
     * Never define this for the real Plus. */
    (void)gHaveCfg;
    gConnected = true;
    SetStatus("TEST BUILD - New Image draws the embedded image");
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
    if (gHaveCfg) DialAgent();      /* launch = connected, ready to draw */
#endif
    SyncMenus();

    while (!gDone) {
        long sleep = (gConnected && gRxState != RX_IDLE) ? 1L : 15L;
        if (WaitNextEvent(everyEvent, &ev, sleep, 0L))
            HandleEvent(&ev);
        if (gConnected) PumpReceive();
    }
    if (gConnected) Disconnect();
    return 0;
}
