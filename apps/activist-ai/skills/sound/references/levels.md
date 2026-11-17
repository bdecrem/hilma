# What listen.py measures, and the numbers

`listen.py` replaces every AudioContext of the page with an offline one that keeps the page's own
clock, so everything the page schedules (clicks, timers, a lookahead scheduler, `<audio>`) is
rendered exactly, without speakers. Then it measures each stretch between two clicks.

| Measure | Interface sound | Music | Why |
|---|---|---|---|
| peak level | about -18 dBFS; [warn] above -14, [fail] above -10 | [fail] above -1 | interface sounds sit far under music and speech |
| clipping (samples at full scale) | [fail] any | [fail] any | distortion, and a sign the gain staging is wrong |
| loudness (RMS while it sounds) | | -24 to -28 for a bed; [warn] above -17, [fail] above -14; [warn] below -42 | a page's music sits under the reading |
| energy above 5 kHz | [warn] over 5%, [fail] over 12% | [warn] over 8%, [fail] over 15% | the harsh, tiring part of a sound: square and sawtooth tones, noise, hard edges |
| attack (10% to 90% of the first peak) | [warn] under 2 ms, [fail] under 1 ms | | an instant start is a click |
| ending | [fail] cut off (still loud 3 ms before silence) | | a stop without a fade is a click |
| hard edges (sample-to-sample jumps) | [fail] any | | square waves, or a sound switched on at full level |
| DC offset | [fail] over 0.01 | [fail] over 0.01 | pushes the speaker off center |
| length | [warn] over 2.6 s | | an interface sound is under a second; a celebration under 2.5 s |
| the family | [warn] levels more than 9 dB apart, or very different brightness | | one voice, different pitches |

For the page as a whole: [fail] sound before a click; [fail] a sound system made on load and never
resumed in a click (phones stay silent); [fail] more than three AudioContexts (browsers stop after a
few); [fail] music that cannot be turned off, or a switch that does not stop it; [fail] buttons that
still sound with sound off; [warn] no sound switch at all; [warn] reduced motion ignored.

For the notes of a tune or a bed (oscillators with a steady pitch; drums and overtones left out):
the key that fits best (major or minor), the share of notes in it ([fail] under 85%), a random walk
([fail]: eight or more notes, all the same length, no figure that comes back; said as a pentatonic
random walk when it uses only five notes), the same note more than four times in a row ([warn]), a
range over two octaves ([warn]), and for a tune that ends: [fail] when its last note is not the home
note or a note of the home chord.

The spectrogram (`sound-check/spectrogram.png`): time across, pitch up on a log scale, loudness as
darkness, a dashed red line at 5 kHz, a blue line at every click. Soft sounds are thin horizontal
lines that fade; harsh ones are dark smears above the red line and dark vertical bars (clicks).
