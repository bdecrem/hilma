/*
 * Macinclaude resources: the Settings dialog (DLOG 128 / DITL 128) and the
 * SIZE resource. Item numbers must match the k* defines in macinclaude.c.
 */

#include "Dialogs.r"

/* Explicit position: 512x342 screen, 20px menu bar, dialog 372x236.
 * left = (512-372)/2 = 70 ; top = 20 + ((342-20)-236)/2 = 63.
 * (centerMainScreen auto-positioning is ignored by this toolbox, which would
 * otherwise leave top=0 and clip the first row behind the menu bar.) */
resource 'DLOG' (128) {
    { 63, 70, 299, 442 },
    dBoxProc,
    visible,
    noGoAway,
    0,
    128,
    "",
    noAutoCenter
};

resource 'DITL' (128) {
    {
        /* 1  Save   */ { 200, 282, 220, 362 }, Button     { enabled, "Save" };
        /* 2  Cancel */ { 200, 182, 220, 262 }, Button     { enabled, "Cancel" };

        /* 3  ssid label */ { 14, 12, 30, 152 }, StaticText { enabled, "WiFi network:" };
        /* 4  ssid edit  */ { 12, 156, 30, 360 }, EditText  { enabled, "" };

        /* 5  pass label */ { 40, 12, 56, 152 }, StaticText { enabled, "WiFi password:" };
        /* 6  pass edit  */ { 38, 156, 56, 360 }, EditText  { enabled, "" };

        /* 7  host label */ { 66, 12, 82, 152 }, StaticText { enabled, "Mac mini host:" };
        /* 8  host edit  */ { 64, 156, 82, 360 }, EditText  { enabled, "" };

        /* 9  port label */ { 92, 12, 108, 152 }, StaticText { enabled, "TCP port:" };
        /* 10 port edit  */ { 90, 156, 108, 246 }, EditText  { enabled, "" };

        /* 11 baud label */ { 120, 12, 136, 152 }, StaticText { enabled, "Baud rate:" };
        /* 12 rb 1200 */ { 118, 156, 134, 246 }, RadioButton { enabled, "1200" };
        /* 13 rb 2400 */ { 118, 250, 134, 340 }, RadioButton { enabled, "2400" };
        /* 14 rb 9600 */ { 140, 156, 156, 246 }, RadioButton { enabled, "9600" };
        /* 15 rb 19200 */ { 140, 250, 156, 350 }, RadioButton { enabled, "19200" };

        /* 16 helper */ { 168, 12, 196, 360 }, StaticText
            { enabled, "Saving joins WiFi and stores it in the modem, then dials." };

        /* 17 default-button frame (UserItem) */ { 196, 278, 224, 366 }, UserItem { enabled };
    }
};

#include "Processes.r"

resource 'SIZE' (-1) {
    reserved,
    acceptSuspendResumeEvents,
    reserved,
    canBackground,
    doesActivateOnFGSwitch,
    backgroundAndForeground,
    dontGetFrontClicks,
    ignoreChildDiedEvents,
    is32BitCompatible,
    notHighLevelEventAware,
    onlyLocalHLEvents,
    notStationeryAware,
    dontUseTextEditServices,
    reserved,
    reserved,
    reserved,
    /* MacTCP needs room: ~16K receive buffer + code + TextEdit console + QuickDraw
       scratch. 120K was fine for the serial path; give the TCP path 1MB (the Plus
       has 4MB), mirroring Atkinson. */
    2048 * 1024,
    2048 * 1024
};
