/*
 * MuxDemo - proves the Macinclaude multiplexer end to end: ONE dialed
 * connection, TWO logical channels at once.
 *   channel 0 -> "talk"  (the Talking Plus agent: send WAKE, show his reply)
 *   channel 1 -> "diag"  (the diagnostic sink: stream log lines)
 * If both work over a single connection, the "share one always-on link"
 * capability is real - the resident .WIFI driver later just makes this
 * connection persist across app launches.
 *
 * Dials the mux (default 192.168.7.50:2330). For emulator testing, vmodem's
 * MNVM_REDIRECT points that at the local mux.
 */

#include <Quickdraw.h>
#include <Windows.h>
#include <Menus.h>
#include <Fonts.h>
#include <Events.h>
#include <TextEdit.h>
#include <Dialogs.h>
#include <ToolUtils.h>
#include <Memory.h>
#include <OSUtils.h>
#include <Devices.h>
#include <Files.h>
#include <Serial.h>
#include <SegLoad.h>

#ifndef monaco
#define monaco 4
#endif
#ifndef systemFont
#define systemFont 0
#endif

#define kAppleMenu 128
#define kFileMenu  129
#define kMuxMenu   130
#define kFileQuit 1
#define kMuxWake  1
#define kMuxDiag  2

#define WIN_W 496
#define WIN_H 300
#define MUX_HOST "192.168.7.50"
#define MUX_PORT 2330
static const short kBaud = baud9600 + data8 + noParity + stop10;

#define CH_TALK 0
#define CH_DIAG 1

static WindowPtr  gWin;
static MenuHandle gAppleM, gFileM, gMuxM;
static Boolean    gDone = false;
static short      gInRef, gOutRef;
static Boolean    gPortOpen = false, gConnected = false;
static char       gSerRing[4096], gSerBuf[2048];
static unsigned char gCap[1024];

/* per-channel received-text accumulator (for the talk channel display) */
#define TALK_MAX 1200
static char  gTalk[TALK_MAX + 1];
static short gTalkLen = 0;
static short gDiagReplies = 0;       /* count of bytes seen on diag channel */
static char  gStatus[80];

/* ---- helpers ---- */
static void StrLenL(const char *s, long *n) { long i=0; while(s[i])i++; *n=i; }
static void CatS(char *b, short *n, const char *s){ short i; for(i=0;s[i];i++) b[(*n)++]=s[i]; }
static void CatN(char *b, short *n, long v){ char t[12]; short k=0; if(v==0)t[k++]='0'; while(v>0){t[k++]=(char)('0'+v%10); v/=10;} while(k)b[(*n)++]=t[--k]; }
static void C2Pp(const char *c, Str255 p){ short n=0; while(c[n]&&n<255){p[n+1]=(unsigned char)c[n];n++;} p[0]=(unsigned char)n; }
static Boolean Has(const unsigned char *b, short len, const char *nd){ short i; long nl; StrLenL(nd,&nl); if(nl==0||len<(short)nl)return false; for(i=0;i+(short)nl<=len;i++){short j;Boolean h=true;for(j=0;j<(short)nl;j++)if(b[i+j]!=(unsigned char)nd[j]){h=false;break;}if(h)return true;} return false; }
static short FindAfter(const unsigned char *b, short len, const char *nd){ short i; long nl; StrLenL(nd,&nl); if(nl==0||len<(short)nl)return -1; for(i=0;i+(short)nl<=len;i++){short j;Boolean h=true;for(j=0;j<(short)nl;j++)if(b[i+j]!=(unsigned char)nd[j]){h=false;break;}if(h)return (short)(i+(short)nl);} return -1; }

static void SetStat(const char *m){ Str255 t; short n=0; char b[100]; short i; for(i=0;m&&m[i]&&i<79;i++)gStatus[i]=m[i]; gStatus[i]=0; CatS(b,&n,"MuxDemo"); if(m&&m[0]){CatS(b,&n," - ");CatS(b,&n,m);} b[n]=0; C2Pp(b,t); if(gWin)SetWTitle(gWin,t); }

/* ---- serial ---- */
static void SendBytes(const char *s, long n){ long c=n; if(gPortOpen) FSWrite(gOutRef,&c,(Ptr)s); }
static void MuxSendRaw(const char *bytes, long n){ SendBytes(bytes, n); }   /* muxclient.inc hook */
static void Drain(void){ long a,c; if(!gPortOpen)return; while(SerGetBuf(gInRef,&a)==noErr&&a>0){c=a;if(c>(long)sizeof(gSerBuf))c=sizeof(gSerBuf);FSRead(gInRef,&c,gSerBuf);} }
static short CaptureFor(short ticks, unsigned char *out, short cap){ unsigned long dl=TickCount()+(unsigned long)ticks; short tot=0; long a,c; while((long)(TickCount()-dl)<0){ if(SerGetBuf(gInRef,&a)==noErr&&a>0){c=a;if(c>(long)sizeof(gSerBuf))c=sizeof(gSerBuf);if(FSRead(gInRef,&c,gSerBuf)==noErr){short i;for(i=0;i<(short)c;i++)if(tot<cap)out[tot++]=(unsigned char)gSerBuf[i];}}} return tot; }

