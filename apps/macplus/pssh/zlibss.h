/* zlibss.h - portable streaming zlib (RFC 1950) / DEFLATE (RFC 1951) codec
 *
 * Purpose: the compression layer for an SSH client ("zlib" /
 * "zlib@openssh.com").  It interoperates with stock zlib (which is what
 * OpenSSH uses), and compiles on both a modern host (clang) and a 1986
 * Macintosh (68000, Retro68 gcc).
 *
 * SSH usage model (this is what the API is designed around):
 *   - ONE zlib stream per direction for the whole connection.
 *   - Each outbound packet payload is compressed with deflate(...,
 *     Z_SYNC_FLUSH); the peer decompresses it immediately.
 *   - State (the LZ77 history / sliding window) persists across packets.
 *
 * So: streaming, partial-flush (sync flush), persistent context, both
 * directions.  Each *_run() call consumes one packet's worth of data and
 * sync-flushes, leaving the byte stream aligned so the peer can decode.
 *
 * Memory (no heap is used; every buffer lives inside the context struct):
 *   - zss_inflate:  ~34 KB  (full 32 KB sliding window required, because a
 *                            stock-zlib peer may compress with a 32 KB
 *                            window; plus ~1.5 KB of Huffman tables).
 *   - zss_deflate:  ~16 KB  (small 4 KB compressor window + 8 KB frame +
 *                            4 KB hash head table; the smaller window is
 *                            advertised honestly in the zlib CMF byte, and
 *                            a stock-zlib peer handles any window we
 *                            advertise).
 *
 * Portability: <stdint.h> / <string.h> only.  No heap, no OS calls, no
 * system zlib, no __int128.  Freestanding C89/C99.  All large buffers are
 * in the context structs (never on the stack -- the 68k stack is small).
 */
#ifndef ZLIBSS_H
#define ZLIBSS_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ---- compressor (deflate) sizing --------------------------------------- */
#define ZSS_CWBITS  12                 /* advertised window = 2^12 = 4 KB    */
#define ZSS_CWSIZE  (1 << ZSS_CWBITS)  /* 4096                               */
#define ZSS_FRAME   (2 * ZSS_CWSIZE)   /* 8192: history + current segment    */
#define ZSS_HBITS   12
#define ZSS_HSIZE   (1 << ZSS_HBITS)   /* 4096 hash heads                    */

/* ---- decompressor (inflate) sizing ------------------------------------- */
#define ZSS_WIN     32768              /* full 32 KB sliding window          */
#define ZSS_WMASK   (ZSS_WIN - 1)

/* Compressor context. No heap. ~16 KB. */
typedef struct {
    int      level;        /* 0..9, mapped to the zlib FLEVEL bits          */
    int      header_done;  /* zlib 2-byte header emitted yet?               */
    int      hlen;         /* bytes of valid history at front of hist[]     */

    /* bit-output accumulator (LSB-first, as DEFLATE requires) */
    uint32_t bi_buf;
    int      bi_valid;

    /* output cursor for the current *_run() call */
    uint8_t *out;
    uint32_t outcap;
    uint32_t outcnt;
    int      overflow;

    uint8_t  hist[ZSS_CWSIZE];   /* carried-over history (<= 4 KB)           */
    uint8_t  frame[ZSS_FRAME];   /* history + current input segment          */
    int16_t  head[ZSS_HSIZE];    /* hash -> last frame position (-1 = none)  */
} zss_deflate;

/* Decompressor context. No heap. ~34 KB. */
typedef struct {
    int      header_done;        /* zlib 2-byte header consumed yet?         */
    int      fixed_built;        /* fixed Huffman tables constructed yet?    */

    uint8_t  win[ZSS_WIN];       /* 32 KB circular history window            */
    uint32_t wpos;               /* next write index (0..32767)              */
    uint32_t wfilled;            /* valid history bytes (<= 32768)           */

    /* fixed Huffman tables (lit/len + dist) */
    int16_t  flcnt[16];
    int16_t  flsym[288];
    int16_t  fdcnt[16];
    int16_t  fdsym[30];

    /* dynamic Huffman tables (rebuilt per dynamic block) */
    int16_t  dlcnt[16];
    int16_t  dlsym[288];
    int16_t  ddcnt[16];
    int16_t  ddsym[32];
} zss_inflate;

/* Returns 0 on success, <0 on error. */
int  zss_deflate_init(zss_deflate *z, int level);
int  zss_deflate_run(zss_deflate *z, const uint8_t *in, uint32_t inlen,
                     uint8_t *out, uint32_t outcap, uint32_t *outlen);
void zss_deflate_free(zss_deflate *z);

int  zss_inflate_init(zss_inflate *z);
int  zss_inflate_run(zss_inflate *z, const uint8_t *in, uint32_t inlen,
                     uint8_t *out, uint32_t outcap, uint32_t *outlen);
void zss_inflate_free(zss_inflate *z);

#ifdef __cplusplus
}
#endif

#endif /* ZLIBSS_H */
