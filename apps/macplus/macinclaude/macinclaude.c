/*
 * Macinclaude - a one-app "Claude Code on the Macintosh Plus" launcher.
 * (System 6.0.8, 68000.) Built with Retro68. Black & white, low memory.
 *
 * What it is: the Plus-side client for the Macinclaude agent running on the
 * Mac mini. SerialDoc proved the cable and the AT/baud handshake; this app
 * bakes the whole ritual in. Configure once (WiFi + mini host:port + baud);
 * after that, launching the app = you're talking to Claude on your Mac Plus.
 *
 * Boot behavior:
 *   - First launch (no prefs): Settings dialog. Saving stores host/port/baud in
 *     a prefs file in the System Folder.
 *   - Every launch after: auto-connect. Open a TCP socket to the mini (host:port
 *     from prefs), then drop straight into a live terminal session with the agent.
 *   - Connection menu: Connect/Reconnect, Disconnect, Settings...
 *   - Any step fails => a plain status line naming what broke + Settings/retry.
 *     No silent fallback.
 *
 * Transport: the Plus now opens a real TCP socket to the agent through the
 * BlueSCSI DaynaPORT + MacTCP (see net/nettcp). WiFi itself is brought up by the
 * BlueSCSI, not by this app - so there is no AT/ATDT/AT&W modem handshake
 * anymore, just a socket. The terminal emulation above the pipe is unchanged.
 *
 * Naming: this Plus app and the mini agent are both "Macinclaude" - two halves
 * of one product. They never share a namespace (different machine, language,
 * folder); the only shared token is the name on the screen.
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

/* Font IDs (classic constants not always provided by the interfaces). */
#ifndef monaco
#define monaco 4
#endif
#ifndef systemFont
#define systemFont 0
#endif

/* ---- window geometry (512x342 screen, 20px menu bar) ---- */
#define WIN_W   480
#define WIN_H   292
#define TE_PAD  4

/* ---- menus ---- */
#define kAppleMenu  128
#define kFileMenu   129
#define kEditMenu   131
#define kConnMenu   130

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

/* ---- Settings dialog (see macinclaude.r) ---- */
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

/* ---- config / prefs ---- */
#define kPrefMagic   0x4D43      /* 'MC' */
#define kPrefVersion 1
#define kPrefName    "\pMacinclaude Prefs"
#define kPrefCreator 'MCLD'
#define kPrefType    'pref'

typedef struct {
    short          magic;
    short          version;
    short          baudIdx;      /* index into kBaudTab (0..3) */
    unsigned short tcpPort;       /* e.g. 2324 */
    Str255         host;          /* e.g. "192.168.7.50" */
    Str255         ssid;
    Str255         pass;
    Boolean        wifiSaved;     /* creds already written to the modem */
    Boolean        pad;
} Config;

static Config gCfg;
static Boolean gHaveCfg = false;
static short   gPrefVRef = 0;

/* ---- globals ---- */
static WindowPtr  gWin;
static TEHandle   gTE;
static MenuHandle gAppleM, gFileM, gEditM, gConnM;
static Boolean    gDone = false;

static NetConn    gConn;                    /* the TCP connection to the agent */
static Boolean    gConnected = false;       /* in a live terminal session */

static char       gSerBuf[2048];            /* receive scratch (TCP -> parser) */

/* ---- baud table (matches SerialDoc) ---- */
typedef struct { const char *name; short config; } BaudEntry;
static const BaudEntry kBaudTab[] = {
    { "1200",  baud1200  + data8 + noParity + stop10 },
    { "2400",  baud2400  + data8 + noParity + stop10 },
    { "9600",  baud9600  + data8 + noParity + stop10 },
    { "19200", baud19200 + data8 + noParity + stop10 },
};
#define NBAUD 4

/* ================= console (TextEdit) ================= */

static void StrLen(const char *s, long *n) { long i = 0; while (s[i]) i++; *n = i; }

