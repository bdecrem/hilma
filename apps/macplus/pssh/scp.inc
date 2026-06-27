/* scp.inc — the SCP protocol (over an SSH "exec" channel), as a pure state
 * machine shared verbatim between the host test (scptest.c) and Plutonix.
 *
 * Upload  ("scp -t <remote>"): server acks 0x00, we send "C0644 <size> <name>\n",
 *   server acks, we send <size> data bytes + 0x00, server acks, done.
 * Download("scp -f <remote>"): we send 0x00, read "C<mode> <size> <name>\n",
 *   send 0x00, read <size> data bytes + trailing 0x00, send 0x00, done.
 *
 * The caller feeds received channel bytes to scp_feed(); the machine emits bytes
 * via emit() and moves file data through fread_cb (upload) / fwrite_cb (download).
 * No heap, no platform calls — works on the host and the 68000.
 */
#ifndef SCP_INC
#define SCP_INC

#include <stdint.h>
#include <string.h>

enum { SCP_PUT = 0, SCP_GET = 1 };
/* states */
enum {
    SCPS_WAIT0,      /* upload: wait server's initial 0x00 */
    SCPS_WAITC,      /* upload: sent C-line, wait ack */
    SCPS_WAITEND,    /* upload: sent data+\0, wait final ack */
    SCPS_DONE,
    SCPS_ERR,
    SCPG_CLINE,      /* download: reading the C-line */
    SCPG_DATA,       /* download: reading file bytes */
    SCPG_TRAIL       /* download: read trailing 0x00 */
};

typedef int  (*scp_emit_fn)(void *u, const uint8_t *d, uint32_t n);  /* -> channel; 0 ok */
typedef long (*scp_fread_fn)(void *u, uint8_t *buf, long max);       /* upload: read file; 0=EOF */
typedef int  (*scp_fwrite_fn)(void *u, const uint8_t *d, long n);    /* download: write file; 0 ok */

typedef struct {
    int  mode, st;
    long size, moved;
    char name[64];
    char cline[96]; int clen;
    int  finished, error;
    void *u;
    scp_emit_fn   emit;
    scp_fread_fn  fread_cb;
    scp_fwrite_fn fwrite_cb;
} ScpCtx;

static void scp__fail(ScpCtx *s){ s->st = SCPS_ERR; s->error = 1; s->finished = 1; }

/* upload: stream the whole file body, then a terminating 0x00 */
static void scp__send_body(ScpCtx *s)
{
    uint8_t buf[512];
    long left = s->size;
    while (left > 0) {
        long want = left < (long)sizeof(buf) ? left : (long)sizeof(buf);
        long got  = s->fread_cb(s->u, buf, want);
        if (got <= 0) { scp__fail(s); return; }
        if (s->emit(s->u, buf, (uint32_t)got) != 0) { scp__fail(s); return; }
        left -= got; s->moved += got;
    }
    { uint8_t z = 0; s->emit(s->u, &z, 1); }   /* end-of-file marker */
}

/* call once after init. For upload there is nothing to send until the server's
   first 0x00; for download we must send the opening 0x00 to start the source. */
static void scp_start(ScpCtx *s)
{
    if (s->mode == SCP_GET) { uint8_t z = 0; s->emit(s->u, &z, 1); s->st = SCPG_CLINE; s->clen = 0; }
    else { s->st = SCPS_WAIT0; }
}

static void scp_put_init(ScpCtx *s, scp_emit_fn emit, scp_fread_fn fr, void *u,
                         const char *name, long size)
{
    const char *base = name, *p;
    memset(s, 0, sizeof(*s));
    s->mode = SCP_PUT; s->emit = emit; s->fread_cb = fr; s->u = u;
    s->size = size;
    /* the C-line name must be a bare filename (scp rejects slashes) */
    for (p = name; *p; p++) if (*p == '/') base = p + 1;
    strncpy(s->name, base, sizeof(s->name) - 1);
}

