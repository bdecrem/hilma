"""
Dub techno reference render: the proposed fix for Abyss, as a listenable target.
Everything is per-sample code that ports 1:1 to Swift (no FFT convolution, no scipy in the chain).
Run: python3 dub_reference.py  ->  dub_reference.wav / .mp3
"""
import numpy as np, subprocess, wave, math
from numba import njit

SR = 48000
BPM = 117.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
BARS = 16
TAIL = 3.0
N = int((BARS * BAR + TAIL) * SR)
rng = np.random.default_rng(11)

def m2f(m): return 440.0 * 2 ** ((m - 69) / 12)

# ---------------------------------------------------------------- oscillators / filters
@njit(cache=True)
def polyblep(t, dt):
    if t < dt:
        t /= dt; return t + t - t * t - 1.0
    if t > 1.0 - dt:
        t = (t - 1.0) / dt; return t * t + t + t + 1.0
    return 0.0

@njit(cache=True)
def render_stab(freqs, detunes, n, sr, base_cut, env_amt, env_tau, res_q, amp_decay):
    """Chord of band-limited (PolyBLEP) detuned saws through a Cytomic/TPT state-variable
    lowpass whose cutoff = base_cut * (1 + env_amt * e^(-t/env_tau)). Continuous, no layers."""
    out = np.zeros(n)
    phases = np.zeros(len(freqs) * len(detunes))
    k = 1.0 / res_q
    ic1 = 0.0; ic2 = 0.0
    for i in range(n):
        t = i / sr
        s = 0.0; j = 0
        for f in freqs:
            for d in detunes:
                dt = f * d / sr
                p = phases[j]
                s += (2.0 * p - 1.0) - polyblep(p, dt)
                p += dt
                if p >= 1.0: p -= 1.0
                phases[j] = p; j += 1
        s /= j
        fc = base_cut * (1.0 + env_amt * math.exp(-t / env_tau))
        if fc > 0.45 * sr: fc = 0.45 * sr
        g = math.tan(math.pi * fc / sr)
        a1 = 1.0 / (1.0 + g * (g + k)); a2 = g * a1; a3 = g * a2
        v3 = s - ic2
        v1 = a1 * ic1 + a2 * v3
        v2 = ic2 + a2 * ic1 + a3 * v3
        ic1 = 2.0 * v1 - ic1; ic2 = 2.0 * v2 - ic2
        att = min(1.0, t / 0.003)
        out[i] = v2 * att * math.exp(-t / amp_decay)
    # 20 ms release at the end
    r = int(0.02 * sr)
    for i in range(r):
        out[n - r + i] *= 1.0 - i / r
    return out

@njit(cache=True)
def onepole_coef(fc, sr):
    return math.exp(-2.0 * math.pi * fc / sr)

# ---------------------------------------------------------------- the dub delay
@njit(cache=True)
def dub_delay(sendL, sendR, sr, delay_s, fb, hp_hz, lp_hz, drive, wobble, wob_rate,
              pre_hp, pre_lp, cross):
    n = len(sendL)
    size = int(sr * 2.5)
    lineL = np.zeros(size); lineR = np.zeros(size)
    outL = np.zeros(n); outR = np.zeros(n)
    w = 0
    # one-pole filters (6 dB/oct) -- gentle per pass, like tape
    a_hp = onepole_coef(hp_hz, sr); a_lp = onepole_coef(lp_hz, sr)
    a_phi = onepole_coef(pre_hp, sr); a_plo = onepole_coef(pre_lp, sr)
    lpL = 0.0; lpR = 0.0; hpLs = 0.0; hpRs = 0.0
    pl_hp = 0.0; pl_lp = 0.0
    phase = 0.0
    base = delay_s * sr
    for i in range(n):
        # send pre-filter: even the FIRST echo is darker/thinner than the dry stab
        x = 0.5 * (sendL[i] + sendR[i])
        pl_hp = a_phi * pl_hp + (1 - a_phi) * x
        x = x - pl_hp
        pl_lp = a_plo * pl_lp + (1 - a_plo) * x
        x = pl_lp
        phase += 2 * math.pi * wob_rate / sr
        d = base * (1.0 + wobble * math.sin(phase))
        rp = w - d
        while rp < 0: rp += size
        i0 = int(rp); fr = rp - i0; i1 = (i0 + 1) % size
        yL = lineL[i0] * (1 - fr) + lineL[i1] * fr
        yR = lineR[i0] * (1 - fr) + lineR[i1] * fr
        # feedback path, per side: HP -> LP -> soft sat
        hpLs = a_hp * hpLs + (1 - a_hp) * yR; fl = yR - hpLs
        lpL = a_lp * lpL + (1 - a_lp) * fl
        hpRs = a_hp * hpRs + (1 - a_hp) * yL; fr2 = yL - hpRs
        lpR = a_lp * lpR + (1 - a_lp) * fr2
        fromR = math.tanh(drive * lpL) / drive
        fromL = math.tanh(drive * lpR) / drive
        lineL[w] = x + fb * fromR
        lineR[w] = fb * fromL
        w += 1
        if w >= size: w = 0
        # partial crossfeed so echoes bounce but never sit hard-panned
        outL[i] = yL + cross * yR
        outR[i] = yR + cross * yL
    return outL, outR

