/*
 * Plutonix — a tiny Unix subsystem for the Macintosh Plus.
 * (System 6.0.8, 68000, 4MB.) Built with Retro68.
 *
 * A terminal + a real shell on a 1986 Mac:
 *   - a scrolling console with an input line and a Unix-y prompt
 *   - builtins (ls/cd/pwd/cat/mkdir/rm/echo/clear/date/mem/uname/help) that
 *     treat the Mac's HFS as a Unix tree ("/" = the boot volume, ":" -> "/")
 *   - `ssh` / `mini`: opens a REAL bash on the Mac mini over our TCP stack
 *     (net/nettcp -> MacTCP -> BlueSCSI DaynaPORT), so you can run apps / real
 *     ssh from a machine that actually has them. The Plus<->mini hop is
 *     plaintext LAN TCP (real crypto is too slow for a 7.8MHz 68000); the mini
 *     does the real ssh onward.
 *
 * The shell core (tokenizer + dispatch + builtins) lives in shell.inc and is
 * host-tested by shtest.c. This file supplies the Mac console, the HFS-backed
 * filesystem ops, and the network plumbing.
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
#include <Files.h>
#include <SegLoad.h>
#include <TextUtils.h>
#include <string.h>
#include "nettcp.h"
#include "ssh.h"                  /* real SSH-2 client (pssh) */
#include "scp.inc"               /* SCP file-transfer protocol */

#define MINI_IP   "192.168.7.50"
#define MINI_PORT 22              /* real SSH */

#ifndef monaco
#define monaco 4
#endif
#ifndef fsRtDirID
#define fsRtDirID 2
#endif
#ifndef fsRdPerm
#define fsRdPerm 1
#endif
#ifndef fsWrPerm
#define fsWrPerm 2
#endif
#ifndef fsFromStart
#define fsFromStart 1
#endif

#define kAppleMenu 128
#define kFileMenu  129
#define kFileQuit  1

/* ---- console: a ring of text lines + a live input line ---- */
#define NLINES 200
#define NCOLS  82
static char  gLines[NLINES][NCOLS + 1];
static short gLineLen[NLINES];
static short gHead = 0;       /* index of the current (last) line */
static short gCount = 1;      /* lines in use */
static short gTopVisible = 0; /* scroll offset (0 = bottom) */

static char  gInput[256];
static short gInputLen = 0;

static WindowPtr  gWin;
static MenuHandle gAppleM, gFileM;
static Boolean    gDone = false;

/* mode: local shell vs. connected to a remote host */
static Boolean  gRemote = false;
static NetConn  gConn;
static short    gEsc = 0;            /* ANSI state: 0 normal, 1 ESC, 2 in CSI */
static char     gRemHost[64] = MINI_IP;
static unsigned short gRemPort = MINI_PORT;
static char     gSshUser[64] = "admin";
static Boolean  gSshConnecting = false;   /* SSH handshake in progress */
static Boolean  gPwPrompt = false;        /* collecting the password */
static short    gKexPct = 0;              /* 0..100 kex progress */
static char     gSshPass[80];
static short    gSshPassLen = 0;
/* scp transfer state */
static Boolean  gScpMode = false;         /* this connection is an scp transfer */
static Boolean  gScpStarted = false;
static Boolean  gScpPending = false;      /* queued behind the password prompt */
static int      gScpIsGet = 0;
static char     gScpLocal[128], gScpRemote[128];
static ScpCtx   gScp;
static short    gScpRef;                   /* open local HFS file */
static char     gScpExec[300];

/* ---- forward decls for the shell core ---- */
void PxOut(const char *s);
void PxOutLn(const char *s);
void PxDate(char *out, short cap);
long PxFreeMem(void);

/* ================= console ================= */

static void NewLine(void)
{
    gHead = (gHead + 1) % NLINES;
    gLineLen[gHead] = 0;
    gLines[gHead][0] = 0;
    if (gCount < NLINES) gCount++;
}

static void PutCh(char c)
{
    if (c == '\n') { NewLine(); return; }
    if (c == '\t') { PutCh(' '); PutCh(' '); return; }
    if (c < 32) return;                       /* drop other control chars */
    if (gLineLen[gHead] >= NCOLS) NewLine();   /* wrap */
    gLines[gHead][gLineLen[gHead]++] = c;
    gLines[gHead][gLineLen[gHead]] = 0;
}

void PxOut(const char *s)   { while (*s) PutCh(*s++); }
void PxOutLn(const char *s) { PxOut(s); PutCh('\n'); }

