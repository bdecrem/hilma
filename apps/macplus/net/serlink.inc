/*
 * serlink.inc — serial-modem transport with the same call shape as nettcp.
 *
 * For builds that must run where there is no MacTCP: the Mini vMac harness
 * (minivmac/e2e.sh bridges the emulated modem port to vmodem.py, a virtual
 * Hayes modem that relays TCP), and a Plus wired to the RetroWiFi SI. Dial
 * ritual = AT/OK, then ATDT"host:port", wait for CONNECT, then raw bytes.
 * Flow control forced off (SerialDoc's lesson); separate SerSetBuf ring and
 * FSRead scratch (serial lesson #1).
 *
 * Include after <Devices.h>/<Serial.h>/<Files.h>. API:
 *   OSErr SLConnect(const char *host, unsigned short port);
 *   long  SLAvailable(void);                     >=0 bytes waiting, -1 = down
 *   long  SLRecv(void *buf, unsigned short max); bytes read, <=0 none/error
 *   OSErr SLSend(const void *buf, unsigned short n);
 *   void  SLClose(void);
 */
#define SL_BAUD (baud9600 + data8 + noParity + stop10)

static short   gSLIn = 0, gSLOut = 0;
static Boolean gSLOpen = false, gSLUp = false;
static char    gSLRing[4096];      /* driver-owned receive ring (SerSetBuf) */
static char    gSLScratch[512];    /* our FSRead scratch — never the ring   */

static Boolean SLOpenPort(void)
{
	SerShk shk;
	if (gSLOpen) return true;
	if (OpenDriver("\p.AOut", &gSLOut) != noErr) return false;
	if (OpenDriver("\p.AIn", &gSLIn) != noErr) { CloseDriver(gSLOut); return false; }
	SerSetBuf(gSLIn, (Ptr)gSLRing, (short)sizeof(gSLRing));
	SerReset(gSLOut, SL_BAUD); SerReset(gSLIn, SL_BAUD);
	shk.fXOn = 0; shk.fCTS = 0; shk.xOn = 0; shk.xOff = 0;
	shk.errs = 0; shk.evts = 0; shk.fInX = 0; shk.null = 0;
	SerHShake(gSLOut, &shk);
	gSLOpen = true;
	return true;
}

static void SLPut(const char *s, long n) { long c = n; if (gSLOpen) FSWrite(gSLOut, &c, (Ptr)s); }
static void SLPutStr(const char *s) { long n = 0; while (s[n]) n++; SLPut(s, n); }

static void SLDrain(void)
{
	long a, c;
	if (!gSLOpen) return;
	while (SerGetBuf(gSLIn, &a) == noErr && a > 0) {
		c = a; if (c > (long)sizeof(gSLScratch)) c = sizeof(gSLScratch);
		FSRead(gSLIn, &c, gSLScratch);
	}
}

/* capture input for `ticks`, scanning for `needle`; true if seen */
static Boolean SLWaitFor(const char *needle, short ticks)
{
	unsigned long deadline = TickCount() + (unsigned long)ticks;
	static char cap[256]; short got = 0, i, nl = 0; long a, c;
	while (needle[nl]) nl++;
	while ((long)(TickCount() - deadline) < 0) {
		SystemTask();
		if (SerGetBuf(gSLIn, &a) == noErr && a > 0) {
			c = a; if (c > (long)sizeof(gSLScratch)) c = sizeof(gSLScratch);
			if (FSRead(gSLIn, &c, gSLScratch) == noErr)
				for (i = 0; i < (short)c; i++) if (got < (short)sizeof(cap) - 1) cap[got++] = gSLScratch[i];
		}
		{ short j; for (j = 0; j + nl <= got; j++) { short k; for (k = 0; k < nl; k++) if (cap[j + k] != needle[k]) break; if (k == nl) return true; } }
	}
	return false;
}

static OSErr SLConnect(const char *host, unsigned short port)
{
	char cmd[96]; short n = 0, tries;
	if (!SLOpenPort()) return -1;
	for (tries = 0; tries < 3; tries++) { SLDrain(); SLPutStr("AT\r"); if (SLWaitFor("OK", 90)) break; }
	if (tries == 3) return -2;                  /* modem not answering */
	{ const char *p = "ATDT\""; while (*p) cmd[n++] = *p++; }
	{ const char *p = host; while (*p) cmd[n++] = *p++; }
	cmd[n++] = ':';
	{ long v = port; char t[8]; short k = 0; if (v == 0) t[k++] = '0'; while (v > 0) { t[k++] = (char)('0' + v % 10); v /= 10; } while (k > 0) cmd[n++] = t[--k]; }
	cmd[n++] = '"'; cmd[n++] = '\r'; cmd[n] = 0;
	SLDrain(); SLPutStr(cmd);
	if (!SLWaitFor("CONNECT", 600)) return -3;
	/* the CONNECT line's trailing \r\n arrives next; the line parser drops blanks */
	gSLUp = true;
	return noErr;
}

static long SLAvailable(void)
{
	long a;
	if (!gSLUp) return -1;
	if (SerGetBuf(gSLIn, &a) != noErr) return -1;
	return a;
}

static long SLRecv(void *buf, unsigned short max)
{
	long c = max;
	if (!gSLUp) return -1;
	if (FSRead(gSLIn, &c, buf) != noErr) return -1;
	return c;
}

static OSErr SLSend(const void *buf, unsigned short n)
{
	long c = n;
	if (!gSLUp) return -1;
	return FSWrite(gSLOut, &c, (Ptr)buf);
}

static void SLClose(void)
{
	if (gSLUp) {
		unsigned long t;
		SLPutStr("+++"); t = TickCount() + 70; while ((long)(TickCount() - t) < 0) SystemTask();
		SLPutStr("ATH\r");
		gSLUp = false;
	}
	if (gSLOpen) {
		SerSetBuf(gSLIn, (Ptr)gSLRing, 0);
		CloseDriver(gSLIn); CloseDriver(gSLOut);
		gSLOpen = false;
	}
}
