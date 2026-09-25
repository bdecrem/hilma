"""Listening proxies for Phase Lock.

  python3 check.py <phase-lock.wav> --stems DIR [--png DIR]

Besides the usual (loudness per bar and section, band balance, stereo and
low-end mono, clicks, true peak, tempo), this checks the first-principles claims:
- the kick really ends on A1 (55 Hz) and the sub sits on 55.0 Hz
- phase lock: the low end (kick + sub) is the same waveform on every beat, and
  the kick-to-sub phase doesn't drift across the track
- just intonation: the stab's partials sit on the JI frequencies, not equal temperament
"""
import argparse
import json
import os

import numpy as np
import soundfile as sf
from scipy import signal

from meter import SR, kweight, lufs, ebur128, band_shares, BANDS
import track as TR

BAR = TR.BAR
BEAT = BAR / 4


def centroid_freq(x, lo, hi, pad=4):
    """Power-weighted centre of a spectral peak (AM sidebands are symmetric, so this is the carrier)."""
    w = x * np.hanning(len(x))
    X = np.abs(np.fft.rfft(w, n=len(w) * pad)) ** 2
    f = np.fft.rfftfreq(len(w) * pad, 1 / SR)
    sel = (f >= lo) & (f <= hi)
    return float(np.sum(f[sel] * X[sel]) / (np.sum(X[sel]) + 1e-20))


