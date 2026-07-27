# Steve The PC Repair Man

A single-file, fully self-contained 3D stealth-comedy built with three.js.

**Play it:** open `steve-the-pc-repair-man.html` in any modern browser. Desktop or phone.
No server, no build step, no network — three.js is inlined and *every* asset
(geometry, texture, sound effect, music, character voice) is generated
procedurally at runtime.

## The story
Steve fixes computers for elderly people who'd otherwise get fleeced at the mall.
Steve also fixes other things, for other people, as long as they pay 100% up front.
One Tuesday afternoon a man called "Mr. Thomas" walks in with a briefcase, and the
job turns out to be the same job Steve does all day: swap a CR2032.
It's just that this one's on the 44th floor of a tower in Prague.

## Chapters
1. **The Shop** — free roam, a CMOS repair, Ms. Ellis, Kernel the cat, 16 hidden secrets.
2. **Transit** — night flight, the briefing, the Prague skyline.
3. **Kestrel Tower** — stealth: patrolling guards with vision cones, sweeping cameras,
   a keypad, a sealed server cage, and ninety seconds of work.
4. **Roof / Epilogue** — extraction, and a pie on Thursday.

## Controls
- **Desktop:** WASD move · mouse look · **E** interact · Shift run · C crouch · Space jump/skip · Esc pause
- **Mobile:** left stick to move · drag anywhere to look · USE / RUN / CRCH buttons · tap the chapter label to pause

## Tech
- Procedural canvas textures (carpet, drywall, PCB, marble, CRT screens, posters, city windows)
- Custom capsule-vs-AABB physics with collide-and-slide, step assist, head bob and footstep noise
- Web Audio synthesis for all SFX plus an adaptive four-layer score that shifts with tension
- Browser speech synthesis with per-character pitch/rate profiles, subtitles, and a tone fallback
- Cinematic director: keyframed and procedural camera moves, letterbox, dialogue sequencing, skip
- Quality toggle that culls optional lights, geometry and screen redraws for phones
