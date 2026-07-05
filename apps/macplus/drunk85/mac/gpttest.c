/* Host equivalence test for the int8 memory-based engine: greedy generation must
 * match llama2.c's runq binary. Build with system clang, not Retro68. */
#include <stdio.h>
#include <stdlib.h>
#include "gpt.h"

static void emit(const char *piece, void *ctx) { (void)ctx; fputs(piece, stdout); }

static void *slurp(const char *path, long *len) {
    FILE *f = fopen(path, "rb");
    void *buf; long n;
    if (!f) { fprintf(stderr, "can't open %s\n", path); exit(1); }
    fseek(f, 0, SEEK_END); n = ftell(f); fseek(f, 0, SEEK_SET);
    buf = malloc(n);
    if (fread(buf, 1, n, f) != (size_t)n) { fprintf(stderr, "read fail\n"); exit(1); }
    fclose(f); *len = n; return buf;
}

int main(int argc, char **argv) {
    const char *model = argc > 1 ? argv[1] : "../llama2.c/out/plus64b/model_q.bin";
    const char *tok   = argc > 2 ? argv[2] : "../llama2.c/data/tok2048.bin";
    const char *prompt = argc > 3 ? argv[3] : "";
    int n = argc > 4 ? atoi(argv[4]) : 50;
    float temp = argc > 5 ? (float)atof(argv[5]) : 0.0f;   /* 0 = greedy (equivalence gate) */
    unsigned long seed = argc > 6 ? (unsigned long)atol(argv[6]) : 12345;
    long ml, tl;
    void *mbuf = slurp(model, &ml);
    void *tbuf = slurp(tok, &tl);
    if (GptInitMem(mbuf, ml, tbuf, tl, temp, 0.0f, seed) != 0) {
        fprintf(stderr, "GptInitMem failed\n"); return 1;
    }
    GptGenerate(prompt, n, emit, 0, 0);
    printf("\n");
    GptShutdown();
    return 0;
}
