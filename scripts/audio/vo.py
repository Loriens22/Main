"""Voices: Bulgarian dialogue (espeak-ng bg -> WORLD vocoder humanisation) and the
sung English refrain (espeak-ng en -> WORLD retuned to an original melody)."""
import os
import subprocess
import tempfile
import numpy as np
import soundfile as sf
import pyworld as pw
from scipy import signal
from dsp import SR, filt, stereo

FP = 5.0  # WORLD frame period (ms)


def espeak(text, voice, speed=160, pitch=40, gap=0):
    with tempfile.TemporaryDirectory() as td:
        p = os.path.join(td, 'o.wav')
        subprocess.run(['espeak-ng', '-v', voice, '-s', str(speed), '-p', str(pitch), '-g', str(gap), '-w', p, text], check=True)
        x, fs = sf.read(p, dtype='float64')
    # trim silence
    a = np.abs(x)
    idx = np.where(a > 0.01 * a.max())[0]
    x = x[max(0, idx[0] - 200): idx[-1] + 400]
    return x, fs


def analyse(x, fs):
    f0, t = pw.harvest(x, fs, f0_floor=60, f0_ceil=600, frame_period=FP)
    sp = pw.cheaptrick(x, f0, t, fs)
    ap = pw.d4c(x, f0, t, fs)
    return f0, sp, ap


def warp_formants(sp, k):
    """scale spectral envelope along frequency (k<1 lowers formants)"""
    n = sp.shape[1]
    src = np.arange(n)
    out = np.empty_like(sp)
    for i in range(sp.shape[0]):
        out[i] = np.interp(src * k, src, sp[i], right=sp[i, -1])
    return out


def retime(arrs, weights, target_frames):
    """non-uniform time stretch: frame i occupies weights[i] of output time"""
    w = np.asarray(weights, float)
    cum = np.concatenate([[0], np.cumsum(w)])
    cum = cum / cum[-1] * target_frames
    out_t = np.arange(target_frames) + 0.5
    src_idx = np.interp(out_t, cum[:-1] + (cum[1:] - cum[:-1]) * 0.5, np.arange(len(w)))
    res = []
    for a in arrs:
        if a.ndim == 1:
            res.append(np.interp(src_idx, np.arange(len(a)), a))
        else:
            lo = np.floor(src_idx).astype(int).clip(0, len(a) - 1)
            hi = (lo + 1).clip(0, len(a) - 1)
            f = (src_idx - lo)[:, None]
            res.append(a[lo] * (1 - f) + a[hi] * f)
    return res, src_idx


