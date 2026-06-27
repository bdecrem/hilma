/* zlibss_test.c - round-trip + bidirectional interop tests for zlibss.
 *
 * Build/run on the host:
 *   cc -O2 -o /tmp/zss zlibss.c zlibss_test.c && /tmp/zss
 *
 * Test 1  ROUND TRIP:  zss_deflate_run -> zss_inflate_run, byte-exact, over
 *                      several inputs, multiple sync-flushed calls per stream.
 * Test 2  PY -> US:    decode bytes produced by Python zlib (compressobj(6) +
 *                      Z_SYNC_FLUSH), two chunks on one stream.
 * Test 3  US -> PY:    Python's zlib.decompressobj() decompresses our output.
 *
 * The contexts are large (~34 KB / ~16 KB) so they live in static storage,
 * never on the stack.  Test 3 shells out to the project's Python venv; if that
 * interpreter is absent the reverse-interop checks are skipped (and reported),
 * not silently passed.
 */
#include "zlibss.h"
#include "zlibss_vectors.h"
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define PYEXE "/tmp/pssh_venv/bin/python3"

static int g_pass = 0, g_fail = 0;
static int g_py_ok = -1;   /* -1 unknown, 0 no, 1 yes */

static void ok(int cond, const char *what) {
    if (cond) { g_pass++; }
    else { g_fail++; printf("  FAIL: %s\n", what); }
}

/* static contexts + scratch buffers (kept off the stack) */
static zss_deflate DEF;
static zss_inflate INF;
static uint8_t COMP[200000];
static uint8_t PLAIN[200000];

static int have_python(void) {
    if (g_py_ok < 0) {
        if (getenv("ZSS_SKIP_PY")) g_py_ok = 0;   /* e.g. under ASan: system() hangs */
        else g_py_ok = (system(PYEXE " -c \"import zlib\" >/dev/null 2>&1") == 0) ? 1 : 0;
    }
    return g_py_ok;
}

/* --- helpers --- */

/* Compress `chunks` separate payloads on one deflate stream (sync flush each),
   concatenating the zlib bytes into COMP. Returns total compressed length. */
static uint32_t compress_stream(const uint8_t **bufs, const uint32_t *lens,
                                int chunks) {
    uint32_t total = 0, got;
    int i, rc;
    zss_deflate_init(&DEF, 6);
    for (i = 0; i < chunks; i++) {
        rc = zss_deflate_run(&DEF, bufs[i], lens[i],
                             COMP + total, (uint32_t)sizeof(COMP) - total, &got);
        if (rc != 0) return 0xFFFFFFFFu;
        total += got;
    }
    return total;
}

/* Round-trip one stream of `chunks` payloads. */
static void roundtrip(const char *name, const uint8_t **bufs,
                      const uint32_t *lens, int chunks) {
    uint8_t *comp_chunks[8];
    uint32_t comp_lens[8];
    uint32_t off = 0, got, plen = 0;
    int i, rc, allok = 1;
    static uint8_t COMP2[200000];

    /* compress each chunk, remember its byte range */
    zss_deflate_init(&DEF, 6);
    for (i = 0; i < chunks; i++) {
        rc = zss_deflate_run(&DEF, bufs[i], lens[i],
                             COMP2 + off, (uint32_t)sizeof(COMP2) - off, &got);
        if (rc != 0) { allok = 0; break; }
        comp_chunks[i] = COMP2 + off;
        comp_lens[i] = got;
        off += got;
    }
    if (!allok) { ok(0, name); printf("    (compress failed)\n"); return; }

    /* decompress each chunk on one inflate stream, compare to original */
    zss_inflate_init(&INF);
    for (i = 0; i < chunks; i++) {
        rc = zss_inflate_run(&INF, comp_chunks[i], comp_lens[i],
                             PLAIN, (uint32_t)sizeof(PLAIN), &got);
        if (rc != 0) { allok = 0; printf("    (inflate rc=%d chunk %d)\n", rc, i); break; }
        if (got != lens[i] || (got && memcmp(PLAIN, bufs[i], got) != 0)) {
            allok = 0;
            printf("    (mismatch chunk %d: got %u want %u)\n", i, got, lens[i]);
            break;
        }
        plen += got;
    }
    (void)plen;
    ok(allok, name);
}

