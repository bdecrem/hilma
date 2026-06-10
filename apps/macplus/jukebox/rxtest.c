/*
 * rxtest.c - host-clang test for the JBX score parser (jukebox_rx.inc, the
 * exact code the Plus runs). Feeds the generated Daisy Bell frame
 * (test_song.h, written by agent-jukebox's selftest) plus synthetic error
 * cases, and asserts the reconstructed score.
 *
 *   cc -o /tmp/jukebox_rxtest rxtest.c && /tmp/jukebox_rxtest
 */

#include <stdio.h>
#include <string.h>

typedef unsigned char Boolean;

/* ---- recorded callbacks ---- */
static int gNNotes, gNLyrics;
static long gTotal;
static int gTpb;
static char gTitle[128];
static struct { int midi; long start; long dur; } gN[900];
static struct { long start; long end; char text[80]; } gL[80];
static int gGotN, gGotL, gDone;
static char gLastLog[256], gLastErr[256];

static void RxLog(const char *m) { strncpy(gLastLog, m, 255); }
static void RxFail(const char *m) { strncpy(gLastErr, m, 255); }
static void SongBegin(short nn, short nl, long total, short tpb)
{
    gNNotes = nn; gNLyrics = nl; gTotal = total; gTpb = tpb;
    gGotN = gGotL = gDone = 0;
}
static void SongTitle(const char *t) { strncpy(gTitle, t, 127); }
static void SongNote(short idx, short midi, long start, long dur)
{
    gN[idx].midi = midi; gN[idx].start = start; gN[idx].dur = dur; gGotN++;
}
static void SongLyric(short idx, long start, long end, const char *text)
{
    gL[idx].start = start; gL[idx].end = end;
    strncpy(gL[idx].text, text, 79);
    gGotL++;
}
static void SongDone(void) { gDone = 1; }

#include "jukebox_rx.inc"
#include "test_song.h"

static int gFail = 0;
static void check(const char *name, int ok)
{
    printf("%s  %s\n", ok ? "PASS" : "FAIL", name);
    if (!ok) gFail++;
}

static void feed(const char *s) { while (*s) FeedRxByte((unsigned char)*s++); }

int main(void)
{
    int i, sorted = 1, bounded = 1;

    /* ---- 1. Daisy Bell end to end ---- */
    feed("JBXSTS composing...\r\n");
    check("status routed", strcmp(gLastLog, "composing...") == 0);
    feed(gTestSong);
    check("song done", gDone == 1);
    check("title", strstr(gTitle, "Daisy Bell") != NULL);
    check("note count matches header", gGotN == gNNotes && gNNotes > 40);
    check("lyric count matches header", gGotL == gNLyrics && gNLyrics == 6);
    check("tpb sane", gTpb == 30);
    for (i = 1; i < gGotN; i++) if (gN[i].start < gN[i - 1].start) sorted = 0;
    for (i = 0; i < gGotN; i++)
        if (gN[i].midi < 24 || gN[i].midi > 96 || gN[i].start + gN[i].dur > gTotal + 60) bounded = 0;
    check("notes sorted", sorted);
    check("notes in range", bounded);
    check("first lyric text", strstr(gL[0].text, "Dai-sy") != NULL);
    check("parser idle", gRxState == JRX_IDLE);

    /* ---- 2. error cases ---- */
    gLastErr[0] = 0;
    feed("JBXSON 5 1 600 30\r\nT x\r\nN 60 0 30\r\nJBXEND\r\n");
    check("missing notes detected", strstr(gLastErr, "notes missing") != NULL);

    gLastErr[0] = 0;
    feed("JBXSON 1 0 600 30\r\nN 200 0 30\r\nJBXEND\r\n");
    check("bad midi detected", strstr(gLastErr, "bad note") != NULL);

    gLastErr[0] = 0;
    feed("JBXSON 9999 0 600 30\r\n");
    check("absurd header rejected", strstr(gLastErr, "header") != NULL);

    gLastErr[0] = 0; gLastLog[0] = 0; gDone = 0;
    feed("RING\r\nCONNECT 9600\r\nstray noise\r\n");
    check("noise ignored", gLastErr[0] == 0 && gLastLog[0] == 0 && gDone == 0);

    /* recovery after error */
    feed(gTestSong);
    check("recovers after errors", gDone == 1);

    printf(gFail ? "\n%d FAILURE(S)\n" : "\nALL RX TESTS PASSED\n", gFail);
    return gFail ? 1 : 0;
}
