/*
 * Porthole resources: SIZE partition, Open Location dialog (DLOG/DITL 129),
 * and an About alert (ALRT/DITL 128). 2MB partition for the zlibss decompressor
 * (~35K) + frame buffers + code.
 */
#include "Processes.r"
#include "Dialogs.r"

resource 'SIZE' (-1) {
    reserved, acceptSuspendResumeEvents, reserved, canBackground,
    doesActivateOnFGSwitch, backgroundAndForeground, dontGetFrontClicks,
    ignoreChildDiedEvents, is32BitCompatible, notHighLevelEventAware,
    onlyLocalHLEvents, notStationeryAware, dontUseTextEditServices,
    reserved, reserved, reserved,
    2048 * 1024,
    2048 * 1024
};

resource 'DLOG' (129) {
    { 120, 60, 230, 452 }, dBoxProc, visible, noGoAway, 0, 129, "", noAutoCenter
};

resource 'DITL' (129) {
    {
        /* 1 Go     */ { 80, 312, 100, 376 }, Button     { enabled, "Go" };
        /* 2 Cancel */ { 80, 230, 100, 294 }, Button     { enabled, "Cancel" };
        /* 3 label  */ { 12, 16, 44, 376 },   StaticText { enabled, "Type a URL (or words to search):" };
        /* 4 edit   */ { 48, 16, 68, 376 },   EditText   { enabled, "" };
    }
};

resource 'ALRT' (128) {
    { 90, 80, 210, 432 }, 128, { OK, visible, sound1; OK, visible, sound1; OK, visible, sound1; OK, visible, sound1 }, noAutoCenter
};

resource 'DITL' (128) {
    {
        /* 1 OK   */ { 90, 270, 110, 334 }, Button     { enabled, "OK" };
        /* 2 text */ { 12, 16, 80, 334 },   StaticText { enabled, "^0" };
    }
};
