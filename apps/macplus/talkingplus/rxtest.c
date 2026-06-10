/*
 * rxtest.c - host-clang test for the TKM utterance parser (talk_rx.inc, the
 * exact code the Plus runs). Feeds the generated test utterance plus error
 * cases and asserts the reconstructed words, mood, bubble text, and recovery.
 *
 *   cc -o /tmp/talk_rxtest rxtest.c && /tmp/talk_rxtest
 */

#include <stdio.h>
#include <string.h>

typedef unsigned char Boolean;

static int gNWordsWant, gMood, gGotWords, gDone;
static char gBubble[2000]; static int gBubLen;
static char gW_disp[200][32], gW_ph[200][64];
static char gLastLog[256], gLastErr[256];

static void RxLog(const char *m) { strncpy(gLastLog, m, 255); }
static void RxFail(const char *m) { strncpy(gLastErr, m, 255); }
static void UttBegin(short nw, short mood) { gNWordsWant = nw; gMood = mood; gGotWords = 0; gDone = 0; gBubLen = 0; gBubble[0] = 0; }
static void UttText(const char *chunk, short first) {
    if (!first && gBubLen < 1998) gBubble[gBubLen++] = ' ';
    int i; for (i = 0; chunk[i] && gBubLen < 1998; i++) gBubble[gBubLen++] = chunk[i];
    gBubble[gBubLen] = 0;
}
static void UttWord(short idx, const char *ph, const char *disp) {
    strncpy(gW_disp[idx], disp, 31); strncpy(gW_ph[idx], ph, 63); gGotWords++;
}
static void UttDone(void) { gDone = 1; }

#include "talk_rx.inc"
#include "test_utterance.h"

static int gFail = 0;
static void check(const char *name, int ok) { printf("%s  %s\n", ok ? "PASS" : "FAIL", name); if (!ok) gFail++; }
static void feed(const char *s) { while (*s) FeedRxByte((unsigned char)*s++); }

int main(void)
{
    int i, allPh = 1;

    /* 1. a hand-made utterance with the documented bar-separated word lines */
    feed("TKMSTS thinking...\r\n");
    check("status routed", strcmp(gLastLog, "thinking...") == 0);
    feed("TKMUTT 4 1\r\n"
         "T Good morning. You have three meetings.\r\n"
         "+ I have been awake since 1986.\r\n"
         "W g UH1 d | Good\r\n"
         "W m AO1 r n IH ng | morning.\r\n"
         "W TH r IY1 | three\r\n"
         "W m IY1 t IH ng z | meetings.\r\n"
         "TKMEND\r\n");
    check("done", gDone == 1);
    check("mood grumpy", gMood == 1);
    check("word count", gGotWords == 4 && gNWordsWant == 4);
    check("first word disp", strcmp(gW_disp[0], "Good") == 0);
    check("first word phonemes", strcmp(gW_ph[0], "g UH1 d") == 0);
    check("phonemes w/ spaces kept", strcmp(gW_ph[1], "m AO1 r n IH ng") == 0);
    check("bubble joined across +", strstr(gBubble, "three meetings") != NULL && strstr(gBubble, "awake since 1986") != NULL);
    check("parser idle", gRxState == TRX_IDLE);

    /* 2. word/header mismatch detected */
    gLastErr[0] = 0; gDone = 0;
    feed("TKMUTT 3 0\r\nT hi\r\nW h AY1 | hi\r\nTKMEND\r\n");
    check("missing words detected", strstr(gLastErr, "missing") != NULL && gDone == 0);

    /* 3. malformed word line (no bar) */
    gLastErr[0] = 0;
    feed("TKMUTT 1 0\r\nW noseparator\r\n");
    check("malformed word detected", strstr(gLastErr, "malformed") != NULL && gRxState == TRX_IDLE);

    /* 4. TKMERR + noise */
    gLastErr[0] = 0;
    feed("TKMERR he is asleep\r\n");
    check("error routed", strcmp(gLastErr, "he is asleep") == 0);
    gLastLog[0] = 0; gLastErr[0] = 0; gDone = 0;
    feed("RING\r\nCONNECT 9600\r\nstray\r\n");
    check("noise ignored", gLastLog[0] == 0 && gLastErr[0] == 0 && gDone == 0);

    /* 5. the embedded test utterance from the agent selftest */
    gDone = 0;
    feed(gTestUtterance);
    check("test utterance parses", gDone == 1 && gGotWords == gNWordsWant && gGotWords > 2);
    for (i = 0; i < gGotWords; i++) if (gW_ph[i][0] == 0) allPh = 0;
    check("every word has phonemes", allPh);

    printf(gFail ? "\n%d FAILURE(S)\n" : "\nALL RX TESTS PASSED\n", gFail);
    return gFail ? 1 : 0;
}
