/*
 * muxclient.inc - the Plus-side client of the Macinclaude multiplexer.
 * Speaks the MUX framing (agent-mux/src/protocol.ts) over ONE serial link so
 * an app can hold several logical channels to different mini agents at once.
 * This is the data-path heart of "always-on WiFi": dial once, share the link.
 *
 * Shared between the demo app and (later) the resident .WIFI driver. Uses the
 * host's serial primitives, which must be defined BEFORE including:
 *   void MuxSendRaw(const char *bytes, long n);   // write to the serial link
 * and the receive parser mux_rx.inc (its MuxData/MuxClosed/MuxErr/MuxPing
 * callbacks route incoming channel data — defined by the host).
 *
 * Frames we SEND:
 *   MUXOPEN <chan> <service>\r\n     open a channel to a named mini service
 *   MUX <chan> <nbytes>\r\n<bytes>   send raw bytes on a channel
 *   MUXCLOSE <chan>\r\n
 *   MUXPONG\r\n                       (answer a MUXPING)
 */

static void MuxNumStr(char *b, short *n, long v)
{
    char t[12]; short k = 0;
    if (v == 0) t[k++] = '0';
    while (v > 0) { t[k++] = (char)('0' + (v % 10)); v /= 10; }
    while (k > 0) b[(*n)++] = t[--k];
}

static void MuxOpen(short chan, const char *service)
{
    char b[80]; short n = 0; short i;
    b[n++]='M';b[n++]='U';b[n++]='X';b[n++]='O';b[n++]='P';b[n++]='E';b[n++]='N';b[n++]=' ';
    MuxNumStr(b, &n, chan);
    b[n++] = ' ';
    for (i = 0; service[i] && n < 70; i++) b[n++] = service[i];
    b[n++] = '\r'; b[n++] = '\n';
    MuxSendRaw(b, n);
}

static void MuxClose(short chan)
{
    char b[24]; short n = 0;
    b[n++]='M';b[n++]='U';b[n++]='X';b[n++]='C';b[n++]='L';b[n++]='O';b[n++]='S';b[n++]='E';b[n++]=' ';
    MuxNumStr(b, &n, chan);
    b[n++] = '\r'; b[n++] = '\n';
    MuxSendRaw(b, n);
}

/* send a chunk of bytes on a channel: header line, then the raw payload */
static void MuxSend(short chan, const char *data, long len)
{
    char hdr[28]; short n = 0;
    hdr[n++]='M';hdr[n++]='U';hdr[n++]='X';hdr[n++]=' ';
    MuxNumStr(hdr, &n, chan);
    hdr[n++] = ' ';
    MuxNumStr(hdr, &n, len);
    hdr[n++] = '\r'; hdr[n++] = '\n';
    MuxSendRaw(hdr, n);
    MuxSendRaw(data, len);
}

/* convenience: send a C string + CR on a channel (the agents are line-based) */
static void MuxSendLine(short chan, const char *s)
{
    char buf[300]; long n = 0;
    while (s[n] && n < 298) { buf[n] = s[n]; n++; }
    buf[n++] = '\r';
    MuxSend(chan, buf, n);
}

static void MuxPong(void) { MuxSendRaw("MUXPONG\r\n", 9); }
