#!/usr/bin/env python3
"""Happy birthday Matex — original score, sound design and dialogue.

All music is composed here (note-by-note, in seconds-space, locked to
src/timeline.json) and rendered per stem through FluidSynth with the
MuseScore General soundfont; SFX are synthesised; the Bulgarian lines use
espeak-ng's Bulgarian voice re-performed through the WORLD vocoder.

    python3 scripts/audio/build_audio.py      -> public/assets/audio/{soundtrack.m4a, soundtrack.wav, lipsync.json, stems/*.wav}
"""
import json
import math
import os
import subprocess
import sys
import numpy as np
import soundfile as sf
import pedalboard as pb

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dsp import SR, buf, add, env, noise, filt, stereo, sine, make_ir, reverb, fx, m, render_part  # noqa: E402
from vo import bulgarian_line, sing_line  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'audio')
os.makedirs(os.path.join(OUT, 'stems'), exist_ok=True)
TL = json.load(open(os.path.join(ROOT, 'src', 'timeline.json')))
DUR = TL['duration']
M, B, F, C = TL['manor'], TL['botanical'], TL['fold'], TL['cosmos']
R = np.random.default_rng(2026)


def sstep(t, a, b):
    x = min(1.0, max(0.0, (t - a) / (b - a)))
    return x * x * (3 - 2 * x)


def sstep2(t, a, b):
    x = min(1.0, max(0.0, (t - a) / (b - a)))
    return x * x * x * (x * (x * 6 - 15) + 10)


IR_ROOM = make_ir('manor', rt60=0.85, pre=0.012, bright=7000, er=10)
IR_HALL = make_ir('hall', rt60=3.4, pre=0.03, bright=6500, er=6)
IR_SPACE = make_ir('space', rt60=6.5, pre=0.05, bright=5200, er=4)
IR_STUDIO = make_ir('studio', rt60=1.4, pre=0.015, bright=9000, er=8)


def place(dst, part, t0=0.0, gain=1.0):
    add(dst, part, t0, gain)


def gate(x, a, b, fade_in=0.05, fade_out=0.05):
    """keep x only in [a,b] seconds (with short fades)"""
    n = len(x)
    g = np.zeros(n, np.float32)
    ia, ib = int(a * SR), min(n, int(b * SR))
    if ib <= ia:
        return x * 0
    g[ia:ib] = 1
    fi, fo = int(fade_in * SR), int(fade_out * SR)
    if fi:
        g[ia:ia + fi] = np.linspace(0, 1, min(fi, ib - ia))[: len(g[ia:ia + fi])]
    if fo:
        g[max(ia, ib - fo):ib] *= np.linspace(1, 0, len(g[max(ia, ib - fo):ib]))
    return x * g[:, None]


def duck(x, spans, depth_db=-9, ramp=0.25):
    n = len(x)
    g = np.ones(n, np.float32)
    for a, b in spans:
        for i0, i1, v0, v1 in [(a - ramp, a, 1, 0), (a, b, 0, 0), (b, b + ramp, 0, 1)]:
            s, e = int(max(0, i0) * SR), int(min(n / SR, i1) * SR)
            if e > s:
                g[s:e] = np.minimum(g[s:e], np.linspace(v0, v1, e - s))
    lin = 10 ** (depth_db / 20)
    g = lin + (1 - lin) * g
    return x * g[:, None]


# =====================================================================  ACT I
def cue_manor():
    """Intimate warm botanica: felt piano, woody mallets, harp, bells, breath pad."""
    bpm = 76.0
    beat = 60 / bpm
    bar = 4 * beat
    t0 = 0.35
    prog = [
        ['F2', 'C3', 'A3', 'E4', 'G4'], ['A2', 'E3', 'G3', 'C4', 'E4'], ['Bb1', 'F2', 'A3', 'D4', 'E4'], ['C2', 'G2', 'F3', 'Bb3', 'C4'],
        ['D2', 'A2', 'F3', 'C4', 'E4'], ['Bb1', 'F2', 'G3', 'D4', 'F4'], ['G1', 'D2', 'F3', 'Bb3', 'D4'], ['C2', 'G2', 'Bb3', 'D4', 'F4'],
    ]
    mel_scale = [m(x) for x in ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'Bb4', 'C5', 'D5', 'E5', 'F5']]
    piano, mar, harp, cel, pad = [], [], [], [], []
    nbars = int((M['glassCross'] - t0) / bar) + 1
    rr = np.random.default_rng(7)
    prev = m('A4')
    for b in range(nbars):
        ch = prog[b % len(prog)]
        tb = t0 + b * bar
        # LH broken chord (felt), soft rolling eighths
        lh = [ch[0], ch[1], ch[2], ch[1], ch[3], ch[2], ch[1], ch[2]]
        for k, p in enumerate(lh):
            piano.append((tb + k * beat / 2, beat * 1.6, p, 30 + 8 * (k == 0) + rr.integers(-3, 4)))
        # RH melody: chord-tone walk with gentle syncopation
        pattern = [[(0, 1.5), (1.5, 0.5), (2, 2)], [(0, 1), (1, 1), (2, 1.5), (3.5, 0.5)], [(0.5, 1.5), (2, 1), (3, 1)], [(0, 3), (3, 1)]][b % 4]
        tones = [m(x) % 12 for x in ch]
        for (off, d) in pattern:
            cands = [p for p in mel_scale if abs(p - prev) <= 5]
            weights = np.array([3.0 if (p % 12) in tones else 1.0 for p in cands])
            weights /= weights.sum()
            p = int(rr.choice(cands, p=weights))
            prev = p
            piano.append((tb + off * beat, d * beat * 1.1, p, 44 + rr.integers(-4, 6)))
        # woody mallets: two soft high notes per bar
        for off in (1.5, 3.25):
            mar.append((tb + off * beat, 0.4, int(rr.choice([m(x) for x in ch[2:]])) + 12, 38))
        if b % 2 == 0:
            for k, p in enumerate(ch[1:] + [m(ch[2]) + 12, m(ch[3]) + 12]):
                harp.append((tb + 2 * beat + k * 0.09, 1.6, p, 30))
        if b % 4 == 1:
            cel.append((tb, 1.5, m(ch[3]) + 12, 34))
            cel.append((tb + beat * 0.5, 1.5, m(ch[4]) + 12, 30))
        pad.append((tb, bar * 1.05, ch[1], 26)); pad.append((tb, bar * 1.05, ch[2], 24)); pad.append((tb, bar * 1.05, ch[3], 22))
    stems = {}
    pno = render_part(piano, 0, gain=0.55)
    pno = fx(pno, pb.LowpassFilter(3200), pb.Distortion(drive_db=2), pb.Gain(-2))   # felt
    stems['piano'] = reverb(pno, IR_ROOM, 0.35)
    stems['mallets'] = reverb(render_part(mar, 12, gain=0.5), IR_ROOM, 0.45)
    stems['harp'] = reverb(render_part(harp, 46, gain=0.45), IR_ROOM, 0.5)
    stems['celesta'] = reverb(render_part(cel, 8, gain=0.35), IR_HALL, 0.5)
    stems['pad'] = reverb(fx(render_part(pad, 89, gain=0.45), pb.LowpassFilter(2500)), IR_HALL, 0.4)
    mix = buf(DUR)
    for k, g in [('piano', 1.0), ('mallets', 0.7), ('harp', 0.6), ('celesta', 0.5), ('pad', 0.55)]:
        place(mix, stems[k], 0, g)
    # duck under dialogue + TV static; hard stop when the camera crosses the glass ("door shuts")
    mix = duck(mix, [(M['line1'] - 0.1, M['line1'] + 3.8), (M['line2'] - 0.1, M['line2'] + 3.0)], -10)
    mix = duck(mix, [(M['tvOn'], M['logo'])], -7, 0.4)
    mix = gate(mix, 0, M['glassCross'], 0.5, 0.12)
    return mix