/* Test 3: write COMP[0..clen) to a file, ask Python to inflate and compare to
   the concatenation of the originals. Returns 1 pass, 0 fail, -1 skipped. */
static int python_decompresses(const uint8_t **bufs, const uint32_t *lens,
                               int chunks, uint32_t clen) {
    FILE *f;
    char cmd[512];
    int rc, i;
    uint32_t total = 0;

    if (!have_python()) return -1;

    f = fopen("/tmp/zss_comp.bin", "wb");
    if (!f) return 0;
    fwrite(COMP, 1, clen, f);
    fclose(f);

    f = fopen("/tmp/zss_orig.bin", "wb");
    if (!f) return 0;
    for (i = 0; i < chunks; i++) { fwrite(bufs[i], 1, lens[i], f); total += lens[i]; }
    fclose(f);
    (void)total;

    snprintf(cmd, sizeof(cmd),
        PYEXE " -c \""
        "import zlib,sys;"
        "c=open('/tmp/zss_comp.bin','rb').read();"
        "o=open('/tmp/zss_orig.bin','rb').read();"
        "d=zlib.decompressobj();"
        "r=d.decompress(c)+d.flush();"
        "sys.exit(0 if r==o else 1)\"");
    rc = system(cmd);
    return (rc == 0) ? 1 : 0;
}

/* compress a stream then have Python decode it */
static void reverse_interop(const char *name, const uint8_t **bufs,
                            const uint32_t *lens, int chunks) {
    uint32_t clen = compress_stream(bufs, lens, chunks);
    int r;
    if (clen == 0xFFFFFFFFu) { ok(0, name); return; }
    r = python_decompresses(bufs, lens, chunks, clen);
    if (r < 0) { printf("  SKIP (no python): %s\n", name); return; }
    ok(r == 1, name);
}

/* Test 2: feed N Python-compressed chunks (one shared stream) to ONE inflate
   context, byte-exact per chunk. Works for any flush mode the producer used. */
static void forward_stream(const char *name, int n,
                           const uint8_t **zc, const uint32_t *zl,
                           const uint8_t **d,  const uint32_t *dl) {
    uint32_t got;
    int i, allok = 1;
    zss_inflate_init(&INF);
    for (i = 0; i < n; i++) {
        int rc = zss_inflate_run(&INF, zc[i], zl[i], PLAIN,
                                 (uint32_t)sizeof(PLAIN), &got);
        if (rc != 0 || got != dl[i] || (got && memcmp(PLAIN, d[i], got) != 0)) {
            allok = 0;
            printf("    (chunk %d rc=%d got=%u want=%u)\n", i, rc, got, dl[i]);
            break;
        }
    }
    ok(allok, name);
}

#define A(x) (x), (uint32_t)sizeof(x)