# ---------------------------------------------------------------- Dattorro plate
@njit(cache=True)
def ap_step(buf, idx, x, g):
    d = buf[idx]
    y = -g * x + d
    buf[idx] = x + g * y
    return y

@njit(cache=True)
def tap(buf, w, off):
    i = w - off
    L = len(buf)
    while i < 0: i += L
    return buf[i]

@njit(cache=True)
def sl(x, sc):
    return max(1, int(x * sc))

@njit(cache=True)
def dattorro(inL, inR, sr, decay, damping, bandwidth, predelay_s, hp_hz):
    n = len(inL)
    sc = sr / 29761.0
    pre = np.zeros(max(1, int(predelay_s * sr)) + 1); pw = 0
    ap1 = np.zeros(sl(142, sc)); ap2 = np.zeros(sl(107, sc)); ap3 = np.zeros(sl(379, sc)); ap4 = np.zeros(sl(277, sc))
    i1 = 0; i2 = 0; i3 = 0; i4 = 0
    exc = 16 * sc
    mapL = np.zeros(sl(672, sc) + int(exc) + 4); mapR = np.zeros(sl(908, sc) + int(exc) + 4)
    mwL = 0; mwR = 0
    dL1 = np.zeros(sl(4453, sc)); dR1 = np.zeros(sl(4217, sc)); wL1 = 0; wR1 = 0
    apL2 = np.zeros(sl(1800, sc)); apR2 = np.zeros(sl(2656, sc)); aL2 = 0; aR2 = 0
    dL2 = np.zeros(sl(3720, sc)); dR2 = np.zeros(sl(3163, sc)); wL2 = 0; wR2 = 0
    bw = 0.0; dampL = 0.0; dampR = 0.0
    a_hp = math.exp(-2 * math.pi * hp_hz / sr); hps = 0.0
    endL = 0.0; endR = 0.0
    outL = np.zeros(n); outR = np.zeros(n)
    lfo = 0.0
    for i in range(n):
        x = 0.5 * (inL[i] + inR[i])
        hps = a_hp * hps + (1 - a_hp) * x; x = x - hps          # no low end into the tank
        pre[pw] = x; pw = (pw + 1) % len(pre); x = pre[pw]
        bw = bw + bandwidth * (x - bw)
        x = ap_step(ap1, i1, bw, 0.75); i1 = (i1 + 1) % len(ap1)
        x = ap_step(ap2, i2, x, 0.75); i2 = (i2 + 1) % len(ap2)
        x = ap_step(ap3, i3, x, 0.625); i3 = (i3 + 1) % len(ap3)
        x = ap_step(ap4, i4, x, 0.625); i4 = (i4 + 1) % len(ap4)
        lfo += 2 * math.pi * 0.9 / sr
        modL = exc * math.sin(lfo); modR = exc * math.cos(lfo)
        # ---- left tank
        vL = x + decay * endR
        lenL = sl(672, sc)
        rp = mwL - (lenL + modL)
        while rp < 0: rp += len(mapL)
        k0 = int(rp); f = rp - k0; k1 = (k0 + 1) % len(mapL)
        dd = mapL[k0] * (1 - f) + mapL[k1] * f
        y = 0.7 * vL + dd                    # decay diffusion 1 (sign-flipped, as in the paper)
        mapL[mwL] = vL - 0.7 * y; mwL = (mwL + 1) % len(mapL)
        dL1[wL1] = y; wL1 = (wL1 + 1) % len(dL1)
        t = dL1[wL1]
        dampL = t * (1 - damping) + dampL * damping
        t = dampL * decay
        t = ap_step(apL2, aL2, t, 0.5); aL2 = (aL2 + 1) % len(apL2)
        dL2[wL2] = t; wL2 = (wL2 + 1) % len(dL2)
        endL_new = dL2[wL2]
        # ---- right tank
        vR = x + decay * endL
        lenR = sl(908, sc)
        rp = mwR - (lenR + modR)
        while rp < 0: rp += len(mapR)
        k0 = int(rp); f = rp - k0; k1 = (k0 + 1) % len(mapR)
        dd = mapR[k0] * (1 - f) + mapR[k1] * f
        y = 0.7 * vR + dd
        mapR[mwR] = vR - 0.7 * y; mwR = (mwR + 1) % len(mapR)
        dR1[wR1] = y; wR1 = (wR1 + 1) % len(dR1)
        t = dR1[wR1]
        dampR = t * (1 - damping) + dampR * damping
        t = dampR * decay
        t = ap_step(apR2, aR2, t, 0.5); aR2 = (aR2 + 1) % len(apR2)
        dR2[wR2] = t; wR2 = (wR2 + 1) % len(dR2)
        endR = dR2[wR2]
        endL = endL_new
        # ---- output taps (Dattorro 1997, scaled)
        oL = (tap(dR1, wR1, sl(266, sc)) + tap(dR1, wR1, sl(2974, sc)) - tap(apR2, aR2, sl(1913, sc))
              + tap(dR2, wR2, sl(1996, sc)) - tap(dL1, wL1, sl(1990, sc)) - tap(apL2, aL2, sl(187, sc))
              - tap(dL2, wL2, sl(1066, sc)))
        oR = (tap(dL1, wL1, sl(353, sc)) + tap(dL1, wL1, sl(3627, sc)) - tap(apL2, aL2, sl(1228, sc))
              + tap(dL2, wL2, sl(2673, sc)) - tap(dR1, wR1, sl(2111, sc)) - tap(apR2, aR2, sl(335, sc))
              - tap(dR2, wR2, sl(121, sc)))
        outL[i] = 0.6 * oL; outR[i] = 0.6 * oR
    return outL, outR