static void scp_get_init(ScpCtx *s, scp_emit_fn emit, scp_fwrite_fn fw, void *u)
{
    memset(s, 0, sizeof(*s));
    s->mode = SCP_GET; s->emit = emit; s->fwrite_cb = fw; s->u = u;
}

/* parse "C0644 <size> <name>" out of s->cline (the leading 'C' already seen) */
static void scp__parse_cline(ScpCtx *s)
{
    const char *p = s->cline;
    long sz = 0; int i = 0;
    if (*p != 'C') { scp__fail(s); return; }
    p++;                                /* skip 'C' */
    while (*p && *p != ' ') p++;         /* skip mode */
    while (*p == ' ') p++;
    while (*p >= '0' && *p <= '9') { sz = sz * 10 + (*p - '0'); p++; }
    while (*p == ' ') p++;
    while (*p && *p != '\n' && i < (int)sizeof(s->name) - 1) s->name[i++] = *p++;
    s->name[i] = 0;
    s->size = sz; s->moved = 0;
    { uint8_t z = 0; s->emit(s->u, &z, 1); }   /* ack the C-line */
    s->st = (sz > 0) ? SCPG_DATA : SCPG_TRAIL;
}

static void scp_feed(ScpCtx *s, const uint8_t *d, uint32_t n)
{
    uint32_t i = 0;
    while (i < n && !s->finished) {
        switch (s->st) {
        case SCPS_WAIT0:                 /* upload: server ready */
            if (d[i] != 0) { scp__fail(s); return; }
            i++;
            { char line[96]; int k = 0; const char *q;
              line[k++]='C'; line[k++]='0'; line[k++]='6'; line[k++]='4'; line[k++]='4'; line[k++]=' ';
              { long v=s->size; char tmp[20]; int t=0; if(v==0)tmp[t++]='0';
                while(v){tmp[t++]=(char)('0'+v%10); v/=10;} while(t) line[k++]=tmp[--t]; }
              line[k++]=' '; q=s->name; while(*q && k<94) line[k++]=*q++; line[k++]='\n';
              if (s->emit(s->u,(const uint8_t*)line,(uint32_t)k)!=0){scp__fail(s);return;} }
            s->st = SCPS_WAITC;
            break;
        case SCPS_WAITC:                 /* upload: ack of C-line -> send body */
            if (d[i] != 0) { scp__fail(s); return; }
            i++;
            scp__send_body(s);
            if (s->st != SCPS_ERR) s->st = SCPS_WAITEND;
            break;
        case SCPS_WAITEND:               /* upload: final ack */
            if (d[i] != 0) { scp__fail(s); return; }
            i++;
            s->st = SCPS_DONE; s->finished = 1;
            break;
        case SCPG_CLINE:                 /* download: accumulate the control line */
            if (d[i] == 1 || d[i] == 2) { scp__fail(s); return; }   /* server error byte */
            if (d[i] == '\n') { s->cline[s->clen] = 0; i++; scp__parse_cline(s); }
            else { if (s->clen < (int)sizeof(s->cline)-1) s->cline[s->clen++] = (char)d[i]; i++; }
            break;
        case SCPG_DATA: {                /* download: file bytes */
            long left = s->size - s->moved;
            uint32_t take = n - i; if ((long)take > left) take = (uint32_t)left;
            if (s->fwrite_cb(s->u, d + i, (long)take) != 0) { scp__fail(s); return; }
            s->moved += take; i += take;
            if (s->moved >= s->size) s->st = SCPG_TRAIL;
            break;
        }
        case SCPG_TRAIL:                 /* download: trailing 0x00 then we ack + done */
            if (d[i] != 0) { scp__fail(s); return; }
            i++;
            { uint8_t z = 0; s->emit(s->u, &z, 1); }
            s->st = SCPS_DONE; s->finished = 1;
            break;
        default:
            return;
        }
    }
}

#endif /* SCP_INC */
