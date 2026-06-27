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

/* Test 2: feed Python-compressed vectors to one inflate context. */
static void forward_interop(const char *name,
                            const uint8_t *zc1, uint32_t zl1, const uint8_t *d1, uint32_t dl1,
                            const uint8_t *zc2, uint32_t zl2, const uint8_t *d2, uint32_t dl2) {
    uint32_t got;
    int rc, allok = 1;
    zss_inflate_init(&INF);

    rc = zss_inflate_run(&INF, zc1, zl1, PLAIN, (uint32_t)sizeof(PLAIN), &got);
    if (rc != 0 || got != dl1 || (got && memcmp(PLAIN, d1, got) != 0)) {
        allok = 0; printf("    (chunk1 rc=%d got=%u want=%u)\n", rc, got, dl1);
    }
    if (allok) {
        rc = zss_inflate_run(&INF, zc2, zl2, PLAIN, (uint32_t)sizeof(PLAIN), &got);
        if (rc != 0 || got != dl2 || (got && memcmp(PLAIN, d2, got) != 0)) {
            allok = 0; printf("    (chunk2 rc=%d got=%u want=%u)\n", rc, got, dl2);
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

    /* ===== Test 2: Python-compressed -> our inflate (streaming) ===== */
    forward_interop("interop py->us: text stream",
        A(vA_zc1), A(vA_d1), A(vA_zc2), A(vA_d2));
    forward_interop("interop py->us: repetitive+english stream",
        A(vB_zc1), A(vB_d1), A(vB_zc2), A(vB_d2));
    forward_interop("interop py->us: empty-first-chunk stream",
        A(vC_zc1), A(vC_d1), A(vC_zc2), A(vC_d2));

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
    }

    printf("zlibss: %d passed, %d failed\n", g_pass, g_fail);
    return g_fail ? 1 : 0;
}
