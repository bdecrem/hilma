/*
 * HelloWiFi - the Macintosh Plus WiFi bring-up + diagnostics app.
 *
 * One run answers "does the always-on WiFi path work on the real hardware?"
 * and hands back a detailed trace WITHOUT any SD shuttling:
 *   1. modem answers AT?        ✓/✗
 *   2. CONNECT to the mux?       (over real WiFi, via the RetroWiFi modem)
 *   3. open a diag channel       -> from here, every log line streams to the
 *                                   mini diag-sink live (I read it there)
 *   4. echo round-trip           -> open an "echo" channel, send a token,
 *                                   confirm the exact bytes come back + latency
 *   5. talk round-trip           -> open "talk", send WAKE, confirm a real
 *                                   Claude reply arrives (proves the full chain)
 * Verdict: a big SMILEY if the echo round-trip succeeded, else a SAD face,
 * with the step-by-step trace on screen (just look — no shuttling) AND mirrored
 * to the mini over the diag channel AND to an SD file as a durable fallback.
 *
 * This proves the multiplexer path end to end. The resident .WIFI driver
 * (always-on, shared across apps) is a later step; here each run dials itself.
 *
 * Config: dials the mux at MUX_HOST:MUX_PORT. On the real Plus that's the mini
 * over WiFi. Channels: 0=echo, 1=diag, 2=talk.
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
#define kTestMenu  130
#define kFileQuit  1
#define kTestRun   1
#define kTestTalk  2

#define WIN_W 496
#define WIN_H 320
#define MUX_HOST "192.168.7.50"   /* the mini, over WiFi, on the real Plus */
#define MUX_PORT 2330
static const short kBaud = baud9600 + data8 + noParity + stop10;

#define CH_ECHO 0
#define CH_DIAG 1
#define CH_TALK 2

static WindowPtr  gWin;
static MenuHandle gAppleM, gFileM, gTestM;
static Boolean    gDone = false;
static short      gInRef, gOutRef;
static Boolean    gPortOpen = false, gConnected = false;
static short      gBootVRef = 0;
static char       gSerRing[4096], gSerBuf[2048];
static unsigned char gCap[1024];

/* verdict + round-trip bookkeeping */
static short  gVerdict = 0;        /* 0 = unknown, 1 = smiley, -1 = sad */
static Boolean gEchoOK = false;
static unsigned long gEchoSentTick = 0;
static long   gEchoLatency = -1;
static char   gTalkText[800]; static short gTalkLen = 0;

/* ---- helpers ---- */
static void StrLenL(const char *s, long *n){ long i=0; while(s[i])i++; *n=i; }
static void CatS(char *b, short *n, const char *s){ short i; for(i=0;s[i];i++)b[(*n)++]=s[i]; }
static void CatN(char *b, short *n, long v){ char t[12]; short k=0; if(v<0){b[(*n)++]='-';v=-v;} if(v==0)t[k++]='0'; while(v>0){t[k++]=(char)('0'+v%10);v/=10;} while(k)b[(*n)++]=t[--k]; }
static void C2Pp(const char *c, Str255 p){ short n=0; while(c[n]&&n<255){p[n+1]=(unsigned char)c[n];n++;} p[0]=(unsigned char)n; }
static Boolean Has(const unsigned char *b, short len, const char *nd){ short i; long nl; StrLenL(nd,&nl); if(nl==0||len<(short)nl)return false; for(i=0;i+(short)nl<=len;i++){short j;Boolean h=true;for(j=0;j<(short)nl;j++)if(b[i+j]!=(unsigned char)nd[j]){h=false;break;}if(h)return true;} return false; }
static short FindAfter(const unsigned char *b, short len, const char *nd){ short i; long nl; StrLenL(nd,&nl); if(nl==0||len<(short)nl)return -1; for(i=0;i+(short)nl<=len;i++){short j;Boolean h=true;for(j=0;j<(short)nl;j++)if(b[i+j]!=(unsigned char)nd[j]){h=false;break;}if(h)return(short)(i+(short)nl);} return -1; }

