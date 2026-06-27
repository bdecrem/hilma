/* zlibss.c - streaming zlib / DEFLATE codec.  See zlibss.h for the design.
 *
 * Inflate is a from-scratch implementation following the structure of Mark
 * Adler's "puff" (zlib license, public-reference): canonical Huffman tables
 * stored as (count[], symbol[]) with a bit-at-a-time decoder.  It is made
 * streaming here by keeping the 32 KB window in the context across calls and
 * resolving back-references against that window rather than the output buffer.
 *
 * Deflate emits valid fixed-Huffman blocks from a small-window greedy LZ77
 * matcher, then a Z_SYNC_FLUSH empty stored block (00 00 FF FF) after each
 * call, exactly like zlib's Z_SYNC_FLUSH.
 */
#include "zlibss.h"
#include <string.h>

/* error codes */
#define ZE_OVERFLOW   -1
#define ZE_SHORT      -2
#define ZE_NLEN       -3
#define ZE_NOTDEFLATE -4
#define ZE_BADCHECK   -5
#define ZE_FDICT      -6
#define ZE_BADTYPE    -7
#define ZE_BADINPUT   -8
#define ZE_BADSYM     -9
#define ZE_BADCODE    -10
#define ZE_DISTFAR    -11
#define ZE_BADTABLE   -12

#define MAXBITS  15
#define MINMATCH 3
#define MAXMATCH 258

/* DEFLATE length/distance base + extra-bit tables (RFC 1951) */
static const int g_lbase[29] = {
    3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,
    195,227,258 };
static const int g_lext[29] = {
    0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0 };
static const int g_dbase[30] = {
    1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,
    3073,4097,6145,8193,12289,16385,24577 };
static const int g_dext[30] = {
    0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13 };

/* ===================================================================== */
/* INFLATE  (fully resumable streaming state machine)                    */
/* ===================================================================== */
/*
 * This decoder treats all calls as one continuous deflate bit stream and may
 * SUSPEND at any bit position when the current chunk's input runs out, then
 * RESUME on the next call with no loss of state.  The persistent state lives
 * in the context (zss_inflate): bit buffer + count, the state-machine `mode`,
 * the 32 KB window, any in-flight stored/dynamic sub-state, and the tables.
 *
 * The key trick that makes mid-symbol suspension clean: bit consumption is
 * COMMITTED only when an operation fully completes.  Reads use a local `used`
 * offset that peeks bits at (bitbuf >> used) WITHOUT removing them; on success
 * we remove `used` bits in one shot; on suspend we simply return without
 * removing anything, so re-running the operation next call re-reads the same
 * bits (now joined by freshly arrived ones).  Input bytes pulled into bitbuf
 * persist there across calls, so nothing is ever re-fetched from old `in`.
 */

/* state-machine modes */
#define ST_INIT       0   /* need the 2-byte zlib header (must be 0: memset) */
#define ST_HEADER     1   /* between blocks: read block header               */
#define ST_STORED_LEN 2   /* stored block: read LEN/NLEN                      */
#define ST_STORED     3   /* stored block: copying LEN bytes                 */
#define ST_CODES      4   /* compressed block: decoding lit/len/dist         */
#define ST_DYNAMIC    5   /* dynamic block: read HLIT/HDIST/HCLEN            */
#define ST_DYN_CL     6   /* dynamic block: read code-length code lengths    */
#define ST_DYN_LENS   7   /* dynamic block: read lit/dist code lengths       */
#define ST_DONE       8   /* final block (BFINAL=1) decoded: stop            */

struct ins {
    const uint8_t *in;
    uint32_t inlen, incnt;
    uint8_t *out;
    uint32_t outcap, outcnt;
    int      overflow;
    int      suspend;        /* set when input ran out -- stop, resume later  */
    zss_inflate *z;
};

/* Make at least `need` bits available in bitbuf without removing any.
   Returns 1 if available; on input exhaustion sets suspend and returns 0.
   bitbuf is 64-bit; the largest atomic peek window is a match unit
   (15 + 5 + 15 + 13 = 48 bits), well within range. */
static int inf_ensure(struct ins *s, int need) {
    while (s->z->bitcnt < need) {
        if (s->incnt >= s->inlen) { s->suspend = 1; return 0; }
        s->z->bitbuf |= (uint64_t)s->in[s->incnt++] << s->z->bitcnt;
        s->z->bitcnt += 8;
    }
    return 1;
}

