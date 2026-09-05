// The browser has the real thing.
export const OfflineAudioContext = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
export const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
export default { OfflineAudioContext, AudioContext };