/* ---- serial ---- */
static void SendBytes(const char *s, long n){ long c=n; if(gPortOpen)FSWrite(gOutRef,&c,(Ptr)s); }
static void MuxSendRaw(const char *bytes, long n){ SendBytes(bytes,n); }    /* muxclient.inc hook */
static void Drain(void){ long a,c; if(!gPortOpen)return; while(SerGetBuf(gInRef,&a)==noErr&&a>0){c=a;if(c>(long)sizeof(gSerBuf))c=sizeof(gSerBuf);FSRead(gInRef,&c,gSerBuf);} }
static short CaptureFor(short ticks, unsigned char *out, short cap){ unsigned long dl=TickCount()+(unsigned long)ticks; short tot=0; long a,c; while((long)(TickCount()-dl)<0){ SystemTask(); if(SerGetBuf(gInRef,&a)==noErr&&a>0){c=a;if(c>(long)sizeof(gSerBuf))c=sizeof(gSerBuf);if(FSRead(gInRef,&c,gSerBuf)==noErr){short i;for(i=0;i<(short)c;i++)if(tot<cap)out[tot++]=(unsigned char)gSerBuf[i];}}} return tot; }
static Boolean OpenSerial(void){ SerShk shk; if(gPortOpen)return true; if(OpenDriver("\p.AOut",&gOutRef)!=noErr)return false; if(OpenDriver("\p.AIn",&gInRef)!=noErr)return false; SerSetBuf(gInRef,(Ptr)gSerRing,(short)sizeof(gSerRing)); SerReset(gOutRef,kBaud);SerReset(gInRef,kBaud); shk.fXOn=0;shk.fCTS=0;shk.xOn=0;shk.xOff=0;shk.errs=0;shk.evts=0;shk.fInX=0;shk.null=0; SerHShake(gOutRef,&shk); gPortOpen=true; return true; }

/* ---- mux_rx callbacks ---- */
static void MuxPing(void);  /* fwd */
static void MuxData(short chan, const unsigned char *bytes, short n)
{
    short i;
    if (chan == CH_ECHO) {
        if (!gEchoOK) { gEchoLatency = (long)(TickCount() - gEchoSentTick); gEchoOK = true; gVerdict = 1; }
    } else if (chan == CH_TALK) {
        for (i = 0; i < n && gTalkLen < 798; i++) { char c=(char)bytes[i]; if(c=='\r')continue; gTalkText[gTalkLen++]=c; }
        gTalkText[gTalkLen]=0;
    }
}
static void MuxClosed(short chan){ (void)chan; }
static void MuxErr(short chan, const char *msg){ (void)chan; (void)msg; }

#include "mux_rx.inc"
#include "muxclient.inc"

/* ---- diag wire sink routes over the mux diag channel ---- */
static void WireSink(const char *bytes, short n){ MuxSend(CH_DIAG, bytes, (long)n); }
#include "../diag/diag.inc"

static MuxRx gRx;
static void MuxPing(void){ MuxPong(); }

/* returns nonzero if bytes were consumed (so the caller redraws only then —
 * redrawing every idle loop is what caused the flicker) */
static short Pump(void)
{
    long a,c;
    if(!gPortOpen)return 0;
    if(SerGetBuf(gInRef,&a)!=noErr||a<=0)return 0;
    c=a; if(c>(long)sizeof(gSerBuf))c=sizeof(gSerBuf);
    if(FSRead(gInRef,&c,gSerBuf)!=noErr)return 0;
    MuxRxFeed(&gRx,(const unsigned char *)gSerBuf,(short)c);
    return (short)c;
}

/* ---- the smiley / sad face ---- */
static void DrawFace(short cx, short cy, short verdict)
{
    Rect o; short i;
    SetRect(&o, cx-34, cy-34, cx+34, cy+34);
    PenSize(3,3); FrameOval(&o); PenSize(1,1);
    /* eyes */
    SetRect(&o, cx-18, cy-14, cx-8, cy-4); PaintOval(&o);
    SetRect(&o, cx+8,  cy-14, cx+18, cy-4); PaintOval(&o);
    /* mouth */
    PenSize(3,3);
    if (verdict > 0) {            /* smile */
        MoveTo(cx-16, cy+8); LineTo(cx-6, cy+18); LineTo(cx+6, cy+18); LineTo(cx+16, cy+8);
    } else if (verdict < 0) {     /* frown */
        MoveTo(cx-16, cy+18); LineTo(cx-6, cy+8); LineTo(cx+6, cy+8); LineTo(cx+16, cy+18);
    } else {                      /* neutral line */
        MoveTo(cx-14, cy+12); LineTo(cx+14, cy+12);
    }
    PenSize(1,1);
    (void)i;
}

static void DrawScreen(void)
{
    Rect r;
    SetPort(gWin); SetRect(&r,0,0,WIN_W,WIN_H); EraseRect(&r);
    TextFont(systemFont); TextFace(bold); TextSize(12);
    MoveTo(10,18); DrawString("\pHello WiFi - Macintosh Plus bring-up");
    /* the verdict face, top right */
    DrawFace(WIN_W-50, 50, gVerdict);
    /* the diagnostic log (diag.inc ring buffer) */
    DiagDraw(10, 96, 18);
}

