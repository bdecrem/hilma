"""Phase Lock — Berlin techno at 132 BPM in A (55 Hz), just intonation. Arrangement, mix, master.

Twelve 16-bar sections (5:49 + the last hit's tail):
  0:00 Intro A   kick, rumble swelling in, offbeat hats          (a DJ's first 16)
  0:29 Intro B   16th hats with a 3-bar decay cycle, the tuned wind, the sub, the toms (12 against 16)
  0:58 Build A   the A minor 7 stab, one hit every two bars, filter nearly shut; open hats
  1:27 Build B   the stab every bar, opening; the ride
  1:56 Main A    clap, 12-step tom polymeter, the stab on two hits with a 7-bar filter drift
  2:25 Main B    a third stab hit on odd bars
  2:54 Breakdown the kick stops; the stab turns to the Phrygian bII (Bb) over the A wind,
                 echoing longer; at 3:09 the kick climbs back through a high-pass that opens
                 downward (no sub), hats rise, a riser, half a beat of nothing
  3:23 Peak A    the drop: A minor 9 on three hits, a 5-step metallic sequence (5 against 16 against 3)
  3:52 Peak B    the rumble at full drive
  4:21 Peak C    the sequence leaves, the stab settles
  4:50 Outro A   the stab closes down, clap and ride out
  5:19 Outro B   kick, rumble, hats — and the last hit

  python3 track.py [--out DIR] [--stems none|check]
"""
import argparse
import json
import os
import time

import numpy as np
import soundfile as sf
from scipy import signal
from scipy.ndimage import uniform_filter1d

import synth as Y
from synth import SR, BAR, STEP, ji
from engine import make_ir, eq, peaking, shelf, compress, limit
from meter import kweight, lufs

BARS = 192
TAIL = 4.5
N = int((BARS * BAR + TAIL) * SR)
SECTIONS = [('Intro A', 0), ('Intro B', 16), ('Build A', 32), ('Build B', 48), ('Main A', 64), ('Main B', 80),
            ('Breakdown', 96), ('Peak A', 112), ('Peak B', 128), ('Peak C', 144), ('Outro A', 160), ('Outro B', 176)]


def T(bar, step=0):
    return bar * BAR + step * STEP


def in_(bar, *ranges):
    return any(a <= bar < b for a, b in ranges)


# --- harmony, all just intonation against A1 = 55 Hz -------------------------
AM7 = [ji('1', 2), ji('5', 2), ji('b7', 2), ji('b3', 3), ji('5', 3)]      # A2 E3 G3 C4 E4: 110 165 198 264 330
AM9 = AM7 + [ji('2', 3)]                                                  # + B3 247.5
BII = [ji('b2', 2), ji('b6', 2), ji('b2', 3), ji('4', 3)]                 # Bb2 F3 Bb3 D4: 117.3 176 234.7 293.3
SEQ = [ji('1', 4), ji('5', 4), ji('b3', 4), ji('b7', 4), ji('5', 4)]      # A4 E5 C5 G5 E5: 440 660 528 792 660
TOMS = {0: (ji('1', 2), 0.9, -0.2), 3: (ji('5', 2), 0.6, 0.25), 7: (ji('1', 2), 0.7, -0.2), 10: (ji('1', 3), 0.5, 0.1)}
WIND_AM = [(ji('1', 3), 1.0), (ji('5', 3), 0.8), (ji('1', 4), 0.6), (ji('b3', 4), 0.45), (ji('5', 4), 0.35)]
WIND_BII = [(ji('b2', 3), 1.0), (ji('b6', 3), 0.7), (ji('b2', 4), 0.5)]
DROPS = {(63, 3), (143, 3), (175, 3)}      # a missing kick before the phrase turns


def auto(points, n=N):
    """Piecewise-linear dB automation over bars -> linear gain per sample."""
    b = np.array([p[0] for p in points], float)
    v = np.array([p[1] for p in points], float)
    return (10 ** (np.interp(np.arange(n) / SR / BAR, b, v) / 20)).astype(np.float32)


class Mix:
    def __init__(self, names):
        self.b = {k: np.zeros((2, N), np.float32) for k in names}

    def add(self, bus, t, y, pan=0.0, gain=1.0):
        i = int(round(t * SR))
        if i >= N:
            return
        if y.ndim == 1:
            a = (pan + 1) * np.pi / 4
            y = np.stack([y * np.cos(a), y * np.sin(a)])
        L = min(y.shape[1], N - i)
        self.b[bus][:, i:i + L] += (y[:, :L] * gain).astype(np.float32)


