/*
 * The Bridge — resources. Just a SIZE partition. The Bridge had no SIZE
 * resource before (it got MultiFinder's tiny default); with the nettcp 16K
 * receive buffer it needs real room. The Plus has 4MB; give it 1MB.
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