static void Prompt(char *out, short cap)
{
    char cwd[256]; short n = 0; short i;
    extern void FsPwd(char *, short);
    FsPwd(cwd, sizeof(cwd));
    { const char *p = "plutonix:"; while (*p && n < cap-1) out[n++] = *p++; }
    for (i = 0; cwd[i] && n < cap - 4; i++) out[n] = cwd[i], n++;
    { const char *p = " % "; while (*p && n < cap-1) out[n++] = *p++; }
    out[n] = 0;
}

static void DrawConsole(void)
{
    Rect r; short rows, y, i, idx, first;
    FontInfo fi;
    SetPort(gWin);
    r = gWin->portRect;
    EraseRect(&r);
    TextFont(monaco); TextSize(9);
    GetFontInfo(&fi);
    rows = (r.bottom - r.top) / (fi.ascent + fi.descent + fi.leading) - 1;
    if (rows < 1) rows = 1;

    /* the input line (prompt + typed text) is the last visible row in local mode */
    first = gCount - rows + 1 - gTopVisible;     /* +1 leaves room for input line */
    if (first < 0) first = 0;
    y = r.top + fi.ascent + 2;
    for (i = 0; i < rows && (first + i) < gCount; i++) {
        idx = (gHead - (gCount - 1) + (first + i) + NLINES * 4) % NLINES;
        MoveTo(r.left + 4, y);
        DrawText(gLines[idx], 0, gLineLen[idx]);
        y += fi.ascent + fi.descent + fi.leading;
    }
    if (gSshConnecting) {                       /* resumable kex: live progress, UI alive */
        char b[48]; short k; short bars = (short)(gKexPct * 20 / 100);
        MoveTo(r.left + 4, y);
        DrawText("key exchange [", 0, 14);
        for (k = 0; k < 20; k++) DrawChar(k < bars ? (char)0xC7 /* filled */ : '-');
        DrawText("] ", 0, 2);
        b[0] = (char)('0' + (gKexPct/100)%10); b[1] = (char)('0' + (gKexPct/10)%10); b[2] = (char)('0' + gKexPct%10); b[3] = '%'; b[4] = 0;
        DrawText(b, (gKexPct>=100)?0:1, (gKexPct>=100)?4:3);
    } else if (gPwPrompt) {
        short k;
        MoveTo(r.left + 4, y);
        DrawText("password: ", 0, 10);
        for (k = 0; k < gSshPassLen && k < 40; k++) DrawChar('*');
        DrawChar('_');
    } else if (!gRemote) {
        char pr[300];
        Prompt(pr, sizeof(pr));
        MoveTo(r.left + 4, y);
        DrawText(pr, 0, (short)strlen(pr));
        DrawText(gInput, 0, gInputLen);
        DrawChar('_');                         /* cheap cursor */
    }
}

/* ================= HFS filesystem (the shell's Fs* ops) ================= */
/* cwd is (vRefNum, dirID) + a display path. "/" = boot volume root (dirID 2). */
static short gCwdVRef = 0;       /* 0 = default volume */
static long  gCwdDir  = fsRtDirID;
static char  gCwdPath[256] = "/";

static void c2p(const char *c, Str255 p)
{ short n = 0; while (c[n] && n < 255) { p[n+1] = (unsigned char)c[n]; n++; } p[0] = (unsigned char)n; }
static void p2c(ConstStr255Param p, char *c)
{ short i, n = p[0]; for (i = 0; i < n; i++) c[i] = (char)p[i+1]; c[n] = 0; }

/* Look up `name` inside (vRef,dir). Fills *isDir and, if a dir, *childDir.
   Returns true if found. */
static Boolean FsLookup(short vRef, long dir, const char *name, Boolean *isDir, long *childDir)
{
    CInfoPBRec pb; Str255 pname;
    c2p(name, pname);
    pb.hFileInfo.ioNamePtr = pname;
    pb.hFileInfo.ioVRefNum = vRef;
    pb.hFileInfo.ioDirID = dir;
    pb.hFileInfo.ioFDirIndex = 0;            /* look up by name */
    if (PBGetCatInfoSync(&pb) != noErr) return false;
    *isDir = (pb.hFileInfo.ioFlAttrib & 0x10) != 0;
    if (*isDir) *childDir = pb.dirInfo.ioDrDirID;
    return true;
}

/* Parent dir of (vRef,dir). */
static long FsParent(short vRef, long dir)
{
    CInfoPBRec pb; Str255 nm;
    pb.dirInfo.ioNamePtr = nm;
    pb.dirInfo.ioVRefNum = vRef;
    pb.dirInfo.ioDrDirID = dir;
    pb.dirInfo.ioFDirIndex = -1;             /* info about the dir itself */
    if (PBGetCatInfoSync(&pb) != noErr) return dir;
    return pb.dirInfo.ioDrParID;
}