def birds(t0, t1, density=0.6, level=1.0, outside=False, seed=0):
    rs = np.random.default_rng(seed)
    out = buf(DUR)
    t = t0
    while t < t1:
        t += rs.exponential(1.0 / density)
        species = rs.integers(0, 4)
        n_notes = rs.integers(3, 9)
        f0 = rs.uniform(2600, 5200)
        tt = t
        pan = rs.uniform(-0.8, 0.8)
        for k in range(n_notes):
            d = rs.uniform(0.04, 0.12) if species != 2 else rs.uniform(0.15, 0.3)
            f = f0 * (1 + 0.25 * math.sin(k * 1.7 + species))
            sweep = rs.uniform(-0.4, 0.6)
            y = sine(lambda x, f=f, d=d, sweep=sweep: f * (1 + sweep * x / d) + 180 * np.sin(2 * np.pi * 38 * x), d)
            y *= env(len(y), 0.005, d, 0, 0.01, 3)
            y += 0.3 * sine(lambda x, f=f: 2 * f * (1 + 0.1 * x), d) * env(len(y), 0.004, d, 0, 0.01, 4)
            if outside:
                y = filt(y, 'lp', 3800)
            add(out, stereo(y * 0.08 * level, pan=pan), tt)
            tt += d + rs.uniform(0.02, 0.1)
    return out


def sfx_manor():
    out = buf(DUR)
    # room tone + muffled spring garden outside
    rt = filt(noise(M['glassCross'], 'pink'), 'lp', 900) * 0.006
    add(out, stereo(rt, width=0.6), 0)
    add(out, birds(0.5, M['glassCross'] - 0.3, 0.55, 0.8, outside=True, seed=3), 0)
    # footsteps — same walk maths as the film (bezier arc length, 0.71 m per step)
    S0, CT, TV = np.array([0.45, 5.7]), np.array([0.95, 2.6]), np.array([2.3, 0.72])
    def bez(u):
        return (1 - u) ** 2 * S0 + 2 * (1 - u) * u * CT + u * u * TV
    def arclen(u):
        L, p = 0.0, bez(0)
        for i in range(1, 25):
            q = bez(u * i / 24); L += np.linalg.norm(q - p); p = q
        return L
    steps = []
    last = -1
    for i in range(int((M['turn'] - M['manEnter']) * 200)):
        t = M['manEnter'] + i / 200
        u = sstep2(t, M['manEnter'], M['manArrive'])
        d = arclen(u)
        k = int(d / 0.71)
        if k != last and 0 < u < 1:
            steps.append((t, bez(u))); last = k
    last = -1
    for i in range(int((M['sitStart'] - M['walkSofa']) * 200)):
        t = M['walkSofa'] + i / 200
        kk = sstep2(t, M['walkSofa'], M['sitStart'] - 0.1)
        d = 6 + kk * 4.1
        k = int(d / 0.71)
        if k != last and 0 < kk < 1:
            p = TV + (np.array([-1.58, 1.03]) - TV) * kk
            steps.append((t, p)); last = k
    for (t, p) in steps:
        on_rug = (-1.1 < p[0] < 1.4) and (-0.6 < p[1] < 2.0)
        thump = sine(lambda x: 85 * (1 - x * 2), 0.09) * env(int(0.09 * SR), 0.002, 0.07, 0, 0.01, 5)
        heel = filt(noise(0.03), 'bp', (1400, 5200)) * env(int(0.03 * SR), 0.001, 0.02, 0, 0.005, 6)
        y = np.zeros(int(0.1 * SR), np.float32)
        y[:len(thump)] += thump * (0.5 if on_rug else 0.35)
        y[:len(heel)] += heel * (0.05 if on_rug else 0.22)
        pan = np.clip((p[0] - 0.2) / 3, -0.8, 0.8)
        add(out, reverb(stereo(y, pan=pan), IR_ROOM, 0.3), t, 0.55)
    # physical push-buttons: down-click + spring return
    for tp in [M['press1'], M['press2'], M['press3'], M['press4']]:
        for (dt, lvl, f) in [(0.08, 1.0, 3400), (0.34, 0.55, 2700)]:
            n = int(0.05 * SR)
            y = filt(noise(0.05), 'hp', 1800) * env(n, 0.0005, 0.012, 0, 0.004, 8)
            y += sine(f, 0.05) * env(n, 0.0005, 0.03, 0, 0.004, 6) * 0.4
            y += sine(180, 0.05) * env(n, 0.001, 0.02, 0, 0.004, 6) * 0.5
            add(out, reverb(stereo(y, pan=0.35), IR_ROOM, 0.25), tp + dt, 0.5 * lvl)
    # TV: power clunk, degauss swell, CRT whine
    tv = M['tvOn']
    n = int(0.25 * SR)
    clunk = sine(lambda x: 70 - 30 * x, 0.25) * env(n, 0.002, 0.15, 0, 0.02, 5) + filt(noise(0.25), 'bp', (300, 2500)) * env(n, 0.001, 0.03, 0, 0.02, 9) * 0.6
    add(out, reverb(stereo(clunk, pan=0.4), IR_ROOM, 0.3), tv, 0.7)
    deg = sine(lambda x: 52 + 0 * x, 0.9) * env(int(0.9 * SR), 0.05, 0.8, 0, 0.1, 3) * 0.5 + filt(noise(0.9), 'lp', 400) * env(int(0.9 * SR), 0.02, 0.8, 0, 0.1, 3) * 0.3
    add(out, stereo(deg, pan=0.4), tv + 0.05, 0.6)
    whine_len = M['glassCross'] - tv
    wh = sine(15600, whine_len) * 0.004 * np.clip(np.arange(int(whine_len * SR)) / SR / 0.6, 0, 1)
    add(out, stereo(wh, pan=0.4), tv)
    # analog snow while it warms up (rolling flutter), abrupt stop at the logo
    st_len = M['logo'] - M['staticStart']
    hiss = filt(noise(st_len), 'bp', (700, 9000))
    tt = np.arange(len(hiss)) / SR
    flutter = 0.7 + 0.3 * np.sin(2 * np.pi * 0.55 * tt) * np.sin(2 * np.pi * 7.3 * tt)
    crack = (R.random(len(hiss)) > 0.9993).astype(np.float32) * R.uniform(-1, 1, len(hiss))
    snow = (hiss * flutter * 0.16 + filt(crack, 'hp', 2000) * 0.5) * np.clip(tt / 0.25, 0, 1)
    add(out, reverb(stereo(snow, pan=0.4, width=0.3), IR_ROOM, 0.2), M['staticStart'])
    hum_len = M['glassCross'] - M['logo']
    hum = (sine(50, hum_len) * 0.5 + sine(100, hum_len) * 0.25 + sine(150, hum_len) * 0.12) * 0.012
    add(out, stereo(hum, pan=0.4), M['logo'])
    # sofa: leather creak + cushion thump when he sits heavily
    si = M['sitImpact']
    n = int(0.5 * SR)
    thump = sine(lambda x: 75 - 20 * x, 0.5) * env(n, 0.004, 0.25, 0, 0.05, 4)
    creak = filt(noise(0.5), 'bp', (500, 1800)) * env(n, 0.05, 0.35, 0, 0.05, 3) * (0.5 + 0.5 * np.sin(2 * np.pi * 23 * np.arange(n) / SR))
    add(out, reverb(stereo(thump * 0.8 + creak * 0.25, pan=-0.5), IR_ROOM, 0.35), si - 0.03, 0.8)
    # the dive: rising air through the glass, then the door between realities shuts
    dl = M['glassCross'] - (M['pushStart'] + 1.2)
    rise = filt(noise(dl), 'bp', (400, 6000)) * np.linspace(0, 1, int(dl * SR)) ** 2 * 0.12
    add(out, stereo(rise, width=0.8), M['pushStart'] + 1.2)
    n = int(1.2 * SR)
    door = sine(lambda x: 48 + 10 * np.exp(-x * 8), 1.2) * env(n, 0.003, 0.9, 0, 0.1, 4) + filt(noise(1.2), 'lp', 300) * env(n, 0.002, 0.2, 0, 0.1, 8)
    add(out, stereo(door * 0.9), M['glassCross'])
    return gate(out, 0, M['glassCross'] + 1.2, 0.01, 0.4)