def build(mix, rng):
    kw, tail_phase = Y.kick_wave()
    kicks = []
    for bar in range(BARS):
        if in_(bar, (96, 112)):
            continue
        for beat in range(4):
            if (bar, beat) not in DROPS:
                kicks.append(T(bar, 4 * beat))
    kicks.append(T(BARS))  # the last hit
    for tk in kicks:
        mix.add('kick', tk, kw)
    for bar in range(104, 112):  # the kick climbing back behind a wall
        for beat in range(4):
            if not (bar == 111 and beat == 3):
                mix.add('kickfar', T(bar, 4 * beat), kw)

    # hats
    for bar in range(BARS):
        for st in range(16):
            t = T(bar, st)
            g = bar * 16 + st
            dec = 0.022 + 0.04 * (0.5 + 0.5 * np.sin(2 * np.pi * g / 48))       # 3-bar decay cycle
            if bar < 16:
                if st % 4 == 2:
                    mix.add('hats', t, Y.hat(0.04, 0.75), pan=0.12)
            elif in_(bar, (16, 96), (112, 176)):
                v = [0.32, 0.22, 0.85, 0.22][st % 4] * (1 + 0.06 * rng.standard_normal())
                if st % 4 == 2 and bar >= 32:
                    v *= 0.45
                mix.add('hats', t, Y.hat(dec, v), pan=0.12)
                if st % 4 == 2 and bar >= 32:
                    mix.add('ohats', t, Y.hat(0.12 if bar < 48 else (0.2 if bar >= 112 else 0.17), 0.7), pan=-0.2)
            elif in_(bar, (104, 112)):
                if bar == 111 and st >= 14:
                    continue
                x = ((bar - 104) * 16 + st) / 128
                mix.add('hats', t, Y.hat(0.02 + 0.04 * x, 0.15 + 0.75 * x), pan=0.12)
            elif in_(bar, (176, 184)):
                v = [0.32, 0.22, 0.85, 0.22][st % 4]
                mix.add('hats', t, Y.hat(dec, v), pan=0.12)
            elif in_(bar, (184, 190)) and st % 4 == 2:
                mix.add('hats', t, Y.hat(0.04, 0.7), pan=0.12)
            if in_(bar, (56, 96), (112, 160)) and st % 2 == 0:
                mix.add('ride', t, Y.ride(0.45 if st % 4 == 0 else 0.7), pan=0.3)
            if in_(bar, (64, 96), (112, 160)) and st in (4, 12):
                mix.add('clap', t, Y.clap(0.9 * (1 + 0.05 * rng.standard_normal())))
            if in_(bar, (112, 160)) and bar % 4 == 3 and st == 15:
                mix.add('clap', t, Y.clap(0.3))
            if in_(bar, (24, 96), (112, 168)):
                pos = (g - 24 * 16) % 12                                          # 12 against 16
                if pos in TOMS:
                    f, v, p = TOMS[pos]
                    mix.add('toms', t, Y.tom(f, v), pan=p)

    # stabs
    def hit(bus, bar, st, chord, fc, **kw):
        mix.add(bus, T(bar, st), Y.stab(chord, fc, **kw))

    for bar in range(32, 176):
        lfo = np.sin(2 * np.pi * bar / 7)                                        # 7-bar filter drift
        if bar < 48:
            if bar % 2 == 0:
                hit('stab', bar, 2, AM7, 220 * (500 / 220) ** ((bar - 32) / 16), env_amt=2.0)
        elif bar < 64:
            fc = 500 * (1300 / 500) ** ((bar - 48) / 16)
            for st in ([2, 11] if bar >= 56 else [2]):
                hit('stab', bar, st, AM7, fc)
        elif bar < 96:
            steps = [2, 11] + ([7] if bar >= 80 and bar % 2 else [])
            for st in steps:
                hit('stab', bar, st, AM7, 1300 * (1 + 0.4 * lfo))
        elif bar < 112:
            if bar < 104 and bar % 2 == 0:
                hit('stab_bd', bar, 2, BII, 700, decay=0.22)
            elif 104 <= bar < 111:
                hit('stab_bd', bar, 2, BII, 700 * (2000 / 700) ** ((bar - 104) / 7), decay=0.2)
        elif bar < 144:
            for st in (2, 7, 11):
                hit('stab', bar, st, AM9, 2400 * (1 + 0.45 * lfo))
        elif bar < 160:
            for st in [2, 11] + ([14] if bar % 4 == 3 else []):
                hit('stab', bar, st, AM9, 3000 * (1 + 0.3 * lfo))
        else:
            hit('stab', bar, 2, AM7, 1500 * (250 / 1500) ** ((bar - 160) / 16))

    # the metallic sequence: 5 notes against 16 steps, accents every 3rd step
    for bar in range(120, 152):
        for st in range(16):
            s = (bar - 120) * 16 + st
            mix.add('seq', T(bar, st), Y.blip(SEQ[s % 5], 1.0 if s % 3 == 0 else 0.55))

    # the tuned wind (A minor partials; the bII partials rise in the breakdown)
    mix.b['drone'] += Y.tuned_wind(N, WIND_AM, rng).astype(np.float32) * auto(
        [(0, -120), (16, -120), (24, -8), (32, -5), (64, -3), (96, -2), (104, 0), (112, -4), (160, -4), (176, -120), (BARS + 3, -120)])
    mix.b['drone'] += Y.tuned_wind(N, WIND_BII, rng).astype(np.float32) * auto(
        [(0, -120), (95, -120), (98, -8), (108, -3), (111.9, -3), (112, -120), (BARS + 3, -120)])

    # breakdown riser, and a reversed ride sucking into the drop
    a, b = T(104), T(111, 14)
    n = int((b - a) * SR)
    t = np.arange(n) / SR
    fc = 180 * (9000 / 180) ** (t / t[-1])
    y = Y.svf_bp(rng.standard_normal(n), fc, 2.5)
    y = y / (np.std(y) + 1e-12) * (t / t[-1]) ** 2.2 * 0.35
    mix.add('fx', a, np.stack([y, np.roll(y, 480)]))
    rev = Y.ride(0.8)[::-1]
    mix.add('fx', T(112) - len(rev) / SR, rev, pan=0.0)
    return kicks, tail_phase