/* Resolve a path into either a directory (wantDir) or a leaf file's parent+name.
   Supports "/abs", "rel", "..", ".". Returns true on success. */
static Boolean FsResolve(const char *path, Boolean wantDir,
                         short *outVRef, long *outDir, char *outLeaf)
{
    char comp[64]; const char *p = path;
    short vRef = gCwdVRef; long dir = gCwdDir;
    if (path[0] == '/') { vRef = gCwdVRef; dir = fsRtDirID; p++; }
    if (outLeaf) outLeaf[0] = 0;

    while (*p) {
        short n = 0;
        while (*p == '/') p++;
        while (*p && *p != '/' && n < 63) comp[n++] = *p++;
        comp[n] = 0;
        if (n == 0) break;
        if (comp[0]=='.' && comp[1]==0) continue;
        if (comp[0]=='.' && comp[1]=='.' && comp[2]==0) { dir = FsParent(vRef, dir); continue; }
        /* peek: is there more after this component? */
        { const char *q = p; while (*q == '/') q++;
          if (*q == 0 && !wantDir && outLeaf) { /* last component, want a file leaf */
              short i; for (i = 0; comp[i]; i++) outLeaf[i] = comp[i]; outLeaf[i] = 0;
              *outVRef = vRef; *outDir = dir; return true;
          }
        }
        { Boolean isDir; long child;
          if (!FsLookup(vRef, dir, comp, &isDir, &child)) return false;
          if (!isDir) {
              if (wantDir) return false;
              if (outLeaf) { short i; for (i=0; comp[i]; i++) outLeaf[i]=comp[i]; outLeaf[i]=0; }
              *outVRef = vRef; *outDir = dir; return true;   /* file leaf */
          }
          dir = child;
        }
    }
    *outVRef = vRef; *outDir = dir; if (outLeaf) outLeaf[0] = 0;
    return true;
}

/* rebuild gCwdPath from the chain of parents (for display) */
static void FsRebuildPath(void)
{
    char parts[16][64]; short np = 0; short i;
    short vRef = gCwdVRef; long dir = gCwdDir;
    char tmp[256]; short n = 0;
    while (dir != fsRtDirID && np < 16) {
        CInfoPBRec pb; Str255 nm; long par;
        pb.dirInfo.ioNamePtr = nm; pb.dirInfo.ioVRefNum = vRef;
        pb.dirInfo.ioDrDirID = dir; pb.dirInfo.ioFDirIndex = -1;
        if (PBGetCatInfoSync(&pb) != noErr) break;
        p2c(nm, parts[np]); np++;
        par = pb.dirInfo.ioDrParID;
        if (par == dir) break;
        dir = par;
    }
    if (np == 0) { gCwdPath[0] = '/'; gCwdPath[1] = 0; return; }
    for (i = np - 1; i >= 0; i--) {
        short k; tmp[n++] = '/';
        for (k = 0; parts[i][k] && n < 254; k++) tmp[n++] = parts[i][k];
    }
    tmp[n] = 0;
    { short k; for (k = 0; tmp[k]; k++) gCwdPath[k] = tmp[k]; gCwdPath[k] = 0; }
}

void FsPwd(char *out, short cap)
{ short i; for (i = 0; gCwdPath[i] && i < cap-1; i++) out[i] = gCwdPath[i]; out[i] = 0; }

short FsChdir(const char *path)
{
    short vRef; long dir;
    if (!FsResolve(path, true, &vRef, &dir, 0)) return -1;
    gCwdVRef = vRef; gCwdDir = dir;
    FsRebuildPath();
    return 0;
}

/* FsListInto / FsReadInto / FsWriteFrom take a PxBuf, so they live just after
   #include "shell.inc" (where PxBuf is defined). */

short FsMkdir(const char *path)
{
    short vRef; long dir; char leaf[64]; Str255 pname; HParamBlockRec hp;
    if (!FsResolve(path, false, &vRef, &dir, leaf) || leaf[0] == 0) return -1;
    c2p(leaf, pname);
    hp.ioParam.ioNamePtr = pname; hp.ioParam.ioVRefNum = vRef; hp.fileParam.ioDirID = dir;
    return (PBDirCreateSync(&hp) == noErr) ? 0 : -1;
}

