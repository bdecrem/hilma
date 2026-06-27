/*
 * applog.inc — dead-simple key-event logging to the mini's shared logs folder.
 *
 * Include AFTER nettcp.h. Call AppLogOpen("AppName") once near launch, then
 * AppLog("event") at the few moments that matter (launched, connected, an
 * error). Lines land timestamped in ~/macplus-logs/all.log on the mini (the
 * diag sink, :2331), which I pull with one ssh. Build on this later.
 *
 * Best-effort and safe: if the sink isn't reachable it silently disables; it
 * never blocks beyond the one connect attempt and never crashes the caller.
 */
#ifndef APPLOG_INC
#define APPLOG_INC

#define APPLOG_IP   "192.168.7.50"
#define APPLOG_PORT 2331

static NetConn  gAppLogConn;
static Boolean  gAppLogOn = false;
static char     gAppLogName[28];

static short AppLogLen(const char *s) { short n = 0; while (s[n]) n++; return n; }

static void AppLogOpen(const char *app)
{
    short i;
    for (i = 0; app[i] && i < 27; i++) gAppLogName[i] = app[i];
    gAppLogName[i] = 0;
    if (NetConnect(&gAppLogConn, NetParseIP(APPLOG_IP), APPLOG_PORT) == noErr) gAppLogOn = true;
}

static void AppLog(const char *event)
{
    if (!gAppLogOn) return;
    NetSend(&gAppLogConn, gAppLogName, (unsigned short)AppLogLen(gAppLogName));
    NetSend(&gAppLogConn, ": ", 2);
    NetSend(&gAppLogConn, event, (unsigned short)AppLogLen(event));
    NetSend(&gAppLogConn, "\n", 1);
}

static void AppLogClose(void) { if (gAppLogOn) { NetClose(&gAppLogConn); gAppLogOn = false; } }

#endif /* APPLOG_INC */