/* remove `n` bits from the front of bitbuf (commit) */
static void inf_drop(struct ins *s, int n) {
    s->z->bitbuf >>= n;
    s->z->bitcnt -= n;
}

/* read+commit n bits (n<=32); returns 0 (suspend) without consuming if short */
static int inf_getbits(struct ins *s, int n, uint32_t *val) {
    if (n == 0) { *val = 0; return 1; }
    if (!inf_ensure(s, n)) return 0;
    *val = (uint32_t)(s->z->bitbuf & (((uint64_t)1 << n) - 1));
    inf_drop(s, n);
    return 1;
}

/* peek n bits at offset *used (no commit); advances *used on success */
static int inf_peekbits(struct ins *s, int n, int *used, uint32_t *val) {
    if (n == 0) { *val = 0; return 1; }
    if (!inf_ensure(s, *used + n)) return 0;
    *val = (uint32_t)((s->z->bitbuf >> *used) & (((uint64_t)1 << n) - 1));
    *used += n;
    return 1;
}

/* emit one byte to output + window */
static int inf_emit(struct ins *s, int b) {
    if (s->outcnt >= s->outcap) { s->overflow = 1; return -1; }
    s->out[s->outcnt++] = (uint8_t)b;
    s->z->win[s->z->wpos] = (uint8_t)b;
    s->z->wpos = (s->z->wpos + 1) & ZSS_WMASK;
    if (s->z->wfilled < ZSS_WIN) s->z->wfilled++;
    return 0;
}

/* Decode one canonical-Huffman symbol by PEEKING at offset *used.
   On success advances *used past the code (caller commits later).
   On input exhaustion sets suspend and returns ZE_BADINPUT (caller checks
   s->suspend first).  Bits are read MSB-first within the code, matching
   DEFLATE: the bit at stream offset (*used+len-1) is appended low. */
static int inf_decode(struct ins *s, const int16_t *count, const int16_t *symbol,
                      int *used) {
    int len, code = 0, first = 0, index = 0, cnt;
    for (len = 1; len <= MAXBITS; len++) {
        if (!inf_ensure(s, *used + len)) return ZE_BADINPUT;  /* suspend */
        code |= (int)((s->z->bitbuf >> (*used + len - 1)) & 1);
        cnt = count[len];
        if (code - cnt < first) { *used += len; return symbol[index + (code - first)]; }
        index += cnt;
        first += cnt;
        first <<= 1;
        code <<= 1;
    }
    return ZE_BADCODE;
}

/* build (count[], symbol[]) from code lengths */
static int inf_construct(int16_t *count, int16_t *symbol,
                         const int16_t *length, int n) {
    int sym, len, left;
    int16_t offs[MAXBITS + 1];
    for (len = 0; len <= MAXBITS; len++) count[len] = 0;
    for (sym = 0; sym < n; sym++) count[length[sym]]++;
    if (count[0] == n) return 0;          /* no codes -- empty (valid) */
    left = 1;
    for (len = 1; len <= MAXBITS; len++) {
        left <<= 1;
        left -= count[len];
        if (left < 0) return left;        /* over-subscribed */
    }
    offs[1] = 0;
    for (len = 1; len < MAXBITS; len++)
        offs[len + 1] = (int16_t)(offs[len] + count[len]);
    for (sym = 0; sym < n; sym++)
        if (length[sym] != 0) symbol[offs[length[sym]]++] = (int16_t)sym;
    return left;                          /* >0 means incomplete (ok for dist) */
}

static void inf_build_fixed(zss_inflate *z) {
    int16_t lengths[288];
    int i;
    if (z->fixed_built) return;
    for (i = 0;   i < 144; i++) lengths[i] = 8;
    for (i = 144; i < 256; i++) lengths[i] = 9;
    for (i = 256; i < 280; i++) lengths[i] = 7;
    for (i = 280; i < 288; i++) lengths[i] = 8;
    inf_construct(z->flcnt, z->flsym, lengths, 288);
    for (i = 0; i < 30; i++) lengths[i] = 5;
    inf_construct(z->fdcnt, z->fdsym, lengths, 30);
    z->fixed_built = 1;
}