short FsRemove(const char *path)
{
    short vRef; long dir; char leaf[64]; Str255 pname; HParamBlockRec hp;
    if (!FsResolve(path, false, &vRef, &dir, leaf) || leaf[0] == 0) return -1;
    c2p(leaf, pname);
    hp.ioParam.ioNamePtr = pname; hp.ioParam.ioVRefNum = vRef; hp.fileParam.ioDirID = dir;
    return (PBHDeleteSync(&hp) == noErr) ? 0 : -1;
}

/* ---- environment builtins ---- */
void PxDate(char *out, short cap)
{
    unsigned long secs; Str255 ds, ts; char cd[64], ct[64]; short n = 0, i;
    GetDateTime(&secs);
    IUDateString(secs, abbrevDate, ds);
    IUTimeString(secs, false, ts);
    p2c(ds, cd); p2c(ts, ct);
    for (i = 0; cd[i] && n < cap-2; i++) out[n++] = cd[i];
    out[n++] = ' ';
    for (i = 0; ct[i] && n < cap-1; i++) out[n++] = ct[i];
    out[n] = 0;
}

long PxFreeMem(void) { return (long)FreeMem(); }

/* the shell calls this when `ssh [user@]host` / `mini` is run, before returning 1.
   parses an optional "user@" prefix into gSshUser. */
void PxSetRemote(const char *host, unsigned short port)
{
    short i = 0, at = -1; short j;
    for (j = 0; host[j]; j++) if (host[j] == '@') { at = j; break; }
    if (at >= 0) {
        for (j = 0; j < at && j < 63; j++) gSshUser[j] = host[j];
        gSshUser[j] = 0;
        host += at + 1;
    }
    while (host[i] && i < 63) { gRemHost[i] = host[i]; i++; }
    gRemHost[i] = 0; gRemPort = port;
}

/* the shell calls this for `put`/`get` (with PxSetRemote for host), then returns 3. */
void PxSetScp(int isGet, const char *local, const char *remote)
{
    short i;
    gScpIsGet = isGet;
    for (i = 0; local[i]  && i < 127; i++) gScpLocal[i]  = local[i];  gScpLocal[i]  = 0;
    for (i = 0; remote[i] && i < 127; i++) gScpRemote[i] = remote[i]; gScpRemote[i] = 0;
}

#include "shell.inc"

/* ================= HFS filesystem ops that emit into a PxBuf ================= */
short FsListInto(const char *path, PxBuf *out)
{
    short vRef = gCwdVRef; long dir = gCwdDir; short idx;
    if (path && path[0]) { if (!FsResolve(path, true, &vRef, &dir, 0)) return -1; }
    for (idx = 1; ; idx++) {
        CInfoPBRec pb; Str255 nm; char cname[64];
        pb.hFileInfo.ioNamePtr = nm;
        pb.hFileInfo.ioVRefNum = vRef;
        pb.hFileInfo.ioDirID = dir;
        pb.hFileInfo.ioFDirIndex = idx;
        if (PBGetCatInfoSync(&pb) != noErr) break;     /* end of directory */
        p2c(nm, cname);
        BufPutS(out, cname);
        if (pb.hFileInfo.ioFlAttrib & 0x10) BufPutC(out, '/');
        BufPutC(out, '\n');
    }
    return 0;
}

long FsReadInto(const char *path, PxBuf *out)
{
    short vRef; long dir; char leaf[64]; Str255 pname;
    short ref; long count; long total = 0; char buf[512];
    if (!FsResolve(path, false, &vRef, &dir, leaf) || leaf[0] == 0) return -1;
    c2p(leaf, pname);
    { HParamBlockRec hp;
      hp.ioParam.ioNamePtr = pname; hp.ioParam.ioVRefNum = vRef;
      hp.fileParam.ioDirID = dir; hp.ioParam.ioPermssn = fsRdPerm; hp.ioParam.ioMisc = 0;
      if (PBHOpenSync(&hp) != noErr) return -1;
      ref = hp.ioParam.ioRefNum;
    }
    for (;;) {
        short i; count = sizeof(buf);
        if (FSRead(ref, &count, buf) != noErr && count == 0) break;
        for (i = 0; i < (short)count; i++) BufPutC(out, buf[i]);
        total += count;
        if (count < (long)sizeof(buf)) break;
    }
    FSClose(ref);
    return total;
}

