/*
 * applog.inc — key-event logging to the mini's shared logs folder, v2.
 *
 * Include AFTER nettcp.h. Call AppLogOpen("AppName") once near launch,
 * AppLog("event") at the few moments that matter (launched, connected, an
 * error), AppLogTick() once per pass of the main event loop, and
 * AppLogClose() on quit. Lines land timestamped in ~/macplus-logs/all.log on
 * the mini (the diag sink, :2331), which I pull with one ssh.
 *
 * v2 adds the two things v1 lacked (2026-07-02):
 *   - HEARTBEAT: after 60 s with nothing sent, Tick sends "~hb". The sink
 *     swallows heartbeats (they never reach all.log) and uses them to tell
 *     "idle" from "frozen": silence past ~3 min becomes a "went silent" event.
 *     Side effect: the idle log link always has traffic, so it can't be
 *     reaped as dead by NAT/DaynaPORT.
 *   - RECONNECT with backoff: a failed open or a failed send marks the link
 *     down and Tick retries at 15 s, doubling to a 10 min cap (a reconnect
 *     attempt with the mini unreachable blocks ~20 s — keep retries rare).
 *
 * Still best-effort and safe: never blocks outside one connect/send attempt,
 * never crashes the caller, and disables itself between retries.
 */
#ifndef APPLOG_INC
#define APPLOG_INC

#define APPLOG_IP        "192.168.7.50"
#define APPLOG_PORT      2331
#define APPLOG_HB_TICKS  (60UL * 60)    /* heartbeat after 60 s idle (60 ticks/s) */
#define APPLOG_RETRY_MIN (15UL * 60)    /* first retry after 15 s */
#define APPLOG_RETRY_MAX (600UL * 60)   /* backoff cap: 10 min */

static NetConn        gAppLogConn;
static short          gAppLogState = 0;      /* 0 off, 1 up, 2 down (retrying) */
static char           gAppLogName[28];
static unsigned long  gAppLogLastSend = 0;   /* TickCount of last successful send */
static unsigned long  gAppLogNextTry = 0;    /* TickCount for the next reconnect */
static unsigned long  gAppLogBackoff = APPLOG_RETRY_MIN;

static short AppLogLen(const char *s) { short n = 0; while (s[n]) n++; return n; }

static void AppLogDown(void)
{
    NetClose(&gAppLogConn);
    gAppLogState = 2;
    gAppLogNextTry = TickCount() + gAppLogBackoff;
    gAppLogBackoff *= 2;
    if (gAppLogBackoff > APPLOG_RETRY_MAX) gAppLogBackoff = APPLOG_RETRY_MAX;
}

/* one line, one NetSend; on failure the link goes down and Tick will retry */
static void AppLogSendLine(const char *event)
{
    char buf[160]; short n = 0, i;
    for (i = 0; gAppLogName[i] && n < 150; i++) buf[n++] = gAppLogName[i];
    buf[n++] = ':'; buf[n++] = ' ';
    for (i = 0; event[i] && n < 158; i++) buf[n++] = event[i];
    buf[n++] = '\n';
    if (NetSend(&gAppLogConn, buf, (unsigned short)n) != noErr) { AppLogDown(); return; }
    gAppLogLastSend = TickCount();
}

static void AppLogTryConnect(void)
{
    if (NetConnect(&gAppLogConn, NetParseIP(APPLOG_IP), APPLOG_PORT) == noErr) {
        gAppLogState = 1;
        gAppLogBackoff = APPLOG_RETRY_MIN;
        gAppLogLastSend = TickCount();
    } else {
        gAppLogState = 2;
        gAppLogNextTry = TickCount() + gAppLogBackoff;
        gAppLogBackoff *= 2;
        if (gAppLogBackoff > APPLOG_RETRY_MAX) gAppLogBackoff = APPLOG_RETRY_MAX;
    }
}

static void AppLogOpen(const char *app)
{
    short i;
    for (i = 0; app[i] && i < 27; i++) gAppLogName[i] = app[i];
    gAppLogName[i] = 0;
    gAppLogBackoff = APPLOG_RETRY_MIN;
    AppLogTryConnect();
}

static void AppLog(const char *event)
{
    if (gAppLogState != 1) return;
    AppLogSendLine(event);
}

/* call once per main-loop pass: sends the heartbeat, drives reconnects */
static void AppLogTick(void)
{
    unsigned long now = TickCount();
    if (gAppLogState == 1) {
        if (now - gAppLogLastSend >= APPLOG_HB_TICKS) AppLogSendLine("~hb");
    } else if (gAppLogState == 2) {
        if ((long)(now - gAppLogNextTry) >= 0) AppLogTryConnect();
    }
}

static void AppLogClose(void)
{
    if (gAppLogState == 1) NetClose(&gAppLogConn);
    gAppLogState = 0;
}

#endif /* APPLOG_INC */
