/*
 * Atkinson resources: the Settings dialog (DLOG/DITL 128, ported from
 * Macinclaude), the New Image prompt dialog (DLOG/DITL 129), and the SIZE
 * resource. Item numbers must match the k* defines in atkinson.c.
 */

#include "Dialogs.r"

/* ---- Settings (WiFi + mini host/port + baud) ----
 * 512x342 screen, 20px menu bar, dialog 372x236.
 * left = (512-372)/2 = 70 ; top = 20 + ((342-20)-236)/2 = 63. */
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

/* ---- New Image (prompt for an image idea) ----
 * dialog 360 wide x 150 tall.  left = (512-360)/2 = 76 ;
 * top = 20 + ((342-20)-150)/2 = 106. */
resource 'DLOG' (129) {
    { 106, 76, 256, 436 },
    dBoxProc,
    visible,
    noGoAway,
    0,
    129,
    "",
    noAutoCenter
};

resource 'DITL' (129) {
    {
        /* 1 Create */ { 120, 270, 140, 344 }, Button   { enabled, "Create" };
        /* 2 Cancel */ { 120, 180, 140, 254 }, Button   { enabled, "Cancel" };

        /* 3 label  */ { 12, 16, 28, 344 }, StaticText   { enabled, "Describe the image to draw:" };
        /* 4 prompt */ { 32, 16, 92, 344 }, EditText      { enabled, "" };

        /* 5 helper */ { 96, 16, 114, 344 }, StaticText
            { enabled, "The agent draws it, dithered to 1-bit, line by line." };

        /* 6 default-button frame (UserItem) */ { 116, 266, 144, 348 }, UserItem { enabled };
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
    160 * 1024,
    160 * 1024
};