def peak_freq(x, lo, hi, pad=8):
    w = x * np.hanning(len(x))
    X = np.abs(np.fft.rfft(w, n=len(w) * pad))
    f = np.fft.rfftfreq(len(w) * pad, 1 / SR)
    sel = (f >= lo) & (f <= hi)
    i = np.argmax(X[sel])
    return float(f[sel][i])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('wav')
    ap.add_argument('--stems')
    ap.add_argument('--png')
    a = ap.parse_args()
    x, sr = sf.read(a.wav, always_2d=True)
    x = x.T
    n = x.shape[1]
    nbars = int(n / SR / BAR)
    rep = {'seconds': round(n / SR, 1)}
    rep.update(ebur128(a.wav))
    rep['sample_peak_db'] = round(float(20 * np.log10(np.max(np.abs(x)))), 2)
    rep['clipped_samples'] = int(np.sum(np.abs(x) >= 0.9999))

    xk = kweight(x)
    mono = x.mean(axis=0)
    lo_sos = signal.butter(4, 120, 'low', fs=SR, output='sos')
    per_bar = []
    for i in range(nbars):
        s, e = int(i * BAR * SR), int((i + 1) * BAR * SR)
        seg = x[:, s:e]
        lowseg = signal.sosfilt(lo_sos, seg, axis=1)
        per_bar.append({'bar': i, 'lufs': round(lufs(xk[:, s:e]), 1), **band_shares(mono[s:e]),
                        'corr': round(float(np.corrcoef(seg[0], seg[1])[0, 1]), 2) if np.std(seg) > 1e-6 else 1.0,
                        'low_corr': round(float(np.corrcoef(lowseg[0], lowseg[1])[0, 1]), 2)
                        if np.sqrt(np.mean(lowseg ** 2)) > 10 ** (-40 / 20) else 1.0})   # skip bars with no real low end
    secs = []
    for name, b0 in TR.SECTIONS:
        rows = [r for r in per_bar if b0 <= r['bar'] < b0 + 16]
        if rows:
            secs.append({'section': name, 'lufs': round(10 * np.log10(np.mean([10 ** (r['lufs'] / 10) for r in rows])), 1),
                         **{k: round(float(np.mean([r[k] for r in rows])), 1) for k, _, _ in BANDS},
                         'corr': round(float(np.mean([r['corr'] for r in rows])), 2),
                         'low_corr': round(float(np.min([r['low_corr'] for r in rows])), 2)})
    rep['sections'] = secs

    d2 = np.abs(np.diff(mono, 2))
    w = int(0.0005 * SR)
    fr = d2[: len(d2) // w * w].reshape(-1, w).max(axis=1)
    ctx = np.convolve(fr, np.ones(200) / 200, mode='same') + 1e-9
    hits = np.where((fr / ctx > 25) & (fr > 0.02))[0]
    tk = h_t = hits * w / SR
    beat_pos = (h_t / BEAT) - np.round(h_t / BEAT)          # kick onsets are on the beat: not clicks
    hits = hits[np.abs(beat_pos * BEAT) > 0.006]
    rep['click_suspects'] = [round(h * w / SR, 3) for h in hits[:30]]
    rep['click_suspect_count'] = int(len(hits))

    if a.stems:
        st = lambda k: sf.read(os.path.join(a.stems, f'{k}.wav'))[0]
        kick, sub, stab = st('kick'), st('sub'), st('stab')
        # 1. kick end pitch: the tail of a mid-track kick
        t0 = TR.T(70)
        seg = kick[int((t0 + 0.12) * SR): int((t0 + 0.42) * SR)]
        rep['kick_tail_hz'] = round(peak_freq(seg, 30, 120, pad=32), 2)
        # 2. sub frequency over 8 bars
        seg = sub[int(TR.T(66) * SR): int(TR.T(74) * SR)]
        rep['sub_hz'] = round(peak_freq(seg, 40, 80, pad=4), 3)
        # 3. phase lock: each beat's kick+sub waveform vs the first beat of the section
        low = signal.sosfilt(signal.butter(4, 90, 'low', fs=SR, output='sos'), kick + sub)
        L = int(0.4 * SR)
        beats = [int(round(TR.T(66 + b // 4, 4 * (b % 4)) * SR)) for b in range(64)]
        ref = low[beats[0]: beats[0] + L]
        cors = [float(np.corrcoef(ref, low[i: i + L])[0, 1]) for i in beats[1:]]
        rep['phase_lock_beat_corr'] = {'min': round(min(cors), 4), 'mean': round(float(np.mean(cors)), 4)}
        # the same measurement if the sub were a hair off (54.9 Hz), for contrast
        tt = np.arange(len(sub)) / SR
        s0, s1 = beats[0] - SR, beats[-1] + SR
        env = np.zeros_like(sub)
        env[s0:s1] = np.abs(signal.hilbert(sub[s0:s1]))          # the real sub's pumping envelope
        fake = np.sin(2 * np.pi * 54.9 * tt) * env
        lowf = signal.sosfilt(signal.butter(4, 90, 'low', fs=SR, output='sos'), kick + fake)
        reff = lowf[beats[0]: beats[0] + L]
        corf = [float(np.corrcoef(reff, lowf[i: i + L])[0, 1]) for i in beats[1:]]
        rep['phase_lock_if_sub_were_54.9Hz'] = {'min': round(min(corf), 4), 'mean': round(float(np.mean(corf)), 4)}
        # kick-to-sub phase at the tail of every kick, across the whole track
        ph = []
        for tk in np.arange(0, 96 * 4) * BEAT:
            i0 = int((tk + 0.2) * SR)
            k = kick[i0: i0 + int(0.1 * SR)]
            s_ = sub[i0: i0 + int(0.1 * SR)]
            if np.std(s_) < 1e-4 or np.std(k) < 1e-4:
                continue
            c = signal.correlate(k, s_, mode='full')
            lag = (np.argmax(c) - (len(s_) - 1)) / SR
            ph.append(((lag * 55.0 + 0.5) % 1.0) - 0.5)
        if ph:
            rep['kick_sub_phase_spread_deg'] = round(float(np.std(ph) * 360), 2)
        # 4. just intonation: stab partials in Main A
        seg = stab[int(TR.T(64) * SR): int(TR.T(72) * SR)]
        targets = {'G3 (9/5)': (198.0, 196.00), 'C4 (6/5)': (264.0, 261.63), 'E3 (3/2)': (165.0, 164.81),
                   'A2 (1/1)': (110.0, 110.0), 'E4 (3/2)': (330.0, 329.63)}
        ji_rep = {}
        for name, (fji, fet) in targets.items():
            fpk = centroid_freq(seg, fji - 1.3, fji + 1.3) if abs(fji - fet) > 1.5 else \
                centroid_freq(seg, (fji + fet) / 2 - 1.3, (fji + fet) / 2 + 1.3)
            ji_rep[name] = {'measured': round(fpk, 2), 'ji': fji, 'et': fet,
                            'closer_to': 'JI' if abs(fpk - fji) <= abs(fpk - fet) else 'ET'}
        rep['stab_tuning'] = ji_rep
        # 5. tempo
        import librosa
        seg = kick[int(TR.T(64) * SR): int(TR.T(96) * SR)].astype(np.float32)
        tempo, _ = librosa.beat.beat_track(y=seg, sr=SR, hop_length=256, start_bpm=130)
        rep['tempo_bpm'] = round(float(np.atleast_1d(tempo)[0]), 2)

    print(json.dumps(rep, indent=1))
    json.dump({**rep, 'per_bar': per_bar}, open(os.path.splitext(a.wav)[0] + '-check.json', 'w'), indent=1)

    if a.png:
        os.makedirs(a.png, exist_ok=True)
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(3, 1, figsize=(18, 11), gridspec_kw={'height_ratios': [3, 1.2, 1.2]})
        f, tt, Z = signal.stft(mono[::2], fs=SR // 2, nperseg=4096, noverlap=2048)
        Zd = 20 * np.log10(np.abs(Z) + 1e-9)
        ax[0].pcolormesh(tt, f, Zd, vmin=Zd.max() - 90, vmax=Zd.max(), shading='auto', cmap='magma')
        ax[0].set_yscale('symlog', linthresh=200)
        ax[0].set_ylim(25, 12000)
        ax[0].set_title('Phase Lock — spectrogram')
        for name, b0 in TR.SECTIONS:
            for axx in ax:
                axx.axvline(b0 * BAR, color='w' if axx is ax[0] else '#999', lw=0.6, alpha=0.7)
            ax[1].text(b0 * BAR + 1, -4, name, fontsize=8)
        bt = [(r['bar'] + 0.5) * BAR for r in per_bar]
        ax[1].plot(bt, [r['lufs'] for r in per_bar], color='k')
        ax[1].set_ylabel('LUFS / bar')
        ax[1].set_ylim(-30, -2)
        ax[1].grid(alpha=0.3)
        bottom = np.zeros(len(per_bar))
        for (k, _, _), col in zip(BANDS, ['#3d3bff', '#16121c', '#ff4b1f', '#ffc31f', '#b6f23a', '#88c']):
            v = np.array([r[k] for r in per_bar])
            ax[2].bar(bt, v, width=BAR * 0.95, bottom=bottom, color=col, label=k)
            bottom += v
        ax[2].legend(ncol=6, fontsize=8, loc='upper left')
        ax[2].set_xlabel('seconds')
        for axx in ax:
            axx.set_xlim(0, n / SR)
        plt.tight_layout()
        p = os.path.join(a.png, 'phase-lock-overview.png')
        plt.savefig(p, dpi=75)
        print('png:', p)


if __name__ == '__main__':
    main()