/* code-length code order (RFC 1951 3.2.7) */
static const int g_clorder[19] = {
    16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15 };

/* Decode lit/len/dist codes until end-of-block.
   Returns 0 = EOB reached, 1 = suspended (resume in ST_CODES),
   <0 = error/overflow.  Each symbol/match unit is atomic: bits are peeked via
   `used` and only dropped once the whole unit decodes, so a mid-unit suspend
   leaves the bit buffer untouched and the unit is re-decoded next call. */
static int inf_codes(struct ins *s,
                     const int16_t *lc, const int16_t *ls,
                     const int16_t *dc, const int16_t *ds) {
    zss_inflate *z = s->z;
    for (;;) {
        int used = 0, sym, dsym, len;
        uint32_t e, dist;

        sym = inf_decode(s, lc, ls, &used);
        if (s->suspend) return 1;
        if (sym < 0) return sym;

        if (sym < 256) {
            inf_drop(s, used);
            if (inf_emit(s, sym)) return ZE_OVERFLOW;
            continue;
        }
        if (sym == 256) {                 /* end of block */
            inf_drop(s, used);
            return 0;
        }
        sym -= 257;
        if (sym >= 29) return ZE_BADSYM;
        len = g_lbase[sym];
        if (g_lext[sym]) {
            if (!inf_peekbits(s, g_lext[sym], &used, &e)) return 1;
            len += (int)e;
        }
        dsym = inf_decode(s, dc, ds, &used);
        if (s->suspend) return 1;
        if (dsym < 0) return dsym;
        if (dsym >= 30) return ZE_BADSYM;
        dist = (uint32_t)g_dbase[dsym];
        if (g_dext[dsym]) {
            if (!inf_peekbits(s, g_dext[dsym], &used, &e)) return 1;
            dist += e;
        }
        inf_drop(s, used);                /* whole match unit decoded -- commit */
        if (dist > z->wfilled) return ZE_DISTFAR;
        while (len--) {
            int b = z->win[(z->wpos - dist) & ZSS_WMASK];
            if (inf_emit(s, b)) return ZE_OVERFLOW;
        }
    }
}

/* Perform one state-machine step.
   Returns 0 = progress (call again), 1 = suspended (out of input, return ok),
   <0 = error. */
