"""Dodo's Lament — a passacaglia for cathedral organ, strings, celesta and a machine pulse.

The dodo went extinct around 1662, the century of Purcell's "Dido's Lament",
whose ground bass falls chromatically from the tonic to the dominant — the
Baroque sign for grief. This piece is a passacaglia on such a ground (original,
in D minor): the bass repeats every 8 bars under ever-changing variations,
which is also how minimal techno works, so a pulse joins the lament halfway,
and the last chord turns to D major (a Picardy third).

Ground:   D2  C#2  C2  B1  Bb1  A1  G1  A1      (one per bar, 120 BPM, 2 s)
Harmony:  i   V6   i42 V65/IV? -> heard as G7/B, Gm7/Bb, Asus4-A, E0/G, Asus4-A
Form (8-bar cycles):
  0:00 Ground  pedal alone               1:52 Plateau  organ out, pulse + strings + arps
  0:16 Chorale organ chords              2:08 Breakdown  the ground on top over a D pedal,
  0:32 Aria    on the Cornet (trill)          the organ swells stop by stop, a silence
  0:48 Bells   celesta aria, 8th plucks  2:24 Tutti I   full organ, trumpet aria, the pulse
  1:04 Build   16ths, strings, far kick  2:40 Tutti II  + descant bells
  1:20 Pulse   kick, sub, strings aria   2:56 Tutti III climax variant (to D6)
  1:36 Pulse   + open hats, dub rim,     3:12 Coda  A7 with a trill to F#, D major, tail
               oboe, descant bells

  python3 score.py [--bars A-B] [--out DIR]
"""
import argparse
import json
import os
import time

import numpy as np
import soundfile as sf
from scipy import signal
from scipy.ndimage import uniform_filter1d

from engine import (SR, CORNET, m, hz, organ_note, organ_pan, string_note, string_pan, pluck_note,
                    celesta_note, sub_note, kick, hat, shaker, rim, make_ir, convolve, pingpong, eq,
                    peaking, shelf, swept_lp, svf_lp, compress, limit, pan2)

BPM = 120
BEAT = 60.0 / BPM
BAR = 4 * BEAT
BARS = 100
TAIL = 8.0


def T(bar, beat=0.0):
    return (bar * 4 + beat) * BEAT


# ---------------------------------------------------------------------------
# the material
# ---------------------------------------------------------------------------
GROUND = [m(x) for x in ['D2', 'C#2', 'C2', 'B1', 'Bb1', 'A1', 'G1', 'A1']]

# chorale: per bar, segments (beat, beats, [tenor, alto, soprano])
CHORALE = [
    [(0, 4, ['F4', 'A4', 'D5'])],                                   # Dm
    [(0, 4, ['E4', 'A4', 'E5'])],                                   # A/C#
    [(0, 4, ['F4', 'A4', 'D5'])],                                   # Dm7/C
    [(0, 4, ['F4', 'G4', 'D5'])],                                   # G7/B
    [(0, 4, ['F4', 'G4', 'D5'])],                                   # Gm7/Bb
    [(0, 2, ['D4', 'A4', 'D5']), (2, 2, ['E4', 'A4', 'C#5'])],      # Asus4 - A
    [(0, 4, ['E4', 'Bb4', 'D5'])],                                  # E half-dim / G
    [(0, 2, ['E4', 'A4', 'D5']), (2, 2, ['E4', 'A4', 'C#5'])],      # Asus4 - A
]
CHORD_PCS = [  # for the checker: pitch classes per half bar (bass included)
    [{2, 5, 9}, {2, 5, 9}], [{1, 4, 9}, {1, 4, 9}], [{0, 2, 5, 9}, {0, 2, 5, 9}], [{11, 2, 5, 7}, {11, 2, 5, 7}],
    [{10, 2, 5, 7}, {10, 2, 5, 7}], [{9, 2, 4}, {9, 1, 4}], [{7, 10, 2, 4}, {7, 10, 2, 4}], [{9, 2, 4}, {9, 1, 4}],
]

