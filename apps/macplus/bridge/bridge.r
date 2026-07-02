/*
 * The Bridge — resources. Just a SIZE partition. The Bridge had no SIZE
 * resource before (it got MultiFinder's tiny default), then crashed at 1MB
 * mid-delivery (the 68000 nettcp working set was too tight). The Plus has
 * 4MB; give it 2MB like the other nettcp apps.
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
