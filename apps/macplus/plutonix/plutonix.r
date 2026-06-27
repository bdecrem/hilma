/*
 * Plutonix resources — just a SIZE partition. Console ring (~17K) + nettcp 16K
 * recv buffer + the SSH/zlib working set (zlib streams ~54K BSS, crypto buffers)
 * + code want real room; the Plus has 4MB, give it 2MB.
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
