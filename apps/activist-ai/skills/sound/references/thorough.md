# Thorough mode: a sound design

Only when the person asks for more than the quick pass. Write each decision in `sound/notes.md` in a
few lines as you go.

1. **Brief.** Every moment that should make a sound, how often it happens (a sound heard fifty times
   a day must be nearly silent; one heard once a month can be a small event), where people will be
   (a shared office, a phone in a pocket, a meeting room), and what the project feels like in three
   words. Moments that happen constantly (typing, scrolling, hovering) get no sound.
2. **The palette.** One voice for the whole set (the kit's `felt` voice unless the brief needs
   another), one key (D major for warm, A minor for serious), one room. Write the list: moment,
   kit sound or a new one, pitch, length.
3. **New sounds, only from the kit's parts.** In a copy of `olasound.js`, add entries to `UI` built
   from `felt(c, o, t, hz('A5'), amp, decay)`, `tock(...)` and `padChord(...)`: pitches from the key,
   amp 0.06 to 0.16, decay 0.07 to 1.3 s. Never change `felt`, `tock` or the beds' voices.
4. **Listen to each by name**, one run per sound:
   `python3 /opt/ola/skills/sound/scripts/listen.py index.html --do "js:OlaSound.play('yourname')" --do wait:2`
   and compare them in one run with the page's own buttons. Fix every [fail] and [warn].
5. **Music.** Read `music.md` and `melody.md`. For a tune, write two versions by the four-bar plan,
   listen to both, keep the one whose notes pass and that you can hum after one hearing; say why in
   one sentence.
6. **The mix.** Interface sounds within 6 dB of each other near -18 dBFS peak; music near -24 RMS;
   nothing clips; the switch silences all of it. Run listen.py on the whole page.
7. **Polish by listening, at most three rounds.** Shorten before you add. Remove any sound that does
   not tell the person something.
8. **Hand off** in three sentences: the palette, where the switch is, what the check found.