# ---------------------------------------------------------------------------
# mix
# ---------------------------------------------------------------------------
GAINS = {'kick': 0.0, 'kickfar': -4.0, 'rumble': -6.0, 'sub': -12.0, 'hats': -16.0, 'ohats': -20.0, 'ride': -24.0,
         'clap': -12.0, 'toms': -12.0, 'stab': -10.0, 'stab_bd': -10.0, 'seq': -18.0, 'drone': -8.0, 'fx': -10.0}
# per-section rides (dB), 12 sections; planned from the measured bus loudness
RIDES = {   # IntroA IntroB BuildA BuildB MainA MainB Break PeakA PeakB PeakC OutroA OutroB
    'kick': [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.0, 0.5, 0.5, 0.5, 0.5, 0.5],
    'kickfar': [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -4.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    'rumble': [-3.7, -6.0, -5.9, -5.8, -5.8, -5.8, -5.8, -5.8, -5.3, -5.8, -5.8, -5.9],
    'sub': [-1.0, -0.7, -0.9, -0.9, -0.9, -0.9, -0.9, -0.9, -0.9, -0.9, -0.9, 1.0],
    'hats': [9.3, 7.0, 11.7, 11.5, 12.1, 12.2, 4.0, 12.1, 12.3, 12.1, 12.1, 9.0],
    'ohats': [0.0, 0.0, 6.7, 5.7, 6.2, 6.2, 6.2, 5.5, 5.5, 5.5, 5.5, 5.5],
    'ride': [0.0, 0.0, 0.0, 13.2, 13.1, 13.2, 13.2, 13.2, 13.2, 13.2, 13.2, 0.0],
    'clap': [0.0, 0.0, 0.0, 0.0, 13.3, 13.2, 13.2, 13.3, 13.2, 13.3, 13.3, 0.0],
    'toms': [0.0, 4.8, 2.9, 3.3, 3.9, 3.9, 3.9, 3.9, 3.9, 3.8, 3.9, 0.0],
    'stab': [0.0, 0.0, 12.5, 9.2, 9.8, 9.2, 9.2, 9.2, 9.2, 10.0, 9.2, 9.2],
    'stab_bd': [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 7.5, 0.0, 0.0, 0.0, 0.0, 0.0],
    'seq': [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 12.2, 12.2, 12.2, 0.0, 0.0],
    'drone': [0.0, 1.6, -1.5, -2.1, -2.6, -2.4, -1.0, -0.9, -0.9, -0.8, -0.8, 0.0],
    'fx': [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -3.0, 0.0, 0.0, 0.0, 0.0, 0.0],
}
# musical automation (bars, dB) on top
AUTO = {
    'rumble': [(0, -24), (8, -3), (16, 0), (BARS + 3, 0)],
    'sub': [(0, -120), (16, -120), (20, 0), (96, 0), (96.1, -120), (111.99, -120), (112, 0), (184, 0), (190, -120), (BARS + 3, -120)],
    'seq': [(0, -120), (120, -120), (124, 0), (148, 0), (152, -120), (BARS + 3, -120)],
    'kickfar': [(0, 0), (BARS + 3, 0)],
}
DUCK = {'rumble': (0.0, 0.13), 'sub': (0.0, 0.1), 'stab': (0.5, 0.1), 'stab_bd': (0.5, 0.1), 'drone': (0.75, 0.12),
        'toms': (0.85, 0.08), 'seq': (0.7, 0.08), 'ride': (0.85, 0.06), 'hall': (0.5, 0.12)}
MASTER_DB = -0.5
ORDER = ['kick', 'kickfar', 'rumble', 'sub', 'hats', 'ohats', 'ride', 'clap', 'toms', 'stab', 'stab_bd', 'seq', 'drone', 'fx']


def process(mix, kicks, tail_phase, out, stems):
    b = mix.b
    db = lambda x: np.float32(10 ** (x / 20))
    dotted8 = int(round(0.75 * Y.BEAT * SR))

    # rumble from the kick bus, and the phase-locked sub
    irr = make_ir([(63, 3.2), (125, 3.0), (250, 2.4), (500, 1.9), (2000, 1.1), (8000, 0.5)], 4.0, 0.012, seed=3)
    drive = np.interp(np.arange(N) / SR / BAR, [0, 32, 64, 96, 112, 128, 160, 176, BARS + 3],
                      [2.0, 2.4, 2.8, 3.2, 3.4, 4.2, 4.2, 2.6, 2.4])
    r = Y.rumble(b['kick'].mean(axis=0).astype(np.float64), irr[0], drive)
    b['rumble'] = np.stack([r, r]).astype(np.float32)
    dk = {k: Y.duck_env(kicks, N, *v).astype(np.float32) for k, v in DUCK.items()}
    s = Y.sub_drone(N, tail_phase, np.ones(N))
    b['sub'] = np.stack([s, s]).astype(np.float32)

    # the build's kick comes back through a high-pass that opens downward: thin, then fuller,
    # never the full bottom — that is saved for the drop, where kick, rumble and sub land together
    t = np.arange(N) / SR
    fk = np.full(N, 20.0)
    w = (t >= T(104)) & (t < T(112))
    fk[w] = 900 * (110 / 900) ** ((t[w] - T(104)) / (T(112) - T(104)))
    kf = b['kickfar'].astype(np.float64)
    b['kickfar'] = np.stack([kf[c] - Y.svf_lp(kf[c], fk, 0.7) for c in range(2)]).astype(np.float32)

    # tone shaping
    b['hats'] = eq(b['hats'], signal.butter(2, 4200, 'high', fs=SR, output='sos'))
    b['ohats'] = eq(b['ohats'], signal.butter(2, 3500, 'high', fs=SR, output='sos'))
    b['toms'] = eq(b['toms'], signal.butter(2, 70, 'high', fs=SR, output='sos'))
    for k in ('stab', 'stab_bd', 'seq'):
        b[k] = eq(b[k], signal.butter(2, 120, 'high', fs=SR, output='sos'))
    b['drone'] = eq(b['drone'], signal.butter(2, 150, 'high', fs=SR, output='sos'))
    b['fx'] = eq(b['fx'], signal.butter(4, 200, 'high', fs=SR, output='sos'))

    # gains, rides, automation, sidechain
    sec = np.minimum((t // (16 * BAR)).astype(np.int64), 11)
    for k in ORDER:
        b[k] *= db(GAINS.get(k, 0.0))
        if k in RIDES:
            rr = uniform_filter1d(np.asarray(RIDES[k], float)[sec], int(0.5 * SR), mode='nearest')
            b[k] *= (10 ** (rr / 20)).astype(np.float32)[None, :]
        if k in AUTO:
            b[k] *= auto(AUTO[k])[None, :]
        if k in dk:
            b[k] *= dk[k][None, :]

    # echoes (after the sidechain so the repeats breathe between kicks)
    def echo(k, fb, lp, hp, drv, wet_db):
        wet = Y.dub_delay(b[k].mean(axis=0).astype(np.float64), dotted8, fb, Y.one_pole(lp), Y.one_pole(hp), drv)
        return (wet * db(wet_db)).astype(np.float32)

    b['stab'] += echo('stab', 0.5, 2600, 280, 1.6, -3)
    b['stab_bd'] += echo('stab_bd', 0.68, 2200, 250, 1.4, -1)
    b['toms'] += echo('toms', 0.32, 3000, 300, 1.2, -12)
    b['seq'] += echo('seq', 0.42, 4000, 400, 1.2, -6)

    # rooms: a concrete hall, a small room for the hats
    hall = make_ir([(125, 2.6), (500, 2.3), (2000, 1.8), (8000, 1.0), (16000, 0.6)], 3.5, 0.025, seed=1989)
    room = make_ir([(500, 0.45), (4000, 0.35), (12000, 0.2)], 0.8, 0.004, seed=12)
    sends = {'stab': -6, 'stab_bd': -3, 'toms': -14, 'seq': -10, 'drone': -8, 'fx': -6, 'clap': -26, 'ride': -20}
    send = sum(b[k] * db(v) for k, v in sends.items())
    from engine import convolve
    wet_hall = convolve(send, hall)
    wet_hall = eq(wet_hall, signal.butter(2, 180, 'high', fs=SR, output='sos')) * dk['hall'][None, :]
    wet_room = convolve(b['hats'] * db(-20) + b['ohats'] * db(-18), room)
    b['hall'] = wet_hall.astype(np.float32)
    b['room'] = wet_room.astype(np.float32)

    # bus loudness per section (for planning the rides)
    table = {}
    for k in ORDER + ['hall', 'room']:
        xk = kweight(b[k].astype(np.float64))
        row = []
        for c in range(12):
            s0, s1 = int(c * 16 * BAR * SR), int(min((c + 1) * 16 * BAR * SR, N))
            seg = xk[:, s0:s1]
            row.append(round(lufs(seg), 1) if np.max(np.abs(seg)) > 1e-7 else None)
        table[k] = row
    json.dump(table, open(f'{out}/bus_lufs.json', 'w'), indent=1)

    if stems == 'check':
        os.makedirs(f'{out}/stems', exist_ok=True)
        for k in ('kick', 'rumble', 'sub', 'stab', 'stab_bd', 'seq', 'toms', 'hats'):
            sf.write(f'{out}/stems/{k}.wav', np.clip(b[k].mean(axis=0), -1, 1), SR, subtype='PCM_16')

    mixdown = sum(b[k] for k in ORDER) + b['hall'] + b['room']
    mixdown = Y.mono_below(mixdown, 160)
    mixdown = eq(mixdown, np.vstack([signal.butter(2, 25, 'high', fs=SR, output='sos'), shelf(9000, 0.5)]))
    comp, gr = compress(mixdown, thr_db=-14, ratio=1.5, knee=6, attack=0.01, release=0.15)
    x = comp * db(MASTER_DB)
    pre_clip = float(np.max(np.abs(x)))
    x = Y.soft_clip(x, 0.72).astype(np.float32)
    master, lg = limit(x, ceiling_db=-1.1)
    lg_db = -20 * np.log10(np.maximum(lg, 1e-9))
    info = {'glue_gr_max_db': round(float(np.max(gr)), 2), 'pre_clip_peak_db': round(20 * np.log10(pre_clip), 2),
            'limiter_gr_max_db': round(float(np.max(lg_db)), 2),
            'limiter_gr_mean_by_section': [round(float(np.mean(lg_db[sec == c])), 2) for c in range(12)]}
    return master, info


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out'))
    ap.add_argument('--stems', default='check', choices=['none', 'check'])
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    t0 = time.time()
    mix = Mix(ORDER)
    rng = np.random.default_rng(132)
    print('arranging...', flush=True)
    kicks, tail_phase = build(mix, rng)
    print(f'  {time.time() - t0:.1f} s; mixing...', flush=True)
    master, info = process(mix, kicks, tail_phase, a.out, a.stems)
    sf.write(f'{a.out}/phase-lock.wav', master.T, SR, subtype='PCM_24')
    info.update({'file': f'{a.out}/phase-lock.wav', 'seconds': round(master.shape[1] / SR, 2),
                 'render_s': round(time.time() - t0, 1), 'kick_tail_phase_rad': round(float(tail_phase), 4)})
    json.dump(info, open(f'{a.out}/phase-lock.json', 'w'), indent=2)
    print(json.dumps(info, indent=1))


if __name__ == '__main__':
    main()
