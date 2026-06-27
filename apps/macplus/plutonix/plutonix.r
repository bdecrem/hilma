/*
 * Plutonix resources — just a SIZE partition. The console ring (~17K) + the
 * nettcp 16K receive buffer + code want real room; the Plus has 4MB, give it 1MB.
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
    1024 * 1024,
    1024 * 1024
};
