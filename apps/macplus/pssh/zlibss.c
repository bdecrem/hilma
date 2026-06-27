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
/* INFLATE                                                               */
/* ===================================================================== */

struct ins {
    const uint8_t *in;
    uint32_t inlen, incnt;
    uint32_t bitbuf;
    int      bitcnt;
    uint8_t *out;
    uint32_t outcap, outcnt;
    int      overflow;
    int      err;        /* set when input runs short mid-symbol */
    zss_inflate *z;
};

/* read `need` bits, LSB-first */
static int inf_bits(struct ins *s, int need) {
    uint32_t val = s->bitbuf;
    while (s->bitcnt < need) {
        if (s->incnt >= s->inlen) { s->err = 1; return 0; }
        val |= (uint32_t)s->in[s->incnt++] << s->bitcnt;
        s->bitcnt += 8;
    }
    s->bitbuf = val >> need;
    s->bitcnt -= need;
    if (need == 0) return 0;
    return (int)(val & (((uint32_t)1 << need) - 1));
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

/* canonical Huffman: decode one symbol from table (count[], symbol[]) */
static int inf_decode(struct ins *s, const int16_t *count, const int16_t *symbol) {
    int len, code = 0, first = 0, index = 0, cnt, bit;
    for (len = 1; len <= MAXBITS; len++) {
        bit = inf_bits(s, 1);
        if (s->err) return ZE_BADINPUT;
        code |= bit;
        cnt = count[len];
        if (code - cnt < first) return symbol[index + (code - first)];
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

/* decode a stored (uncompressed) block; aligns to byte boundary first */
static int inf_stored(struct ins *s) {
    uint32_t len, nlen;
    /* discard buffered bits back to a byte boundary */
    while (s->bitcnt >= 8) { s->incnt--; s->bitcnt -= 8; }
    s->bitbuf = 0; s->bitcnt = 0;
    if (s->incnt + 4 > s->inlen) return ZE_SHORT;
    len  = s->in[s->incnt++];
    len |= (uint32_t)s->in[s->incnt++] << 8;
    nlen  = s->in[s->incnt++];
    nlen |= (uint32_t)s->in[s->incnt++] << 8;
    if ((len ^ 0xFFFF) != nlen) return ZE_NLEN;
    while (len--) {
        if (s->incnt >= s->inlen) return ZE_SHORT;
        if (inf_emit(s, s->in[s->incnt++])) return ZE_OVERFLOW;
    }
    return 0;
}

/* decode literal/length + distance symbols until end-of-block (256) */
static int inf_codes(struct ins *s, const int16_t *lcnt, const int16_t *lsym,
                     const int16_t *dcnt, const int16_t *dsym) {
    int sym, len;
    uint32_t dist;
    for (;;) {
        sym = inf_decode(s, lcnt, lsym);
        if (sym < 0) return sym;
        if (sym < 256) {
            if (inf_emit(s, sym)) return ZE_OVERFLOW;
        } else if (sym == 256) {
            return 0;                     /* end of block */
        } else {
            sym -= 257;
            if (sym >= 29) return ZE_BADSYM;
            len = g_lbase[sym] + inf_bits(s, g_lext[sym]);
            sym = inf_decode(s, dcnt, dsym);
            if (sym < 0) return sym;
            if (sym >= 30) return ZE_BADSYM;
            dist = (uint32_t)g_dbase[sym] + (uint32_t)inf_bits(s, g_dext[sym]);
            if (s->err) return ZE_BADINPUT;
            if (dist > s->z->wfilled) return ZE_DISTFAR;
            while (len--) {
                int b = s->z->win[(s->z->wpos - dist) & ZSS_WMASK];
                if (inf_emit(s, b)) return ZE_OVERFLOW;
            }
        }
    }
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

static int inf_dynamic(struct ins *s) {
    int nlen, ndist, ncode, index, sym, len, err;
    int16_t lengths[288 + 32];
    int16_t clcnt[16], clsym[19];

    nlen  = inf_bits(s, 5) + 257;
    ndist = inf_bits(s, 5) + 1;
    ncode = inf_bits(s, 4) + 4;
    if (s->err) return ZE_BADINPUT;
    if (nlen > 286 || ndist > 30) return ZE_BADTABLE;

    for (index = 0; index < ncode; index++)
        lengths[g_clorder[index]] = (int16_t)inf_bits(s, 3);
    for (; index < 19; index++) lengths[g_clorder[index]] = 0;
    if (s->err) return ZE_BADINPUT;
    err = inf_construct(clcnt, clsym, lengths, 19);
    if (err != 0) return ZE_BADTABLE;     /* code-length code must be complete */

    index = 0;
    while (index < nlen + ndist) {
        sym = inf_decode(s, clcnt, clsym);
        if (sym < 0) return sym;
        if (sym < 16) {
            lengths[index++] = (int16_t)sym;
        } else if (sym == 16) {
            if (index == 0) return ZE_BADTABLE;
            len = lengths[index - 1];
            sym = 3 + inf_bits(s, 2);
            while (sym-- && index < nlen + ndist) lengths[index++] = (int16_t)len;
        } else if (sym == 17) {
            sym = 3 + inf_bits(s, 3);
            while (sym-- && index < nlen + ndist) lengths[index++] = 0;
        } else {
            sym = 11 + inf_bits(s, 7);
            while (sym-- && index < nlen + ndist) lengths[index++] = 0;
        }
        if (s->err) return ZE_BADINPUT;
    }
    if (lengths[256] == 0) return ZE_BADTABLE;  /* missing end-of-block code */

    err = inf_construct(s->z->dlcnt, s->z->dlsym, lengths, nlen);
    if (err < 0) return ZE_BADTABLE;      /* lit/len code over-subscribed */
    err = inf_construct(s->z->ddcnt, s->z->ddsym, lengths + nlen, ndist);
    if (err < 0) return ZE_BADTABLE;      /* a single incomplete dist code is ok */

    return inf_codes(s, s->z->dlcnt, s->z->dlsym, s->z->ddcnt, s->z->ddsym);
}

int zss_inflate_init(zss_inflate *z) {
    memset(z, 0, sizeof(*z));
    return 0;
}

void zss_inflate_free(zss_inflate *z) { (void)z; }

int zss_inflate_run(zss_inflate *z, const uint8_t *in, uint32_t inlen,
                    uint8_t *out, uint32_t outcap, uint32_t *outlen) {
    struct ins s;
    int last, type, e;

    s.in = in; s.inlen = inlen; s.incnt = 0;
    s.bitbuf = 0; s.bitcnt = 0;
    s.out = out; s.outcap = outcap; s.outcnt = 0;
    s.overflow = 0; s.err = 0; s.z = z;

    if (!z->header_done) {
        uint8_t cmf, flg;
        if (inlen < 2) return ZE_SHORT;
        cmf = in[0]; flg = in[1];
        if ((cmf & 0x0F) != 8) return ZE_NOTDEFLATE;     /* CM must be 8 */
        if ((((uint32_t)cmf << 8) | flg) % 31 != 0) return ZE_BADCHECK;
        if (flg & 0x20) return ZE_FDICT;                 /* preset dict: no */
        s.incnt = 2;
        z->header_done = 1;
    }

    /* Process whole deflate blocks until the input bytes are consumed.
       Each *_run() input is one sync-flushed packet: zero or more data
       blocks followed by the empty stored block (00 00 FF FF). */
    while (s.incnt < s.inlen) {
        last = inf_bits(&s, 1);            /* BFINAL -- ignored (SSH never sets) */
        type = inf_bits(&s, 2);
        (void)last;
        if (s.err) return ZE_BADINPUT;
        if (type == 0) {
            e = inf_stored(&s);
        } else if (type == 1) {
            inf_build_fixed(z);
            e = inf_codes(&s, z->flcnt, z->flsym, z->fdcnt, z->fdsym);
        } else if (type == 2) {
            e = inf_dynamic(&s);
        } else {
            return ZE_BADTYPE;
        }
        if (e < 0) return e;
        if (s.overflow) return ZE_OVERFLOW;
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