short FsWriteFrom(const char *path, const char *b, long n, short append)
{
    short vRef; long dir; char leaf[64]; Str255 pname; short ref; long cnt;
    if (!FsResolve(path, false, &vRef, &dir, leaf) || leaf[0] == 0) return -1;
    c2p(leaf, pname);
    {   HParamBlockRec hp;
        /* create (ignore dup), then open for write */
        hp.ioParam.ioNamePtr = pname; hp.ioParam.ioVRefNum = vRef;
        hp.fileParam.ioDirID = dir; hp.ioParam.ioMisc = 0;
        (void)PBHCreateSync(&hp);
        hp.ioParam.ioNamePtr = pname; hp.ioParam.ioVRefNum = vRef;
        hp.fileParam.ioDirID = dir; hp.ioParam.ioPermssn = fsWrPerm; hp.ioParam.ioMisc = 0;
        if (PBHOpenSync(&hp) != noErr) return -1;
        ref = hp.ioParam.ioRefNum;
    }
    if (append) { long eof = 0; GetEOF(ref, &eof); SetFPos(ref, fsFromStart, eof); }
    else SetEOF(ref, 0);
    cnt = n;
    FSWrite(ref, &cnt, (Ptr)b);
    FSClose(ref);
    return 0;
}

/* ================= remote (SSH) mode ================= */
/* gRemote = SSH shell live; gSshConnecting = handshake (resumable kex) in
   progress; gPwPrompt = collecting the password. */
static ssh_client *gSsh = 0;
static ssh_io      gSshIo;

/* weak entropy: a 68000 has no RNG. Mix TickCount per byte. (Documented: this
   weakens forward secrecy of the ephemeral key; the session is still encrypted.) */
static void PxRandom(uint8_t *o, size_t n)
{
    static unsigned long st = 0x1a2b3c4dUL;
    size_t i;
    for (i = 0; i < n; i++) { st = st * 1103515245UL + 12345UL + (unsigned long)TickCount(); o[i] = (uint8_t)(st >> 17); }
}

static void FeedRemote(const unsigned char *b, short n)  /* ANSI-strip + console */
{
    short i;
    for (i = 0; i < n; i++) {
        unsigned char c = b[i];
        if (gEsc == 1) { gEsc = (c == '[') ? 2 : 0; continue; }
        if (gEsc == 2) { if (c >= '@' && c <= '~') gEsc = 0; continue; }
        if (c == 27) { gEsc = 1; continue; }
        if (c == '\r') continue;
        if (c == 7) continue;
        if (c == 8) { if (gLineLen[gHead] > 0) { gLineLen[gHead]--; gLines[gHead][gLineLen[gHead]] = 0; } continue; }
        PutCh((char)c);
    }
}

/* ssh io callbacks */
static int  sshSend(void *u, const uint8_t *d, size_t n) { (void)u; return (NetSend(&gConn, d, (unsigned short)n) == noErr) ? (int)n : -1; }
static void sshOnData(void *u, const uint8_t *d, size_t n) { (void)u;
    if (gScpMode) scp_feed(&gScp, d, (uint32_t)n); else FeedRemote(d, (short)n); }
/* scp protocol callbacks */
static int  scpEmit(void *u, const uint8_t *d, uint32_t n) { (void)u; return ssh_send_data(gSsh, d, n) >= 0 ? 0 : -1; }
static long scpFread(void *u, uint8_t *buf, long max) { long c = max; (void)u; if (FSRead(gScpRef, &c, buf) != noErr && c == 0) return 0; return c; }
static int  scpFwrite(void *u, const uint8_t *d, long n) { long c = n; (void)u; return (FSWrite(gScpRef, &c, (Ptr)d) == noErr) ? 0 : -1; }
static void sshStatus(void *u, const char *m) { (void)u; PxOutLn(m); }
static void sshRand(void *u, uint8_t *o, size_t n) { (void)u; PxRandom(o, n); }

/* trust-on-first-use host-key store: file "Plutonix Hosts" in the System Folder.
   record = 64-byte host (NUL-padded) + 32-byte key = 96 bytes.
   returns 1 = known & matches, 0 = new (remembered), -1 = CHANGED (reject). */
#define HK_REC 96
static int sshCheckHost(void *u, const uint8_t key[32])
{
    SysEnvRec se; short vref, ref; OSErr e; long count; short i;
    unsigned char rec[HK_REC]; char host[64];
    (void)u;
    for (i = 0; i < 64; i++) host[i] = 0;
    for (i = 0; gRemHost[i] && i < 63; i++) host[i] = gRemHost[i];
    SysEnvirons(1, &se); vref = se.sysVRefNum;
    e = FSOpen("\pPlutonix Hosts", vref, &ref);
    if (e != noErr) {                                   /* first ever: create it */
        if (Create("\pPlutonix Hosts", vref, 'PLTX', 'pkhs') != noErr) return 0;
        if (FSOpen("\pPlutonix Hosts", vref, &ref) != noErr) return 0;
    }
    for (;;) {                                          /* scan existing records */
        count = HK_REC;
        if (FSRead(ref, &count, rec) != noErr || count < HK_REC) break;
        if (memcmp(rec, host, 64) == 0) {
            FSClose(ref);
            return (memcmp(rec + 64, key, 32) == 0) ? 1 : -1;
        }
    }
    { long end; GetEOF(ref, &end); SetFPos(ref, fsFromStart, end);   /* append (TOFU) */
      memcpy(rec, host, 64); memcpy(rec + 64, key, 32);
      count = HK_REC; FSWrite(ref, &count, rec); }
    FSClose(ref);
    PxOutLn("(new host key remembered)");
    return 0;
}