static void ScrollToBottom(void)
{
    short totalH, viewH, desiredTop, delta;
    totalH = (*gTE)->nLines * (*gTE)->lineHeight;
    viewH  = (*gTE)->viewRect.bottom - (*gTE)->viewRect.top;
    desiredTop = (*gTE)->viewRect.top - ((totalH > viewH) ? (totalH - viewH) : 0);
    delta = desiredTop - (*gTE)->destRect.top;
    if (delta != 0) TEScroll(0, delta, gTE);
}

static void Emit(const char *s)
{
    long n; StrLen(s, &n);
    if (n <= 0) return;
    if ((*gTE)->teLength + n > 28000) {
        TESetSelect(0, 12000, gTE);
        TEDelete(gTE);
    }
    TESetSelect(32767, 32767, gTE);
    TEInsert((Ptr)s, n, gTE);
    ScrollToBottom();
}

static void EmitLine(const char *s) { Emit(s); Emit("\r"); }

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

/* Render incoming bytes to the console, filtering ANSI/control noise.
 * The agent sends clean ASCII + CRLF; the only escapes it emits are CSI
 * sequences (clear-screen on /clear). We honor ESC[2J as a console clear and
 * drop the rest, so nothing shows up as garbage dots. */
static Boolean gInEsc = false;       /* mid CSI escape sequence */
static char    gEscBuf[16];
static short   gEscLen = 0;

static void ClearConsole(void)
{
    TESetSelect(0, (*gTE)->teLength, gTE);
    TEDelete(gTE);
    ScrollToBottom();
}

static void DumpTerm(const unsigned char *buf, short len)
{
    char line[200]; short k = 0; short i;
    for (i = 0; i < len; i++) {
        unsigned char c = buf[i];
        if (gInEsc) {
            if (gEscLen < (short)sizeof(gEscBuf)) gEscBuf[gEscLen++] = (char)c;
            /* CSI ends on a final byte 0x40..0x7E */
            if (c >= 0x40 && c <= 0x7E) {
                if (c == 'J') { if (k > 0) { line[k] = 0; Emit(line); k = 0; } ClearConsole(); }
                gInEsc = false; gEscLen = 0;
            }
            continue;
        }
        if (c == 27) { gInEsc = true; gEscLen = 0; continue; }
        if (c == 0) continue;                 /* drop NULs */
        if (c == 8 || c == 127) {             /* destructive backspace echo: the
                                               * PTY erases with BS/space/BS, so
                                               * delete the last console char */
            if (k > 0) { line[k] = 0; Emit(line); k = 0; }
            if ((*gTE)->teLength > 0) {
                TESetSelect((*gTE)->teLength - 1, (*gTE)->teLength, gTE);
                TEDelete(gTE);
                ScrollToBottom();
            }
            continue;
        }
        /* Line breaks: the LF is the break, CR is dropped. The agent ends every
         * line with exactly one LF, so this yields one break per line. CRs are
         * just decoration the telnet/Zimodem layer may add or duplicate
         * (\r\n, \r\r\n, \r\0\n) - emitting a break per CR is what double-spaced
         * everything vs ZTerm, which is likewise LF-driven. TextEdit's own line
         * terminator is CR, so an LF maps to a single '\r'. */
        if (c == 10) line[k++] = '\r';
        else if (c == 13) { /* drop - the LF makes the break */ }
        else if (c >= 32 && c < 127) line[k++] = (char)c;
        else line[k++] = '.';
        if (k > 180) { line[k] = 0; Emit(line); k = 0; }
    }
    if (k > 0) { line[k] = 0; Emit(line); }
}

/* ================= TCP transport primitives =================
 * These replace the RetroWiFi serial-modem path. The Plus now opens a real TCP
 * socket to the agent through the BlueSCSI DaynaPORT + MacTCP (see net/nettcp).
 * The terminal protocol above is unchanged - only the pipe under it is. */

/* Send n bytes over the connection (no local echo; the remote echoes). */
static void SendBytes(const char *s, long n)
{
    if (!gConnected || n <= 0) return;
    NetSend(&gConn, s, (unsigned short)n);
}
static void SendStr(const char *s) { long n; StrLen(s, &n); SendBytes(s, n); }

/* Discard any bytes already waiting on the socket. */
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

