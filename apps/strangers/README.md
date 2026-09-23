# Strangers

A 30-second vertical music edit, drawn frame by frame in code, in the style of `misc/video-sep26.mov`
(halftone, manga speed lines, RGB split, slammed type, cuts on the beat). Two characters from the emoji
keyboard: **Volt** (⚡) and **Boo** (👻). The song is "Speed is Life" (Blade + Into The Void), 0:58–1:28;
the lyrics ("Strangers in the night / Destiny to collide / Running from the light…") are the storyboard.

- `scene.js` — everything drawn: characters, shots, post effects. `renderAt(t)` paints the frame at t.
  Beat and hit times at the top were measured with librosa on the clip (152 BPM, drop at 3.76 s);
  lyric times came from Whisper with word timestamps.
- `index.html` — preview in a browser with the song (tap to play, ←/→ to step, `?t=12.3` for a still).
- `render.mjs` — Playwright + ffmpeg. `node render.mjs` → `out/strangers.mp4` (~1 min on the M4);
  `node render.mjs --stills 4,9.6,22 --sheet out/sheet.jpg` for a contact sheet.
- `fetch-audio.sh` — the song isn't committed; this downloads it and cuts the clip into `audio/clip.wav`.