/* load an optional Ed25519 identity (32-byte seed) from "Plutonix Identity" in
   the System Folder; enables public-key auth (tried before the password). */
static void LoadIdentity(ssh_client *c)
{
    SysEnvRec se; short vref, ref; uint8_t seed[32]; long cnt = 32;
    SysEnvirons(1, &se); vref = se.sysVRefNum;
    if (FSOpen("\pPlutonix Identity", vref, &ref) == noErr) {
        if (FSRead(ref, &cnt, seed) == noErr && cnt == 32) {
            ssh_set_identity(c, seed); PxOutLn("(using key identity)");
        }
        FSClose(ref);
    }
}

static void SshClose(const char *why)
{
    if (gSsh) { ssh_free(gSsh); gSsh = 0; }
    NetClose(&gConn);
    gRemote = false; gSshConnecting = false;
    if (why) { PxOutLn(""); PxOutLn(why); }
}

static void StartSSH(void)
{
    OSErr err; unsigned long ip;
    gPwPrompt = false; gSshPass[gSshPassLen] = 0;
    ip = NetParseIP(gRemHost);
    if (ip == 0) { PxOut("ssh: bad host: "); PxOutLn(gRemHost); return; }
    PxOut("ssh "); PxOut(gSshUser); PxOut("@"); PxOut(gRemHost); PxOutLn(" - connecting...");
    DrawConsole();
    err = NetConnect(&gConn, ip, gRemPort);
    if (err != noErr) { PxOut("ssh: "); PxOutLn((char *)NetErrStr(err)); return; }
    gSshIo.send = sshSend; gSshIo.on_data = sshOnData; gSshIo.on_status = sshStatus;
    gSshIo.get_random = sshRand; gSshIo.check_host = sshCheckHost; gSshIo.user = 0;
    gSsh = ssh_new(&gSshIo, gSshUser, gSshPass);
    if (!gSsh) { PxOutLn("ssh: out of memory"); NetClose(&gConn); return; }
    LoadIdentity(gSsh);
    gSshConnecting = true; gEsc = 0; gKexPct = 0;
}

/* open the local HFS file (in the cwd) for an scp transfer, connect, and arm the
   scp protocol. The transfer runs in the event loop (SshPump). */