def to48(x, fs):
    from math import gcd
    g = gcd(int(fs), SR)
    return signal.resample_poly(x, SR // g, int(fs) // g).astype(np.float32)


# --------------------------------------------------------------- Bulgarian man
def bulgarian_line(text, target_sec, base_hz=108.0, emph=(), seed=0, speed=165):
    """Returns (mono 48k float32 dry voice, lip envelope list @60Hz)."""
    x, fs = espeak(text, 'bg+m3', speed=speed, pitch=32, gap=1)
    f0, sp, ap = analyse(x, fs)
    voiced = f0 > 0
    # compress long pauses, keep syllable rhythm
    w = np.where(voiced, 1.0, 0.75)
    n_target = int(target_sec * 1000 / FP)
    (f0r, spr, apr), src = retime([f0, sp, ap], w, n_target)
    vo = np.interp(src, np.arange(len(voiced)), voiced.astype(float)) > 0.5
    # natural intonation: exaggerated relative contour + declination + emphasis
    rel = np.where(f0r > 0, f0r, np.nan)
    med = np.nanmedian(rel)
    contour = np.nan_to_num(np.log2(rel / med), nan=0.0)
    tt = np.linspace(0, 1, n_target)
    rs = np.random.default_rng(seed)
    jit = signal.savgol_filter(rs.standard_normal(n_target), 31, 2) * 0.012
    semis = contour * 12 * 1.5 - 2.2 * tt + jit * 12
    for (pos, amt, width) in emph:
        semis += amt * np.exp(-((tt - pos) / width) ** 2)
    newf0 = np.where(vo, base_hz * 2 ** (semis / 12), 0.0)
    # gruff, chesty: lower formants slightly, a touch of breath/roughness
    spr = warp_formants(spr, 0.9)
    apr = np.clip(apr ** 0.85, 0, 1)
    y = pw.synthesize(newf0, np.ascontiguousarray(spr), np.ascontiguousarray(apr), fs, FP)
    y = to48(y, fs)
    y = filt(y, 'hp', 85)
    y /= np.abs(y).max() + 1e-9
    y *= 0.85
    # lip-sync envelope (60 Hz) from the dry signal energy
    hop = SR // 60
    nfr = len(y) // hop
    e = np.array([np.sqrt(np.mean(y[i * hop:(i + 1) * hop] ** 2)) for i in range(nfr)])
    e = signal.savgol_filter(e, 7, 2) if len(e) > 7 else e
    e = np.clip(e / (np.percentile(e, 95) + 1e-9), 0, 1)
    return y.astype(np.float32), [round(float(v), 3) for v in e]


# -------------------------------------------------------------- sung refrain
def sing_word(word, notes, voice='en-us+f4', bpm=70):
    """notes: list of (midi_pitch, beats) for this word's syllables."""
    beat = 60.0 / bpm
    dur = sum(b for _, b in notes) * beat
    x, fs = espeak(word, voice, speed=120, pitch=55)
    f0, sp, ap = analyse(x, fs)
    voiced = f0 > 0
    nv = voiced.sum()
    n_target = max(4, int(dur * 1000 / FP))
    n_unv = len(f0) - nv
    # consonants keep their natural length; vowels stretch to fill the notes
    wv = max(0.2, (n_target - n_unv) / max(1, nv))
    w = np.where(voiced, wv, 1.0)
    (f0r, spr, apr), src = retime([f0, sp, ap], w, n_target)
    vo = np.interp(src, np.arange(len(voiced)), voiced.astype(float)) > 0.5
    # syllable pitch map over voiced frames (proportional split), portamento + vibrato
    vidx = np.where(vo)[0]
    target = np.zeros(n_target)
    if len(vidx):
        edges = np.cumsum([0] + [b for _, b in notes])
        edges = edges / edges[-1]
        for k, (p, _) in enumerate(notes):
            a = vidx[int(edges[k] * (len(vidx) - 1))]
            b = vidx[int(edges[k + 1] * (len(vidx) - 1))]
            target[a: b + 1] = p
        # fill gaps
        last = notes[0][0]
        for i in range(n_target):
            if target[i] == 0:
                target[i] = last
            else:
                last = target[i]
    port = signal.savgol_filter(target, 15, 2) if n_target > 15 else target
    tt = np.arange(n_target) * FP / 1000
    vib = 0.33 * np.sin(2 * np.pi * 5.4 * tt) * np.clip((tt - 0.16) / 0.25, 0, 1)
    hz = 440 * 2 ** ((port + vib - 69) / 12)
    newf0 = np.where(vo, hz, 0.0)
    apr = np.clip(apr * 1.05 + 0.02, 0, 1)
    y = pw.synthesize(newf0, np.ascontiguousarray(spr), np.ascontiguousarray(apr), fs, FP)
    y = to48(y, fs)
    fade = int(0.012 * SR)
    if len(y) > 2 * fade:
        y[:fade] *= np.linspace(0, 1, fade)
        y[-fade:] *= np.linspace(1, 0, fade)
    return y.astype(np.float32), dur


def sing_line(words, t0, bpm=70, voice='en-us+f4'):
    """words: list of (word, [(pitch, beats), ...], rest_beats_after). Returns list of (t, audio)."""
    beat = 60.0 / bpm
    t = t0
    out = []
    for word, notes, rest in words:
        y, d = sing_word(word, notes, voice, bpm)
        out.append((t, y))
        t += d + rest * beat
    return out
