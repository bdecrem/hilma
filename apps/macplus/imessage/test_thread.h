/*
 * test_thread.h - a canned agent payload (a full IMLIST + IMCONV stream).
 * Drives both the host test (rxtest.c) and the offline Mini vMac build
 * (-DIM_TEST), where there is no serial link. Mirrors agent-imessage's
 * protocol.ts output. Lines end \r\n exactly as on the wire.
 */

static const char gTestThread[] =
    "IMSTS imessage ready - List the conversations to begin\r\n"
    "IMLIST\r\n"
    "C 0 2 Mom\r\n"
    "C 1 0 Work Crew\r\n"
    "C 2 0 +15551234567\r\n"
    "C 3 1 Dad\r\n"
    "IMEND\r\n"
    "IMCONV 0 Mom\r\n"
    "M < Hey are you coming over for dinner tonight?\r\n"
    "M > Yes! Should be there around six.\r\n"
    "M < Wonderful. Bring the dog, and can you also pick up a loaf of bread and\r\n"
    "+ some butter on the way, plus anything you want to drink with dinner.\r\n"
    "M > Will do. See you soon.\r\n"
    "IMEND\r\n";