static void StartSCP(void)
{
    OSErr err; unsigned long ip; short vRef; long dir; char leaf[64]; Str255 pn; HParamBlockRec hp;
    short k; const char *s;
    gPwPrompt = false; gScpPending = false; gSshPass[gSshPassLen] = 0;
    ip = NetParseIP(gRemHost);
    if (ip == 0) { PxOut("scp: bad host: "); PxOutLn(gRemHost); return; }
    if (!FsResolve(gScpLocal, false, &vRef, &dir, leaf) || leaf[0] == 0) { PxOutLn("scp: bad local path"); return; }
    c2p(leaf, pn);
    if (gScpIsGet) {                                  /* create local file for writing */
        hp.ioParam.ioNamePtr = pn; hp.ioParam.ioVRefNum = vRef; hp.fileParam.ioDirID = dir; hp.ioParam.ioMisc = 0;
        (void)PBHCreateSync(&hp);
        hp.ioParam.ioNamePtr = pn; hp.ioParam.ioVRefNum = vRef; hp.fileParam.ioDirID = dir; hp.ioParam.ioPermssn = fsWrPerm; hp.ioParam.ioMisc = 0;
        if (PBHOpenSync(&hp) != noErr) { PxOutLn("scp: cannot create local file"); return; }
        gScpRef = hp.ioParam.ioRefNum; SetEOF(gScpRef, 0);
    } else {                                          /* open local file for reading */
        hp.ioParam.ioNamePtr = pn; hp.ioParam.ioVRefNum = vRef; hp.fileParam.ioDirID = dir; hp.ioParam.ioPermssn = fsRdPerm; hp.ioParam.ioMisc = 0;
        if (PBHOpenSync(&hp) != noErr) { PxOutLn("scp: cannot open local file"); return; }
        gScpRef = hp.ioParam.ioRefNum;
    }
    k = 0; s = gScpIsGet ? "scp -f " : "scp -t "; while (*s) gScpExec[k++] = *s++;
    s = gScpRemote; while (*s && k < 298) gScpExec[k++] = *s++; gScpExec[k] = 0;
    PxOut("scp "); PxOut(gScpIsGet ? "<- " : "-> "); PxOut(gSshUser); PxOut("@"); PxOut(gRemHost);
    PxOut(":"); PxOutLn(gScpRemote); DrawConsole();
    err = NetConnect(&gConn, ip, gRemPort);
    if (err != noErr) { PxOut("scp: "); PxOutLn((char *)NetErrStr(err)); FSClose(gScpRef); return; }
    gSshIo.send = sshSend; gSshIo.on_data = sshOnData; gSshIo.on_status = sshStatus;
    gSshIo.get_random = sshRand; gSshIo.check_host = sshCheckHost; gSshIo.user = 0;
    gSsh = ssh_new(&gSshIo, gSshUser, gSshPass);
    if (!gSsh) { PxOutLn("scp: out of memory"); NetClose(&gConn); FSClose(gScpRef); return; }
    LoadIdentity(gSsh);
    ssh_set_exec(gSsh, gScpExec);
    if (gScpIsGet) scp_get_init(&gScp, scpEmit, scpFwrite, 0);
    else { long sz = 0; GetEOF(gScpRef, &sz); SetFPos(gScpRef, fsFromStart, 0);
           scp_put_init(&gScp, scpEmit, scpFread, 0, gScpLocal, sz); }
    gScpMode = true; gScpStarted = false; gSshConnecting = true; gEsc = 0; gKexPct = 0;
}

static void SshPump(void)
{
    unsigned char buf[2048]; long avail, got; int r;
    if (!gSsh) return;
    avail = NetAvailable(&gConn);
    if (avail < 0) { SshClose("[connection closed - back in Plutonix]"); return; }
    if (avail > 0) {
        if (avail > (long)sizeof(buf)) avail = sizeof(buf);
        got = NetRecv(&gConn, buf, (unsigned short)avail, 1);
        if (got > 0) ssh_feed(gSsh, buf, (size_t)got);
    }
    r = ssh_pump(gSsh, 8);                 /* 8 ladder bits per pass -> smooth UI */
    if (gSshConnecting) {
        gKexPct = (short)((long)ssh_kex_progress(gSsh) * 100 / 255);
        if (r == 1) { gSshConnecting = false; if (!gScpMode) gRemote = true; }
    }
    if (gScpMode) {
        if (!gScpStarted && !gSshConnecting) { gScpStarted = true; scp_start(&gScp); }
        if (gScp.finished) {
            char b[24]; short k = 0; long v = gScp.moved;
            FSClose(gScpRef);
            if (gScp.error) PxOutLn("scp: transfer FAILED");
            else { char t[20]; short tn = 0; if (v == 0) t[tn++] = '0';
                   while (v) { t[tn++] = (char)('0' + v % 10); v /= 10; }
                   { const char *p = "scp: done ("; while (*p) b[k++] = *p++; }
                   while (tn) b[k++] = t[--tn]; b[k] = 0; PxOut(b); PxOutLn(" bytes)"); }
            gScpMode = false; SshClose(0);
            return;
        }
    }
    if (r < 0) {
        if (gScpMode) { FSClose(gScpRef); gScpMode = false; }
        PxOut("ssh: "); PxOutLn(ssh_error(gSsh)); SshClose(0);
    }
}

/* ================= input ================= */
static void RunLine(void)
{
    char line[256]; short i; short rc;
    for (i = 0; i < gInputLen; i++) line[i] = gInput[i];
    line[gInputLen] = 0;
    /* echo the prompt+command into the scrollback */
    { char pr[300]; Prompt(pr, sizeof(pr)); PxOut(pr); PxOut(line); PutCh('\n'); }
    gInputLen = 0; gInput[0] = 0;
    rc = ShRun(line);
    if (rc == 1) { gScpPending = false; gPwPrompt = true; gSshPassLen = 0; gSshPass[0] = 0; PxOut("password: "); }
    else if (rc == 2) { gHead = 0; gCount = 1; gLineLen[0] = 0; gLines[0][0] = 0; }
    else if (rc == 3) { gScpPending = true; gPwPrompt = true; gSshPassLen = 0; gSshPass[0] = 0; PxOut("password: "); }
}