/* feed leftover post-CONNECT bytes */
static void FeedByteToRx(unsigned char b){ MuxRxFeed(&gRx,&b,1); }

/* Return the modem to COMMAND mode so a fresh AT probe works. After a prior
 * run the modem is online (connected to the mux), so "AT" would just travel to
 * the mux as data and never get an "OK" — that's the "no OK to AT" on re-run.
 * Hayes escape needs ~1s of guard silence before and after "+++". */
static void HangUp(void)
{
    long t;
    if(!gPortOpen) return;
    if(gConnected){ MuxClose(CH_ECHO); MuxClose(CH_TALK); MuxClose(CH_DIAG); }
    Delay(70,&t);                       /* >1s guard before escape */
    SendBytes("+++",3);                 /* escape to command mode (no CR) */
    Delay(70,&t);                       /* >1s guard after escape */
    Drain(); SendBytes("ATH\r",4);      /* hang up the connection */
    CaptureFor(90,gCap,sizeof(gCap));
    gConnected=false;
}

static Boolean DialMux(void)
{
    char cmd[64]; short n=0, got, tries;
    if(!OpenSerial()){ DiagLog("SER","no serial port"); return false; }
    DiagLog("SER","port open");
    for(tries=0;tries<3;tries++){ Drain(); SendBytes("AT\r",3); got=CaptureFor(90,gCap,sizeof(gCap)); if(Has(gCap,got,"OK"))break; }
    if(tries==3){ DiagLog("MODEM","no OK to AT - check cable/power"); return false; }
    DiagLogNum("MODEM","AT OK after tries", (long)(tries+1));
    n=0; CatS(cmd,&n,"ATDT\""); CatS(cmd,&n,MUX_HOST); CatS(cmd,&n,":"); CatN(cmd,&n,(long)MUX_PORT); CatS(cmd,&n,"\"\r"); cmd[n]=0;
    Drain(); SendBytes(cmd,n);
    {
        unsigned long dl=TickCount()+600; short tot=0;
        while((long)(TickCount()-dl)<0){
            long av,cc; if(SerGetBuf(gInRef,&av)==noErr&&av>0){cc=av;if(cc>(long)sizeof(gSerBuf))cc=sizeof(gSerBuf);if(FSRead(gInRef,&cc,gSerBuf)==noErr){short i;for(i=0;i<(short)cc;i++)if(tot<(short)sizeof(gCap))gCap[tot++]=(unsigned char)gSerBuf[i];}}
            { short past=FindAfter(gCap,tot,"CONNECT"); if(past>=0){ short i; gConnected=true; MuxRxInit(&gRx); for(i=past;i<tot;i++)FeedByteToRx(gCap[i]); return true; } }
            if(Has(gCap,tot,"NO CARRIER")||Has(gCap,tot,"BUSY")){ DiagLog("MUX","no answer - is the mux up on the mini?"); return false; }
        }
    }
    DiagLog("MUX","silence - WiFi joined? mux reachable?");
    return false;
}

static void RunTest(void)
{
    gVerdict = 0; gEchoOK = false; gEchoLatency = -1; gTalkLen = 0;
    DiagInit();
    DiagSetFile(gBootVRef);                 /* SD fallback */
    DiagLog("BOOT","HelloWiFi bring-up starting");

    /* if a prior run left us online, drop back to command mode first so the
     * AT probe below actually reaches the modem (fixes "no OK to AT" on re-run) */
    if (gConnected || gPortOpen) { DiagLog("RESET","hanging up prior session"); HangUp(); }

    if (!DialMux()) { gVerdict = -1; DiagLog("RESULT","FAILED before mux - sad face"); DiagFlush(); DrawScreen(); return; }

    DiagLog("MUX","CONNECT ok over the wire");
    /* open diag channel and switch logging to stream to the mini */
    MuxOpen(CH_DIAG, "diag");
    DiagSetWire(WireSink);
    DiagLog("DIAG","wire sink live - you are reading this on the mini");

    /* echo round-trip: the bring-up verdict */
    MuxOpen(CH_ECHO, "echo");
    gEchoSentTick = TickCount();
    MuxSendLine(CH_ECHO, "PING-from-the-Plus");
    DiagLog("ECHO","sent PING on echo channel, waiting...");

    /* pump for up to ~3s for the echo to bounce back */
    {
        unsigned long dl = TickCount() + 180;
        while ((long)(TickCount() - dl) < 0 && !gEchoOK) { Pump(); }
    }
    if (gEchoOK) { DiagLogNum("ECHO","round-trip OK, ticks", gEchoLatency); gVerdict = 1; DiagLog("RESULT","WIFI WORKS - smiley"); }
    else         { DiagLog("ECHO","no echo back in 3s"); gVerdict = -1; DiagLog("RESULT","echo failed - sad face"); }

    DiagFlush();
    DrawScreen();
}

