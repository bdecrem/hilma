/*
 * wifi.c — the Macinclaude WiFi system service (resident shared link manager).
 *
 * One serial link to the mini multiplexer (MUX_HOST:MUX_PORT), shared by every
 * app through logical channels. The state lives in the SYSTEM heap (NewPtrSys),
 * so the link stays up across app quit — dial once, never again. Apps reach it
 * through wifi.h.
 *
 * The data path reuses the proven, host-tested pieces:
 *   mux_rx.inc    — MUX frame parser (callbacks below route bytes into rings)
 *   muxclient.inc — MUX frame sender (MuxSendRaw below writes to the serial)
 *
 * NOTE (v1): discovery is within a session — the first app to call WIFIConnect
 * allocates the shared state and keeps a process-global pointer to it. Making a
 * freshly-launched app re-find the existing system-heap state is the INIT +
 * Gestalt step (task #28); the LINK itself already persists because the serial
 * driver stays open and the state block is in the system heap.
 */
#include <Devices.h>
#include <Serial.h>
#include <OSUtils.h>
#include <Memory.h>
#include <Files.h>
#include <Quickdraw.h>
#include "wifi.h"

#define MUX_HOST "192.168.7.50"
#define MUX_PORT 2330
#define kBaud   (baud9600 + data8 + noParity + stop10)
#define RING    1024            /* per-channel receive ring buffer */

/* The top channel is reserved by the service itself for on-demand screen grabs
 * (see screen.inc). Apps never get it — WIFIConnect opens it, WIFIOpen skips it. */
#define WIFI_SCREEN_CHAN (WIFI_MAXCHAN - 1)

/* host hooks the MUX includes call — forward-declared so the parser/sender can
 * be pulled in before WIFIState (which needs the MuxRx type from mux_rx.inc) */
static void MuxSendRaw(const char *bytes, long n);
static void MuxData(short chan, const unsigned char *bytes, short n);
static void MuxClosed(short chan);
static void MuxErr(short chan, const char *msg);
static void MuxPing(void);

#include "mux_rx.inc"           /* defines the MuxRx type + the frame parser */
#include "muxclient.inc"        /* defines MuxOpen/MuxSend/... (use MuxSendRaw) */

typedef struct WIFIState {
    long          magic;        /* 'WiFi' — sanity for cross-quit discovery later */
    short         inRef, outRef;
    Boolean       portOpen, connected;
    MuxRx         rx;           /* MUX parser state (lives here, in the system heap) */
    Boolean       used[WIFI_MAXCHAN];
    unsigned char ring[WIFI_MAXCHAN][RING];
    short         head[WIFI_MAXCHAN], tail[WIFI_MAXCHAN];
    char          serRing[4096];    /* the serial driver's SerSetBuf ring */
    char          serScratch[2048]; /* FSRead scratch — separate from the ring */
    Boolean       scrReq;           /* a GRAB arrived on the screen channel */
    char          scrCmd[16];       /* line accumulator for the screen channel */
    short         scrCmdLen;
} WIFIState;

static WIFIState  gInstance;     /* app-local state; the LINK persists in hardware */
static WIFIState *gW = 0;        /* -> gInstance once initialised */

#include "screen.inc"            /* WIFIScreenGrab() — uses qd + MuxSendLine */

/* write raw bytes to the serial link */
static void MuxSendRaw(const char *bytes, long n)
{
    long c = n;
    if (gW && gW->portOpen) FSWrite(gW->outRef, &c, (Ptr)bytes);
}