int main(void) {
    /* ----- build assorted round-trip payloads ----- */
    static uint8_t repab[2000];
    static uint8_t english[4096];
    static uint8_t randbuf[3000];
    static uint8_t big[60000];
    const char *eng =
        "The quick brown fox jumps over the lazy dog. Pack my box with five "
        "dozen liquor jugs. How vexingly quick daft zebras jump! The five "
        "boxing wizards jump quickly. Sphinx of black quartz, judge my vow. ";
    uint32_t i, englen, seed = 0x12345678u;

    for (i = 0; i < sizeof(repab); i++) repab[i] = (i & 1) ? 'B' : 'A';
    englen = 0;
    while (englen + (uint32_t)strlen(eng) < sizeof(english)) {
        memcpy(english + englen, eng, strlen(eng));
        englen += (uint32_t)strlen(eng);
    }
    for (i = 0; i < sizeof(randbuf); i++) {     /* xorshift pseudo-random */
        seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5;
        randbuf[i] = (uint8_t)(seed & 0xFF);
    }
    for (i = 0; i < sizeof(big); i++) big[i] = (uint8_t)('a' + (i % 26));

    printf("zlibss tests\n");

    /* ===== Test 1: round trips ===== */
    {
        const uint8_t *b[4]; uint32_t l[4];

        b[0] = (const uint8_t *)""; l[0] = 0;
        roundtrip("rt: empty", b, l, 1);

        b[0] = (const uint8_t *)"hello"; l[0] = 5;
        roundtrip("rt: hello", b, l, 1);

        b[0] = repab; l[0] = sizeof(repab);
        roundtrip("rt: ABAB x1000", b, l, 1);

        b[0] = randbuf; l[0] = sizeof(randbuf);
        roundtrip("rt: random 3KB", b, l, 1);

        b[0] = english; l[0] = englen;
        roundtrip("rt: english 4KB", b, l, 1);

        b[0] = big; l[0] = sizeof(big);
        roundtrip("rt: 60KB (>window, multi-segment)", b, l, 1);

        /* multi-chunk streaming on one stream, with cross-chunk repetition */
        b[0] = (const uint8_t *)"first chunk "; l[0] = 12;
        b[1] = (const uint8_t *)"second chunk reuses first chunk words "; l[1] = 38;
        b[2] = english; l[2] = englen;
        b[3] = repab; l[3] = sizeof(repab);
        roundtrip("rt: 4-chunk stream", b, l, 4);

        /* empty chunk in the middle of a stream */
        b[0] = (const uint8_t *)"alpha"; l[0] = 5;
        b[1] = (const uint8_t *)""; l[1] = 0;
        b[2] = (const uint8_t *)"omega"; l[2] = 5;
        roundtrip("rt: stream with empty middle chunk", b, l, 3);
    }

    /* ===== Test 2: Python-compressed -> our inflate (streaming) =====
       One shared inflate context per stream, fed chunk by chunk. Covers
       SYNC / PARTIAL / FULL / NO flush, so the decoder cannot depend on the
       sync-flush 00 00 FF FF marker or on chunk boundaries being byte-aligned
       in the bit stream. */
    {
        const uint8_t *zc[8], *d[8];
        uint32_t zl[8], dl[8];
#define SET(i, P, N) do { zc[i]=P##_zc##N; zl[i]=P##_zl##N; \
                          d[i]=P##_d##N;  dl[i]=P##_dl##N; } while (0)

        SET(0,vA,1); SET(1,vA,2);
        forward_stream("interop py->us SYNC: text stream", 2, zc, zl, d, dl);

        SET(0,vB,1); SET(1,vB,2);
        forward_stream("interop py->us SYNC: repetitive+english", 2, zc, zl, d, dl);

        SET(0,vC,1); SET(1,vC,2);
        forward_stream("interop py->us SYNC: empty-first-chunk", 2, zc, zl, d, dl);

        /* The coordinator's exact bug: Z_PARTIAL_FLUSH, 2nd chunk continues the
           bit stream mid-byte (no 00 00 FF FF marker). Extended to 3 chunks. */
        SET(0,vP,1); SET(1,vP,2); SET(2,vP,3);
        forward_stream("interop py->us PARTIAL: hello/world/3rd", 3, zc, zl, d, dl);

        /* Many small partial-flush chunks: lots of mid-bit-buffer boundaries
           plus cross-chunk back-references. */
        SET(0,vQ,1); SET(1,vQ,2); SET(2,vQ,3);
        SET(3,vQ,4); SET(4,vQ,5); SET(5,vQ,6);
        forward_stream("interop py->us PARTIAL: 6 small chunks", 6, zc, zl, d, dl);

        SET(0,vF,1); SET(1,vF,2);
        forward_stream("interop py->us FULL: english", 2, zc, zl, d, dl);

#undef SET
    }

    /* NO_FLUSH: with no flush the output does NOT align to input chunk
       boundaries -- chunk1 emits ~0 bytes (data buffered), chunk2 emits it
       all. So assert the TOTAL recovered stream equals the concatenation. */
    {
        uint32_t got, total = 0;
        int rc, allok = 1;
        static uint8_t WANT[2048], GOTBUF[2048];
        uint32_t wlen = 0;
        memcpy(WANT + wlen, vN_d1, vN_dl1); wlen += vN_dl1;
        memcpy(WANT + wlen, vN_d2, vN_dl2); wlen += vN_dl2;

        zss_inflate_init(&INF);
        rc = zss_inflate_run(&INF, vN_zc1, vN_zl1, GOTBUF + total,
                             (uint32_t)sizeof(GOTBUF) - total, &got);
        if (rc != 0) allok = 0; else total += got;
        rc = zss_inflate_run(&INF, vN_zc2, vN_zl2, GOTBUF + total,
                             (uint32_t)sizeof(GOTBUF) - total, &got);
        if (rc != 0) allok = 0; else total += got;
        if (allok && (total != wlen || memcmp(GOTBUF, WANT, wlen) != 0)) {
            allok = 0; printf("    (NO_FLUSH total got=%u want=%u)\n", total, wlen);
        }
        ok(allok, "interop py->us NO_FLUSH: split mid-block (total)");
    }

    /* ===== Test 3: our deflate -> Python inflate (streaming) ===== */
    {
        const uint8_t *b[4]; uint32_t l[4];

        b[0] = (const uint8_t *)"hello"; l[0] = 5;
        reverse_interop("interop us->py: hello", b, l, 1);

        b[0] = repab; l[0] = sizeof(repab);
        reverse_interop("interop us->py: ABAB x1000", b, l, 1);

        b[0] = english; l[0] = englen;
        reverse_interop("interop us->py: english 4KB", b, l, 1);

        b[0] = randbuf; l[0] = sizeof(randbuf);
        reverse_interop("interop us->py: random 3KB", b, l, 1);

        b[0] = big; l[0] = sizeof(big);
        reverse_interop("interop us->py: 60KB multi-segment", b, l, 1);

        b[0] = (const uint8_t *)"chunk-A "; l[0] = 8;
        b[1] = (const uint8_t *)"chunk-B reuses chunk-A "; l[1] = 23;
        b[2] = english; l[2] = englen;
        reverse_interop("interop us->py: 3-chunk stream", b, l, 3);

        /* many tiny sync-flushed chunks on one stream -> Python decodes all */
        b[0] = (const uint8_t *)"aa "; l[0] = 3;
        b[1] = (const uint8_t *)"bb "; l[1] = 3;
        b[2] = (const uint8_t *)"aa bb "; l[2] = 6;
        b[3] = (const uint8_t *)"cc aa "; l[3] = 6;
        reverse_interop("interop us->py: 4 tiny chunks", b, l, 4);
    }

    /* ===== Test 4: arbitrary byte-aligned re-chunking =====
       Feed ONE continuous mixed-flush compressed blob to one inflate context
       in tiny fixed-size slices that fall at arbitrary bit positions (NOT at
       flush boundaries). The decoder must suspend/resume across every slice
       and still recover the exact stream. Run for several slice sizes. */
    {
        static const uint32_t sizes[5] = {1, 2, 3, 5, 7};
        static uint8_t OUT[2048];
        int si;
        for (si = 0; si < 5; si++) {
            uint32_t step = sizes[si], off = 0, total = 0, got;
            int allok = 1, rc;
            char nm[64];
            zss_inflate_init(&INF);
            while (off < vR_zl) {
                uint32_t n = vR_zl - off; if (n > step) n = step;
                rc = zss_inflate_run(&INF, vR_zc + off, n, OUT + total,
                                     (uint32_t)sizeof(OUT) - total, &got);
                if (rc != 0) { allok = 0; printf("    (slice rc=%d off=%u)\n", rc, off); break; }
                total += got; off += n;
            }
            if (allok && (total != vR_dl || memcmp(OUT, vR_d, vR_dl) != 0)) {
                allok = 0; printf("    (got=%u want=%u)\n", total, (uint32_t)vR_dl);
            }
            snprintf(nm, sizeof(nm), "resume: %u-byte slices across mixed flushes", step);
            ok(allok, nm);
        }
    }

    printf("zlibss: %d passed, %d failed\n", g_pass, g_fail);
    return g_fail ? 1 : 0;
}
