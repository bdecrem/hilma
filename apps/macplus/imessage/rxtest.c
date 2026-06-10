/*
 * rxtest.c - host-clang test of im_rx.inc against a real agent payload.
 *   cc -o rxtest rxtest.c && ./rxtest
 * Feeds the embedded test_thread.h frame (optionally one byte at a time, to
 * prove the parser is split-safe) and asserts the decoded structure.
 */
#include <stdio.h>
#include <string.h>

static int g_fail = 0;
#define CHECK(cond, msg) do { \
    printf("%s  %s\n", (cond) ? "PASS" : "FAIL", msg); \
    if (!(cond)) g_fail++; \
} while (0)

/* ---- captured state ---- */
static int  listStarts = 0, ends = 0, convStarts = 0, statuses = 0, sents = 0, errors = 0;
static int  nRows = 0;
static short rowIdx[16], rowUnread[16];
static char  rowName[16][64];
static int  nMsgs = 0;
static char  msgDir[32];
static char  msgText[32][256];
static short lastConvIdx = -1;
static char  lastConvName[64];
static char  lastStatus[128];
static short lastSent = -1;

static int curMsg = -1;   /* index of the message currently being assembled */
static int gMaxLine = 0;  /* longest string any callback ever received */
static void track(const char *s) { int L = (int)strlen(s); if (L > gMaxLine) gMaxLine = L; }

static void ImListStart(void) { listStarts++; nRows = 0; }
static void ImListRow(short idx, short unread, const char *name)
{
    track(name);
    if (nRows < 16) { rowIdx[nRows] = idx; rowUnread[nRows] = unread; strncpy(rowName[nRows], name, 63); nRows++; }
}
static void ImConvStart(short idx, const char *name)
{
    convStarts++; lastConvIdx = idx; strncpy(lastConvName, name, 63); nMsgs = 0; curMsg = -1;
}
static void ImMsg(char dir, const char *text)
{
    track(text);
    if (nMsgs < 32) { msgDir[nMsgs] = dir; strncpy(msgText[nMsgs], text, 255); curMsg = nMsgs; nMsgs++; }
}
static void ImCont(const char *text)
{
    if (curMsg >= 0) { strncat(msgText[curMsg], " ", 255 - strlen(msgText[curMsg])); strncat(msgText[curMsg], text, 255 - strlen(msgText[curMsg])); }
}
static void ImEnd(void) { ends++; }
static void ImStatus(const char *msg) { statuses++; strncpy(lastStatus, msg, 127); }
static void ImError(const char *msg) { errors++; (void)msg; }
static void ImSent(short idx) { sents++; lastSent = idx; }

#include "im_rx.inc"
#include "test_thread.h"

int main(void)
{
    ImRx rx;
    long i, n = (long)strlen(gTestThread);

    /* feed one byte at a time to prove split-safety */
    ImRxInit(&rx);
    for (i = 0; i < n; i++) {
        unsigned char b = (unsigned char)gTestThread[i];
        ImRxFeed(&rx, &b, 1);
    }

    CHECK(statuses == 1, "one IMSTS status line");
    CHECK(strcmp(lastStatus, "imessage ready - List the conversations to begin") == 0, "status text intact");
    CHECK(listStarts == 1, "one IMLIST");
    CHECK(nRows == 4, "four conversation rows");
    CHECK(rowIdx[0] == 0 && rowUnread[0] == 2 && strcmp(rowName[0], "Mom") == 0, "row 0 = Mom, unread 2");
    CHECK(rowIdx[3] == 3 && rowUnread[3] == 1 && strcmp(rowName[3], "Dad") == 0, "row 3 = Dad, unread 1");
    CHECK(convStarts == 1, "one IMCONV");
    CHECK(lastConvIdx == 0 && strcmp(lastConvName, "Mom") == 0, "conversation is idx 0 (Mom)");
    CHECK(nMsgs == 4, "four messages in the thread");
    CHECK(msgDir[0] == '<' && msgDir[1] == '>' && msgDir[2] == '<' && msgDir[3] == '>', "direction markers in order");
    CHECK(strcmp(msgText[0], "Hey are you coming over for dinner tonight?") == 0, "first message text");
    CHECK(strstr(msgText[2], "Bring the dog") != NULL && strstr(msgText[2], "want to drink with dinner.") != NULL,
          "continuation (+) joined onto its message");
    CHECK(ends == 2, "two IMEND blocks (list + conversation)");
    CHECK(errors == 0, "no spurious errors");

    /* also feed the whole buffer at once - same result shape */
    ImRxInit(&rx);
    statuses = 0; listStarts = 0; convStarts = 0; ends = 0; nRows = 0; nMsgs = 0;
    ImRxFeed(&rx, (const unsigned char *)gTestThread, (short)n);
    CHECK(nRows == 4 && nMsgs == 4 && ends == 2, "bulk feed decodes identically");

    /* ---- overflow stress: a backend with FAR more rows/messages and a much
     *      longer line than any client array. The app drops past its caps
     *      (MAX_CONV / MAX_PLINES / gMsgBuf) — here we prove the parser itself
     *      never crashes and never hands a callback a line > IMRX_LINEMAX
     *      (over-long lines are truncated, not overflowed). ---- */
    {
        static char big[60000]; int bn = 0, k, j;
        ImRxInit(&rx);
        statuses = listStarts = convStarts = ends = nRows = nMsgs = errors = 0;
        gMaxLine = 0;
        bn += sprintf(big + bn, "IMLIST\r\n");
        for (k = 0; k < 500; k++) bn += sprintf(big + bn, "C %d 0 Conversation number %d\r\n", k, k);
        bn += sprintf(big + bn, "C 500 0 ");              /* one 2000-char row name */
        for (j = 0; j < 2000; j++) big[bn++] = 'X';
        big[bn++] = '\r'; big[bn++] = '\n';
        bn += sprintf(big + bn, "IMEND\r\n");
        bn += sprintf(big + bn, "IMCONV 9999 BigThread\r\n");   /* out-of-range idx */
        for (k = 0; k < 800; k++) bn += sprintf(big + bn, "M %c message %d with some words\r\n", (k & 1) ? '>' : '<', k);
        bn += sprintf(big + bn, "IMEND\r\n");
        for (k = 0; k < bn; k++) { unsigned char b = (unsigned char)big[k]; ImRxFeed(&rx, &b, 1); }  /* byte-by-byte */
        CHECK(listStarts == 1 && convStarts == 1 && ends == 2, "overflow: structure still parses");
        CHECK(gMaxLine <= IMRX_LINEMAX, "overflow: parser never exceeds IMRX_LINEMAX (long lines truncated)");
        CHECK(errors == 0, "overflow: no spurious errors");
    }

    printf(g_fail ? "\n%d FAILURE(S)\n" : "\nall good\n", g_fail);
    return g_fail ? 1 : 0;
}