/* an incoming channel data chunk -> push into that channel's ring (drop if full) */
static void MuxData(short chan, const unsigned char *b, short n)
{
    short i;
    if (!gW || chan < 0 || chan >= WIFI_MAXCHAN) return;
    if (chan == WIFI_SCREEN_CHAN) {              /* commands for the grabber, not app data */
        for (i = 0; i < n; i++) {
            unsigned char c = b[i];
            if (c == '\r' || c == '\n') {
                gW->scrCmd[gW->scrCmdLen] = 0;
                if (gW->scrCmdLen >= 4 && gW->scrCmd[0] == 'G' && gW->scrCmd[1] == 'R'
                    && gW->scrCmd[2] == 'A' && gW->scrCmd[3] == 'B')
                    gW->scrReq = true;
                gW->scrCmdLen = 0;
            } else if (gW->scrCmdLen < (short)sizeof(gW->scrCmd) - 1) {
                gW->scrCmd[gW->scrCmdLen++] = (char)c;
            }
        }
        return;
    }
    for (i = 0; i < n; i++) {
        short nt = (short)((gW->tail[chan] + 1) % RING);
        if (nt == gW->head[chan]) break;          /* ring full: drop the rest */
        gW->ring[chan][gW->tail[chan]] = b[i];
        gW->tail[chan] = nt;
    }
}
static void MuxClosed(short chan) { if (gW && chan >= 0 && chan < WIFI_MAXCHAN) gW->used[chan] = false; }
static void MuxErr(short chan, const char *msg) { (void)chan; (void)msg; }
static void MuxPing(void) { MuxPong(); }

/* ---- serial plumbing (mirrors HelloWiFi, proven on the real Plus) ---- */
static Boolean openSerial(void)
{
    SerShk shk;
    if (gW->portOpen) return true;
    if (OpenDriver("\p.AOut", &gW->outRef) != noErr) return false;
    if (OpenDriver("\p.AIn",  &gW->inRef)  != noErr) { CloseDriver(gW->outRef); return false; }
    SerSetBuf(gW->inRef, (Ptr)gW->serRing, (short)sizeof(gW->serRing));
    SerReset(gW->outRef, kBaud); SerReset(gW->inRef, kBaud);
    shk.fXOn = 0; shk.fCTS = 0; shk.xOn = 0; shk.xOff = 0;
    shk.errs = 0; shk.evts = 0; shk.fInX = 0; shk.null = 0;
    SerHShake(gW->outRef, &shk);
    gW->portOpen = true;
    return true;
}

static void drainSerial(void) { long a, c; if (!gW->portOpen) return; while (SerGetBuf(gW->inRef, &a) == noErr && a > 0) { c = a; if (c > (long)sizeof(gW->serScratch)) c = sizeof(gW->serScratch); FSRead(gW->inRef, &c, gW->serScratch); } }

static void putStr(const char *s) { long n = 0; while (s[n]) n++; MuxSendRaw(s, n); }

/* capture serial input for `ticks`, scanning for `needle`; returns true if seen */
static Boolean waitFor(const char *needle, short ticks)
{
    unsigned long deadline = TickCount() + (unsigned long)ticks;
    static char cap[256]; short got = 0, i; long a, c;
    short nl = 0; while (needle[nl]) nl++;
    cap[0] = 0;
    while ((long)(TickCount() - deadline) < 0) {
        SystemTask();
        if (SerGetBuf(gW->inRef, &a) == noErr && a > 0) {
            c = a; if (c > (long)sizeof(gW->serScratch)) c = sizeof(gW->serScratch);
            if (FSRead(gW->inRef, &c, gW->serScratch) == noErr)
                for (i = 0; i < (short)c; i++) if (got < (short)sizeof(cap) - 1) cap[got++] = gW->serScratch[i];
        }
        cap[got] = 0;
        { short j; for (j = 0; j + nl <= got; j++) { short k; for (k = 0; k < nl; k++) if (cap[j+k] != needle[k]) break; if (k == nl) return true; } }
    }
    return false;
}

/* Reserve + open the screen channel so the grabber is always available, and so
 * WIFIOpen (which picks the first free channel) never hands it to an app. */
static void openScreenChan(void)
{
    gW->used[WIFI_SCREEN_CHAN] = true;
    gW->head[WIFI_SCREEN_CHAN] = gW->tail[WIFI_SCREEN_CHAN] = 0;
    gW->scrCmdLen = 0;
    gW->scrReq = false;
    MuxOpen(WIFI_SCREEN_CHAN, "screen");
}

