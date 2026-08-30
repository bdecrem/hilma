/* rxtest.c — host test for dodo_rx.inc. Build: cc -o rxtest rxtest.c && ./rxtest */
#include <stdio.h>
#include <string.h>
static int nTopic, nMsgU, nMsgA, nCont, nBlank, nList, nItem, nWait, nErr, nEnd, nOk;
static char lastTopic[100], lastName[100], lastDate[20], lastText[300]; static short lastN;
static void RxTopic(const char *n) { nTopic++; strncpy(lastTopic, n, 99); }
static void RxMsg(char r, const char *t) { if (r == 'U') nMsgU++; else nMsgA++; strncpy(lastText, t, 299); }
static void RxCont(const char *t) { nCont++; if (!t[0]) nBlank++; else strncpy(lastText, t, 299); }
static void RxListStart(void) { nList++; }
static void RxListItem(short n, const char *d, const char *nm) { nItem++; lastN = n; strncpy(lastDate, d, 19); strncpy(lastName, nm, 99); }
static void RxWait(const char *t) { nWait++; strncpy(lastText, t, 299); }
static void RxErr(const char *t) { nErr++; strncpy(lastText, t, 299); }
static void RxEnd(void) { nEnd++; }
static void RxOk(void) { nOk++; }
#include "dodo_rx.inc"
static int fails = 0;
#define CHECK(c) do { if (!(c)) { printf("FAIL: %s (line %d)\n", #c, __LINE__); fails++; } } while (0)
static void feed(const char *s) { RxFeed((const unsigned char *)s, (short)strlen(s)); }
int main(void) {
    feed("DOK\r\n");
    CHECK(nOk == 1);
    feed("DLIST\r\nDT 1 today|Sumerian\r\nDT 2 Aug 24|French Belgium US Revolutions\r\nDEND\r\n");
    CHECK(nList == 1 && nItem == 2 && nEnd == 1);
    CHECK(lastN == 2 && strcmp(lastDate, "Aug 24") == 0 && strcmp(lastName, "French Belgium US Revolutions") == 0);
    /* split across chunks mid-line */
    feed("DTOPIC Sum"); feed("erian\r\nDU who invented"); feed(" writing\r\n");
    CHECK(nTopic == 1 && strcmp(lastTopic, "Sumerian") == 0);
    CHECK(nMsgU == 1 && strcmp(lastText, "who invented writing") == 0);
    feed("DA Nobody sat down to invent it.\r\nD+ \r\nD+ Second paragraph.\r\nDEND\r\n");
    CHECK(nMsgA == 1 && nCont == 2 && nBlank == 1 && strcmp(lastText, "Second paragraph.") == 0);
    feed("D+\r\n");                       /* bare D+ = paragraph break too */
    CHECK(nBlank == 2);
    feed("DWAIT Dodo is thinking...\r\nDERR no topic open\r\n");
    CHECK(nWait == 1 && nErr == 1 && strcmp(lastText, "no topic open") == 0);
    /* noise + unknown tags are ignored; overlong lines truncate, never overflow */
    feed("XYZ hello\r\nDENDX\r\nDAnospace\r\n");
    { char big[600]; int i; memset(big, 'a', 599); big[599] = 0; memcpy(big, "DA ", 3); feed(big); feed("\r\n"); }
    CHECK(nMsgA == 2 && strlen(lastText) == RX_LINE_CAP - 1 - 3);
    feed("DEND\r\n");
    CHECK(nEnd == 3 && nOk == 1 && nList == 1);
    /* DT without a bar: name only, empty date */
    feed("DT 3 Untitled\r\n");
    CHECK(lastN == 3 && lastDate[0] == 0 && strcmp(lastName, "Untitled") == 0);
    printf(fails ? "rxtest: %d FAILED\n" : "rxtest: all passed\n", fails);
    return fails ? 1 : 0;
}
