/*
 * atkinson_rx.inc - the frame receive state machine, shared verbatim between
 * the Plus app (atkinson.c) and the host test (rxtest.c). It is pure parsing:
 * it depends only on the image globals (gImgBuf/gImgRB/gImgW/gImgH/gImgValid),
 * the IMG_W/IMG_H constants, and four host callbacks (DrawBand, ClearCanvas,
 * SetStatus, SetStatusPct). atkinson.c supplies the Mac versions; rxtest.c
 * supplies stubs - so this decoder is tested against the real agent frame
 * without a serial link or the emulator.
 *
 * The agent streams: "ATKIMG w h rb", then h hex rows, then "ATKEND" (or
 * "ATKERR msg"). Serial bytes go through FeedRxByte(); completed lines go to
 * RxLine(). Each decoded row is blitted as it lands, so the image develops
 * with byte arrival - the Polaroid effect, for real this time.
 */
enum { RX_IDLE, RX_WAIT_HEADER, RX_READ_ROWS };
static short gRxState = RX_IDLE;
static char  gRxLine[300];      /* one wire line; rb*2 hex = up to 256 */
static short gRxLineLen = 0;
static short gRxRow = 0;        /* next image row to fill */
static short gDrawnRow = 0;     /* rows [0,gDrawnRow) already blitted (band boundary) */
#define RX_BAND 30              /* blit in 30-row bands, never a single scanline */
static unsigned long gRxDeadline = 0;   /* abort if the agent goes silent */

static short HexNib(char c)
{
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

/* Parse "ATKIMG w h rb" -> dimensions. Returns true on a sane header. */
static Boolean ParseHeader(const char *line)
{
    const char *p = line + 6;        /* past "ATKIMG" */
    long w = 0, h = 0, rb = 0; short field = 0;
    while (*p) {
        if (*p == ' ') { field++; p++; continue; }
        if (*p >= '0' && *p <= '9') {
            long v = *p - '0';
            if (field == 1) w = w * 10 + v;
            else if (field == 2) h = h * 10 + v;
            else if (field == 3) rb = rb * 10 + v;
        }
        p++;
    }
    if (w != IMG_W || h != IMG_H || rb != IMG_W / 8) return false;
    gImgW = (short)w; gImgH = (short)h; gImgRB = (short)rb;
    return true;
}

/* Decode one hex row line into gImgBuf at row `row`. Blitting is done in
   multi-row BANDS by the caller (RxLine), NOT here: a 1-pixel-tall CopyBits
   (DrawBand(row, row+1)) crashed the real Plus's QuickDraw with an address
   error on the very first blit — the breadcrumb log ended at "rx row 0 decoded"
   with no "blitted". The tested test-image render always blits multi-row bands,
   which are safe; so we accumulate rows here and band-blit them. */
static void TakeRow(const char *line, short len, short row)
{
    short need = gImgRB * 2, i;
    unsigned char *dst = gImgBuf + (long)row * gImgRB;
    if (len < need) return;                  /* short line - skip, don't corrupt */
    for (i = 0; i < gImgRB; i++) {
        short hi = HexNib(line[i * 2]), lo = HexNib(line[i * 2 + 1]);
        if (hi < 0 || lo < 0) return;
        dst[i] = (unsigned char)((hi << 4) | lo);
    }
    gImgValid = true;
}

static void RxAbort(const char *why)
{
    gRxState = RX_IDLE;
    RxNote(why);                /* breadcrumb to the shared log (app) / stub (test) */
    SetStatus(why);
}

static void RxLine(char *line, short len)
{
    line[len] = 0;
    if (gRxState == RX_WAIT_HEADER) {
        if (len >= 6 && line[0]=='A'&&line[1]=='T'&&line[2]=='K'&&line[3]=='I'&&line[4]=='M'&&line[5]=='G') {
            if (!ParseHeader(line)) { RxAbort("bad image header"); return; }
            RxNote("receiving image");
            ClearCanvas();
            gImgValid = false;          /* nothing drawn yet */
            gRxRow = 0;
            gDrawnRow = 0;
            gRxState = RX_READ_ROWS;
            SetStatus("receiving 0%");
        } else if (len >= 6 && line[0]=='A'&&line[1]=='T'&&line[2]=='K'&&line[3]=='E'&&line[4]=='R'&&line[5]=='R') {
            RxAbort(line[6] ? line + 7 : "agent error");
        }
        /* anything else before the header (banners, blank lines): ignore */
        return;
    }
    if (gRxState == RX_READ_ROWS) {
        if (len >= 6 && line[0]=='A'&&line[1]=='T'&&line[2]=='K'&&line[3]=='E'&&line[4]=='N'&&line[5]=='D') {
            if (gRxRow > gDrawnRow) { DrawBand(gDrawnRow, gRxRow); gDrawnRow = gRxRow; }  /* final band */
            gRxState = RX_IDLE;
            RxNote(gRxRow >= gImgH ? "image done" : "image done (partial)");
            SetStatus(gRxRow >= gImgH ? "done" : "done (partial)");
            return;
        }
        if (len >= 6 && line[0]=='A'&&line[1]=='T'&&line[2]=='K'&&line[3]=='E'&&line[4]=='R'&&line[5]=='R') {
            RxAbort(line[6] ? line + 7 : "agent error");
            return;
        }
        if (gRxRow < gImgH) {
            TakeRow(line, len, gRxRow);
            gRxRow++;
            if (gRxRow - gDrawnRow >= RX_BAND || gRxRow == gImgH) {
                DrawBand(gDrawnRow, gRxRow);          /* blit the new band (>=1px, ~30 in practice) */
                RxMark(gRxRow, 1);                    /* breadcrumb: band blitted up to row N */
                gDrawnRow = gRxRow;
                SetStatusPct("receiving", (short)((long)gRxRow * 100 / gImgH));
            }
        }
    }
}

static void FeedRxByte(unsigned char c)
{
    if (c == '\n') { RxLine(gRxLine, gRxLineLen); gRxLineLen = 0; return; }
    if (c == '\r') return;                  /* lines end on \n; ignore CR */
    if (gRxLineLen < (short)sizeof(gRxLine) - 1) gRxLine[gRxLineLen++] = (char)c;
    /* overlong line (shouldn't happen): drop extra chars, the row will be skipped */
}
