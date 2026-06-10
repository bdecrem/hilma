/*
 * wifiinit.c — the WiFi boot INIT.
 *
 * Runs once at startup (it's an 'INIT' resource in the System Folder). It opens
 * the modem serial port and dials the mini multiplexer, then leaves the port
 * OPEN and the modem ONLINE and exits. From then on the shared WiFi link is up
 * before any application launches — apps call WIFIConnect() (wifi.c), which
 * pings the mux, sees the live link, and attaches without dialing.
 *
 * The link persists because the serial driver is system-global (not closed when
 * an app quits) and the RetroWiFi modem holds its TCP connection until someone
 * hangs up. Nobody hangs up, so it stays up for the whole session.
 *
 * Built as a flat code resource (see CMakeLists.txt / wifiinit.r), the same way
 * as Retro68's SystemExtension sample.
 */
#include <Devices.h>
#include <Serial.h>
#include <OSUtils.h>
#include "Retro68Runtime.h"

#define MUX_HOST "192.168.7.50"
#define MUX_PORT 2330
#define kBaud   (baud9600 + data8 + noParity + stop10)

static short gIn, gOut;
static char  gBuf[512];

static void put(const char *s) { long n = 0; while (s[n]) n++; FSWrite(gOut, &n, (Ptr)s); }
static void drain(void) { long a, c; while (SerGetBuf(gIn, &a) == noErr && a > 0) { c = a; if (c > (long)sizeof(gBuf)) c = sizeof(gBuf); FSRead(gIn, &c, gBuf); } }

static Boolean waitFor(const char *needle, short ticks)
{
    unsigned long dl = TickCount() + (unsigned long)ticks;
    char cap[256]; short got = 0, i; long a, c;
    short nl = 0; while (needle[nl]) nl++;
    cap[0] = 0;
    while ((long)(TickCount() - dl) < 0) {
        if (SerGetBuf(gIn, &a) == noErr && a > 0) {
            c = a; if (c > (long)sizeof(gBuf)) c = sizeof(gBuf);
            if (FSRead(gIn, &c, gBuf) == noErr) for (i = 0; i < (short)c; i++) if (got < 255) cap[got++] = gBuf[i];
        }
        cap[got] = 0;
        { short j; for (j = 0; j + nl <= got; j++) { short k; for (k = 0; k < nl; k++) if (cap[j+k] != needle[k]) break; if (k == nl) return true; } }
    }
    return false;
}

void _start(void)
{
    short tries; char cmd[96]; short n; SerShk shk;
    RETRO68_RELOCATE();
    Retro68CallConstructors();

    if (OpenDriver("\p.AOut", &gOut) != noErr) { Retro68FreeGlobals(); return; }
    if (OpenDriver("\p.AIn",  &gIn)  != noErr) { CloseDriver(gOut); Retro68FreeGlobals(); return; }
    SerSetBuf(gIn, (Ptr)gBuf, (short)sizeof(gBuf));
    SerReset(gOut, kBaud); SerReset(gIn, kBaud);
    shk.fXOn = 0; shk.fCTS = 0; shk.xOn = 0; shk.xOff = 0;
    shk.errs = 0; shk.evts = 0; shk.fInX = 0; shk.null = 0;
    SerHShake(gOut, &shk);

    /* already online (warm restart)? then there's nothing to do */
    drain(); put("MUXPING\r\n");
    if (!waitFor("MUXPONG", 60)) {
        for (tries = 0; tries < 4; tries++) { drain(); put("AT\r"); if (waitFor("OK", 60)) break; }
        if (tries < 4) {
            n = 0;
            { const char *p = "ATDT\""; while (*p) cmd[n++] = *p++; }
            { const char *p = MUX_HOST; while (*p) cmd[n++] = *p++; }
            cmd[n++] = ':';
            { long v = MUX_PORT; char t[8]; short k = 0; if (v==0) t[k++]='0'; while (v>0){ t[k++]=(char)('0'+v%10); v/=10; } while (k>0) cmd[n++]=t[--k]; }
            cmd[n++] = '"'; cmd[n++] = '\r'; cmd[n] = 0;
            drain(); put(cmd); waitFor("CONNECT", 600);
        }
    }

    /* hand the driver back its own buffer; leave the port OPEN + modem ONLINE */
    SerSetBuf(gIn, (Ptr)gBuf, 0);
    Retro68FreeGlobals();
}