/* ================= pascal/C string helpers ================= */

static void P2C(ConstStr255Param p, char *c)
{
    short i, n = p[0];
    for (i = 0; i < n; i++) c[i] = (char)p[i + 1];
    c[n] = 0;
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
    gCfg.tcpPort = 2324;            /* the Macinclaude agent on the mini */
    /* host = "192.168.7.50" */
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
    if (FSOpen(kPrefName, gPrefVRef, &refNum) != noErr) {
        EmitLine("*** could not save prefs."); return;
    }
    count = sizeof(Config);
    SetFPos(refNum, fsFromStart, 0);
    FSWrite(refNum, &count, (Ptr)&gCfg);
    SetEOF(refNum, (long)sizeof(Config));
    FSClose(refNum);
    FlushVol(NULL, gPrefVRef);
}

/* ================= connection ================= */

/* Open a TCP connection to the agent (host:port from prefs) and, on success,
   drop into the terminal loop. WiFi itself is brought up by the BlueSCSI
   (DaynaPORT), not by this app - so there is no AT/ATDT/AT&W handshake anymore,
   just a socket. */
static Boolean DialAgent(void)
{
    char hostC[256];
    unsigned long ip;
    OSErr err;

    if (gConnected) return true;

    EmitLine("");
    EmitLine("Connecting to Macinclaude...");
    P2C(gCfg.host, hostC);
    ip = NetParseIP(hostC);
    if (ip == 0) { EmitLine("  bad server IP - check Connection > Settings."); return false; }

    err = NetConnect(&gConn, ip, gCfg.tcpPort);
    if (err != noErr) {
        char b[80]; short n = 0;
        CatStr(b, &n, "  connect failed: ");
        CatStr(b, &n, (char *)NetErrStr(err));
        b[n] = 0; EmitLine(b);
        return false;
    }

    gConnected = true;
    gInEsc = false; gEscLen = 0;
    EmitLine("--- connected. you're talking to Claude. ---");
    EmitLine("");
    return true;
}

static void Disconnect(void)
{
    if (gConnected) NetClose(&gConn);
    gConnected = false;
    EmitLine("");
    EmitLine("--- disconnected ---");
}

/* ================= terminal pump (live session) ================= */

static void PumpTerminal(void)
{
    long avail, got;
    if (!gConnected) return;
    avail = NetAvailable(&gConn);
    if (avail <= 0) {
        if (avail < 0) {       /* connection gone */
            gConnected = false;
            EmitLine("");
            EmitLine("--- connection dropped ---");
        }
        return;
    }
    if (avail > (long)sizeof(gSerBuf)) avail = sizeof(gSerBuf);
    got = NetRecv(&gConn, gSerBuf, (unsigned short)avail, 5);
    if (got <= 0) return;
    DumpTerm((unsigned char *)gSerBuf, (short)got);
}

