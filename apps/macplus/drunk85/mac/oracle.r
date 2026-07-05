/*
 * Oracle resources:
 *   SIZE  -- 2MB memory partition. The int8 model (~470K, loaded as the 'MODL'
 *            resource) + KV cache/activation buffers (~0.8M) + tokenizer + code
 *            fit comfortably; 2MB matches the other apps here (proven to launch
 *            on the 4MB Plus).
 *   MODL  -- the int8-quantized model weights (llama2.c v2 checkpoint), embedded
 *            so THE ORACLE is a single self-contained app: no data files.
 *   TOKN  -- the tokenizer.
 * Paths are relative to the CMake build dir (mac/build), i.e. ../<file>.
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

data 'MODL' (128) { $$read("../model_q.bin") };
data 'TOKN' (128) { $$read("../tok2048.bin") };
