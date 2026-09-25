"""Listening proxies for Dodo's Lament. I can't hear the track, so this measures it.

  python3 check.py <master.wav> [--stems DIR] [--offset-bars N] [--png DIR]

- loudness: integrated / LRA / true peak (ffmpeg ebur128), and K-weighted
  loudness per bar (BS.1770 filters, own implementation) — the arc of the piece
- balance: energy share per band per section (sub, low, low-mid, mid, presence, air)
- harmony: chroma of the dry organ + pedal + strings stems per half bar, scored
  against the chord the score says is sounding (share of chroma energy on the
  chord's pitch classes)
- melody: pYIN pitch track of the solo stem against the written aria notes
- clicks: second-difference spikes far above their neighbourhood
- stereo: L/R correlation per section, and below 120 Hz (should be ~mono)
- tempo: beat tracking on the drum stems
Pictures: spectrogram, loudness curve, band balance, chord match.
"""
import argparse
import json
import os
import subprocess

import numpy as np
import soundfile as sf
from scipy import signal

import score as S

SR = 48000
BAR = S.BAR


def kweight(x):
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=-1), axis=-1)


def lufs(xk):
    p = np.sum(np.mean(xk ** 2, axis=-1))
    return -0.691 + 10 * np.log10(p + 1e-12)


def ebur128(path):
    r = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                       capture_output=True, text=True)
    txt = r.stderr[r.stderr.rfind('Summary:'):]
    out = {}
    for key, label in [('I', 'integrated'), ('LRA', 'lra'), ('Peak', 'true_peak')]:
        for line in txt.splitlines():
            if line.strip().startswith(key + ':'):
                out[label] = float(line.split(':')[1].split()[0])
    return out


def bands(x, lo_hz, hi_hz):
    X = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return X[(f >= lo_hz) & (f < hi_hz)].sum()


