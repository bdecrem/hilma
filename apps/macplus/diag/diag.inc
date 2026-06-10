/*
 * diag.inc - the Macinclaude diagnostic logger for the Plus.
 * Shared across apps/driver. Three sinks so hardware debugging needs no SD
 * round-trips:
 *   SCREEN - an in-memory ring buffer you can draw on screen (DiagDraw) or read
 *            in a DA; just glance at the Plus.
 *   WIRE   - lines streamed to the mini diag-sink (port 2331) over whatever
 *            serial session is active; I read them live on the mini.
 *   FILE   - appended to "Macinclaude Diag.log" on the boot volume; durable
 *            backup for when the wire itself is what's broken.
 *
 * The logger never owns the serial port - the host passes in a "write one
 * line to the wire" callback (or none), so diag is safe to use from inside an
 * app or driver that already owns serial, and can't fight it for the port.
 *
 * Host provides BEFORE including:
 *   (nothing required) - but to enable the WIRE sink, call
 *   DiagSetWire(fn) where fn writes n bytes to the active serial link.
 *   To enable the FILE sink, call DiagSetFile(vRefNum) once.
 */

#define DIAG_LINES   80
#define DIAG_COLS    78

typedef void (*DiagWireProc)(const char *bytes, short n);

static char  gDiagBuf[DIAG_LINES][DIAG_COLS + 1];
static short gDiagHead = 0;        /* next slot */
static short gDiagCount = 0;
static unsigned long gDiagT0 = 0;  /* TickCount at DiagInit, for relative time */

static DiagWireProc gDiagWire = 0;
static Boolean gDiagFileOn = false;
static short   gDiagFileVRef = 0;
static short   gDiagFileRef = 0;   /* open file refnum, 0 = not open */

/* ---- tiny formatting (no stdio) ---- */
static void DgU(char *b, short *n, unsigned long v)
{
    char tmp[12]; short k = 0;
    if (v == 0) tmp[k++] = '0';
    while (v > 0) { tmp[k++] = (char)('0' + (v % 10)); v /= 10; }
    while (k > 0) b[(*n)++] = tmp[--k];
}
static void DgS(char *b, short *n, const char *s) { short i; for (i = 0; s[i] && *n < DIAG_COLS; i++) b[(*n)++] = s[i]; }

/* ---- init / sink config ---- */
static void DiagInit(void)
{
    gDiagHead = 0; gDiagCount = 0;
    gDiagT0 = TickCount();
    gDiagWire = 0; gDiagFileOn = false; gDiagFileRef = 0;
}
static void DiagSetWire(DiagWireProc fn) { gDiagWire = fn; }

/* Open/create the SD log file on the given volume (the boot volume). Appends. */
static void DiagSetFile(short vRefNum)
{
    OSErr err;
    long eof;
    gDiagFileVRef = vRefNum;
    err = Create("\pMacinclaude Diag.log", vRefNum, 'ttxt', 'TEXT');
    /* dupFNErr is fine - we append */
    if (FSOpen("\pMacinclaude Diag.log", vRefNum, &gDiagFileRef) != noErr) { gDiagFileRef = 0; return; }
    if (GetEOF(gDiagFileRef, &eof) == noErr) SetFPos(gDiagFileRef, fsFromStart, eof);
    gDiagFileOn = true;
}
static void DiagCloseFile(void)
{
    if (gDiagFileRef) { FSClose(gDiagFileRef); gDiagFileRef = 0; }
    if (gDiagFileOn) FlushVol(NULL, gDiagFileVRef);
    gDiagFileOn = false;
}

/* ---- the log call ---- */

/* Assemble one line into out[] (NUL-terminated), return its length.
 * Format: "<ticks>  <tag>  <msg>" optionally "  =<num>". */
static short DiagFormat(char *out, const char *tag, const char *msg, Boolean hasNum, long num)
{
    short n = 0;
    DgU(out, &n, (unsigned long)(TickCount() - gDiagT0));
    DgS(out, &n, "  ");
    DgS(out, &n, tag);
    DgS(out, &n, "  ");
    DgS(out, &n, msg);
    if (hasNum) {
        DgS(out, &n, "  =");
        if (num < 0) { if (n < DIAG_COLS) out[n++] = '-'; num = -num; }
        DgU(out, &n, (unsigned long)num);
    }
    out[n] = 0;
    return n;
}

static void DiagEmit(const char *tag, const char *msg, Boolean hasNum, long num)
{
    char line[DIAG_COLS + 4];
    short len;
    short i;

    len = DiagFormat(line, tag, msg, hasNum, num);

    /* SCREEN sink: ring buffer */
    for (i = 0; i < len && i < DIAG_COLS; i++) gDiagBuf[gDiagHead][i] = line[i];
    gDiagBuf[gDiagHead][i] = 0;
    gDiagHead = (gDiagHead + 1) % DIAG_LINES;
    if (gDiagCount < DIAG_LINES) gDiagCount++;

    /* WIRE sink */
    if (gDiagWire) {
        line[len] = '\r'; line[len + 1] = '\n';
        gDiagWire(line, (short)(len + 2));
        line[len] = 0;
    }

    /* FILE sink */
    if (gDiagFileOn && gDiagFileRef) {
        long cnt = len;
        char crlf[2]; crlf[0] = '\r'; crlf[1] = '\n';
        FSWrite(gDiagFileRef, &cnt, (Ptr)line);
        cnt = 2; FSWrite(gDiagFileRef, &cnt, (Ptr)crlf);
    }
}

static void DiagLog(const char *tag, const char *msg) { DiagEmit(tag, msg, false, 0); }
static void DiagLogNum(const char *tag, const char *msg, long num) { DiagEmit(tag, msg, true, num); }

/* Periodically flush the file so a crash/hang still leaves a record. */
static void DiagFlush(void) { if (gDiagFileOn) FlushVol(NULL, gDiagFileVRef); }

/* ---- screen rendering: draw the last `maxLines` into a rect (Monaco 9) ---- */
static void DiagDraw(short left, short top, short maxLines)
{
    short shown = gDiagCount < maxLines ? gDiagCount : maxLines;
    short i, y = top;
    short start = gDiagCount - shown;
    TextFont(monaco); TextSize(9); TextFace(0);
    for (i = 0; i < shown; i++) {
        short idx = (gDiagHead - shown + i + DIAG_LINES * 2) % DIAG_LINES;
        short n = 0; while (gDiagBuf[idx][n]) n++;
        MoveTo(left, y);
        DrawText(gDiagBuf[idx], 0, n);
        y += 11;
    }
}
