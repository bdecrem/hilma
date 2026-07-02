/*
 * applog_test.c — host test for the applog.inc state machine (v2).
 *   cc -o /tmp/applogtest applog_test.c && /tmp/applogtest
 * Stubs the nettcp layer and the Mac tick clock, then drives connect failure,
 * send failure, heartbeat timing, and reconnect backoff. No Mac, no network.
 */
#include <stdio.h>
#include <string.h>

/* ---- stubs for what applog.inc needs from nettcp.h / the Toolbox ---- */
typedef short OSErr;
#define noErr 0
typedef struct NetConn { int open; } NetConn;

static unsigned long gNow = 1000;
static unsigned long TickCount(void) { return gNow; }

static int  gConnectOK = 1, gConnectCalls = 0;
static int  gSendOK = 1;
static char gSent[8192]; static int gSentLen = 0;

static OSErr NetConnect(NetConn *c, unsigned long host, unsigned short port)
{ (void)host; (void)port; gConnectCalls++; if (gConnectOK) { c->open = 1; return noErr; } return -23; }
static OSErr NetSend(NetConn *c, const void *b, unsigned short n)
{ (void)c; if (!gSendOK) return -23; if (gSentLen + n < (int)sizeof(gSent)) { memcpy(gSent + gSentLen, b, n); gSentLen += n; } return noErr; }
static void NetClose(NetConn *c) { c->open = 0; }
static unsigned long NetParseIP(const char *s) { (void)s; return 0x0a000001; }

#include "applog.inc"

static int gPass = 0, gFail = 0;
static void ok(const char *label, int cond)
{ if (cond) gPass++; else { gFail++; printf("FAIL: %s\n", label); } }
static void sentreset(void) { gSentLen = 0; gSent[0] = 0; }
static const char *sent(void) { gSent[gSentLen] = 0; return gSent; }

int main(void)
{
    /* 1. clean open + event */
    AppLogOpen("TestApp");
    ok("open connects", gAppLogState == 1 && gConnectCalls == 1);
    sentreset(); AppLog("launched");
    ok("event line format", !strcmp(sent(), "TestApp: launched\n"));

    /* 2. heartbeat only after 60 s idle */
    sentreset();
    gNow += 30UL * 60; AppLogTick();
    ok("no hb before 60s", gSentLen == 0);
    gNow += 31UL * 60; AppLogTick();
    ok("hb after 60s idle", !strcmp(sent(), "TestApp: ~hb\n"));
    sentreset();
    AppLogTick();
    ok("hb not repeated immediately", gSentLen == 0);
    gNow += 61UL * 60; AppLogTick();
    ok("next hb after another 60s", !strcmp(sent(), "TestApp: ~hb\n"));

    /* 3. a real event resets the idle clock */
    sentreset(); gNow += 40UL * 60; AppLog("something");
    gNow += 30UL * 60; AppLogTick();          /* only 30 s since the event */
    ok("event resets hb timer", strstr(sent(), "~hb") == 0);

    /* 4. send failure -> down, silent, retry scheduled */
    gSendOK = 0; sentreset(); AppLog("this fails");
    ok("send failure marks down", gAppLogState == 2);
    gSendOK = 1; sentreset(); AppLog("while down");
    ok("no sends while down", gSentLen == 0);

    /* 5. reconnect honors backoff and doubles on failure */
    gConnectOK = 0; gConnectCalls = 0;
    AppLogTick();
    ok("no retry before backoff elapses", gConnectCalls == 0);
    gNow += 16UL * 60; AppLogTick();           /* past the 15 s backoff */
    ok("retry after backoff", gConnectCalls == 1 && gAppLogState == 2);
    gNow += 16UL * 60; AppLogTick();           /* 30 s backoff now — not yet */
    ok("doubled backoff not elapsed", gConnectCalls == 1);
    gNow += 15UL * 60; AppLogTick();           /* now past 30 s */
    ok("second retry after doubled backoff", gConnectCalls == 2);

    /* 6. backoff caps at 10 min */
    { int i; for (i = 0; i < 12; i++) { gNow += APPLOG_RETRY_MAX + 60; AppLogTick(); } }
    ok("backoff capped", gAppLogBackoff == APPLOG_RETRY_MAX);

    /* 7. reconnect success resumes logging + resets backoff */
    gConnectOK = 1; gNow += APPLOG_RETRY_MAX + 60; AppLogTick();
    ok("reconnects when sink is back", gAppLogState == 1);
    ok("backoff reset after success", gAppLogBackoff == APPLOG_RETRY_MIN);
    sentreset(); AppLog("recovered");
    ok("logging resumes", !strcmp(sent(), "TestApp: recovered\n"));

    /* 8. failed open at launch also retries */
    AppLogClose();
    gConnectOK = 0; gConnectCalls = 0;
    AppLogOpen("TestApp");
    ok("failed open -> down", gAppLogState == 2 && gConnectCalls == 1);
    gConnectOK = 1; gNow += 16UL * 60; AppLogTick();
    ok("recovers from failed open", gAppLogState == 1);

    printf("\napplogtest: %d passed, %d failed\n", gPass, gFail);
    return gFail ? 1 : 0;
}