static int inf_step(struct ins *s) {
    zss_inflate *z = s->z;
    switch (z->mode) {

    case ST_DONE:                         /* final block decoded: nothing more */
        return 1;

    case ST_INIT: {                       /* 2-byte zlib header */
        int used = 0;
        uint32_t cmf, flg;
        if (!inf_peekbits(s, 8, &used, &cmf)) return 1;
        if (!inf_peekbits(s, 8, &used, &flg)) return 1;
        if ((cmf & 0x0F) != 8) return ZE_NOTDEFLATE;          /* CM must be 8 */
        if (((cmf << 8) | flg) % 31 != 0) return ZE_BADCHECK;
        if (flg & 0x20) return ZE_FDICT;                      /* preset dict */
        inf_drop(s, used);
        z->mode = ST_HEADER;
        return 0;
    }

    case ST_HEADER: {                     /* block header: BFINAL + BTYPE */
        int used = 0;
        uint32_t bfinal, btype;
        if (!inf_peekbits(s, 1, &used, &bfinal)) return 1;
        if (!inf_peekbits(s, 2, &used, &btype)) return 1;
        inf_drop(s, used);
        z->bfinal = (int)bfinal;          /* remember: stop after this block if set */
        if (btype == 0) {
            /* skip to byte boundary: drop the low (bitcnt & 7) bits */
            inf_drop(s, z->bitcnt & 7);
            z->mode = ST_STORED_LEN;
        } else if (btype == 1) {
            inf_build_fixed(z);
            z->cur_dynamic = 0;
            z->mode = ST_CODES;
        } else if (btype == 2) {
            z->mode = ST_DYNAMIC;
        } else {
            return ZE_BADTYPE;
        }
        return 0;
    }

    case ST_STORED_LEN: {
        int used = 0;
        uint32_t len, nlen;
        if (!inf_peekbits(s, 16, &used, &len))  return 1;
        if (!inf_peekbits(s, 16, &used, &nlen)) return 1;
        inf_drop(s, used);
        if ((len ^ 0xFFFF) != nlen) return ZE_NLEN;
        z->stored_rem = len;
        z->mode = ST_STORED;
        return 0;
    }

    case ST_STORED: {
        while (z->stored_rem) {
            uint32_t b;
            if (!inf_getbits(s, 8, &b)) return 1;   /* per-byte atomic */
            if (inf_emit(s, (int)b)) return ZE_OVERFLOW;
            z->stored_rem--;
        }
        z->mode = z->bfinal ? ST_DONE : ST_HEADER;
        return 0;
    }

    case ST_CODES: {
        int r;
        if (z->cur_dynamic)
            r = inf_codes(s, z->dlcnt, z->dlsym, z->ddcnt, z->ddsym);
        else
            r = inf_codes(s, z->flcnt, z->flsym, z->fdcnt, z->fdsym);
        if (r == 1) return 1;             /* suspended mid-block */
        if (r < 0) return r;
        z->mode = z->bfinal ? ST_DONE : ST_HEADER;   /* end of block */
        return 0;
    }

    case ST_DYNAMIC: {                    /* HLIT(5) HDIST(5) HCLEN(4) */
        int used = 0, i;
        uint32_t a, b, c;
        if (!inf_peekbits(s, 5, &used, &a)) return 1;
        if (!inf_peekbits(s, 5, &used, &b)) return 1;
        if (!inf_peekbits(s, 4, &used, &c)) return 1;
        inf_drop(s, used);
        z->dyn_nlen  = (int)a + 257;
        z->dyn_ndist = (int)b + 1;
        z->dyn_ncode = (int)c + 4;
        if (z->dyn_nlen > 286 || z->dyn_ndist > 30) return ZE_BADTABLE;
        for (i = 0; i < 19; i++) z->cl_lengths[i] = 0;
        z->dyn_idx = 0;
        z->mode = ST_DYN_CL;
        return 0;
    }

    case ST_DYN_CL: {                     /* ncode 3-bit code-length lengths */
        while (z->dyn_idx < z->dyn_ncode) {
            uint32_t v;
            if (!inf_getbits(s, 3, &v)) return 1;
            z->cl_lengths[g_clorder[z->dyn_idx]] = (int16_t)v;
            z->dyn_idx++;
        }
        if (inf_construct(z->clcnt, z->clsym, z->cl_lengths, 19) != 0)
            return ZE_BADTABLE;           /* code-length code must be complete */
        z->dyn_idx = 0;
        z->dyn_prev = 0;
        z->mode = ST_DYN_LENS;
        return 0;
    }

    case ST_DYN_LENS: {                   /* lit/dist code lengths via cl code */
        int total = z->dyn_nlen + z->dyn_ndist;
        while (z->dyn_idx < total) {
            int used = 0, sym;
            uint32_t rep;
            sym = inf_decode(s, z->clcnt, z->clsym, &used);
            if (s->suspend) return 1;
            if (sym < 0) return sym;
            if (sym < 16) {
                inf_drop(s, used);
                z->dyn_lengths[z->dyn_idx++] = (int16_t)sym;
                z->dyn_prev = sym;
            } else if (sym == 16) {
                int k;
                if (z->dyn_idx == 0) return ZE_BADTABLE;
                if (!inf_peekbits(s, 2, &used, &rep)) return 1;
                inf_drop(s, used);
                k = 3 + (int)rep;
                while (k-- && z->dyn_idx < total)
                    z->dyn_lengths[z->dyn_idx++] = (int16_t)z->dyn_prev;
            } else if (sym == 17) {
                int k;
                if (!inf_peekbits(s, 3, &used, &rep)) return 1;
                inf_drop(s, used);
                k = 3 + (int)rep;
                while (k-- && z->dyn_idx < total) z->dyn_lengths[z->dyn_idx++] = 0;
                z->dyn_prev = 0;
            } else {                       /* sym == 18 */
                int k;
                if (!inf_peekbits(s, 7, &used, &rep)) return 1;
                inf_drop(s, used);
                k = 11 + (int)rep;
                while (k-- && z->dyn_idx < total) z->dyn_lengths[z->dyn_idx++] = 0;
                z->dyn_prev = 0;
            }
        }
        if (z->dyn_lengths[256] == 0) return ZE_BADTABLE;  /* need EOB code */
        if (inf_construct(z->dlcnt, z->dlsym, z->dyn_lengths, z->dyn_nlen) < 0)
            return ZE_BADTABLE;
        if (inf_construct(z->ddcnt, z->ddsym,
                          z->dyn_lengths + z->dyn_nlen, z->dyn_ndist) < 0)
            return ZE_BADTABLE;
        z->cur_dynamic = 1;
        z->mode = ST_CODES;
        return 0;
    }

    default:
        return ZE_BADINPUT;
    }
}