static Boolean OpenSerial(void){ SerShk shk; if(gPortOpen)return true; if(OpenDriver("\p.AOut",&gOutRef)!=noErr)return false; if(OpenDriver("\p.AIn",&gInRef)!=noErr)return false; SerSetBuf(gInRef,(Ptr)gSerRing,(short)sizeof(gSerRing)); SerReset(gOutRef,kBaud);SerReset(gInRef,kBaud); shk.fXOn=0;shk.fCTS=0;shk.xOn=0;shk.xOff=0;shk.errs=0;shk.evts=0;shk.fInX=0;shk.null=0; SerHShake(gOutRef,&shk); gPortOpen=true; return true; }

/* ---- mux_rx callbacks: route channel data ---- */
static void MuxData(short chan, const unsigned char *bytes, short n)
{
    short i;
    if (chan == CH_TALK) {
        for (i = 0; i < n && gTalkLen < TALK_MAX; i++) {
            char c = (char)bytes[i];
            if (c == '\r') continue;            /* keep it readable */
            gTalk[gTalkLen++] = c;
        }
        gTalk[gTalkLen] = 0;
    } else if (chan == CH_DIAG) {
        gDiagReplies += n;                      /* diag sink usually silent; count anything */
    }
}
static void MuxClosed(short chan) { (void)chan; }
static void MuxErr(short chan, const char *msg) { (void)chan; SetStat(msg); }
static void MuxPing(void);   /* fwd */

#include "mux_rx.inc"
#include "muxclient.inc"

static MuxRx gRx;
static void MuxPing(void) { MuxPong(); }   /* answer keepalive */
static void FeedByteToRx(unsigned char b);  /* fwd */

static void Pump(void)
{
    long a, c; short i;
    if (!gPortOpen) return;
    if (SerGetBuf(gInRef, &a) != noErr || a <= 0) return;
    c = a; if (c > (long)sizeof(gSerBuf)) c = sizeof(gSerBuf);
    if (FSRead(gInRef, &c, gSerBuf) != noErr) return;
    MuxRxFeed(&gRx, (const unsigned char *)gSerBuf, (short)c);
}

static void DrawScreen(void)
{
    Rect r; short y, i, lineStart;
    SetPort(gWin); SetRect(&r,0,0,WIN_W,WIN_H); EraseRect(&r);
    TextFont(systemFont); TextFace(bold); TextSize(12);
    MoveTo(10,18); DrawString("\pMux Demo - one connection, two channels");
    TextFace(0); TextSize(9); TextFont(monaco);
    MoveTo(10,38);
    { Str255 p; char b[80]; short n=0; CatS(b,&n,"ch0 talk | ch1 diag bytes="); CatN(b,&n,(long)gDiagReplies); b[n]=0; C2Pp(b,p); DrawString(p); }
    /* talk channel text, wrapped crudely at ~76 cols */
    TextFont(monaco); TextSize(9);
    y = 60; lineStart = 0;
    for (i = 0; i <= gTalkLen; i++) {
        if (i == gTalkLen || gTalk[i] == '\n' || (i - lineStart) >= 76) {
            MoveTo(10, y); DrawText(gTalk, lineStart, i - lineStart); y += 11;
            lineStart = (i < gTalkLen && gTalk[i] == '\n') ? i + 1 : i;
            if (y > WIN_H - 12) break;
        }
    }
}

static Boolean DialMux(void)
{
    char cmd[64]; short n=0, got, tries;
    if (!OpenSerial()) { SetStat("no serial port"); return false; }
    SetStat("connecting...");
    for (tries=0;tries<3;tries++){ Drain(); SendBytes("AT\r",3); got=CaptureFor(90,gCap,sizeof(gCap)); if(Has(gCap,got,"OK"))break; }
    if (tries==3){ SetStat("modem no OK"); return false; }
    CatS(cmd,&n,"ATDT\""); CatS(cmd,&n,MUX_HOST); CatS(cmd,&n,":"); CatN(cmd,&n,(long)MUX_PORT); CatS(cmd,&n,"\"\r"); cmd[n]=0;
    Drain(); SendBytes(cmd, n);
    {
        unsigned long dl = TickCount() + 600; short tot = 0;
        while ((long)(TickCount()-dl) < 0) {
            long av,cc; if (SerGetBuf(gInRef,&av)==noErr && av>0){cc=av;if(cc>(long)sizeof(gSerBuf))cc=sizeof(gSerBuf);if(FSRead(gInRef,&cc,gSerBuf)==noErr){short i;for(i=0;i<(short)cc;i++)if(tot<(short)sizeof(gCap))gCap[tot++]=(unsigned char)gSerBuf[i];}}
            { short past=FindAfter(gCap,tot,"CONNECT"); if(past>=0){ short i; gConnected=true; SetStat("connected"); MuxRxInit(&gRx); for(i=past;i<tot;i++)FeedByteToRx(gCap[i]); return true; } }
            if (Has(gCap,tot,"NO CARRIER")||Has(gCap,tot,"BUSY")){ SetStat("no answer - mux up?"); return false; }
        }
    }
    SetStat("silence - check WiFi/mux");
    return false;
}

