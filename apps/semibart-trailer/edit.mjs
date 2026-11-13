// The edit: one timeline that the picture (scene.js) and the score (score.js) both read.
// Act 1 is a movie trailer on black: three braams, THIS. / CHANGES. / EVERYTHING., a riser.
// The hinge: the riser cuts, EVERYTHING. crumbles into 8-bit pixels while the last braam's chord
// powers down as square waves, the game's own start jingle plays, and the title card resolves out
// of the pixels. Act 2 is the game: a chiptune theme on that jingle at 120 BPM (a bar is 2 s),
// cut on the bar to footage filmed by capture.mjs, ending on the title and the address.
export const FPS = 30;
export const HITS = [1.2, 3.6, 6.0];          // THIS. CHANGES. EVERYTHING.
export const WORDS = ['THIS.', 'CHANGES.', 'EVERYTHING.'];
export const WORD_OUT = [3.0, 5.4];            // the first two words go to black before the next hit: the pause
export const RISER = [6.7, 8.4];
export const CRUMBLE = [8.4, 9.05];            // EVERYTHING. falls apart into pixels, the chord powers down
export const JINGLE = 9.2;                     // the game's start jingle; the title resolves out of the pixels
export const T0 = 10.0;                        // the theme's first downbeat
export const BAR = 2.0;
export const STABS = [40.0, 40.5, 41.0];       // THIS. CHANGES. EVERYTHING. again, in the game's font
export const END = 42.0;                       // the end card
export const DUR = 48.0;

// Footage: [start, end, shot, firstFrame, view]. view = [cx, cy, zoom] in 1920x1080 stage pixels,
// or two of them to move from one to the other across the segment.
export const SEGMENTS = [
  [10.0, 12.0, 'title', 20, [[960, 540, 1], [960, 470, 1.12]]],
  [12.0, 14.0, 'start', 8, [[1080, 470, 1.35], [1080, 470, 1.5]]],
  [14.0, 16.0, 'turkeys', 8, [[1230, 520, 2.0], [1230, 500, 2.2]]],
  [17.0, 19.0, 'knock', 36, [[1250, 420, 1.35], [1290, 400, 1.42]]],
  [19.0, 21.0, 'knock', 128, [[1350, 640, 1.5], [1350, 600, 1.6]]],
  [22.0, 26.0, 'seminar', 80, [[960, 540, 1.0], [800, 500, 1.15]]],
  [26.0, 28.0, 'flush', 0, [[1110, 520, 1.9], [1110, 500, 2.1]]],
  [28.0, 30.0, 'leaf', 30, [[700, 470, 1.25], [700, 450, 1.3]]],
  [30.0, 36.0, 'rats', 20, [[960, 540, 1.0], [960, 560, 1.06]]],
  [36.0, 38.0, 'wire', 60, [[900, 720, 1.5], [960, 740, 1.55]]],
  [38.0, 40.0, 'knock', 192, [[1200, 560, 1.2], [1220, 560, 1.3]]],
];
// cards on black in the game's font, between shots
export const CARDS = [
  [16.0, 17.0, 'Fifty-four studies.'],
  [21.0, 22.0, 'One afternoon.'],
];
// game sounds the score leaves out (the theme plays its own jingle)
export const MUTE_SFX = ['jingle'];