ARIA = [
    [(0, 1, 'A4'), (1, 1, 'D5'), (2, 2, 'F5')],
    [(0, 2, 'E5'), (2, 1, 'A5'), (3, 1, 'G5')],
    [(0, 2, 'F5'), (2, 1, 'E5'), (3, 1, 'D5')],
    [(0, 2, 'D5'), (2, 1, 'F5'), (3, 1, 'G5')],
    [(0, 3, 'Bb5'), (3, 1, 'A5')],
    [(0, 2, 'A5'), (2, 1, 'G5'), (3, 1, 'F5')],
    [(0, 2, 'E5'), (2, 1, 'G5'), (3, 1, 'F5')],
    [(0, 2, 'E5'), (2, 2, 'C#5')],
]
ARIA_CLIMAX = ARIA[:3] + [
    [(0, 2, 'D5'), (2, 1, 'F5'), (3, 1, 'A5')],
    [(0, 2, 'D6'), (2, 1, 'C6'), (3, 1, 'Bb5')],
    [(0, 2, 'A5'), (2, 1, 'G5'), (3, 1, 'F5')],
    [(0, 2, 'E5'), (2, 1, 'G5'), (3, 1, 'F5')],
    [(0, 4, 'E5')],
]
DESCANT = ['A5', 'A5', 'A5', 'B5', 'Bb5', 'A5', 'Bb5', 'A5']

# breakdown over a D pedal: the ground moves to the top
BREAK_TOP = ['D5', 'C#5', 'C5', 'B4', 'Bb4', 'A4', 'G4', 'A4']
BREAK_INNER = [['F4', 'A4'], ['E4', 'G4'], ['F4', 'A4'], ['D4', 'G4'], ['D4', 'G4'], ['D4', 'F4'], ['Bb3', 'D4'],
               ['C#4', 'E4', 'G4']]

ARP_FIGURE = [0, 2, 1, 3, 2, 4, 3, 1]
TRESILLO = {0, 3, 6, 8, 11, 14}


def chorale_segments(bar_in_cycle):
    return [(b, d, [m(x) for x in v]) for b, d, v in CHORALE[bar_in_cycle]]


def arp_tones(bar_in_cycle, half):
    segs = CHORALE[bar_in_cycle]
    voices = segs[0][2] if (half == 0 or len(segs) == 1) else segs[1][2]
    base = sorted(set([GROUND[bar_in_cycle] + 24] + [m(x) for x in voices]))
    return base + [base[2] + 12]


# ---------------------------------------------------------------------------
# rendering helpers
# ---------------------------------------------------------------------------
class Mix:
    def __init__(self, n, names):
        self.n = n
        self.b = {k: np.zeros((2, n), np.float32) for k in names}

    def add(self, bus, start, y, pan=0.0, gain=1.0):
        i = int(round(start * SR))
        if i >= self.n:
            return
        if y.ndim == 1:
            y = pan2(y, pan)
        L = min(y.shape[1], self.n - i)
        if i < 0:
            y = y[:, -i:]
            L = min(y.shape[1], self.n)
            i = 0
        self.b[bus][:, i:i + L] += (y[:, :L] * gain).astype(np.float32)


def merge_ties(notes):
    """notes: (start, dur, midi, key) sorted by start; join a note to the one before if it continues it."""
    out = []
    for s, d, p, k in sorted(notes, key=lambda x: x[0]):
        if out and out[-1][2] == p and out[-1][3] == k and abs(out[-1][0] + out[-1][1] - s) < 1e-6:
            out[-1] = (out[-1][0], out[-1][1] + d, p, k)
        else:
            out.append((s, d, p, k))
    return out


def trill(start, beats, main, upper, rate_beats=1 / 6):
    """A Baroque trill starting on the upper note; returns [(start, dur, midi)]."""
    out = []
    t = 0.0
    i = 0
    while t < beats - 0.5 - 1e-9:
        out.append((start + t * BEAT, rate_beats * BEAT, upper if i % 2 == 0 else main))
        t += rate_beats
        i += 1
    out.append((start + t * BEAT, (beats - t) * BEAT, main))
    return out


def section_of(bar):
    return bar // 8