/* ---- public API ---- */
Boolean WIFIConnect(void)
{
    char cmd[96]; short n, tries;
    if (gW && gW->connected) return true;            /* this app already up */
    if (!gW) {
        gW = &gInstance;
        { char *p = (char *)gW; long i; for (i = 0; i < (long)sizeof(WIFIState); i++) p[i] = 0; }
        gW->magic = 'WiFi';
    }
    MuxRxInit(&gW->rx);
    if (!openSerial()) return false;

    /* Is the shared link ALREADY up — brought up by the boot INIT or a prior
     * app that quit without hanging up? Ping the mux; a MUXPONG means we are
     * still online, so reuse the link instead of dialing again. This is what
     * makes "dial once, every app after just attaches" work. */
    drainSerial();
    putStr("MUXPING\r\n");
    if (waitFor("MUXPONG", 90)) { gW->connected = true; openScreenChan(); return true; }

    /* Link not up — do the full modem dial. */
    for (tries = 0; tries < 3; tries++) { drainSerial(); putStr("AT\r"); if (waitFor("OK", 90)) break; }
    if (tries == 3) return false;                    /* modem not answering */
    n = 0;
    { const char *p = "ATDT\""; while (*p) cmd[n++] = *p++; }
    { const char *p = MUX_HOST; while (*p) cmd[n++] = *p++; }
    cmd[n++] = ':';
    { long v = MUX_PORT; char t[8]; short k = 0; if (v==0) t[k++]='0'; while (v>0){ t[k++]=(char)('0'+v%10); v/=10; } while (k>0) cmd[n++]=t[--k]; }
    cmd[n++] = '"'; cmd[n++] = '\r'; cmd[n] = 0;
    drainSerial(); putStr(cmd);
    if (!waitFor("CONNECT", 600)) return false;
    gW->connected = true;
    openScreenChan();
    return true;
}

Boolean WIFIIsConnected(void) { return (Boolean)(gW && gW->connected); }

short WIFIOpen(const char *service)
{
    short chan;
    if (!gW || !gW->connected) return -1;
    for (chan = 0; chan < WIFI_MAXCHAN; chan++) if (!gW->used[chan]) break;
    if (chan == WIFI_MAXCHAN) return -1;
    gW->used[chan] = true;
    gW->head[chan] = gW->tail[chan] = 0;
    MuxOpen(chan, service);
    return chan;
}

void WIFIClose(short chan)
{
    if (!gW || chan < 0 || chan >= WIFI_MAXCHAN || !gW->used[chan]) return;
    MuxClose(chan);
    gW->used[chan] = false;
}

void WIFISend(short chan, const void *data, long len)
{
    if (gW && gW->connected && chan >= 0 && chan < WIFI_MAXCHAN) MuxSend(chan, (const char *)data, len);
}

void WIFISendLine(short chan, const char *line)
{
    if (gW && gW->connected && chan >= 0 && chan < WIFI_MAXCHAN) MuxSendLine(chan, line);
}

short WIFIIdle(void)
{
    long a, c;
    if (!gW || !gW->portOpen) return 0;
    if (SerGetBuf(gW->inRef, &a) != noErr || a <= 0) return 0;
    c = a; if (c > (long)sizeof(gW->serScratch)) c = sizeof(gW->serScratch);
    if (FSRead(gW->inRef, &c, gW->serScratch) != noErr) return 0;
    MuxRxFeed(&gW->rx, (const unsigned char *)gW->serScratch, (short)c);
    if (gW->scrReq) { gW->scrReq = false; WIFIScreenGrab(); }
    return (short)c;
}

short WIFIRead(short chan, void *buf, short cap)
{
    short got = 0; unsigned char *out = (unsigned char *)buf;
    if (!gW || chan < 0 || chan >= WIFI_MAXCHAN) return 0;
    while (got < cap && gW->head[chan] != gW->tail[chan]) {
        out[got++] = gW->ring[chan][gW->head[chan]];
        gW->head[chan] = (short)((gW->head[chan] + 1) % RING);
    }
    return got;
}

/* Call before the app quits. Hands the serial driver back its own default
 * buffer (our ring is about to be freed with the app), but does NOT close the
 * driver or hang up the modem — so the link stays up and the next app to launch
 * finds it live (via the MUXPING probe in WIFIConnect) and skips the dial. */
void WIFIPark(void)
{
    short ch;
    if (!gW || !gW->portOpen) return;
    for (ch = 0; ch < WIFI_MAXCHAN; ch++) if (gW->used[ch]) { MuxClose(ch); gW->used[ch] = false; }
    SerSetBuf(gW->inRef, (Ptr)gW->serRing, 0);   /* release our ring -> driver default */
    gW->portOpen = false;
}
