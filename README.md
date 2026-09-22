# The Pore That May Not Exist

A single-file, self-contained generative film system: **7 minutes 54 seconds** of
procedurally computed, physics-driven 3D cinema about the **mitochondrial
permeability transition pore** and cardiac ischemia–reperfusion injury.

**`film/MITOCHONDRIAL_TRANSITION.html`** — open it in Chrome, Edge or Firefox 115+.
No build step, no dependencies, no network. Everything you see and hear is
computed at run time.

---

## Why this problem

The mPTP is one of the last great *unidentified* objects in cell biology. It has
been characterised in exquisite electrophysiological detail — a ~1.3 nS,
Ca²⁺-triggered, cyclosporin-A-sensitive megachannel in the inner mitochondrial
membrane — and yet nobody can say what it is made of. The two leading
candidates, the c-ring lumen of ATP synthase and the adenine nucleotide
translocase, each survive their own genetic ablation. The film takes that
unresolvedness as its central image rather than hiding it: in Act XIII a single
electron-density volume holds both candidate structures at once and refuses to
collapse into either.

## What actually runs underneath the picture

| Layer | What it is |
|---|---|
| **17-state ODE** | Ischemia–reperfusion at one mitochondrion: ETC flux with protonmotive back-pressure, bidirectional ATP synthase, succinate accumulation driving reverse electron transport, MICU-gated MCU Ca²⁺ flux, RIRR autocatalysis, a redox latch on the pore, osmotic swelling and rupture. RK4 at 20 Hz. It **self-equilibrates** for 120 virtual seconds before frame 0, so the resting state is the model's own fixed point, not a typed-in number. |
| **GPU excitable medium** | A Barkley-type reaction–diffusion field on a 512² lattice: `∂u/∂t = D∇²u + u(1−u)(u−(v+b)/a)/ε`, with the excitation threshold lowered by matrix Ca²⁺ and by pore fraction. Its spiral waves *are* the depolarisation wavefront in Act XII. |
| **Electron-density volume** | ~26 000 atoms generated from real α-helical geometry (1.50 Å rise, 100°/residue, 2.30 Å Cα radius) and splatted into a 96³ RGBA volume: Gaussian density for candidate A, for candidate B, lipid occupancy, and a Debye–Hückel screened potential (κ⁻¹ = 0.78 nm at 150 mM). The molecular acts raymarch that volume directly. |
| **GPGPU particles** | Ions, metabolites and cytochrome c with Stokes–Einstein mobilities and a Nernst–Planck drift term in the simulated potential field. |
| **Procedural score** | Pitch material is sonified infrared wavenumbers (amide I 1652 cm⁻¹ → 413 Hz at 0.25 Hz/cm⁻¹); harmony is `frac(log₁₀ k)` of seven enzyme turnover numbers; rhythm is the myocyte's own sinus rhythm, which fibrillates the instant the pore opens. |

Change a rate constant and the film changes. The acts do not decide that the
pore opens — they only decide where the camera is when it does.

**One deliberate distortion, declared.** The model is stiff across reperfusion:
once superoxide crosses the RIRR threshold the cascade finishes in under half a
minute of biological time. True of the tissue, unwatchable as cinema. So between
2:10 and 3:44 the film's clock runs at 0.38× while the ODE runs on unchanged —
the camera walks more slowly along the same trajectory. Nothing is re-scaled or
faked, and every number on screen is the model's own value at that point. It is
one function, `Science.warpRate(t)`.

## The eighteen acts

`I DESCENT · II THE PROTON FLUID · III THE PORE THAT MAY NOT EXIST · IV ISCHEMIA
· V ACIDOSIS, A PROTECTIVE POISON · VI REPERFUSION · VII THE CALCIUM DOOR ·
VIII ROS-INDUCED ROS RELEASE · IX THE TRANSITION · X COLLAPSE, THE MEMBRANE
REMEMBERS · XI RUPTURE · XII THE WAVEFRONT · XIII THE UNRESOLVED ·
XIV–XVI THREE INTERVENTIONS · XVII THE FRONT DIES · XVIII HYSTERESIS`

## Performance

Per frame the film runs a 512² reaction–diffusion step, a 256² pressure-projected
fluid step, a 256² GPGPU particle integration, a full-screen raymarch of two
blended scale archetypes (each surface sample costs a normal, an ambient
occlusion and a soft shadow), a volumetric integration, a five-level bloom and a
feedback-warped grade. It wants a discrete GPU. Start at `?q=med`, and use `1`–`4`
to move between presets — they trade march steps, render scale, particle count
and pressure iterations. Under a software rasteriser it will run, slowly; the
simulation is clocked on film time rather than frame time, so a slow machine
shows you the same film, just at fewer frames per second.

## Controls

```
space  play / pause        [ ]   previous / next act      , .  ±5 s
r      restart             h     toggle HUD               f    fullscreen
1-4    quality low→ultra   m     mute
c      realtime capture (webm with sound)
x      offline deterministic render (WebCodecs VP9 + 48 kHz WAV)
```

## Rendering the finished film

```
MITOCHONDRIAL_TRANSITION.html?q=ultra&w=3840&h=1608&fps=24&mb=8&render=1
```

Press BEGIN once (the browser will not start an AudioContext without a
gesture) and the render starts by itself; or press `x` at any time. The score
is rendered first, through an `OfflineAudioContext` in one pass — that takes a
few minutes with no progress bar, then the frames begin.

Each output frame is the average of `mb` sub-frames, which gives true
rotary-shutter motion blur and resolves the stochastic depth-of-field sampling
at the same time. You get `the_pore_0000-0474_3840x1608.webm` (VP9) and
`the_pore_score_48k.wav`. Mux them:

```sh
ffmpeg -i the_pore_0000-0474_3840x1608.webm -i the_pore_score_48k.wav \
       -map 0:v -map 1:a -c:v libx264 -crf 14 -preset veryslow \
       -pix_fmt yuv420p -c:a aac -b:a 320k THE_PORE_THAT_MAY_NOT_EXIST.mp4
```

For a render farm, open N tabs with disjoint `&start=/&end=` ranges (each warms
the simulation for `&warm=` seconds first) and `ffmpeg -f concat` the results.
Requires WebGL2 with `EXT_color_buffer_float`, and WebCodecs for the offline
path; the realtime capture (`c`) works anywhere `MediaRecorder` does.