def dialogue():
    vo = buf(DUR)
    lips = []
    y1, e1 = bulgarian_line('Жено, какво си го направила тоя телевизор, бе? Не пали!', 3.55, base_hz=112, emph=[(0.05, 3.5, 0.06), (0.62, 2.5, 0.06), (0.86, 4.0, 0.07)], seed=1)
    y2, e2 = bulgarian_line('Хмм, къв е тоя канал, бе? Кво си гледала преди?', 2.85, base_hz=104, emph=[(0.05, -1.5, 0.08), (0.42, 2.5, 0.06), (0.9, 3.0, 0.08)], seed=2, speed=175)
    for t, y, e, pan in [(M['line1'], y1, e1, 0.3), (M['line2'], y2, e2, -0.45)]:
        s = reverb(stereo(y, pan=pan), IR_ROOM, 0.22)
        s = fx(s, pb.HighShelfFilter(4000, 2.5), pb.Compressor(-18, 3, 5, 80))
        add(vo, s, t, 0.9)
        lips.append({'start': t, 'rate': 60, 'env': e})
    json.dump(lips, open(os.path.join(OUT, 'lipsync.json'), 'w'))
    return vo


def sfx_interference():
    a, b = TL['interference']
    out = buf(DUR)
    L = b - a
    hiss = filt(noise(L), 'bp', (500, 10000))
    tt = np.arange(len(hiss)) / SR
    buzz = (np.sign(np.sin(2 * np.pi * 59.94 * tt)) * 0.04 + np.sin(2 * np.pi * 15734 * tt) * 0.01)
    roll = 0.75 + 0.25 * np.sin(2 * np.pi * 1.3 * tt)
    y = (hiss * 0.22 * roll + buzz) * np.clip(tt / 0.02, 0, 1) * np.clip((L - tt) / 0.02, 0, 1)
    add(out, stereo(y, width=0.7), a)
    return out