static void TerminalKey(char ch)
{
    char out[2];
    if (!gConnected) { SysBeep(1); return; }
    /* The Plus Delete key sends 0x08 (BS), but the mini's PTY erase char is
     * 0x7F (DEL) - so send DEL, otherwise the host echoes a literal ^H instead
     * of erasing. (This is the bug ZTerm couldn't fix without a setting.) */
    if (ch == 8) ch = 0x7f;
    out[0] = ch;
    SendBytes(out, 1);             /* remote echoes; no local echo */
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

/* Copy the console selection (if any) to the desk scrap. */
static void TerminalCopy(void)
{
    ScrapFromTE(gTE);
}

/* Paste: send the clipboard text out the serial line as if typed. The remote
 * echoes it back, so it appears on screen. This is the escape hatch for a dead
 * key (e.g. a stuck 'L'): type the text anywhere with Key Caps, copy, paste here. */
static void TerminalPaste(void)
{
    Handle h; long n, off = 0;
    if (!gConnected) { SysBeep(1); return; }
    h = NewHandle(0);
    if (!h) return;
    n = GetScrap(h, 'TEXT', &off);
    if (n > 0) {
        HLock(h);
        SendBytes(*h, n);          /* raw bytes; remote echoes them back */
        HUnlock(h);
    } else {
        SysBeep(1);                /* nothing on the clipboard */
    }
    DisposeHandle(h);
}

/* ================= Settings dialog ================= */

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

static void SyncBaudRadios(DialogPtr d, short sel)
{
    SetControlValue(DlgCtl(d, kRB1200),  sel == 0);
    SetControlValue(DlgCtl(d, kRB2400),  sel == 1);
    SetControlValue(DlgCtl(d, kRB9600),  sel == 2);
    SetControlValue(DlgCtl(d, kRB19200), sel == 3);
}

/* default-button frame drawn around the Save button */
static pascal void FrameDefault(DialogPtr dlg, short itemNo)
{
    short t; Handle h; Rect box;
    (void)itemNo;
    GetDialogItem(dlg, kSave, &t, &h, &box);
    InsetRect(&box, -4, -4);
    PenSize(3, 3);
    FrameRoundRect(&box, 16, 16);
    PenSize(1, 1);
}

/* returns true if the user saved */
/* Modal filter for the Settings dialog: wire up clipboard editing in the
 * SSID/password/host fields (Cmd-X/C/V), and map Return->Save, Esc->Cancel.
 * Without this, Cmd-V does nothing and a dead key (stuck 'L') can't be worked
 * around by pasting. */
static pascal Boolean SettingsFilter(DialogPtr dlg, EventRecord *ev, short *itemHit)
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
    if (ch == 13 || ch == 3)  { *itemHit = kSave;   return true; }   /* Return/Enter */
    if (ch == 27)             { *itemHit = kCancel; return true; }   /* Esc */
    return false;
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
    if (!dlg) { EmitLine("*** could not open Settings dialog."); return false; }
    filt = NewModalFilterUPP(SettingsFilter);

    /* install the default-button frame user item */
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
            if (pv < 1) pv = 2324;
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

/* Open Settings, then (if saved) persist. Reconnect via Connection > Connect. */
static void DoSettings(void)
{
    if (gConnected) Disconnect();
    if (DoSettingsDialog()) {
        SavePrefs();
        gHaveCfg = true;
        EmitLine("");
        EmitLine("Settings saved. Use Connection > Connect.");
    }
}

/* ================= menus ================= */

static void SyncMenus(void)
{
    if (gConnected) {
        DisableItem(gConnM, kConnConnect);
        EnableItem(gConnM, kConnDisconnect);
    } else {
        EnableItem(gConnM, kConnConnect);
        DisableItem(gConnM, kConnDisconnect);
    }
}

static void DoAbout(void)
{
    EmitLine("");
    EmitLine("=============== Macinclaude ===============");
    EmitLine(" Claude Code, on your Macintosh Plus.");
    EmitLine(" Talks over WiFi (MacTCP) to the");
    EmitLine(" Macinclaude agent on the Mac mini.");
    EmitLine(" code by Claude Code, for Bart Decrem");
    EmitLine("===========================================");
}

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
            if (SystemEdit(item - 1)) break;   /* a desk accessory took it */
            if (item == kEditCopy)  TerminalCopy();
            if (item == kEditPaste) TerminalPaste();
            break;
        case kConnMenu:
            switch (item) {
                case kConnConnect:    if (!gConnected) DialAgent();  break;
                case kConnDisconnect: Disconnect();                  break;
                case kConnSettings:   DoSettings();                  break;
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
            } else if (gConnected) {
                TerminalKey(ch);
            }
            break;
        case updateEvt: {
            WindowPtr w = (WindowPtr)ev->message;
            BeginUpdate(w);
            SetPort(w);
            { Rect r = (*gTE)->viewRect; EraseRect(&r); TEUpdate(&r, gTE); }
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
    AppendMenu(gAppleM, "\pAbout Macinclaude");
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

    DrawMenuBar();
}

static void SetUpWindow(void)
{
    Rect r, view;
    short left = (qd.screenBits.bounds.right - WIN_W) / 2;
    short top  = qd.screenBits.bounds.top + 24;
    SetRect(&r, left, top, left + WIN_W, top + WIN_H);
    gWin = NewWindow(0L, &r, "\pMacinclaude Code", true, documentProc,
                     (WindowPtr)-1L, false, 0);
    SetPort(gWin);
    TextFont(monaco); TextSize(9);

    SetRect(&view, TE_PAD, TE_PAD, WIN_W - TE_PAD, WIN_H - TE_PAD);
    gTE = TENew(&view, &view);
    TEAutoView(true, gTE);
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

static void Banner(void)
{
    EmitLine("    M A C I N C L A U D E");
    EmitLine("    ~~~~~~~~~~~~~~~~~~~~~");
    EmitLine("    Claude Code for the 1986 Mac.");
    EmitLine("");
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

/* compact Macintosh silhouette, a Claude spark glowing on its screen. */
static void DrawCompactMac(short cx, short topY)
{
    Rect body, scr, slot, dot;
    short w = 70, h = 86, L = cx - w / 2, T = topY;
    PenSize(2, 2);
    SetRect(&body, L, T, L + w, T + h);        FrameRoundRect(&body, 16, 16);
    SetRect(&scr, L + 9, T + 9, L + w - 9, T + 47); FrameRoundRect(&scr, 8, 8);
    MoveTo(L + 9, T + 55); LineTo(L + w - 9, T + 55);   /* chin separator */
    PenSize(1, 1);
    DrawSpark((scr.left + scr.right) / 2, (scr.top + scr.bottom) / 2, 13);
    SetRect(&slot, L + w - 30, T + h - 17, L + w - 10, T + h - 12); PaintRect(&slot);
    SetRect(&dot, L + 11, T + h - 20, L + 19, T + h - 12); PaintOval(&dot);
}

static void CenterText(short winW, short y, ConstStr255Param s)
{
    MoveTo((winW - StringWidth(s)) / 2, y); DrawString(s);
}

/* Startup splash: compact-Mac hero + Chicago title + loading line + bar. Held
 * briefly, then cleared so the terminal takes over. */
static void ShowSplash(void)
{
    Rect rp, bar, fill; short bx; long t;
    SetPort(gWin);
    rp = gWin->portRect; EraseRect(&rp);
    DrawCompactMac(WIN_W / 2, 14);
    TextFont(systemFont); TextFace(bold); TextSize(20);
    CenterText(WIN_W, 130, "\pMACINCLAUDE");
    CenterText(WIN_W, 152, "\pCODE");
    TextFace(0); TextSize(12);
    CenterText(WIN_W, 184, "\pconnecting to claude . 9600 baud");
    bx = (WIN_W - 240) / 2;
    SetRect(&bar, bx, 198, bx + 240, 216);
    PenSize(2, 2); FrameRoundRect(&bar, 12, 12); PenSize(1, 1);
    SetRect(&fill, bx + 4, 202, bx + 4 + 232 * 6 / 10, 212); PaintRoundRect(&fill, 8, 8);
    TextSize(9);
    CenterText(WIN_W, 238, "\pa coding companion for the 1986 mac");
    Delay(120, &t);
    EraseRect(&rp);
    TextFont(monaco); TextSize(9); TextFace(0);     /* restore for the console */
}

int main(void)
{
    EventRecord ev;

    InitToolbox();
    SetUpMenus();
    SetUpWindow();

    ShowSplash();
    PrefsLocate();
    Banner();

    gHaveCfg = LoadPrefs();
    if (!gHaveCfg) {
        SetDefaults();
        EmitLine("First run - let's set things up.");
        EmitLine("");
        if (DoSettingsDialog()) {
            SavePrefs();
            gHaveCfg = true;
        } else {
            EmitLine("Setup cancelled. Use Connection > Settings when ready.");
        }
    }

    SyncMenus();

    if (gHaveCfg) DialAgent();      /* the magic: launch = connected */

    while (!gDone) {
        long sleep = gConnected ? 2L : 15L;
        if (WaitNextEvent(everyEvent, &ev, sleep, 0L))
            HandleEvent(&ev);
        if (gConnected) { PumpTerminal(); TEIdle(gTE); }
    }
    if (gConnected) Disconnect();
    return 0;
}