BANDS = [('sub', 20, 60), ('low', 60, 250), ('lowmid', 250, 1000), ('mid', 1000, 4000), ('pres', 4000, 10000), ('air', 10000, 20000)]
SECTIONS = ['Ground', 'Chorale', 'Aria', 'Bells', 'Build', 'Pulse', 'Pulse II', 'Plateau', 'Breakdown', 'Tutti I',
            'Tutti II', 'Tutti III', 'Coda']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('wav')
    ap.add_argument('--stems')
    ap.add_argument('--offset-bars', type=int, default=0)
    ap.add_argument('--png')
    a = ap.parse_args()
    x, sr = sf.read(a.wav, always_2d=True)
    x = x.T
    assert sr == SR
    n = x.shape[1]
    nbars = int(n / SR / BAR)
    rep = {'file': a.wav, 'seconds': round(n / SR, 1)}
    rep.update(ebur128(a.wav))
    rep['sample_peak_db'] = round(20 * np.log10(np.max(np.abs(x))), 2)
    rep['clipped_samples'] = int(np.sum(np.abs(x) >= 0.9999))
    rep['dc'] = [round(float(np.mean(c)), 6) for c in x]

    # per-bar loudness, bands, stereo
    xk = kweight(x)
    per_bar = []
    for i in range(nbars):
        s, e = int(i * BAR * SR), int((i + 1) * BAR * SR)
        seg = x[:, s:e]
        mono = seg.mean(axis=0)
        tot = sum(bands(mono, lo, hi) for _, lo, hi in BANDS) + 1e-12
        lowL = signal.sosfilt(signal.butter(4, 120, 'low', fs=SR, output='sos'), seg, axis=1)
        corr = float(np.corrcoef(seg[0], seg[1])[0, 1]) if np.std(seg) > 1e-6 else 1.0
        lcorr = float(np.corrcoef(lowL[0], lowL[1])[0, 1]) if np.std(lowL) > 1e-6 else 1.0
        per_bar.append({'bar': i + a.offset_bars, 'lufs': round(lufs(xk[:, s:e]), 1),
                        **{k: round(bands(mono, lo, hi) / tot * 100, 1) for k, lo, hi in BANDS},
                        'corr': round(corr, 2), 'low_corr': round(lcorr, 2)})
    rep['per_bar'] = per_bar

    # per-section summary
    secs = []
    for c in range(0, (nbars + 7) // 8):
        rows = [r for r in per_bar if (r['bar'] // 8) == c + a.offset_bars // 8]
        if not rows:
            continue
        name = SECTIONS[min(c + a.offset_bars // 8, len(SECTIONS) - 1)]
        secs.append({'section': name, 'bars': f"{rows[0]['bar']}-{rows[-1]['bar']}",
                     'lufs': round(10 * np.log10(np.mean([10 ** (r['lufs'] / 10) for r in rows])), 1),
                     **{k: round(float(np.mean([r[k] for r in rows])), 1) for k, _, _ in BANDS},
                     'corr': round(float(np.mean([r['corr'] for r in rows])), 2),
                     'low_corr': round(float(np.min([r['low_corr'] for r in rows])), 2)})
    rep['sections'] = secs

    # clicks: second-difference spikes vs their surroundings
    mono = x.mean(axis=0)
    d2 = np.abs(np.diff(mono, 2))
    w = int(0.0005 * SR)
    frames = d2[: len(d2) // w * w].reshape(-1, w).max(axis=1)
    ctx = np.convolve(frames, np.ones(200) / 200, mode='same') + 1e-9
    ratio = frames / ctx
    hits = np.where((ratio > 25) & (frames > 0.02))[0]
    rep['click_suspects'] = [round(h * w / SR, 3) for h in hits[:40]]
    rep['click_suspect_count'] = int(len(hits))

    # harmony, melody, tempo from stems
    if a.stems:
        def stem(name):
            p = os.path.join(a.stems, f'{name}.wav')
            if not os.path.exists(p):
                return None
            y, _ = sf.read(p, always_2d=True)
            return y.mean(axis=1)
        import librosa
        harm = sum(v for v in [stem('organ'), stem('pedal'), stem('strings')] if v is not None)
        off = a.offset_bars
        hop = 1024
        C = librosa.feature.chroma_cqt(y=harm.astype(np.float32), sr=SR, hop_length=hop, n_chroma=12, bins_per_octave=36)
        fr_t = librosa.frames_to_time(np.arange(C.shape[1]), sr=SR, hop_length=hop)
        rows = []
        for half in range(nbars * 2):
            bar = half // 2 + off
            if bar < 8 or bar >= 96 or 64 <= bar < 72:  # the ground's chords sound from bar 8; not the breakdown
                continue
            t0 = bar * BAR + (half % 2) * BAR / 2 + 0.25   # stems are full length, from bar 0
            t1 = t0 + BAR / 2 - 0.35
            sel = (fr_t >= t0) & (fr_t < t1)
            if not sel.any():
                continue
            v = C[:, sel].mean(axis=1)
            pcs = S.CHORD_PCS[bar % 8][half % 2]
            rows.append({'bar': bar, 'half': half % 2, 'match': round(float(v[list(pcs)].sum() / (v.sum() + 1e-9)), 2),
                         'top': [librosa.midi_to_note(60 + k, octave=False) for k in np.argsort(v)[::-1][:4]]})
        rep['chord_match'] = {'mean': round(float(np.mean([r['match'] for r in rows])), 3) if rows else None,
                              'worst': sorted(rows, key=lambda r: r['match'])[:6]}
        solo = stem('solo')
        if solo is not None and off <= 16 < off + nbars:
            s0 = int(16 * BAR * SR)
            seg = solo[s0: s0 + int(8 * BAR * SR)].astype(np.float32)
            f0, vflag, _ = librosa.pyin(seg, fmin=200, fmax=1200, sr=SR, frame_length=2048, hop_length=256)
            tt = librosa.times_like(f0, sr=SR, hop_length=256)
            errs = []
            for i, bar_notes in enumerate(S.ARIA):
                for beat, beats, name in bar_notes:
                    if i == 7 and beat == 0:
                        continue  # the trill
                    t0 = i * BAR + beat * S.BEAT + 0.12
                    t1 = t0 + beats * S.BEAT - 0.2
                    sel = (tt >= t0) & (tt < t1) & vflag
                    if sel.sum() < 3:
                        errs.append({'note': name, 'heard': None})
                        continue
                    heard = float(np.median(librosa.hz_to_midi(f0[sel])))
                    errs.append({'note': name, 'cents_off': round((heard - S.m(name)) * 100, 1)})
            bad = [e for e in errs if e.get('heard', 0) is None or abs(e.get('cents_off', 999)) > 30]
            rep['aria_pitch'] = {'notes': len(errs), 'off_by_more_than_30_cents': bad,
                                 'median_abs_cents': round(float(np.median([abs(e['cents_off']) for e in errs if 'cents_off' in e])), 1)}
        drums = sum(v for v in [stem('kick'), stem('hats')] if v is not None)
        if drums is not None and np.max(np.abs(drums)) > 0:
            start = int(40 * BAR * SR)
            seg = drums[start: start + int(24 * BAR * SR)]
            if len(seg) > SR * 10:
                tempo, beats = librosa.beat.beat_track(y=seg.astype(np.float32), sr=SR, hop_length=512)
                rep['tempo_bpm'] = round(float(np.atleast_1d(tempo)[0]), 2)

    print(json.dumps({k: v for k, v in rep.items() if k != 'per_bar'}, indent=1))
    if a.png:
        os.makedirs(a.png, exist_ok=True)
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        base = os.path.splitext(os.path.basename(a.wav))[0]
        fig, ax = plt.subplots(3, 1, figsize=(16, 11), gridspec_kw={'height_ratios': [3, 1.2, 1.2]})
        f, t, Z = signal.stft(mono[::2], fs=SR // 2, nperseg=4096, noverlap=3072)
        Zd = 20 * np.log10(np.abs(Z) + 1e-9)
        ax[0].pcolormesh(t + a.offset_bars * BAR, f, Zd, vmin=Zd.max() - 90, vmax=Zd.max(), shading='auto', cmap='magma')
        ax[0].set_yscale('symlog', linthresh=200)
        ax[0].set_ylim(30, 12000)
        ax[0].set_title(f'{base} — spectrogram')
        for c in range(0, 13):
            for axx in ax:
                axx.axvline((c * 8) * BAR, color='w' if axx is ax[0] else '#999', lw=0.5, alpha=0.6)
        bars_t = [(r['bar'] + 0.5) * BAR for r in per_bar]
        ax[1].plot(bars_t, [r['lufs'] for r in per_bar], color='k')
        ax[1].set_ylabel('LUFS / bar')
        ax[1].grid(alpha=0.3)
        bottom = np.zeros(len(per_bar))
        colors = ['#3d3bff', '#16121c', '#ff4b1f', '#ffc31f', '#b6f23a', '#88c']
        for (k, _, _), col in zip(BANDS, colors):
            vals = np.array([r[k] for r in per_bar])
            ax[2].bar(bars_t, vals, width=BAR * 0.95, bottom=bottom, color=col, label=k)
            bottom += vals
        ax[2].legend(ncol=6, fontsize=8, loc='upper left')
        ax[2].set_ylabel('band %')
        ax[2].set_xlabel('seconds')
        for axx in ax:
            axx.set_xlim(a.offset_bars * BAR, a.offset_bars * BAR + n / SR)
        plt.tight_layout()
        plt.savefig(os.path.join(a.png, f'{base}-overview.png'), dpi=80)
        print('png:', os.path.join(a.png, f'{base}-overview.png'))
    json.dump(rep, open(os.path.splitext(a.wav)[0] + '-check.json', 'w'), indent=1)


if __name__ == '__main__':
    main()
