/*
 * gpt.h — the portable llama2 inference engine for THE ORACLE.
 *
 * Ported from Karpathy's llama2.c run.c: same math verbatim, but with the two
 * Unix-only pieces removed so it builds for the classic Mac (Retro68, 68000):
 *   - checkpoint load: mmap()  ->  fread() into a malloc'd buffer
 *   - output:          printf() -> a caller-supplied emit callback (streaming)
 * The CLI (main/chat/read_stdin) is gone; callers drive it through this API.
 *
 * One engine, many clients: the Oracle chat app and a future headless tweet
 * machine both link this and call GptGenerate().
 */
#ifndef GPT_H
#define GPT_H

/* Called once per decoded token during generation with a NUL-terminated
 * UTF-8/ASCII piece. `ctx` is passed straight through from GptGenerate. */
typedef void (*GptEmit)(const char *piece, void *ctx);

/* Called after every forward pass so the app can show progress, pump its
 * event loop, and cancel. phase 0 = reading the prompt (done/total = prompt
 * positions), phase 1 = generating (done/total = new tokens). Return nonzero
 * to continue, 0 to stop cleanly. May be NULL. */
typedef int (*GptTick)(int phase, int done, int total, void *ctx);

/* Initialize from in-RAM buffers (e.g. embedded 'MODL'/'TOKN' resources): the
 * int8 v2 checkpoint bytes and the tokenizer bytes. temperature/seed configure
 * sampling (temperature 0 = greedy argmax; temperature > 0 = top-k, k=40).
 * topp is accepted for compatibility but ignored (top-p was replaced by top-k
 * in the v2 68000 speed pass). The buffers must stay valid for the engine's
 * lifetime (weights are read in place). Returns 0 on success, non-zero on
 * failure (bad data). */
int  GptInitMem(const void *modelData, long modelLen,
                const void *tokData, long tokLen,
                float temperature, float topp, unsigned long seed);

/* True once GptInit has succeeded. */
int  GptReady(void);

/* Free everything GptInit allocated. Safe to call when not initialized. */
void GptShutdown(void);

/* Generate up to maxNewTokens tokens continuing `prompt`, calling emit(piece,
 * ctx) for each decoded piece as it is produced and tick (may be NULL) after
 * every forward pass (see GptTick; return 0 from tick to stop). Stops early
 * at the sequence delimiter. During prompt prefill the classifier matmul is
 * skipped (~30% of a forward pass). No-op if not initialized. */
void GptGenerate(const char *prompt, int maxNewTokens,
                 GptEmit emit, GptTick tick, void *ctx);

/* Model's max sequence length (from the checkpoint header); 0 if not loaded. */
int  GptSeqLen(void);

/* DEBUG: raw IEEE-754 bits of a few loaded weights (i=0..3), and the argmax
 * token predicted from BOS. For host-vs-Mac endianness verification. */
unsigned long GptDbgBits(int i);
int           GptDbgFirstTok(void);
void          GptDbgProbe(const char *prompt, int *pLen, int *pT0, int *pT1, int *pFirst);

/* Optional progress hook, called with a step number as GptInit proceeds
 * (1=enter, 2=model file open, 3=weights buffer alloc, 4=weights read,
 *  5=run-state alloc, 6=tokenizer, 7=sampler/ready). Default NULL (no-op).
 * Used for remote diagnosis on hardware where a crash can't be caught in C. */
extern void (*gGptProgress)(int step);

#endif /* GPT_H */
