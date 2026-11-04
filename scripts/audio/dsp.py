"""Small DSP toolkit for the soundtrack (numpy/scipy/pedalboard). 48 kHz stereo."""
import os
import subprocess
import tempfile
import numpy as np
import soundfile as sf
from scipy import signal
import pedalboard as pb

SR = 48000
SF2 = '/usr/share/sounds/sf3/MuseScore_General_Full.sf3'
if not os.path.exists(SF2):
    SF2 = '/usr/share/sounds/sf2/FluidR3_GM.sf2'
RNG = np.random.default_rng(1104)


def buf(seconds):
    return np.zeros((int(seconds * SR) + 1, 2), np.float32)


def add(dst, src, t, gain=1.0):
    """mix src (N,2 or N) into dst at time t (seconds)"""
    if src.ndim == 1:
        src = np.stack([src, src], 1)
    i = int(round(t * SR))
    if i < 0:
        src = src[-i:]
        i = 0
    n = min(len(src), len(dst) - i)
    if n > 0:
        dst[i:i + n] += src[:n] * gain


def env(n, a=0.005, d=0.1, s=0.0, r=0.05, curve=4.0):
    """attack/decay/sustain/release envelope over n samples"""
    e = np.ones(n, np.float32) * s
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na = min(na, n)
    e[:na] = np.linspace(0, 1, na) if na else e[:na]
    nd = min(nd, n - na)
    if nd > 0:
        x = np.linspace(0, 1, nd)
        e[na:na + nd] = s + (1 - s) * np.exp(-curve * x)
    if nr > 0 and n > nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def noise(sec, color='white'):
    n = int(sec * SR)
    w = RNG.standard_normal(n).astype(np.float32)
    if color == 'pink':
        b, a = [0.049922035, -0.095993537, 0.050612699, -0.004408786], [1, -2.494956002, 2.017265875, -0.522189400]
        w = signal.lfilter(b, a, w).astype(np.float32) * 3
    if color == 'brown':
        w = np.cumsum(w) * 0.02
        w -= signal.savgol_filter(w, 2001, 2) if n > 2001 else w.mean()
    return w


def filt(x, kind, f, order=2, q=None):
    nyq = SR / 2
    if kind == 'bp':
        sos = signal.butter(order, [max(20, f[0]) / nyq, min(f[1], nyq * 0.95) / nyq], 'bandpass', output='sos')
    else:
        sos = signal.butter(order, min(f, nyq * 0.95) / nyq, {'lp': 'lowpass', 'hp': 'highpass'}[kind], output='sos')
    if x.ndim == 2:
        return np.stack([signal.sosfilt(sos, x[:, 0]), signal.sosfilt(sos, x[:, 1])], 1).astype(np.float32)
    return signal.sosfilt(sos, x).astype(np.float32)


def stereo(x, width=0.0, pan=0.0):
    if x.ndim == 2:
        return x
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    if width > 0:
        d = int(width * 0.012 * SR)
        xr = np.concatenate([np.zeros(d, np.float32), x[:-d]]) if d else x
        return np.stack([x * l * 1.41, xr * r * 1.41], 1).astype(np.float32)
    return np.stack([x * l * 1.41, x * r * 1.41], 1).astype(np.float32)


def sine(freq, sec, phase=0.0):
    t = np.arange(int(sec * SR)) / SR
    if callable(freq):
        f = freq(t)
        ph = 2 * np.pi * np.cumsum(f) / SR
        return np.sin(ph + phase).astype(np.float32)
    return np.sin(2 * np.pi * freq * t + phase).astype(np.float32)


_IR = {}


def make_ir(name, rt60=2.0, pre=0.02, bright=6000, er=8, width=1.0):
    """synthetic stereo impulse response: early reflections + damped diffuse tail"""
    if name in _IR:
        return _IR[name]
    n = int((rt60 * 1.3 + pre) * SR)
    t = np.arange(n) / SR
    r = np.random.default_rng(abs(hash(name)) % 2**32)
    out = np.zeros((n, 2), np.float32)
    for ch in range(2):
        tail = r.standard_normal(n).astype(np.float32) * np.exp(-6.9 * t / rt60)
        # frequency-dependent damping: progressively low-passed tail
        lp_early = filt(tail, 'lp', bright)
        lp_late = filt(tail, 'lp', bright * 0.25)
        mix = np.clip(t / rt60, 0, 1)
        tail = lp_early * (1 - mix) + lp_late * mix
        tail[: int(pre * SR)] = 0
        out[:, ch] = tail
        for k in range(er):
            d = int((pre * 0.4 + r.uniform(0.003, pre * 1.6 + 0.02)) * SR)
            if d < n:
                out[d, ch] += r.uniform(0.25, 0.7) * r.choice([-1, 1])
    if width < 1:
        m = out.mean(1, keepdims=True)
        out = m + (out - m) * width
    out /= np.sqrt((out ** 2).sum() / 2) + 1e-9
    path = os.path.join(tempfile.gettempdir(), f'ir_{name}.wav')
    sf.write(path, out, SR)
    _IR[name] = path
    return path