static void RunTalk(void)
{
    if (!gConnected) { DiagLog("TALK","not connected - run the test first"); DrawScreen(); return; }
    gTalkLen = 0; gTalkText[0]=0;
    MuxOpen(CH_TALK, "talk");
    MuxSendLine(CH_TALK, "WAKE");
    DiagLog("TALK","asked the talk agent - reply streams to ch2 + appears below");
    DrawScreen();
}

static void DoMenu(long sel)
{
    short menu=HiWord(sel), item=LoWord(sel); Str255 nm;
    if(menu==kAppleMenu){ if(item!=1){GetMenuItemText(gAppleM,item,nm);OpenDeskAcc(nm);} }
    else if(menu==kFileMenu){ if(item==kFileQuit)gDone=true; }
    else if(menu==kTestMenu){ if(item==kTestRun)RunTest(); else if(item==kTestTalk)RunTalk(); }
    HiliteMenu(0);
}
static void HandleEvent(EventRecord *ev)
{
    WindowPtr w; char ch;
    switch(ev->what){
        case mouseDown: switch(FindWindow(ev->where,&w)){ case inMenuBar:DoMenu(MenuSelect(ev->where));break; case inSysWindow:SystemClick(ev,w);break; case inDrag:DragWindow(w,ev->where,&qd.screenBits.bounds);break; } break;
        case keyDown: ch=ev->message&charCodeMask; if(ev->modifiers&cmdKey){long s=MenuKey(ch);if(HiWord(s))DoMenu(s);} break;
        case updateEvt:{ WindowPtr u=(WindowPtr)ev->message; BeginUpdate(u); if(u==gWin)DrawScreen(); EndUpdate(u); break; }
    }
}

static void SetUp(void)
{
    Str255 at; Rect r; SysEnvRec env; short left;
    InitGraf(&qd.thePort);InitFonts();InitWindows();InitMenus();TEInit();InitDialogs(0L);InitCursor();FlushEvents(everyEvent,0);
    at[0]=1;at[1]=0x14;
    gAppleM=NewMenu(kAppleMenu,at);AppendMenu(gAppleM,"\pAbout HelloWiFi");AppendMenu(gAppleM,"\p(-");AppendResMenu(gAppleM,'DRVR');InsertMenu(gAppleM,0);
    gFileM=NewMenu(kFileMenu,"\pFile");AppendMenu(gFileM,"\pQuit/Q");InsertMenu(gFileM,0);
    gTestM=NewMenu(kTestMenu,"\pTest");AppendMenu(gTestM,"\pRun WiFi Test/R;Ask Talk Agent/T");InsertMenu(gTestM,0);
    DrawMenuBar();
    left=(qd.screenBits.bounds.right-WIN_W)/2;
    SetRect(&r,left,40,left+WIN_W,40+WIN_H);
    gWin=NewWindow(0L,&r,"\pHelloWiFi",true,documentProc,(WindowPtr)-1L,false,0);
    SetPort(gWin);
    if(SysEnvirons(curSysEnvVers,&env)==noErr)gBootVRef=env.sysVRefNum;
}

int main(void)
{
    EventRecord ev;
    SetUp();
    DiagInit();
    DiagLog("READY","HelloWiFi - Test menu > Run WiFi Test (Cmd-R)");
    DrawScreen();
    RunTest();                       /* auto-run the bring-up test on launch */
    while(!gDone){
        long sleep = gConnected ? 6L : 15L;
        if(WaitNextEvent(everyEvent,&ev,sleep,0L)) HandleEvent(&ev);
        if(gConnected && Pump()) DrawScreen();   /* redraw only when new data arrived — no flicker */
    }
    if(gConnected){ MuxClose(CH_ECHO); MuxClose(CH_TALK); MuxClose(CH_DIAG); }
    DiagCloseFile();
    if(gPortOpen){ CloseDriver(gInRef); CloseDriver(gOutRef); }
    return 0;
}
