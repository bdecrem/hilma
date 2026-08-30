/*
 * dodo_rx.inc — line parser for the Dodo agent protocol (agent-dodo/server.mjs).
 * Included verbatim by dodo.c (the app) and rxtest.c (host test). The includer
 * defines these callbacks before including:
 *
 *   static void RxTopic(const char *name);                 DTOPIC <name>
 *   static void RxMsg(char role, const char *text);        DU/DA <text>   role 'U' / 'A'
 *   static void RxCont(const char *text);                  D+ <text>      ("" = paragraph break)
 *   static void RxListStart(void);                         DLIST
 *   static void RxListItem(short n, const char *date, const char *name);   DT <n> <date> <name>
 *   static void RxWait(const char *text);                  DWAIT <text>
 *   static void RxErr(const char *text);                   DERR <text>
 *   static void RxEnd(void);                               DEND
 *   static void RxOk(void);                                DOK
 *
 * Feed bytes with RxFeed(buf, n). Lines end in \n (\r ignored). Overlong lines
 * are truncated, never overflowed. Unknown lines are dropped.
 */
#define RX_LINE_CAP 240

static char  gRxLine[RX_LINE_CAP];
static short gRxLen = 0;
static short gRxOverflow = 0;

static short RxStarts(const char *l, const char *tag)
{
	short i = 0;
	while (tag[i]) { if (l[i] != tag[i]) return 0; i++; }
	return i;
}

static void RxDispatch(char *l, short n)
{
	short k;
	l[n] = 0;
	if (n >= 3 && RxStarts(l, "DA ")) { RxMsg('A', l + 3); return; }
	if (n >= 3 && RxStarts(l, "DU ")) { RxMsg('U', l + 3); return; }
	if (n >= 2 && RxStarts(l, "D+")) { RxCont(n >= 3 ? l + 3 : ""); return; }
	if (RxStarts(l, "DEND") && n == 4) { RxEnd(); return; }
	if (RxStarts(l, "DOK") && n == 3) { RxOk(); return; }
	if (RxStarts(l, "DLIST") && n == 5) { RxListStart(); return; }
	if ((k = RxStarts(l, "DTOPIC ")) != 0) { RxTopic(l + k); return; }
	if ((k = RxStarts(l, "DWAIT ")) != 0) { RxWait(l + k); return; }
	if ((k = RxStarts(l, "DERR ")) != 0) { RxErr(l + k); return; }
	if ((k = RxStarts(l, "DT ")) != 0) {
		/* DT <n> <date>|<name> — the date may contain a space ("Aug 24"), so the
		   agent separates it from the name with a '|' (never in a name). */
		short num = 0; char *p = l + k; char *date; char *name; char *bar;
		while (*p >= '0' && *p <= '9') { num = (short)(num * 10 + (*p - '0')); p++; }
		if (*p == ' ') p++;
		date = p;
		bar = p; while (*bar && *bar != '|') bar++;
		if (*bar == '|') { *bar = 0; name = bar + 1; } else { name = date; date = ""; }
		RxListItem(num, date, name);
		return;
	}
	/* unknown line: ignore */
}

static void RxFeed(const unsigned char *buf, short n)
{
	short i;
	for (i = 0; i < n; i++) {
		unsigned char c = buf[i];
		if (c == '\r') continue;
		if (c == '\n') {
			RxDispatch(gRxLine, gRxLen);        /* truncated lines still dispatch */
			gRxLen = 0; gRxOverflow = 0;
			continue;
		}
		if (gRxLen < RX_LINE_CAP - 1) gRxLine[gRxLen++] = (char)c;
		else gRxOverflow = 1;
	}
}