# ---------------------------------------------------------------------------
# the score
# ---------------------------------------------------------------------------
def build(mix, rng, bars_range):
    lo, hi = bars_range
    inb = lambda b: lo <= b < hi

    # ---------------- organ: chorale (manual) ----------------
    regs = {1: (['gedackt8', 'principal8'], 0.08), 2: (['gedackt8', 'principal8'], 0.07),
            3: (['gedackt8'], 0.09), 4: (['gedackt8', 'flute4'], 0.085),
            5: (['principal8', 'octave4'], 0.075), 6: (['principal8', 'octave4'], 0.075),
            9: (['principal8', 'octave4', 'superoctave2', 'mixture'], 0.062),
            10: (['principal8', 'octave4', 'superoctave2', 'mixture'], 0.062),
            11: (['principal8', 'octave4', 'superoctave2', 'mixture'], 0.062)}
    voices = {0: [], 1: [], 2: []}
    lh = []
    for bar in range(8, 96):
        c = section_of(bar)
        if c not in regs:
            continue
        for beat, beats, vv in chorale_segments(bar % 8):
            for vi, p in enumerate(vv):
                voices[vi].append((T(bar, beat), beats * BEAT, p, c))
        if c >= 9:
            lh.append((T(bar), BAR, GROUND[bar % 8] + 12, c))
    for vi, notes in voices.items():
        for s, d, p, c in merge_ties(notes):
            if not (inb(int(s // BAR)) or inb(int((s + d - 1e-3) // BAR))):
                continue
            stops, g = regs[c]
            y = organ_note(p, d, stops, rng, gain=g)
            mix.add('organ', s + rng.normal(0, 0.005), y, pan=organ_pan(p))
    for bar in range(0, 8):   # the opening: the ground doubled an octave up on soft flutes
        if inb(bar):
            p = GROUND[bar] + 12
            mix.add('organ', T(bar), organ_note(p, BAR, ['gedackt8', 'flute4', 'octave4'], rng, gain=0.085), pan=organ_pan(p) * 0.4)
    for s, d, p, c in merge_ties(lh):
        if inb(int(s // BAR)):
            y = organ_note(p, d, ['principal8', 'octave4'], rng, gain=0.06)
            mix.add('organ', s, y, pan=organ_pan(p) * 0.5)

    # breakdown (bars 64-71): inner chords over the D pedal, stops added as it swells
    for i in range(8):
        bar = 64 + i
        if not inb(bar):
            continue
        stops = ['gedackt8', 'flute4']
        if i >= 5:
            stops = stops + ['principal8', 'octave4']
        if i >= 6:
            stops = stops + ['superoctave2', 'mixture']
        if i == 7:
            stops = stops + ['trumpet8']
        dur = BAR if i < 7 else 2 * BEAT
        for p in [m(x) for x in BREAK_INNER[i]] + [m(BREAK_TOP[i])]:
            y = organ_note(p, dur, stops, rng, gain=0.075)
            mix.add('organ', T(bar) + rng.normal(0, 0.004), y, pan=organ_pan(p))

    # coda (bars 96-99)
    coda = [(96, 0, 2, ['E4', 'A4', 'D5']), (96, 2, 2, ['E4', 'A4', 'C#5']), (97, 0, 4, ['G4', 'C#5', 'E5']),
            (98, 0, 8, ['F#4', 'D5', 'F#5'])]
    for bar, beat, beats, vv in coda:
        if not inb(bar):
            continue
        for p in [m(x) for x in vv]:
            y = organ_note(p, beats * BEAT, ['principal8', 'octave4', 'superoctave2', 'mixture', 'trumpet8'], rng, gain=0.058)
            mix.add('organ', T(bar, beat) + rng.normal(0, 0.004), y, pan=organ_pan(p))
    for bar, beats, p in [(96, 8, m('A2')), (98, 8, m('D3')), (98, 8, m('A3'))]:
        if inb(bar):
            mix.add('organ', T(bar), organ_note(p, beats * BEAT, ['principal8', 'octave4', 'trumpet8'], rng, gain=0.055),
                    pan=organ_pan(p) * 0.5)

    # ---------------- organ: pedal ----------------
    pregs = {0: (['subbass16', 'pprincipal8', 'poctave4'], 0.15), 1: (['subbass16', 'pprincipal8'], 0.15),
             2: (['subbass16', 'pprincipal8'], 0.15), 3: (['subbass16', 'pprincipal8'], 0.13),
             4: (['subbass16', 'pprincipal8'], 0.13), 5: (['pprincipal8', 'poctave4'], 0.11),
             6: (['pprincipal8', 'poctave4'], 0.11), 9: (['subbass16', 'pprincipal8', 'poctave4'], 0.10),
             10: (['subbass16', 'pprincipal8', 'poctave4', 'posaune16'], 0.095),
             11: (['subbass16', 'pprincipal8', 'poctave4', 'posaune16'], 0.095)}
    ped = []
    for bar in range(0, 96):
        c = section_of(bar)
        if c in pregs:
            ped.append((T(bar), BAR, GROUND[bar % 8], c))
    for s, d, p, c in merge_ties(ped):
        if inb(int(s // BAR)):
            stops, g = pregs[c]
            mix.add('pedal', s, organ_note(p, d, stops, rng, gain=g), pan=0.0)
    if inb(64):
        mix.add('pedal', T(64), organ_note(m('D2'), 7 * BAR, ['subbass16', 'pprincipal8'], rng, gain=0.13))
    if inb(71):
        mix.add('pedal', T(71), organ_note(m('A1'), 2 * BEAT, ['subbass16', 'pprincipal8', 'poctave4', 'posaune16'], rng, gain=0.1))
    if inb(96):
        mix.add('pedal', T(96), organ_note(m('A1'), 2 * BAR, ['subbass16', 'pprincipal8', 'poctave4', 'posaune16'], rng, gain=0.095))
    if inb(98):
        mix.add('pedal', T(98), organ_note(m('D2'), 2 * BAR, ['subbass16', 'pprincipal8', 'poctave4', 'posaune16'], rng, gain=0.1))

    # ---------------- the aria on organ solo stops ----------------
    def aria_notes(cycle_bar0, table, transpose=0):
        out = []
        for i, bar_notes in enumerate(table):
            for beat, beats, name in bar_notes:
                out.append((T(cycle_bar0 + i, beat), beats * BEAT, m(name) + transpose))
        return out

    solo = []
    if inb(16):  # Cornet, with a trill on the cadence
        notes = aria_notes(16, ARIA)
        notes = [x for x in notes if not (abs(x[0] - T(23)) < 1e-6)]
        notes += trill(T(23), 2, m('E5'), m('F5'))
        solo += [(s, d, p, CORNET, 0.075) for s, d, p in notes]
    if inb(48):  # oboe doubling the strings
        solo += [(s, d, p, ['oboe8'], 0.06) for s, d, p in aria_notes(48, ARIA)]
    for c0, tab in [(72, ARIA), (88, ARIA_CLIMAX)]:
        if inb(c0):
            solo += [(s, d, p, ['trumpet8'], 0.075) for s, d, p in aria_notes(c0, tab)]
    if inb(80):  # Tutti II: the trumpet holds a cantus firmus (the descant, one note a bar, tied)
        cf = merge_ties([(T(80 + i), BAR, m(DESCANT[i]), 0) for i in range(8)])
        solo += [(s, d, p, ['trumpet8'], 0.07) for s, d, p, _ in cf]
    if inb(96):
        solo += [(T(96), BAR, m('E5'), ['trumpet8'], 0.075)]
        solo += [(s, d, p, ['trumpet8'], 0.075) for s, d, p in trill(T(97), 4, m('E5'), m('F#5'))]
        solo += [(T(98), 2 * BAR, m('F#5'), ['trumpet8'], 0.075)]
    for s, d, p, stops, g in solo:
        mix.add('solo', s + rng.normal(0, 0.003), organ_note(p, d, stops, rng, gain=g), pan=0.05)

    # ---------------- strings ----------------
    def strings(notes, vel=1.0, attack=0.35, release=0.6, legato=0.0):
        for s, d, p in notes:
            y = string_note(p, d + legato, rng, vel=vel, attack=attack, release=release, pan=string_pan(p))
            mix.add('strings', s + rng.normal(0, 0.008), y)

    def pad_notes(bars, parts=('T', 'A', 'S'), bass_oct=True):
        vv = {'T': [], 'A': [], 'S': []}
        bl = []
        for bar in bars:
            for beat, beats, v3 in chorale_segments(bar % 8):
                for key, p in zip(('T', 'A', 'S'), v3):
                    vv[key].append((T(bar, beat), beats * BEAT, p, 0))
            bl.append((T(bar), BAR, GROUND[bar % 8] + 12, 0))
        out = []
        for key in parts:
            out += [(s, d, p) for s, d, p, _ in merge_ties(vv[key])]
        if bass_oct:
            out += [(s, d, p) for s, d, p, _ in merge_ties(bl)]
        return out

    if inb(32):
        strings(pad_notes(range(32, 40)), vel=0.45, attack=0.9)
    if inb(40):
        strings(pad_notes(range(40, 56), parts=('T',)), vel=0.5, attack=0.5)
        strings(aria_notes(40, ARIA) + aria_notes(48, ARIA), vel=0.85, attack=0.12, release=0.35, legato=0.08)
    if inb(56):
        strings(pad_notes(range(56, 64)), vel=0.55, attack=0.7)
    if inb(64):
        for i in range(8):
            v = 0.5 + 0.5 * i / 7
            d = BAR if i < 7 else 2 * BEAT
            strings([(T(64 + i), d, m(BREAK_TOP[i]))], vel=v * 1.1, attack=0.5)
            strings([(T(64 + i), d, m(x)) for x in BREAK_INNER[i]], vel=v * 0.7, attack=0.5)
    if inb(72):
        strings(pad_notes(range(72, 96)), vel=0.6, attack=0.4)
        strings(aria_notes(72, ARIA, 12) + aria_notes(80, ARIA, 12) + aria_notes(88, ARIA_CLIMAX, 12),
                vel=0.8, attack=0.1, release=0.35, legato=0.08)
    if inb(96):
        strings([(T(96), BAR, m(x)) for x in ['A3', 'E4', 'A4', 'D5']] + [(T(97), BAR, m(x)) for x in ['A3', 'G4', 'C#5', 'E5']],
                vel=0.75, attack=0.3)
        strings([(T(98), 2 * BAR, m(x)) for x in ['D3', 'A3', 'F#4', 'D5', 'F#5', 'A5']], vel=0.85, attack=0.25, release=1.5)
        strings([(T(96), BAR, m('E6')), (T(97), BAR, m('E6')), (T(98), 2 * BAR, m('F#6'))], vel=0.55, attack=0.3, release=1.5)

    # ---------------- celesta ----------------
    if inb(24):
        for s, d, p in aria_notes(24, ARIA, 12):
            mix.add('bells', s, celesta_note(p, rng, vel=0.55), pan=0.15)
    for c0 in (48, 56, 80):
        if inb(c0):
            for i in range(8):
                for beat in (0, 1.5, 3):
                    mix.add('bells', T(c0 + i, beat), celesta_note(m(DESCANT[i]), rng, vel=0.5 if beat else 0.62), pan=-0.2)
    if inb(88):
        for s, d, p in aria_notes(88, ARIA_CLIMAX, 12):
            mix.add('bells', s, celesta_note(p, rng, vel=0.5), pan=0.15)
    if inb(99):
        for j, name in enumerate(['D6', 'F#6', 'A6', 'D7']):
            mix.add('bells', T(99, 1 + 0.5 * j), celesta_note(m(name), rng, vel=0.5 - 0.07 * j, ring=2.6), pan=0.1)

    # ---------------- plucks ----------------
    def arps(bar, step_beats, fc0, vel, q=1.4):
        steps = int(4 / step_beats)
        for st in range(steps):
            beat = st * step_beats
            half = 0 if beat < 2 else 1
            tones = arp_tones(bar % 8, half)
            idx = ARP_FIGURE[(st * (2 if step_beats == 0.5 else 1)) % len(ARP_FIGURE)]
            p = tones[idx]
            v = vel * (1.0 if (st * (2 if step_beats == 0.5 else 1)) % 16 in TRESILLO else 0.62)
            y = pluck_note(p, step_beats * BEAT * 0.9, rng, vel=v, fc0=fc0, q=q)
            mix.add('arps', T(bar, beat) + rng.normal(0, 0.002), y, pan=0.0)

    for bar in range(24, 97):
        if not inb(bar):
            continue
        c = section_of(bar)
        if c == 3:
            arps(bar, 0.5, 1000, 0.55)
        elif c == 4:
            arps(bar, 0.25, 1000 + 1600 * (bar - 32) / 7, 0.55)
        elif c in (5, 6):
            arps(bar, 0.25, 3400, 0.6)
        elif c == 7:
            arps(bar, 0.25, 2800 + 1400 * np.sin(np.pi * (bar - 56) / 8), 0.6, q=2.2)
        elif c in (9, 10, 11) or bar == 96:
            arps(bar, 0.25, 4200, 0.7)   # bar 96 is bar 7 of the ground again: A sus4 - A

    # ---------------- drums, sub ----------------
    kicks = []
    swing = 0.08 * 0.25 * BEAT
    for bar in range(0, BARS):
        if not inb(bar):
            continue
        c = section_of(bar)
        if c == 3 and bar >= 28:
            for beat in (0, 2):
                mix.add('kickfar', T(bar, beat), kick(rng, vel=0.8), pan=0.0)
        if c == 4:
            for beat in range(4):
                if bar == 39 and beat == 3:
                    continue
                mix.add('kickfar', T(bar, beat), kick(rng, vel=0.9), pan=0.0)
            if bar >= 36:
                for st in range(16):
                    mix.add('hats', T(bar, st * 0.25) + (swing if st % 2 else 0), shaker(rng, 0.3 if st in TRESILLO else 0.15), pan=0.25)
        pulse = c in (5, 6, 7, 9, 10, 11) or bar == 96
        if pulse:
            for beat in range(4):
                kicks.append(T(bar, beat))
                mix.add('kick', T(bar, beat), kick(rng, vel=1.0, decay=0.24), pan=0.0)
            for st in range(16):
                acc = st in TRESILLO
                mix.add('hats', T(bar, st * 0.25) + (swing if st % 2 else 0), shaker(rng, 0.42 if acc else 0.2), pan=0.25)
            if c == 5:
                for beat in (0.5, 1.5, 2.5, 3.5):
                    mix.add('hats', T(bar, beat), hat(rng, 0.5), pan=-0.15)
            if c in (6, 9, 10, 11) or bar == 96:
                for beat in (0.5, 1.5, 2.5, 3.5):
                    mix.add('hats', T(bar, beat), hat(rng, 0.42, open_=True), pan=-0.15)
            if c in (10, 11):
                for st in (1, 3, 5, 7, 9, 11, 13, 15):
                    if st % 4 != 2:
                        mix.add('hats', T(bar, st * 0.25) + swing, hat(rng, 0.18), pan=0.35)
            if c in (6, 7, 9, 10, 11):
                for st in (3, 11):
                    mix.add('rim', T(bar, st * 0.25) + swing, rim(rng, 0.5), pan=0.1)
    if inb(98):
        kicks.append(T(98))
        mix.add('kick', T(98), kick(rng, vel=0.85, decay=0.55), pan=0.0)

    sub = []
    for bar in range(0, 97):
        c = section_of(bar)
        if c in (5, 6, 7, 9, 10, 11) or bar == 96:
            sub.append((T(bar), BAR, GROUND[bar % 8], 0))
    for s, d, p, _ in merge_ties(sub):
        if inb(int(s // BAR)):
            mix.add('sub', s, sub_note(p, d, vel=0.55), pan=0.0)
    if inb(98):
        mix.add('sub', T(98), sub_note(m('D2'), 3.5, vel=0.6) * np.exp(-np.arange(int(3.75 * SR)) / SR / 1.6), pan=0.0)

    # riser: wind through the pipes as the swell opens (bars 69-71)
    if inb(69):
        n = int((T(71, 2) - T(69)) * SR)
        t = np.arange(n) / SR
        nz = rng.standard_normal(n)
        fc = 300 * (8000 / 300) ** (t / t[-1])
        y = svf_lp(nz, fc, 1.2) - svf_lp(nz, fc * 0.25, 0.7)
        y = y / (np.std(y) + 1e-12) * (t / t[-1]) ** 2 * 0.032
        mix.add('organ', T(69), y, pan=0.0)
    return kicks


def duck(kicks, n, depth, tau=0.12, attack=0.003):
    g = np.ones(n, np.float32)
    L = int(0.6 * SR)
    t = np.arange(L) / SR
    curve = 1 - depth * np.exp(-np.maximum(t - attack, 0) / tau) * np.clip(t / attack, 0, 1)
    for tk in kicks:
        i = int(tk * SR)
        j = min(n, i + L)
        if i >= n:
            continue
        g[i:j] = np.minimum(g[i:j], curve[:j - i])
    return g


# ---------------------------------------------------------------------------
# mix
# ---------------------------------------------------------------------------
GAINS = {  # dB, set by listening proxies in check.py
    'organ': 0.0, 'pedal': 0.0, 'solo': 0.0, 'strings': -6.0, 'bells': -9.0, 'arps': -8.0,
    'kick': -3.0, 'kickfar': -6.0, 'hats': -14.0, 'rim': -14.0, 'sub': -6.0,
}
# Per-section fader rides (dB, on top of GAINS), one value per 8-bar section:
#   Ground Chorale Aria Bells Build Pulse PulseII Plateau Break TuttiI TuttiII TuttiIII Coda
# Planned from measured stem loudness against a target arc (-20 LUFS at the start,
# -8.3 at the last tutti) and a balance per section with the organ leading.
RIDES = {
    'organ': [0.4, -1.2, -2.3, -0.6, -0.4, 0.3, 0.0, 0.0, 3.2, 3.8, 3.9, 4.3, 4.0],
    'pedal': [0.0, 0.9, -0.5, 1.3, 2.3, 2.3, 1.9, 0.0, 2.5, 5.9, 4.0, 4.6, 7.0],
    'solo': [0.0, 0.0, 2.2, 0.0, 0.0, 0.0, 6.9, 0.0, 0.0, 7.0, 7.0, 7.8, 10.5],
    'strings': [0.0, 0.0, 0.0, 0.0, -13.0, -11.4, -11.1, -12.6, -10.6, -13.7, -13.8, -13.5, -13.4],
    'bells': [0.0, 0.0, 0.0, -7.3, 0.0, 0.0, -11.1, -10.7, 0.0, 0.0, -9.6, -6.2, 0.4],
    'arps': [0.0, 0.0, 0.0, -4.4, -3.0, -4.0, -4.2, -3.0, 0.0, -5.1, -5.0, -4.8, 3.0],
    'kick': [0.0, 0.0, 0.0, 0.0, 0.0, -7.5, -7.7, -7.5, 0.0, -8.2, -8.2, -7.9, -0.9],
    'kickfar': [0.0, 0.0, 0.0, -7.4, -6.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    'hats': [0.0, 0.0, 0.0, 0.0, 6.8, 5.1, 2.2, 7.0, 0.0, 2.3, 2.0, 2.4, 7.4],
    'rim': [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 16.5, 16.7, 0.0, 16.0, 16.0, 16.2, 0.0],
    'sub': [0.0, 0.0, 0.0, 0.0, 0.0, -2.3, -2.5, -1.8, 0.0, -2.5, -2.5, -2.2, 3.5],
}
SEND = {  # dB into the rooms
    'cathedral': {'organ': -8.0, 'pedal': -11.0, 'solo': -9.0, 'strings': -10.0, 'bells': -8.0},
    'hall': {'arps': -9.0, 'rim': -8.0},
    'room': {'hats': -12.0, 'kick': -24.0},
}
DUCK = {'organ': 0.22, 'pedal': 0.5, 'solo': 0.12, 'strings': 0.3, 'arps': 0.35, 'bells': 0.1, 'sub': 0.85,
        'cathedral': 0.3, 'hall': 0.3}


def process(mix, kicks, out_dir, stems='check'):
    n = mix.n
    b = mix.b
    db = lambda x: 10 ** (x / 20)
    # bus EQ
    b['organ'] = eq(b['organ'], np.vstack([signal.butter(2, 70, 'high', fs=SR, output='sos'),
                                          peaking(320, -1.5, 1.0), signal.butter(1, 15000, 'low', fs=SR, output='sos')]))
    b['pedal'] = eq(b['pedal'], signal.butter(4, 34, 'high', fs=SR, output='sos'))
    b['strings'] = eq(b['strings'], np.vstack([signal.butter(2, 75, 'high', fs=SR, output='sos'), peaking(290, 2.5, 1.0),
                                              peaking(1000, 1.0, 1.2), peaking(2800, 2.5, 1.2),
                                              signal.butter(2, 9000, 'low', fs=SR, output='sos')]))
    b['arps'] = eq(b['arps'], signal.butter(2, 160, 'high', fs=SR, output='sos'))
    b['sub'] = eq(b['sub'], signal.butter(2, 160, 'low', fs=SR, output='sos'))
    # swell box on the manuals during the breakdown (bars 64-71): 450 Hz -> open, +8 dB
    t = np.arange(n) / SR
    fc = np.full(n, 20000.0)
    s0, s1 = T(64), T(71, 2)
    w = (t >= s0) & (t < s1)
    x = (t[w] - s0) / (s1 - s0)
    fc[w] = 450 * (20000 / 450) ** (x ** 1.6)
    swell_gain = np.ones(n, np.float32)
    swell_gain[w] = db(-8 + 8 * x ** 1.3)
    b['organ'] = (swept_lp(b['organ'], fc, 0.6) * swell_gain).astype(np.float32)
    # the far kick: behind a wall that opens
    fk = np.full(n, 120.0)
    a0, a1 = T(28), T(32)
    fk[(t >= a0) & (t < a1)] = 120
    w2 = (t >= T(32)) & (t < T(40))
    fk[w2] = 150 * (3200 / 150) ** ((t[w2] - T(32)) / (T(40) - T(32)))
    b['kickfar'] = swept_lp(b['kickfar'], fk, 0.8).astype(np.float32)
    # dub echo on the rim, ping-pong on the plucks
    b['rim'] = b['rim'] + pingpong(b['rim'], 0.75 * BEAT, 0.55, 0.45, 5, lp_hz=3500)
    b['arps'] = b['arps'] + pingpong(b['arps'], 0.75 * BEAT, 0.32, 0.38, 6, lp_hz=3000)

    # gains, fader rides, sidechain
    g = {k: np.float32(db(v)) for k, v in GAINS.items()}
    dk = {k: duck(kicks, n, d) for k, d in DUCK.items()}
    sec = np.minimum((np.arange(n) / SR // (8 * BAR)).astype(np.int64), 12)
    for k in b:
        b[k] *= g.get(k, 1.0)
        if k in RIDES:
            r_db = uniform_filter1d(np.asarray(RIDES[k], np.float64)[sec], int(0.3 * SR), mode='nearest')
            b[k] *= (10 ** (r_db / 20)).astype(np.float32)[None, :]
        if k in dk:
            b[k] *= dk[k][None, :]

    # rooms
    print('  rooms...', flush=True)
    irs = {'cathedral': make_ir([(63, 7.0), (125, 6.4), (250, 5.8), (500, 5.3), (1000, 4.8), (2000, 4.0), (4000, 3.0),
                                 (8000, 1.9), (16000, 1.0)], 8.0, 0.035, seed=1662),
           'hall': make_ir([(125, 2.6), (500, 2.2), (2000, 1.8), (8000, 1.0)], 3.5, 0.02, seed=1598),
           'room': make_ir([(125, 0.7), (1000, 0.6), (8000, 0.35)], 1.2, 0.006, seed=7)}
    wet = {}
    for room, sends in SEND.items():
        send = np.zeros((2, n), np.float32)
        for k, v in sends.items():
            send += b[k] * np.float32(db(v))
        r = convolve(send, irs[room])
        r = eq(r, signal.butter(2, 140 if room != 'room' else 250, 'high', fs=SR, output='sos'))
        if room in dk:
            r *= dk[room][None, :]
        wet[room] = r
    dry = sum(b.values())
    mixdown = dry + sum(wet.values())
    if stems != 'none':   # 16-bit; 'check' = the mono stems check.py reads, 'all' = every bus in stereo
        os.makedirs(f'{out_dir}/stems', exist_ok=True)
        for k, v in list(b.items()) + [(f'wet-{k}', v) for k, v in wet.items()]:
            if stems == 'all':
                sf.write(f'{out_dir}/stems/{k}.wav', np.clip(v.T, -1, 1), SR, subtype='PCM_16')
            elif k in ('organ', 'pedal', 'strings', 'solo', 'kick', 'hats'):
                sf.write(f'{out_dir}/stems/{k}.wav', np.clip(v.mean(axis=0), -1, 1), SR, subtype='PCM_16')
    # master: gentle glue, a touch of air, limiter
    mixdown = eq(mixdown, shelf(7000, 2.5, high=True))
    comp, gr = compress(mixdown, thr_db=-17, ratio=1.5, knee=8, attack=0.03, release=0.3)
    pre = np.max(np.abs(comp))
    master, lg = limit(comp * np.float32(db(MASTER_DB)), ceiling_db=-1.3)
    lg_db = -20 * np.log10(np.maximum(lg, 1e-9))
    secs = np.minimum((np.arange(n) / SR // (8 * BAR)).astype(np.int64), 12)
    info = {'glue_gr_max_db': float(np.max(gr)), 'limiter_gr_max_db': float(np.max(lg_db)),
            'pre_limiter_peak_db': float(20 * np.log10(pre) + MASTER_DB),
            'limiter_gr_by_section': [[round(float(np.max(lg_db[secs == c])), 1), round(float(np.mean(lg_db[secs == c])), 2)]
                                      for c in range(13)]}
    return master, info


MASTER_DB = 2.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bars', default=f'0-{BARS}')
    ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out'))
    ap.add_argument('--stems', default='check', choices=['none', 'check', 'all'])
    a = ap.parse_args()
    lo, hi = [int(x) for x in a.bars.split('-')]
    os.makedirs(a.out, exist_ok=True)
    t0 = time.time()
    n = int((BARS * BAR + TAIL) * SR)
    mix = Mix(n, ['organ', 'pedal', 'solo', 'strings', 'bells', 'arps', 'kick', 'kickfar', 'hats', 'rim', 'sub'])
    rng = np.random.default_rng(1662)
    print('score...', flush=True)
    kicks = build(mix, rng, (lo, hi))
    print(f'  {time.time() - t0:.1f} s; process...', flush=True)
    master, info = process(mix, kicks, a.out, stems=a.stems)
    s = int(T(lo) * SR)
    e = min(n, int((T(hi) + (TAIL if hi >= BARS else 3.0)) * SR))
    master = master[:, s:e]
    name = 'dodos-lament' if (lo, hi) == (0, BARS) else f'excerpt-{lo}-{hi}'
    sf.write(f'{a.out}/{name}.wav', master.T, SR, subtype='PCM_24')
    info.update({'file': f'{a.out}/{name}.wav', 'seconds': master.shape[1] / SR, 'render_s': time.time() - t0})
    json.dump(info, open(f'{a.out}/{name}.json', 'w'), indent=2)
    print(json.dumps(info, indent=2))


if __name__ == '__main__':
    main()
