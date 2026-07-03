/*
 * Daily Pixel — resources. Just a SIZE partition; 2 MB like the other nettcp
 * apps (the MacTCP receive ring + offscreen bitmap need real room, and 1 MB
 * proved too tight for the nettcp working set on Atkinson/Bridge).
 */
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
    2048 * 1024,
    2048 * 1024
};