int zss_inflate_init(zss_inflate *z) {
    memset(z, 0, sizeof(*z));
    z->mode = ST_INIT;
    return 0;
}

void zss_inflate_free(zss_inflate *z) { (void)z; }

int zss_inflate_run(zss_inflate *z, const uint8_t *in, uint32_t inlen,
                    uint8_t *out, uint32_t outcap, uint32_t *outlen) {
    struct ins s;
    int rc;

    s.in = in; s.inlen = inlen; s.incnt = 0;
    s.out = out; s.outcap = outcap; s.outcnt = 0;
    s.overflow = 0; s.suspend = 0; s.z = z;
    /* bitbuf/bitcnt are NOT reset -- they carry partial bits across calls. */

    for (;;) {
        rc = inf_step(&s);
        if (rc == 1) break;     /* suspended: out of input for this chunk, ok */
        if (rc < 0) return rc;  /* hard error */
        /* rc == 0: progress, keep stepping */
    }

    *outlen = s.outcnt;
    return 0;
}

/* ===================================================================== */
/* DEFLATE                                                               */
/* ===================================================================== */

static void def_put_byte(zss_deflate *z, int b) {
    if (z->outcnt >= z->outcap) { z->overflow = 1; return; }
    z->out[z->outcnt++] = (uint8_t)b;
}

/* append `n` bits of `val`, LSB-first */
static void def_bits(zss_deflate *z, uint32_t val, int n) {
    z->bi_buf |= (val << z->bi_valid);
    z->bi_valid += n;
    while (z->bi_valid >= 8) {
        def_put_byte(z, (int)(z->bi_buf & 0xFF));
        z->bi_buf >>= 8;
        z->bi_valid -= 8;
    }
}

/* flush partial byte, padding with zero bits */
static void def_windup(zss_deflate *z) {
    if (z->bi_valid > 0) def_put_byte(z, (int)(z->bi_buf & 0xFF));
    z->bi_buf = 0;
    z->bi_valid = 0;
}

/* fixed lit/len Huffman code (canonical, MSB-first) for a symbol */
static void def_fixed_code(int sym, int *code, int *len) {
    if (sym < 144)      { *len = 8; *code = 0x30 + sym; }
    else if (sym < 256) { *len = 9; *code = 0x190 + (sym - 144); }
    else if (sym < 280) { *len = 7; *code = sym - 256; }
    else                { *len = 8; *code = 0xC0 + (sym - 280); }
}

/* send a Huffman code: MSB-first, i.e. bit-reversed into the LSB-first stream */
static void def_huff(zss_deflate *z, int code, int len) {
    uint32_t rev = 0;
    int i;
    for (i = 0; i < len; i++) { rev = (rev << 1) | (uint32_t)(code & 1); code >>= 1; }
    def_bits(z, rev, len);
}

static void def_sym(zss_deflate *z, int sym) {
    int code, len;
    def_fixed_code(sym, &code, &len);
    def_huff(z, code, len);
}

static void def_match(zss_deflate *z, int length, int dist) {
    int i, lc = 0, dc = 0;
    for (i = 28; i >= 0; i--) if (length >= g_lbase[i]) { lc = i; break; }
    def_sym(z, 257 + lc);
    if (g_lext[lc]) def_bits(z, (uint32_t)(length - g_lbase[lc]), g_lext[lc]);
    for (i = 29; i >= 0; i--) if (dist >= g_dbase[i]) { dc = i; break; }
    def_huff(z, dc, 5);
    if (g_dext[dc]) def_bits(z, (uint32_t)(dist - g_dbase[dc]), g_dext[dc]);
}

static int def_hash(const uint8_t *p) {
    int h = ((int)p[0] << 4) ^ ((int)p[1] << 2) ^ (int)p[2];
    return h & (ZSS_HSIZE - 1);
}