# ====================================================================  ACT II
def cue_botanical():
    """Reverent, time-bending organ / piano / strings / choir — original."""
    bpm = 66.0
    beat = 60 / bpm
    bar = 4 * beat
    t0, t1 = B['start'] + 0.2, B['whiteout']
    prog = [
        ['Bb1', 'F2', 'Db3', 'C4', 'F4'], ['Gb1', 'Db2', 'Bb2', 'F3', 'Bb3'], ['F1', 'Db2', 'Ab2', 'F3', 'Ab3'], ['Ab1', 'Eb2', 'Bb2', 'Eb3', 'C4'],
        ['Eb1', 'Bb1', 'Gb2', 'Db3', 'F3'], ['Gb1', 'Db2', 'Bb2', 'F3', 'Ab3'], ['Db2', 'Ab2', 'F3', 'C4', 'F4'], ['C2', 'G2', 'E3', 'Bb3', 'Db4'],
    ]
    organ, arp, piano, strings, choir, low, pizz, trem = [], [], [], [], [], [], [], []
    nb = int((t1 - t0) / bar) + 1
    for b_ in range(nb):
        ch = prog[b_ % 8]
        tb = t0 + b_ * bar
        for p in ch[1:]:
            organ.append((tb, bar * 1.02, p, 52))
        # rolling 6-note arpeggio in triplets (time-bending, not ticking)
        seq = [ch[1], ch[2], ch[3], m(ch[4]), m(ch[3]) + 12, ch[3]]
        for k in range(12):
            arp.append((tb + k * beat / 3, beat / 3 * 1.4, seq[k % 6], 34 + 6 * (k % 3 == 0)))
        if tb > 54:
            for off, p in [(0, m(ch[4]) + 12), (2.5, m(ch[3]) + 12)]:
                piano.append((tb + off * beat, beat * 2.5, p, 46))
        if tb > 56:
            for p in ch[1:4]:
                strings.append((tb, bar * 1.02, m(p) + 12, 40 + min(30, int((tb - 56) * 2))))
        if tb > 60:
            choir.append((tb, bar, m(ch[4]) + 12, 48)); choir.append((tb, bar, m(ch[3]) + 12, 44))
        low.append((tb, bar, m(ch[0]) - 12 if m(ch[0]) > 30 else m(ch[0]), 60))
    # the dinosaur's passing low note (cello + bass swell)
    dp = B['dinoPass']
    for p, v in [('Bb1', 80), ('F2', 64), ('Bb2', 54)]:
        strings.append((dp - 2.4, 5.2, p, v))
    # confusion: pizzicato chatter and tremolo clusters as the people arrive
    pe, ws = B['peopleEnter'], B['whiteout']
    rs = np.random.default_rng(31)
    t = pe
    while t < ws:
        k = (t - pe) / (ws - pe)
        pizz.append((t, 0.2, int(rs.choice([m('Bb3'), m('Db4'), m('E4'), m('F4'), m('Gb4'), m('A4')])), 50 + int(40 * k)))
        t += beat / (2 + 4 * k)
    for p in ['Bb3', 'B3', 'Db4', 'E4', 'F4']:
        trem.append((pe + 1.0, ws - pe, p, 30))
    st = {}
    st['organ'] = reverb(fx(render_part(organ, 19, gain=0.42), pb.LowpassFilter(5200)), IR_HALL, 0.55)
    st['arp'] = reverb(render_part(arp, 20, gain=0.32), IR_HALL, 0.5)
    st['piano'] = reverb(render_part(piano, 0, gain=0.5), IR_HALL, 0.55)
    st['strings'] = reverb(render_part(strings, 49, gain=0.5), IR_HALL, 0.45)
    st['choir'] = reverb(render_part(choir, 52, gain=0.42), IR_HALL, 0.6)
    st['low'] = reverb(render_part(low, 43, gain=0.5), IR_HALL, 0.35)
    st['pizz'] = reverb(render_part(pizz, 45, gain=0.5), IR_HALL, 0.3)
    st['trem'] = reverb(render_part(trem, 44, gain=0.45), IR_HALL, 0.3)
    mix = buf(DUR)
    for k, g in [('organ', 0.75), ('arp', 0.55), ('piano', 0.7), ('strings', 0.7), ('choir', 0.55), ('low', 0.45), ('pizz', 0.5), ('trem', 0.55)]:
        lay = st[k]
        if k == 'trem':
            n = len(lay); ramp = np.clip((np.arange(n) / SR - (pe + 1.0)) / (ws - pe - 1.0), 0, 1)
            lay = lay * (ramp ** 1.5)[:, None]
        place(mix, lay, 0, g)
    # fade in from the snow, then the score stops dead at the white-out
    n = len(mix)
    fi = np.clip((np.arange(n) / SR - B['start']) / 2.5, 0, 1)
    mix *= fi[:, None]
    return gate(mix, B['start'], B['whiteout'], 0.01, 0.004)


def sfx_botanical():
    out = buf(DUR)
    s0, s1 = B['start'], B['whiteout']
    breeze = filt(noise(s1 - s0, 'pink'), 'bp', (200, 2200)) * 0.02
    tt = np.arange(len(breeze)) / SR
    breeze *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.07 * tt)
    add(out, stereo(breeze, width=0.8), s0)
    add(out, birds(s0 + 0.5, s1, 1.1, 1.2, seed=11), 0)
    # dinosaur footfalls: same contact maths as the film
    speed = 52 / (B['dinoExit'] - B['dinoEnter'] + 2.2)
    for n_ in range(-20, 21):
        xs = n_ * 1.55
        tc = B['dinoPass'] - xs / speed
        if not (B['dinoEnter'] - 0.5 < tc < B['dinoExit'] + 1.5):
            continue
        dist = abs(xs) + 7.5
        g = 2.2 / dist
        L = 0.5
        nn = int(L * SR)
        y = sine(lambda x: 52 + 30 * np.exp(-x * 30), L) * env(nn, 0.002, 0.35, 0, 0.05, 4) * 1.2
        y += filt(noise(L), 'bp', (150, 1600)) * env(nn, 0.001, 0.12, 0, 0.05, 7) * 0.5
        y += filt(noise(L), 'bp', (2000, 7000)) * env(nn, 0.01, 0.2, 0, 0.05, 5) * 0.12  # grass swish
        add(out, reverb(stereo(y, pan=float(np.clip(xs / 14, -0.9, 0.9))), IR_STUDIO, 0.2), tc, g)
    # passing whoosh + startled wings
    wl = 3.0
    wh = filt(noise(wl), 'bp', (250, 3000)) * np.sin(np.linspace(0, np.pi, int(wl * SR))) ** 2 * 0.12
    add(out, stereo(wh, width=0.6), B['dinoPass'] - 1.5)
    rs = np.random.default_rng(5)
    for k in range(40):
        t = B['dinoPass'] - 1.4 + rs.exponential(0.9)
        L = rs.uniform(0.25, 0.6)
        nn = int(L * SR)
        y = filt(noise(L), 'bp', (800, 5000)) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * rs.uniform(14, 24) * np.arange(nn) / SR))) * env(nn, 0.01, L, 0, 0.05, 2)
        add(out, stereo(y * 0.05, pan=rs.uniform(-0.9, 0.9)), t)
    # prehistoric people: grunts (formant synthesis) and plant whacks
    for k in range(26):
        t = B['peopleEnter'] + 0.3 + rs.uniform(0, s1 - B['peopleEnter'] - 0.5)
        L = rs.uniform(0.18, 0.45)
        nn = int(L * SR)
        f0 = rs.uniform(95, 190)
        ph = 2 * np.pi * np.cumsum(f0 * (1 + 0.25 * np.sin(np.linspace(0, 3, nn)) - 0.2 * np.linspace(0, 1, nn))) / SR
        src = (signal_saw(ph) + 0.3 * noise(L)[:nn]) * env(nn, 0.02, L, 0, 0.04, 2)
        vowel = rs.choice([(700, 1200), (600, 1000), (400, 2000), (500, 900)])
        y = filt(src, 'bp', (vowel[0] * 0.7, vowel[0] * 1.3)) + 0.6 * filt(src, 'bp', (vowel[1] * 0.8, vowel[1] * 1.25))
        add(out, reverb(stereo(y * 0.14, pan=rs.uniform(-0.6, 0.6)), IR_STUDIO, 0.2), t)
    t = B['strikeStart']
    while t < s1:
        L = 0.3
        nn = int(L * SR)
        y = filt(noise(L), 'bp', (600, 5000)) * env(nn, 0.001, 0.05, 0, 0.02, 9) * 0.6 + filt(noise(L), 'bp', (2500, 9000)) * env(nn, 0.02, 0.25, 0, 0.03, 3) * 0.2
        add(out, stereo(y * 0.35, pan=rs.uniform(-0.5, 0.5)), t)
        t += rs.uniform(0.12, 0.38)
    return gate(out, s0, s1, 0.3, 0.004)