/* feed leftover post-CONNECT bytes through the parser */
static void FeedByteToRx(unsigned char b){ MuxRxFeed(&gRx, &b, 1); }

static void DoWake(void)
{
    if (!gConnected) { SetStat("not connected"); SysBeep(1); return; }
    gTalkLen = 0; gTalk[0] = 0;
    MuxOpen(CH_TALK, "talk");
    MuxSendLine(CH_TALK, "WAKE");
    SetStat("asked talk agent (ch0)...");
}
static void DoDiag(void)
{
    if (!gConnected) { SetStat("not connected"); SysBeep(1); return; }
    MuxOpen(CH_DIAG, "127.0.0.1:2331");
    MuxSendLine(CH_DIAG, "MUX1  hello from the Plus over channel 1");
    MuxSendLine(CH_DIAG, "MUX1  two channels, one connection - it works");
    SetStat("streamed 2 lines to diag (ch1)");
}

static void DoMenu(long sel)
{
    short menu=HiWord(sel), item=LoWord(sel); Str255 nm;
    if(menu==kAppleMenu){ if(item!=1){GetMenuItemText(gAppleM,item,nm);OpenDeskAcc(nm);} }
    else if(menu==kFileMenu){ if(item==kFileQuit)gDone=true; }
    else if(menu==kMuxMenu){ if(item==kMuxWake)DoWake(); else if(item==kMuxDiag)DoDiag(); }
    HiliteMenu(0); DrawScreen();
}
static void HandleEvent(EventRecord *ev)
{
    WindowPtr w; char ch;
    switch(ev->what){
        case mouseDown: switch(FindWindow(ev->where,&w)){ case inMenuBar:DoMenu(MenuSelect(ev->where));break; case inSysWindow:SystemClick(ev,w);break; case inDrag:DragWindow(w,ev->where,&qd.screenBits.bounds);break; } break;
        case keyDown: ch=ev->message&charCodeMask; if(ev->modifiers&cmdKey){long s=MenuKey(ch);if(HiWord(s))DoMenu(s);} break;
        case updateEvt:{WindowPtr u=(WindowPtr)ev->message;BeginUpdate(u);if(u==gWin)DrawScreen();EndUpdate(u);break;}
    }
}

static void SetUp(void)
{
    Str255 at; Rect r; short left;
    InitGraf(&qd.thePort);InitFonts();InitWindows();InitMenus();TEInit();InitDialogs(0L);InitCursor();FlushEvents(everyEvent,0);
    at[0]=1;at[1]=0x14;
    gAppleM=NewMenu(kAppleMenu,at);AppendMenu(gAppleM,"\pAbout MuxDemo");AppendMenu(gAppleM,"\p(-");AppendResMenu(gAppleM,'DRVR');InsertMenu(gAppleM,0);
    gFileM=NewMenu(kFileMenu,"\pFile");AppendMenu(gFileM,"\pQuit/Q");InsertMenu(gFileM,0);
    gMuxM=NewMenu(kMuxMenu,"\pMux");AppendMenu(gMuxM,"\pWake Talk Agent (ch0)/W;Stream to Diag (ch1)/D");InsertMenu(gMuxM,0);
    DrawMenuBar();
    left=(qd.screenBits.bounds.right-WIN_W)/2;
    SetRect(&r,left,40,left+WIN_W,40+WIN_H);
    gWin=NewWindow(0L,&r,"\pMuxDemo",true,documentProc,(WindowPtr)-1L,false,0);
    SetPort(gWin);
}

int main(void)
{
    EventRecord ev;
    SetUp();
    DialMux();
    DrawScreen();
    while(!gDone){
        long sleep = gConnected ? 2L : 15L;
        if(WaitNextEvent(everyEvent,&ev,sleep,0L)) HandleEvent(&ev);
        if(gConnected){ Pump(); DrawScreen(); }
    }
    if(gConnected){ MuxClose(CH_TALK); MuxClose(CH_DIAG); }
    if(gPortOpen){ CloseDriver(gInRef); CloseDriver(gOutRef); }
    return 0;
}