/* compress all of `in` for this call into the open fixed-Huffman block,
   emitting tokens.  Matching uses carried history + this call's bytes,
   capped to the 4 KB advertised window. */
static void def_compress(zss_deflate *z, const uint8_t *in, uint32_t inlen) {
    uint32_t pos = 0;
    while (pos < inlen) {
        int hlen = z->hlen;
        int segcap = ZSS_FRAME - hlen;
        uint32_t seg = inlen - pos;
        int framelen, i, keep;
        if (seg > (uint32_t)segcap) seg = (uint32_t)segcap;

        memcpy(z->frame, z->hist, (size_t)hlen);
        memcpy(z->frame + hlen, in + pos, (size_t)seg);
        framelen = hlen + (int)seg;

        for (i = 0; i < ZSS_HSIZE; i++) z->head[i] = -1;

        i = 0;
        while (i < framelen) {
            int emit = (i >= hlen);
            int bestlen = 0, bestpos = -1;
            if (i + MINMATCH <= framelen) {
                int h = def_hash(z->frame + i);
                int cand = z->head[h];
                if (emit && cand >= 0 && cand < i && (i - cand) <= ZSS_CWSIZE) {
                    int maxlen = framelen - i;
                    int l = 0;
                    if (maxlen > MAXMATCH) maxlen = MAXMATCH;
                    while (l < maxlen && z->frame[cand + l] == z->frame[i + l]) l++;
                    if (l >= MINMATCH) { bestlen = l; bestpos = cand; }
                }
                z->head[h] = (int16_t)i;
            }
            if (bestlen >= MINMATCH) {
                int k;
                def_match(z, bestlen, i - bestpos);
                for (k = 1; k < bestlen; k++) {
                    int p = i + k;
                    if (p + MINMATCH <= framelen)
                        z->head[def_hash(z->frame + p)] = (int16_t)p;
                }
                i += bestlen;
            } else {
                if (emit) def_sym(z, z->frame[i]);
                i++;
            }
        }

        pos += seg;
        keep = framelen;
        if (keep > ZSS_CWSIZE) keep = ZSS_CWSIZE;
        memmove(z->hist, z->frame + (framelen - keep), (size_t)keep);
        z->hlen = keep;
    }
}

int zss_deflate_init(zss_deflate *z, int level) {
    if (level < 0 || level > 9) return -1;
    memset(z, 0, sizeof(*z));
    z->level = level;
    z->header_done = 0;
    z->hlen = 0;
    return 0;
}

void zss_deflate_free(zss_deflate *z) { (void)z; }

int zss_deflate_run(zss_deflate *z, const uint8_t *in, uint32_t inlen,
                    uint8_t *out, uint32_t outcap, uint32_t *outlen) {
    z->out = out; z->outcap = outcap; z->outcnt = 0; z->overflow = 0;
    /* bi_valid is 0 here: every call ends byte-aligned via sync flush */

    if (!z->header_done) {
        int cmf = (ZSS_CWBITS - 8) << 4 | 8;   /* CINFO=4 (4 KB), CM=8 */
        int flevel = (z->level < 2) ? 0 : (z->level < 6) ? 1 :
                     (z->level == 6) ? 2 : 3;
        int flg = flevel << 6;                 /* FDICT=0 */
        int rem = ((cmf << 8) | flg) % 31;
        if (rem) flg += (31 - rem);            /* FCHECK */
        def_put_byte(z, cmf);
        def_put_byte(z, flg);
        z->header_done = 1;
    }

    if (inlen > 0) {
        def_bits(z, 2, 3);          /* BFINAL=0, BTYPE=01 (fixed Huffman) */
        def_compress(z, in, inlen);
        def_sym(z, 256);            /* end of block */
    }

    /* Z_SYNC_FLUSH: empty stored block, byte-aligned -> 00 00 FF FF */
    def_bits(z, 0, 3);              /* BFINAL=0, BTYPE=00 */
    def_windup(z);
    def_put_byte(z, 0x00);
    def_put_byte(z, 0x00);
    def_put_byte(z, 0xFF);
    def_put_byte(z, 0xFF);

    if (z->overflow) return ZE_OVERFLOW;
    *outlen = z->outcnt;
    return 0;
}