def signal_saw(ph):
    return ((ph / (2 * np.pi)) % 1.0 * 2 - 1).astype(np.float32)


# ===================================================================  ACT III
def cue_tech():
    """Botanical-modern technology: measured pulse that accelerates per generation."""
    gens = F['gens']
    segs = []
    bpms = [96, 104, 112, 120, 128, 136, 144]
    for i, g in enumerate(gens):
        a = g['t0'] if i else F['musicStart']
        b = gens[i + 1]['t0'] if i + 1 < len(gens) else F['end']
        segs.append((a, b, bpms[i], i))
    prog = [['E2', 'B2', 'G3', 'D4'], ['C2', 'G2', 'E3', 'B3'], ['G2', 'D3', 'B3', 'F#4'], ['D2', 'A2', 'F#3', 'C#4']]
    hats, kicks, rims, bass, mar, glass, pno, pad, shaker = [], [], [], [], [], [], [], [], []
    bar_idx = 0
    for (a, b, bpm, gi) in segs:
        beat = 60 / bpm
        t = a
        while t < b - 1e-3:
            ch = prog[bar_idx % 4]
            for s16 in range(16):
                ts = t + s16 * beat / 4
                if ts >= b:
                    break
                if s16 % 2 == 0:
                    hats.append((ts, 0.05, 42, (22 if gi == 0 else 34) + 10 * (s16 % 4 == 2) + gi * 3))
                if gi >= 3 and s16 % 2 == 1:
                    hats.append((ts, 0.04, 42, 24 + gi * 3))
                if gi == 0 and s16 % 4 == 2:
                    shaker.append((ts, 0.05, 70, 40))
                if gi >= 2 and s16 in (0, 8) or (gi >= 5 and s16 in (6, 14)):
                    kicks.append((ts, 0.1, 36, 70 + gi * 4))
                if gi >= 3 and s16 in (4, 12):
                    rims.append((ts, 0.05, 37, 60))
                if s16 in (0, 3, 6, 10, 14) and (gi >= 1 or s16 in (0, 10)):
                    bass.append((ts, beat * 0.45, m(ch[0]) + (12 if s16 in (6, 14) else 0), 70 if gi else 52))
                if s16 % (2 if gi >= 2 else 4) == 0:
                    arp = [ch[1], ch[2], ch[3], m(ch[2]) + 12]
                    mar.append((ts, beat * 0.4, m(arp[(s16 // 2) % 4]) + 12, 52 + gi * 4))
            glass.append((t, 2.5, m(ch[3]) + 12, 46 + gi * 4))
            if bar_idx % 2 == 0:
                for p in ch[1:]:
                    pno.append((t + beat * 0.5, beat * 1.5, m(p) + 12, 42))
            for p in ch[1:]:
                pad.append((t, 4 * beat * 1.02, p, 30))
            t += 4 * beat
            bar_idx += 1
    st = {
        'hats': render_part(hats, 0, gain=0.45, drum=True), 'kick': render_part(kicks, 0, gain=0.55, drum=True), 'rim': render_part(rims, 0, gain=0.4, drum=True),
        'shaker': render_part(shaker, 0, gain=0.4, drum=True), 'bass': render_part(bass, 38, gain=0.45), 'mar': render_part(mar, 12, gain=0.5),
        'glass': render_part(glass, 98, gain=0.4), 'pno': render_part(pno, 0, gain=0.5), 'pad': render_part(pad, 90, gain=0.4),
    }
    mix = buf(DUR)
    for k, g, wet in [('hats', 0.5, 0.15), ('kick', 0.8, 0.1), ('rim', 0.45, 0.2), ('shaker', 0.5, 0.2), ('bass', 0.7, 0.1), ('mar', 0.7, 0.3), ('glass', 0.5, 0.5), ('pno', 0.55, 0.35), ('pad', 0.45, 0.4)]:
        place(mix, reverb(st[k], IR_STUDIO, wet), 0, g)
    # launch riser + impact, then everything stops at the cut to space
    L = F['launch'] - 126.6
    nn = int(L * SR)
    rise = filt(noise(L), 'hp', 800) * np.linspace(0, 1, nn) ** 3 * 0.35
    rise += sine(lambda x: 200 * 2 ** (x * 2.2 / L), L) * np.linspace(0, 1, nn) ** 2 * 0.12
    add(mix, stereo(rise, width=0.7), 126.6)
    hit = render_part([(0.0, 1.0, 36, 120), (0.0, 1.5, 49, 110), (0.0, 1.5, 57, 90)], 0, gain=0.6, drum=True)
    add(mix, reverb(hit, IR_HALL, 0.4), F['launch'])
    sub = sine(lambda x: 60 * np.exp(-x * 2), 0.8) * env(int(0.8 * SR), 0.003, 0.7, 0, 0.05, 3)
    add(mix, stereo(sub * 0.6), F['launch'])
    fi = np.clip((np.arange(len(mix)) / SR - F['musicStart']) / 3.0, 0, 1)
    mix *= fi[:, None]
    return gate(mix, F['musicStart'], F['end'], 0.01, 0.003)


def sfx_fold():
    out = buf(DUR)
    rs = np.random.default_rng(77)
    for g in F['gens']:
        t0, asm = g['t0'], g['asm']
        N = int(8 + asm * 6)
        for k in range(N):
            t = t0 + asm * (0.1 + 0.85 * (k / N) ** 0.85) + rs.uniform(-0.04, 0.04)
            L = 0.06
            nn = int(L * SR)
            y = filt(noise(L), 'hp', 2500) * env(nn, 0.0005, 0.01, 0, 0.004, 9) + sine(rs.uniform(2500, 5200), L) * env(nn, 0.0005, 0.03, 0, 0.005, 6) * 0.3
            add(out, reverb(stereo(y * 0.25, pan=rs.uniform(-0.6, 0.6)), IR_STUDIO, 0.3), t)
        # magnetic snap when the device completes
        L = 0.2
        nn = int(L * SR)
        y = sine(lambda x: 140 * np.exp(-x * 20) + 60, L) * env(nn, 0.001, 0.12, 0, 0.02, 5) + filt(noise(L), 'bp', (2000, 8000)) * env(nn, 0.0005, 0.02, 0, 0.01, 9) * 0.6
        add(out, reverb(stereo(y * 0.5), IR_STUDIO, 0.25), t0 + asm)
        # disassembly air
        L = 0.9
        wh = filt(noise(L), 'bp', (500, 6000)) * np.sin(np.linspace(0, np.pi, int(L * SR))) ** 2 * 0.06
        add(out, stereo(wh, width=0.8), g['t1'] - 1.0)
    # butterfly flutter crossing the white studio
    a, b = F['butterfly']
    L = b - a
    nn = int(L * SR)
    tt = np.arange(nn) / SR
    flap = (0.5 + 0.5 * np.sin(2 * np.pi * 17 * tt)) ** 4
    y = filt(noise(L), 'bp', (900, 5000)) * flap * 0.12 * np.sin(np.pi * tt / L)
    pan = np.linspace(-0.8, 0.8, nn)
    st = np.stack([y * np.cos((pan + 1) * np.pi / 4), y * np.sin((pan + 1) * np.pi / 4)], 1) * 1.4
    add(out, st, a)
    return gate(out, F['start'], F['end'], 0.01, 0.003)


# ====================================================================  ACT IV
def cue_cosmic():
    """Aspirational original song: pads, strings, choir, sub, bells, sung refrain."""
    bpm = 70.0
    beat = 60 / bpm
    bar = 4 * beat
    E = {'E': ['E2', 'B2', 'G#3', 'B3', 'E4'], 'C#m7': ['C#2', 'G#2', 'E3', 'B3', 'E4'], 'Aadd9': ['A1', 'E2', 'B3', 'C#4', 'E4'], 'Bsus': ['B1', 'F#2', 'E3', 'F#3', 'B3'],
         'B': ['B1', 'F#2', 'D#3', 'F#3', 'B3'], 'E/G#': ['G#1', 'E2', 'B2', 'E3', 'G#3'], 'F#m7': ['F#1', 'C#2', 'A2', 'E3', 'A3'], 'A': ['A1', 'E2', 'C#3', 'E3', 'A3'],
         'B/D#': ['D#2', 'B2', 'F#3', 'B3', 'D#4'], 'G#m': ['G#1', 'D#2', 'B2', 'D#3', 'G#3'], 'C#': ['C#2', 'G#2', 'E#3', 'G#3', 'C#4'],
         'F#': ['F#1', 'C#2', 'A#2', 'C#3', 'F#3'], 'D#m7': ['D#2', 'A#2', 'F#3', 'C#4', 'F#4'], 'Badd9': ['B1', 'F#2', 'C#3', 'D#3', 'F#3'], 'C#sus': ['C#2', 'G#2', 'F#3', 'G#3', 'C#4'],
         'C#/E#': ['E#1', 'C#2', 'G#2', 'C#3', 'E#3'], 'F#add9': ['F#1', 'C#2', 'G#3', 'A#3', 'C#4']}
    plan = [  # (start, chord sequence per bar)
        (131.0, ['E', 'C#m7']),
        (137.86, ['E', 'C#m7', 'Aadd9', 'Bsus', 'A', 'E/G#', 'F#m7', 'B']),
        (C['xt']['orbit'][0], ['E', 'B/D#', 'C#m7', 'A', 'E', 'B/D#']),
        (C['purple'][0] + 0.8, ['A', 'B', 'G#m', 'C#']),
        (C['xt2']['t0'] + 1.0, ['F#', 'D#m7', 'Badd9', 'C#sus']),
        (C['xt2']['openP1'][0], ['Badd9', 'C#']),
        (C['xt2']['orbit'][0], ['F#', 'C#/E#', 'D#m7', 'Badd9', 'F#']),
        (C['xt2']['vpose'][0] - 0.6, ['Badd9', 'C#sus']),
        (C['text1'][0], ['Badd9', 'C#sus']),
        (C['text1'][1] - 0.4, ['F#add9']),
    ]
    pads, strings, choir, bells, sub, tim, pno, brass = [], [], [], [], [], [], [], []
    for i, (ts, seq) in enumerate(plan):
        tend = plan[i + 1][0] if i + 1 < len(plan) else C['end'] - 0.5
        t = ts
        k = 0
        while t < tend - 0.05:
            name = seq[k % len(seq)]
            ch = E[name]
            d = min(bar, tend - t)
            if i == len(plan) - 1:
                d = C['end'] - 0.8 - t
            intensity = [0.35, 0.5, 0.75, 0.6, 0.65, 0.85, 1.05, 0.95, 1.2, 0.6][i]
            for p in ch[1:]:
                pads.append((t, d * 1.03, p, int(34 + 24 * intensity)))
            if i >= 1:
                for p in ch[2:]:
                    strings.append((t, d * 1.02, m(p) + 12, int(30 + 45 * intensity)))
            if i >= 2:
                choir.append((t, d, m(ch[3]) + 12, int(30 + 40 * intensity)))
                choir.append((t, d, m(ch[4]) + 12, int(28 + 40 * intensity)))
            sub.append((t, d, m(ch[0]), int(50 + 40 * intensity)))
            if i in (2, 6, 8):
                tim.append((t, 1.5, m(ch[0]) + 12, int(60 + 40 * intensity)))
                brass.append((t, d, m(ch[2]), int(30 + 30 * intensity)))
            if i in (0, 3, 9) or (i >= 6 and k % 2 == 0):
                for j, p in enumerate(ch[2:]):
                    bells.append((t + j * beat * 0.5, 2.0, m(p) + 24, 40))
            if i in (1, 4, 9):
                for j, p in enumerate([ch[2], ch[3], ch[4], ch[3]]):
                    pno.append((t + j * beat, beat * 1.6, m(p) + 12, 44))
            t += d
            k += 1
            if i == len(plan) - 1:
                break
    st = {
        'pads': reverb(render_part(pads, 89, gain=0.42), IR_SPACE, 0.6),
        'strings': reverb(render_part(strings, 49, gain=0.45), IR_SPACE, 0.5),
        'choir': reverb(render_part(choir, 52, gain=0.4), IR_SPACE, 0.6),
        'bells': reverb(render_part(bells, 9, gain=0.3), IR_SPACE, 0.7),
        'sub': fx(render_part(sub, 38, gain=0.5), pb.LowpassFilter(180)),
        'tim': reverb(render_part(tim, 47, gain=0.5), IR_SPACE, 0.4),
        'pno': reverb(render_part(pno, 0, gain=0.45), IR_SPACE, 0.55),
        'brass': reverb(render_part(brass, 61, gain=0.35), IR_SPACE, 0.5),
    }
    mix = buf(DUR)
    for k, g in [('pads', 0.8), ('strings', 0.75), ('choir', 0.6), ('bells', 0.45), ('sub', 0.55), ('tim', 0.6), ('pno', 0.6), ('brass', 0.35)]:
        place(mix, st[k], 0, g)
    # ---- sung refrain (original lyrics & melody)
    N = lambda s: m(s)
    lines = [
        (138.4, [('beyond', [(N('B3'), .5), (N('E4'), 1)], 0), ('the', [(N('F#4'), .5)], 0), ('night', [(N('G#4'), 1.5)], .5),
                 ('new', [(N('G#4'), .5)], 0), ('horizons', [(N('A4'), .5), (N('G#4'), .5), (N('F#4'), 1)], 0), ('bloom', [(N('E4'), 2.5)], 0)]),
        (146.3, [('through', [(N('B3'), .5)], 0), ('every', [(N('E4'), .5), (N('F#4'), .5)], 0), ('shape', [(N('G#4'), 1.5)], .5),
                 ('a', [(N('G#4'), .5)], 0), ('wider', [(N('B4'), .75), (N('A4'), .25)], 0), ('sky', [(N('G#4'), 1)], 0), ('appears', [(N('F#4'), .5), (N('E4'), 1.5)], 0)]),
        (152.9, [('open', [(N('B4'), .5), (N('C#5'), .5)], 0), ('your', [(N('B4'), .5)], 0), ('wings', [(N('G#4'), 1.5)], .5),
                 ('the', [(N('G#4'), .5)], 0), ('stars', [(N('B4'), 1)], 0), ('are', [(N('A4'), .5)], 0), ('calling', [(N('G#4'), .5), (N('F#4'), .5)], 0), ('you', [(N('E4'), 2.5)], 0)]),
        (165.6, [('unfold', [(N('C#4'), .5), (N('F#4'), 1)], 0), ('the', [(N('G#4'), .5)], 0), ('light', [(N('A#4'), 1.5)], .5),
                 ('unfold', [(N('A#4'), .5), (N('B4'), 1)], 0), ('the', [(N('A#4'), .5)], 0), ('sky', [(N('G#4'), 2.5)], 0)]),
        (176.6, [('open', [(N('C#5'), .5), (N('D#5'), .5)], 0), ('your', [(N('C#5'), .5)], 0), ('wings', [(N('A#4'), 1.5)], .5),
                 ('the', [(N('A#4'), .5)], 0), ('stars', [(N('C#5'), 1)], 0), ('are', [(N('B4'), .5)], 0), ('calling', [(N('A#4'), .5), (N('G#4'), .5)], 0), ('you', [(N('F#4'), 3)], 0)]),
    ]
    voc = buf(DUR)
    dbl = []
    for t0, words in lines:
        for (t, y) in sing_line(words, t0, bpm):
            add(voc, stereo(y, pan=0.0), t, 0.55)
            add(voc, stereo(y, pan=0.0), t + 0.018, 0.25)  # doubled take
        tt = t0
        for w, notes, rest in words:
            for p, bts in notes:
                dbl.append((tt, bts * beat * 1.05, p, 52))
                tt += bts * beat
            tt += rest * beat
    voc = fx(voc, pb.HighpassFilter(160), pb.Compressor(-20, 3, 4, 120), pb.HighShelfFilter(6000, 3), pb.Chorus(rate_hz=0.6, depth=0.12, mix=0.25))
    voc = reverb(voc, IR_SPACE, 0.55, 0.85)
    place(mix, voc, 0, 0.9)
    place(mix, reverb(render_part(dbl, 53, gain=0.42), IR_SPACE, 0.6), 0, 0.5)   # voice oohs double the tune
    # wordless high climax as the words of starlight appear
    climax = [(C['text1'][0] + 0.2, C['text1'][1] - C['text1'][0], N('F#5'), 70), (C['text1'][0] + 0.2, 5.4, N('C#5'), 62)]
    place(mix, reverb(render_part(climax, 52, gain=0.55), IR_SPACE, 0.6), 0, 1.1)
    fi = np.clip((np.arange(len(mix)) / SR - C['songStart']) / 4.0, 0, 1)
    mix *= fi[:, None]
    # final notes decay naturally into silence
    fo = np.clip((C['end'] - np.arange(len(mix)) / SR) / 7.0, 0, 1) ** 1.5
    mix *= fo[:, None]
    return gate(mix, C['songStart'], C['end'], 0.05, 0.05)


def sfx_cosmos():
    out = buf(DUR)
    rs = np.random.default_rng(99)
    def sparkle(a, b, rate, lvl=0.05):
        t = a
        while t < b:
            t += rs.exponential(1 / rate)
            L = rs.uniform(0.2, 0.7)
            nn = int(L * SR)
            y = sine(rs.uniform(2200, 7000), L) * env(nn, 0.002, L, 0, 0.05, 4)
            add(out, reverb(stereo(y * lvl, pan=rs.uniform(-0.9, 0.9)), IR_SPACE, 0.6), t)
    sparkle(C['xt']['t0'], C['xt']['asmEnd'], 6)
    sparkle(C['xt2']['t0'], C['xt2']['asmEnd'], 7)
    sparkle(C['xt']['dissolve'][0], C['xt']['dissolve'][1] + 1, 18, 0.06)
    sparkle(C['purple'][0], C['purple'][1], 4, 0.04)
    for t in [C['xt']['asmEnd'], C['xt2']['asmEnd']]:
        L = 0.4; nn = int(L * SR)
        y = sine(lambda x: 120 * np.exp(-x * 10) + 55, L) * env(nn, 0.001, 0.3, 0, 0.05, 4) + filt(noise(L), 'bp', (3000, 9000)) * env(nn, 0.0005, 0.03, 0, 0.01, 9) * 0.5
        add(out, reverb(stereo(y * 0.45), IR_SPACE, 0.4), t)
    # hinge actions: friction sweep + soft detent click at the end of each fold motion
    for a, b in [C['xt']['open1'], C['xt']['open2'], C['xt2']['openP1'], C['xt2']['openP3']]:
        L = b - a; nn = int(L * SR)
        y = filt(noise(L), 'bp', (1500, 5000)) * np.sin(np.linspace(0, np.pi, nn)) ** 2 * 0.02
        add(out, stereo(y, width=0.5), a)
        L2 = 0.12; n2 = int(L2 * SR)
        c = filt(noise(L2), 'hp', 2500) * env(n2, 0.0005, 0.02, 0, 0.01, 8) + sine(220, L2) * env(n2, 0.001, 0.05, 0, 0.01, 6) * 0.4
        add(out, reverb(stereo(c * 0.3), IR_SPACE, 0.35), b - 0.05)
    # hypernovae: distant soft booms
    for tn in C['novae']:
        L = 3.0; nn = int(L * SR)
        y = sine(lambda x: 38 + 10 * np.exp(-x), L) * env(nn, 0.08, 2.5, 0, 0.3, 2) + filt(noise(L), 'lp', 500) * env(nn, 0.05, 1.5, 0, 0.3, 3) * 0.4
        add(out, reverb(stereo(y * 0.35, width=0.6), IR_SPACE, 0.5), tn)
    # cake: falling slide-whistle, squishy splat, goofy boing
    td, ti = C['cakeDrop'], C['cakeImpact']
    L = ti - td + 0.05; nn = int(L * SR)
    wh = sine(lambda x: 1500 * 2 ** (-x * 2.4 / L), L) * env(nn, 0.03, L, 0.8, 0.02, 1) * 0.08
    add(out, stereo(wh, pan=0.1), td)
    L = 0.6; nn = int(L * SR)
    splat = filt(noise(L), 'bp', (150, 2500)) * env(nn, 0.001, 0.18, 0, 0.05, 6) * 0.6 + sine(lambda x: 90 * np.exp(-x * 6) + 40, L) * env(nn, 0.001, 0.3, 0, 0.05, 5) * 0.8
    squish = filt(noise(0.35), 'bp', (500, 3000)) * env(int(0.35 * SR), 0.02, 0.3, 0, 0.05, 2) * (0.5 + 0.5 * np.sin(2 * np.pi * 31 * np.arange(int(0.35 * SR)) / SR))
    add(out, reverb(stereo(splat), IR_STUDIO, 0.2), ti, 0.7)
    add(out, stereo(squish * 0.25), ti + 0.05)
    L = 0.9; nn = int(L * SR)
    boing = sine(lambda x: 210 + 160 * np.exp(-x * 5) * np.sin(2 * np.pi * 12 * x), L) * env(nn, 0.003, 0.8, 0, 0.1, 3) * 0.22
    add(out, reverb(stereo(boing, pan=0.15), IR_STUDIO, 0.25), ti + 0.12)
    return out


# =====================================================================  MIX
def main():
    print('composing + rendering stems ...')
    stems = {
        'music_manor': cue_manor(),
        'sfx_manor': sfx_manor(),
        'dialogue': dialogue(),
        'tv_static': sfx_interference(),
        'music_botanical': cue_botanical(),
        'sfx_botanical': sfx_botanical(),
        'music_tech': cue_tech(),
        'sfx_fold': sfx_fold(),
        'music_cosmic_vocal': cue_cosmic(),
        'sfx_cosmos': sfx_cosmos(),
    }
    gains = {'music_manor': 1.9, 'sfx_manor': 0.9, 'dialogue': 1.0, 'tv_static': 0.8, 'music_botanical': 0.85, 'sfx_botanical': 0.8,
             'music_tech': 1.15, 'sfx_fold': 0.8, 'music_cosmic_vocal': 0.95, 'sfx_cosmos': 0.8}
    mix = buf(DUR)
    for k, s in stems.items():
        add(mix, s[: len(mix)], 0, gains[k])
        sf.write(os.path.join(OUT, 'stems', f'{k}.wav'), s[: len(mix)], SR, subtype='PCM_16')
        print(' stem', k)
    # silence where the film demands it (exact score stop at the white-out)
    mix = fx(mix, pb.HighpassFilter(28), pb.Compressor(-18, 2.2, 15, 200), pb.Gain(4), pb.Limiter(-2.0, 120))
    mix = mix[: int(DUR * SR)]
    # true-peak safety: soft-knee clip above -3 dBFS, then normalise the peak to -1 dBFS
    th = 10 ** (-3 / 20)
    a = np.abs(mix)
    over = a > th
    mix[over] = np.sign(mix[over]) * (th + (1 - th) * np.tanh((a[over] - th) / (1 - th)))
    mix *= 10 ** (-1 / 20) / (np.abs(mix).max() + 1e-9)
    wav = os.path.join(OUT, 'soundtrack.wav')
    sf.write(wav, mix, SR, subtype='PCM_24')
    m4a = os.path.join(OUT, 'soundtrack.m4a')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'aac', '-b:a', '192k', m4a], check=True)
    peak = float(np.abs(mix).max())
    rms = float(np.sqrt(np.mean(mix ** 2)))
    print(f'done: {wav} peak {20*np.log10(peak+1e-9):.1f} dBFS, rms {20*np.log10(rms+1e-9):.1f} dBFS')


if __name__ == '__main__':
    main()