static void KeyLocal(char c)
{
    if (c == 13 || c == 3) { RunLine(); return; }       /* Return / Enter */
    if (c == 8) { if (gInputLen > 0) gInputLen--; gInput[gInputLen] = 0; return; }
    if (c < 32) return;
    if (gInputLen < (short)sizeof(gInput) - 1) { gInput[gInputLen++] = c; gInput[gInputLen] = 0; }
}

static void KeyPassword(char c)
{
    if (c == 13 || c == 3) { PutCh('\n'); if (gScpPending) StartSCP(); else StartSSH(); return; }
    if (c == 27) { gPwPrompt = false; gScpPending = false; PxOutLn("(cancelled)"); return; }
    if (c == 8) { if (gSshPassLen > 0) gSshPassLen--; gSshPass[gSshPassLen] = 0; return; }
    if (c < 32) return;
    if (gSshPassLen < (short)sizeof(gSshPass) - 1) { gSshPass[gSshPassLen++] = c; gSshPass[gSshPassLen] = 0; }
}

static void KeyRemote(char c)
{
    char ch = c;
    if (c == 27) { SshClose("[disconnected - back in Plutonix]"); return; }   /* ESC = bail */
    if (c == 13 || c == 3) ch = '\r';
    if (gSsh) ssh_send_data(gSsh, (const uint8_t *)&ch, 1);
}

/* ================= menus / events ================= */
static void SetUpMenus(void)
{
    gAppleM = NewMenu(kAppleMenu, "\p\024"); AppendMenu(gAppleM, "\pAbout Plutonix"); AppendResMenu(gAppleM, 'DRVR'); InsertMenu(gAppleM, 0);
    gFileM  = NewMenu(kFileMenu, "\pFile"); AppendMenu(gFileM, "\pQuit/Q"); InsertMenu(gFileM, 0);
    DrawMenuBar();
}

static void DoMenu(long sel)
{
    short menu = HiWord(sel), item = LoWord(sel); Str255 nm;
    if (menu == kAppleMenu) {
        if (item == 1) { PxOutLn(""); PxOutLn(PX_VERSION " - a Unix subsystem for the Macintosh Plus."); }
        else { GetMenuItemText(gAppleM, item, nm); OpenDeskAcc(nm); }
    } else if (menu == kFileMenu && item == kFileQuit) gDone = true;
    HiliteMenu(0);
}

int main(void)
{
    EventRecord ev; Rect b; char pr[300];

    InitGraf(&qd.thePort); InitFonts(); InitWindows(); InitMenus();
    TEInit(); InitDialogs(0L); InitCursor();
    SetUpMenus();
    SetRect(&b, 6, 42, 506, 336);
    gWin = NewWindow(0L, &b, "\pPlutonix", true, noGrowDocProc, (WindowPtr)-1L, false, 0);
    SetPort(gWin);

    gLineLen[0] = 0; gLines[0][0] = 0;
    FsChdir("/");
    PxOutLn(PX_VERSION " - type 'help', or 'ssh' for a shell on the mini.");
    PxOutLn("");

    while (!gDone) {
        Boolean busy = gRemote || gSshConnecting || gScpMode;
        if (WaitNextEvent(everyEvent, &ev, busy ? 1L : 8L, 0L)) {
            switch (ev.what) {
                case updateEvt: BeginUpdate(gWin); DrawConsole(); EndUpdate(gWin); break;
                case keyDown:
                case autoKey: {
                    char c = ev.message & charCodeMask;
                    if ((ev.modifiers & cmdKey) && !gRemote && !gPwPrompt && !gScpMode) { DoMenu(MenuKey(c)); break; }
                    if (gPwPrompt) KeyPassword(c);
                    else if (gScpMode) { if (c == 27) { FSClose(gScpRef); gScpMode = false; SshClose("[scp cancelled]"); } }
                    else if (gRemote) KeyRemote(c);
                    else if (gSshConnecting) { if (c == 27) SshClose("[cancelled]"); }
                    else KeyLocal(c);
                    DrawConsole();
                    break;
                }
                case mouseDown: {
                    WindowPtr w; short part = FindWindow(ev.where, &w);
                    if (part == inMenuBar) DoMenu(MenuSelect(ev.where));
                    else if (part == inDrag) DragWindow(w, ev.where, &qd.screenBits.bounds);
                    break;
                }
            }
        }
        if (gRemote || gSshConnecting || gScpMode) { SshPump(); DrawConsole(); }
    }
    if (gSsh) ssh_free(gSsh);
    if (gRemote || gSshConnecting || gScpMode) NetClose(&gConn);
    return 0;
}
