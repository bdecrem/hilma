/*
 * rxtest.c - host-clang test for the SRF receive parser (surf_rx.inc, the
 * exact code the Plus runs). Feeds frames byte-by-byte and asserts the
 * resulting block stream: styles, continuation joining, link numbers,
 * status/error routing, noise rejection, and overflow safety.
 *
 *   cc -o /tmp/surf_rxtest rxtest.c && /tmp/surf_rxtest
 */

#include <stdio.h>
#include <string.h>

/* ---- recorded callback stream ---- */
#define MAXEV 200
static struct { char kind; char style; int link; char text[4200]; } gEv[MAXEV];
static int gNEv = 0;

static void rec(char kind, char style, const char *text, int len, int link)
{
    if (gNEv >= MAXEV) return;
    gEv[gNEv].kind = kind;
    gEv[gNEv].style = style;
    gEv[gNEv].link = link;
    if (len > 4199) len = 4199;
    memcpy(gEv[gNEv].text, text, len);
    gEv[gNEv].text[len] = 0;
    gNEv++;
}

/* callbacks the parser needs (the surf.c contract) */
static void PageClear(void) { rec('C', 0, "", 0, 0); }
static void BlockReady(char style, const char *text, short len, short link)
{
    rec('B', style, text, len, link);
}
static void PageDone(void) { rec('D', 0, "", 0, 0); }
static void RxStatus(const char *msg) { rec('S', 0, msg, (int)strlen(msg), 0); }
static void RxError(const char *msg) { rec('E', 0, msg, (int)strlen(msg), 0); }

typedef unsigned char Boolean;   /* minimal Mac-isms the .inc relies on */

#include "surf_rx.inc"

static int gFail = 0;
static void check(const char *name, int ok)
{
    printf("%s  %s\n", ok ? "PASS" : "FAIL", name);
    if (!ok) gFail++;
}

static void feed(const char *s)
{
    while (*s) FeedRxByte((unsigned char)*s++);
}

int main(void)
{
    /* ---- 1. a full frame, including continuations and links ---- */
    feed("SRFSTS fetching example.com...\r\n"
         "SRFPAG\r\n"
         "T A Title\r\n"
         "P first part\r\n"
         "+ second part\r\n"
         "+ third part\r\n"
         "H Heading\r\n"
         "- bullet one\r\n"
         "Q a quote\r\n"
         "B\r\n"
         "L 7 a link label\r\n"
         "+ with continuation\r\n"
         "garbage line without a tag\r\n"
         "SRFEND\r\n");

    check("status first", gNEv > 0 && gEv[0].kind == 'S' &&
          strcmp(gEv[0].text, "fetching example.com...") == 0);
    check("page clear", gEv[1].kind == 'C');
    check("title block", gEv[2].kind == 'B' && gEv[2].style == 'T' &&
          strcmp(gEv[2].text, "A Title") == 0);
    check("continuations joined", gEv[3].style == 'P' &&
          strcmp(gEv[3].text, "first part second part third part") == 0);
    check("heading", gEv[4].style == 'H' && strcmp(gEv[4].text, "Heading") == 0);
    check("bullet", gEv[5].style == '-' && strcmp(gEv[5].text, "bullet one") == 0);
    check("quote", gEv[6].style == 'Q' && strcmp(gEv[6].text, "a quote") == 0);
    check("gap block", gEv[7].style == 'B');
    check("link number + continuation", gEv[8].style == 'L' && gEv[8].link == 7 &&
          strcmp(gEv[8].text, "a link label with continuation") == 0);
    check("page done", gEv[gNEv - 1].kind == 'D');
    check("parser idle after frame", gRxState == SRX_IDLE);

    /* ---- 2. SRFERR mid-frame aborts cleanly ---- */
    gNEv = 0;
    feed("SRFPAG\r\nT half a page\r\nSRFERR the tubes are clogged\r\n");
    check("error recorded", gEv[gNEv - 1].kind == 'E' &&
          strcmp(gEv[gNEv - 1].text, "the tubes are clogged") == 0);
    check("error resets state", gRxState == SRX_IDLE);

    /* a fresh frame still works after the abort */
    gNEv = 0;
    feed("SRFPAG\r\nT recovered\r\nSRFEND\r\n");
    check("recovers after error", gNEv == 3 && gEv[1].style == 'T' &&
          strcmp(gEv[1].text, "recovered") == 0 && gEv[2].kind == 'D');

    /* ---- 3. noise outside a frame is ignored ---- */
    gNEv = 0;
    feed("RING\r\nCONNECT 9600\r\nsome stray echo\r\n");
    check("noise ignored", gNEv == 0);

    /* ---- 4. orphan continuation becomes a P block ---- */
    gNEv = 0;
    feed("SRFPAG\r\n+ orphan continuation\r\nSRFEND\r\n");
    check("orphan + becomes P", gEv[1].style == 'P' &&
          strcmp(gEv[1].text, "orphan continuation") == 0);

    /* ---- 5. overlong wire line is truncated, not corrupted ---- */
    gNEv = 0;
    feed("SRFPAG\r\nP ");
    {
        int i;
        for (i = 0; i < 600; i++) FeedRxByte('x');
    }
    feed("\r\nSRFEND\r\n");
    check("long line truncated", gEv[1].style == 'P' &&
          (int)strlen(gEv[1].text) <= SRX_LINEMAX);

    /* ---- 6. block overflow stays bounded ---- */
    gNEv = 0;
    feed("SRFPAG\r\nP start\r\n");
    {
        int i;
        for (i = 0; i < 40; i++)
            feed("+ aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                 "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                 "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\r\n");
    }
    feed("SRFEND\r\n");
    check("block capped at SRX_BLOCKMAX", (int)strlen(gEv[1].text) <= SRX_BLOCKMAX);

    /* ---- 7. the embedded Mini vMac test page parses end to end ---- */
    {
#define gTestPage gTestPage_  /* avoid clash if names ever align */
#include "test_page.h"
        int blocks = 0, links = 0, i;
        gNEv = 0;
        feed(gTestPage_);
        for (i = 0; i < gNEv; i++) {
            if (gEv[i].kind == 'B') blocks++;
            if (gEv[i].kind == 'B' && gEv[i].style == 'L') links++;
        }
        check("test page: clear+done", gEv[0].kind == 'S' && gEv[1].kind == 'C' &&
              gEv[gNEv - 1].kind == 'D');
        check("test page: blocks", blocks > 15);
        check("test page: 3 links", links == 3);
    }

    printf(gFail ? "\n%d FAILURE(S)\n" : "\nALL RX TESTS PASSED\n", gFail);
    return gFail ? 1 : 0;
}