def reverb(x, ir, wet=0.3, dry=1.0):
    if x.ndim == 1:
        x = stereo(x)
    c = pb.Convolution(ir, mix=1.0)
    w = c(x.T.astype(np.float32), SR).T
    n = len(x)
    return (x * dry + w[:n] * wet).astype(np.float32)


def fx(x, *plugins):
    board = pb.Pedalboard(list(plugins))
    return board(x.T.astype(np.float32), SR).T.astype(np.float32)


# ------------------------------------------------------------------ MIDI parts
NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def m(n):
    """'C#4' -> 61"""
    if isinstance(n, (int, np.integer)):
        return int(n)
    name, acc, octv = n[0], n[1:-1], int(n[-1])
    v = NOTE[name] + (1 if acc == '#' else -1 if acc == 'b' else 0)
    return 12 * (octv + 1) + v


def render_part(notes, program, gain=0.6, drum=False, cc=None, bank=0, tail=4.0):
    """notes: list of (t_start_sec, dur_sec, pitch, vel). Rendered via FluidSynth with
    MuseScore General; returns stereo float array starting at t=0."""
    import mido
    if not notes:
        return buf(0.1)
    TPB = 960  # 120 bpm -> 1920 ticks per second
    mf = mido.MidiFile(ticks_per_beat=TPB)
    tr = mido.MidiTrack()
    mf.tracks.append(tr)
    ch = 9 if drum else 0
    tr.append(mido.MetaMessage('set_tempo', tempo=500000, time=0))
    if not drum:
        if bank:
            tr.append(mido.Message('control_change', channel=ch, control=0, value=bank, time=0))
        tr.append(mido.Message('program_change', channel=ch, program=program, time=0))
    tr.append(mido.Message('control_change', channel=ch, control=91, value=0, time=0))
    tr.append(mido.Message('control_change', channel=ch, control=93, value=0, time=0))
    ev = []
    for (t0, d, p, v) in notes:
        ev.append((max(0, t0), 1, m(p), int(np.clip(v, 1, 127))))
        ev.append((max(0, t0) + max(0.02, d), 0, m(p), 0))
    for (t0, ctl, val) in (cc or []):
        ev.append((t0, 2, ctl, int(val)))
    ev.sort(key=lambda e: (e[0], e[1]))
    last = 0
    for (t0, kind, a, b) in ev:
        tick = int(round(t0 * 1920))
        dt = max(0, tick - last)
        last = tick
        if kind == 1:
            tr.append(mido.Message('note_on', channel=ch, note=a, velocity=b, time=dt))
        elif kind == 0:
            tr.append(mido.Message('note_off', channel=ch, note=a, velocity=0, time=dt))
        else:
            tr.append(mido.Message('control_change', channel=ch, control=a, value=b, time=dt))
    end = max(e[0] for e in ev) + tail
    tr.append(mido.MetaMessage('end_of_track', time=int(tail * 1920)))
    with tempfile.TemporaryDirectory() as td:
        mid, wav = os.path.join(td, 'p.mid'), os.path.join(td, 'p.wav')
        mf.save(mid)
        subprocess.run(['fluidsynth', '-ni', '-q', '-R', '0', '-C', '0', '-r', str(SR), '-g', str(gain),
                        '-o', 'synth.polyphony=512', '-F', wav, SF2, mid], check=True, capture_output=True)
        a, sr = sf.read(wav, dtype='float32')
    if a.ndim == 1:
        a = stereo(a)
    return a[: int(end * SR)]


def loudness_norm(x, target_rms_db=-17.0):
    rms = np.sqrt(np.mean(x ** 2) + 1e-12)
    g = 10 ** (target_rms_db / 20) / rms
    return x * g