# ---------------------------------------------------------------- drums
def kick():
    n = int(1.0 * SR); t = np.arange(n) / SR
    f = 44 + (110 - 44) * np.exp(-t / 0.045)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.32)
    x += 0.05 * rng.standard_normal(n) * np.exp(-t / 0.002)
    return np.tanh(1.2 * x) / np.tanh(1.2)

def biquad_hp(x, fc, q=0.707):
    w = 2 * np.pi * fc / SR; al = np.sin(w) / (2 * q); c = np.cos(w); a0 = 1 + al
    b = np.array([(1 + c) / 2, -(1 + c), (1 + c) / 2]) / a0
    a = np.array([1, -2 * c / a0, (1 - al) / a0])
    from scipy.signal import lfilter
    return lfilter(b, a, x)

def hat(decay=0.025, hp=8000):
    n = int(decay * 8 * SR); t = np.arange(n) / SR
    x = biquad_hp(biquad_hp(rng.standard_normal(n), hp), hp)   # noise only: no aliasing squares
    return x * np.minimum(1, t / 0.0005) * np.exp(-t / decay)

def place(buf, x, pos):
    pos = int(pos)
    if pos >= len(buf): return
    e = min(len(buf), pos + len(x)); buf[pos:e] += x[:e - pos]

# ---------------------------------------------------------------- arrangement
def main():
    s16 = BEAT / 4
    kickB = np.zeros(N); hatB = np.zeros(N); subB = np.zeros(N); stab = np.zeros(N)
    K = kick()
    kick_times = []
    DM = [50, 53, 57, 60, 64]   # D3 F3 A3 C4 E4
    CM = [48, 51, 55, 58, 62]
    det = np.array([1.0, 1.0045, 0.9955])
    for bar in range(BARS):
        t0 = bar * BAR
        no_kick = bar in (12, 13)          # a two-bar "abyss" so you hear the chamber alone
        for beat in range(4):
            if not no_kick:
                place(kickB, K, (t0 + beat * BEAT) * SR); kick_times.append(t0 + beat * BEAT)
            place(hatB, hat() * (0.5 if bar else 0.25), (t0 + beat * BEAT + 2 * s16) * SR)
        if 4 <= bar and not no_kick:
            for st in range(16):
                if st % 2 == 1:
                    sw = 0.06 * s16   # a little shuffle on the 16ths
                    place(hatB, hat(0.012, 9000) * (0.16 + 0.06 * rng.random()), (t0 + st * s16 + sw) * SR)
        # breath: continuous, log-spaced cutoff over 16 bars, 350 Hz -> 2.4 kHz -> 350 Hz
        chord = DM if (bar // 4) % 2 == 0 else CM
        hits = [(2, 0.85), (7, 0.7)] + ([(10, 0.55)] if bar % 2 else [])
        for st, vel in hits:
            tt = t0 + st * s16
            ph = (tt / BAR) / 16.0
            br = 0.5 - 0.5 * np.cos(2 * np.pi * ph)
            base = 350 * (2400 / 350) ** br
            n = int(0.45 * SR)
            x = render_stab(np.array([m2f(m) for m in chord]), det, n, SR,
                            base, 2.2, 0.018, 1.1, 0.16)
            place(stab, x * vel * (0.6 + 0.4 * br), tt * SR)
        if bar >= 4 and not no_kick:
            for beat in (0, 2):
                n = int(BEAT * 1.9 * SR); t = np.arange(n) / SR
                f = m2f(38 if (bar // 4) % 2 == 0 else 36)   # D2 / C2
                env = np.minimum(1, t / 0.02) * np.minimum(1, (n - np.arange(n)) / (0.15 * SR))
                place(subB, np.sin(2 * np.pi * f * t) * env, (t0 + beat * BEAT) * SR)

    # kick duck envelope (fast attack, 0.2 s release)
    kenv = np.zeros(N)
    rel = np.exp(-1 / (0.2 * SR))
    imp = np.zeros(N)
    for kt in kick_times: imp[int(kt * SR)] = 1.0
    v = 0.0
    for i in range(N):
        v = 1.0 if imp[i] else v * rel
        kenv[i] = v

    stab /= np.max(np.abs(stab))
    stab_dry = stab * (1 - 0.3 * kenv)
    # ---- chamber
    eL, eR = dub_delay(stab_dry * 0.8, stab_dry * 0.8, SR, 0.75 * BEAT,
                       fb=0.72, hp_hz=180, lp_hz=3200, drive=1.4,
                       wobble=0.004, wob_rate=0.6, pre_hp=220, pre_lp=3800, cross=0.3)
    rvL, rvR = dattorro(stab_dry * 0.35 + eL * 0.6, stab_dry * 0.35 + eR * 0.6, SR,
                        decay=0.82, damping=0.35, bandwidth=0.7, predelay_s=0.02, hp_hz=300)
    duck_ret = 1 - 0.25 * kenv
    retL = (eL * 2.2 + rvL * 1.5) * duck_ret
    retR = (eR * 2.2 + rvR * 1.5) * duck_ret

    # ---- bed
    hiss = biquad_hp(rng.standard_normal(N), 3000) * 0.006
    sub = subB * (1 - 0.6 * kenv)          # sub ducks to the kick too: no flab where they overlap
    kickB /= np.max(np.abs(kickB)); hatB /= np.max(np.abs(hatB)); sub /= max(1e-9, np.max(np.abs(sub)))

    L = kickB * 0.9 + sub * 0.42 + hatB * 0.28 + stab_dry * 1.3 + retL + hiss
    R = kickB * 0.9 + sub * 0.42 + hatB * 0.28 + stab_dry * 1.3 + retR + hiss[::-1]
    st = np.stack([L, R])
    st /= np.max(np.abs(st)); st *= 0.95
    th = 0.8
    a = np.abs(st)
    st = np.where(a > th, np.sign(st) * (th + 0.2 * np.tanh((a - th) / 0.2)), st)
    fo = int(TAIL * SR)
    st[:, -fo:] *= np.linspace(1, 0, fo)
    st /= np.max(np.abs(st)); st *= 0.89
    pcm = (st.T * 32767).astype(np.int16)
    with wave.open('/home/claude/dub_reference.wav', 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', '/home/claude/dub_reference.wav',
                    '-b:a', '256k', '/home/claude/dub_reference.mp3'], check=True)
    np.save('/tmp/claude-0/-home-claude/45f76194-0e9d-5f4d-8112-eb7a910501f8/scratchpad/stems.npy',
            np.stack([stab_dry, eL + eR, rvL + rvR]))
    print('ok')

if __name__ == '__main__':
    main()
