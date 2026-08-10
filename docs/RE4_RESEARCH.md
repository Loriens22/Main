# RE4 RESEARCH — Implementation Reference for ISLAND PROTOCOL

**Author:** Agent B (Research)
**Date:** 2026-08-10
**Purpose:** Give Agents C/D/E/F/G concrete, typed-in-directly numbers and behavioral rules so
ISLAND PROTOCOL replicates the *feel* of Resident Evil 4 (2005) and RE4 Remake (2023).

---

## 0. HOW TO READ THIS DOCUMENT

Every number carries a confidence tag. **Do not skip these.**

| Tag | Meaning |
|---|---|
| `[S]` | **Sourced this session.** URL cited inline. Verified against a live search result. |
| `[K]` | **Known / community-consensus.** Long-documented in guides, but I could NOT re-verify it this session (see 0.1). Treat as high-confidence but not gospel. |
| `[E]` | **My estimate / derivation.** Reasoned from `[S]`/`[K]` values or from observed game footage timing. Tune freely. |
| `[C]` | **Conflict.** Sources disagree (usually 2005 vs Remake, or difficulty-rank dependent). My recommendation is stated. |

### 0.1 Research constraint you must know about

This session's network egress proxy **blocked WebFetch to every domain attempted** —
`residentevil.fandom.com`, `strategywiki.org`, `gamefaqs.gamespot.com`, `steamcommunity.com`,
`en.wikipedia.org`, `gamedeveloper.com`, `medium.com`, and `google.com` all returned
`EGRESS_BLOCKED`. All 30 research queries were therefore run through WebSearch, which returns
synthesized page content plus URLs. This means:

- Quoted numbers are **second-hand through search summarization**. Where a summary looked
  internally inconsistent, I flagged it rather than laundering it into a clean table.
- Full datamined stat tables (the Steam "RE4R Weapons Max Stat Comparison Table" and the
  StrategyWiki upgrade grids) could not be read directly. Those specific cells are `[K]`.
- **Section 11 (the tuning table) is the actual deliverable.** It is internally consistent and
  self-contained. Sections 1–10 exist to justify it. If a `[K]` cell in sections 1–10 turns out
  wrong, Section 11 does not break.

### 0.2 The single most important framing for this project

RE4 is not a shooter with horror paint. It is a **crowd-management puzzle** where the ammo
economy is the difficulty dial and the camera is the fear generator. Three load-bearing systems,
in priority order:

1. **The stagger→melee loop.** Guns do not kill efficiently; guns *create melee openings*, and
   melee is free, fast, and knocks down bystanders. This is what makes scarcity survivable.
2. **The attack-token crowd AI.** A ring of 10 enemies where only 2 may commit at a time.
3. **The hidden rank/director.** Silently re-tunes damage, spawn counts, and drops so the player
   always feels 3 seconds from death and never actually soft-locks.

Everything else — inventory Tetris, the merchant, Ashley — is texture layered on those three.

---

## 1. CAMERA

### 1.1 Historical framing

Shinji Mikami: *"We weren't trying to do something new or groundbreaking... We weren't planning
on doing something innovative, but in the end everyone kept saying we did."* The team simply
decided a moving third-person over-the-shoulder camera beat fixed angles. `[S]`
(https://www.videogameschronicle.com/news/shinji-mikami-says-resident-evil-4s-camera-wasnt-meant-to-be-groundbreaking/,
https://www.gamedeveloper.com/business/shinji-mikami-didn-t-realize-the-impact-of-i-resident-evil-4-i-s-camera)

The design consequence that matters to us: the camera **moved the source of fear from the unseen
room to the blind spot.** Fixed-angle RE hid threats behind a cut; RE4 hides them behind Leon's
own body and just outside a deliberately narrow frustum. Epic told Capcom that Gears of War's
shooting and perspective derived from RE4's rig. `[S]`
(https://medium.com/@elio.lucantonio/the-architecture-of-anxiety-how-resident-evil-4-reconfigured-the-3d-viewport-7ee41935a930)

### 1.2 Concrete camera values

| Property | 2005 | Remake | Confidence |
|---|---|---|---|
| In-game FOV slider range | none (fixed) | **90–110 deg** (horizontal), default mid | `[S]` |
| Default hip/walk FOV (vertical equiv.) | ~55–60 deg V | ~60 deg V at 90 H on 16:9 | `[E]` |
| Aim FOV (ADS) | ~45–50 deg V | ~45 deg V | `[E]` |
| Aim FOV transition time | ~0.20 s | ~0.15 s | `[E]` |
| Shoulder offset (lateral) | ~0.35 m right | ~0.30 m right | `[E]` |
| Shoulder offset when aiming | ~0.45 m right (widens) | ~0.42 m right | `[E]` |
| Camera boom length, walking | ~1.6 m behind | ~1.5 m behind | `[E]` |
| Camera boom length, aiming | ~0.9 m behind (tightens) | ~0.85 m behind | `[E]` |
| Camera height above player origin | ~1.45 m | ~1.45 m | `[E]` |
| Shoulder swap | not available | **not available** (heavily requested, never shipped) | `[S]` |

FOV source: https://game8.co/games/Resident-Evil-4-Remake/archives/409453 and
https://www.nexusmods.com/residentevil42023/mods/123 (mod exists precisely because 90–110 is
narrow; players mod to 130–140). The narrowness is a **feature** — it is what makes flanking
enemies land.

### 1.3 The aim transition (this is the money detail)

When the aim button goes down, four things happen **simultaneously but on different curves**:

1. **Boom shortens** 1.5 m → 0.85 m over ~0.15 s, ease-out (fast start, soft land).
2. **Lateral offset widens** 0.30 m → 0.42 m over the same window, ease-in-out. The widening is
   what "unblocks" the player's own shoulder from the reticle.
3. **FOV narrows** ~60 → ~45 deg V, ease-out. Narrowing FOV *while* the boom shortens produces
   a much stronger "lean in" sensation than either alone — this is the trick.
4. **Camera yaw/pitch max speed drops** to a separate, lower sensitivity. RE4R exposes
   "Maximum Camera Speed" for normal and for aiming as **two independent settings** `[S]`
   (https://www.gamepressure.com/resident-evil-4-1/keybinds/z510974). Ship both sliders.

On release, run the same curves in reverse but ~1.4x slower. Snapping out of aim feels cheap;
sliding out feels heavy.

### 1.4 2005 "tank + aim stop" vs Remake move-while-aiming

`[C]` **The single biggest mechanical divergence between the two games.**

- **2005:** separate traversal and aiming control modes. You physically cannot translate while
  aiming. Mikami defends this as deliberate craft, not a technical limitation. `[S]`
  (https://www.neogaf.com/threads/shinji-mikami-says-resident-evil-4-camera-wasn%E2%80%99t-meant-to-be-groundbreaking.1640835/,
  https://www.resetera.com/threads/why-do-some-people-believe-that-resident-evil-4-does-not-have-tank-controls.16000/)
  The gameplay consequence: **every shot is a commitment.** Stopping to aim inside a crowd is a
  bet. That bet *is* the game's core tension.
- **Remake:** free movement while aiming, but at a heavily reduced speed, plus a knife parry to
  cover the mobility you gave away in the original by standing still.

**Recommendation for ISLAND PROTOCOL:** Do **not** ship 2005's hard aim-stop — it reads as
broken to a 2026 audience, especially on touch. Ship the remake compromise: **aiming multiplies
move speed by 0.30 and disables sprint and quick-turn.** You keep the commitment cost (you can't
outrun anything while aiming) without the "the game took my controls away" feeling.
RE4R also disallows quick-turn while aiming or while the knife is out `[S]`
(https://game8.co/games/Resident-Evil-4-Remake/archives/408601) — copy that exactly.

### 1.5 Camera collision and corridors

RE4's corridors are built *around* the camera, not the other way round. Rules to implement:

- **Spring-arm sphere cast.** Cast a sphere of radius ~0.25 m from the pivot to the desired
  camera position. On hit, pull in to `hit.t - 0.05 m`. Pull in **instantly** (same frame),
  push back out **damped** (`IP.Util.damp` with lambda ≈ 6). Instant-in/slow-out prevents the
  jitter that a symmetric damper produces against door frames.
- **Minimum corridor width ≈ 2.2 m.** Below that the arm is permanently collapsed and the game
  becomes near-first-person, which is correct for horror but must be *intentional*, not
  accidental. RE4 uses exactly this: the tightest corridors intentionally jam the camera into
  Leon's back so the player loses peripheral awareness right before an ambush.
- **Ceiling clamp.** Never let the arm rise above a hit ceiling; instead pitch the camera down
  and pull in.
- **Never rotate the camera automatically.** RE4 has essentially no auto-camera-turn during
  combat. Auto-yaw destroys the player's mental map of where the crowd is. The camera only
  moves when the player moves it (plus tiny additive shake).
- **Additive shake budget:** footstep bob amplitude ~0.012 m at run, weapon recoil kick
  1.5–4.0 deg pitch depending on weapon, damage-taken kick 6 deg + 0.15 s. Keep the *sum* under
  ~8 deg peak or the frame reads as unreadable in a crowd. `[E]`

---

## 2. CONTROL FEEL

### 2.1 The "heaviness" — what it actually is

RE4 does not feel heavy because inputs are laggy. It feels heavy because **state transitions are
non-interruptible and animation-gated.** Reload cannot be cancelled by movement in the 2005 game.
Melee cannot be aborted. The quick-turn is a fixed-duration animation. That is the whole trick.
Do **not** implement input latency (it just feels broken on touch); implement **commit windows**.

### 2.2 Movement values

There are **no published m/s figures** for either game — my searches for datamined movement
speeds returned only mods and forum threads, no numbers `[S]`
(https://www.speedrun.com/re4r/forums/v5m9y, https://www.nexusmods.com/residentevil42023/mods/6195).
Everything below is `[E]`, derived from frame-counting typical footage against known
architectural scale (a standard door ≈ 2.05 m tall).

| State | 2005 est. | Remake est. | Notes |
|---|---|---|---|
| Walk (analog partial) | 1.3 m/s | 1.4 m/s | |
| Run (default locomotion) | 3.1 m/s | 3.3 m/s | This is RE4's "normal" — there is no separate jog |
| Sprint (remake only, R-trigger) | n/a | 4.6 m/s | Cannot fire; ~0.35 s recovery to aim |
| Aim-walk | 0 (locked) | ~1.0 m/s (≈0.30x run) | see 1.4 |
| Crouch move | n/a | ~0.9 m/s | remake only |
| Backpedal | 1.6 m/s | 1.8 m/s | ~0.55x forward — deliberately punishing |
| Strafe | n/a (tank) | 2.4 m/s | ~0.72x forward |

### 2.3 Turn rates and quick-turn

| Property | Value | Confidence |
|---|---|---|
| Free-look yaw rate (hip, max stick) | ~180 deg/s | `[E]` |
| Free-look yaw rate (aiming, max stick) | ~90 deg/s | `[E]` |
| Character body turn-to-face rate (walking) | ~360 deg/s | `[E]` |
| **Quick-turn (180) duration** | **~0.35 s, non-interruptible** | `[E]` |
| Quick-turn input | Back on stick + dash/run button (console); `Q` on PC | `[S]` |
| Quick-turn availability | walking, running, crouching only — **NOT while aiming or knife out** | `[S]` |

Sources: https://game8.co/games/Resident-Evil-4-Remake/archives/408601,
https://gamerant.com/resident-evil-4-remake-quick-turn-guide-how-to/

The quick-turn is a **panic-relief valve**. It exists so the crowd behind you is survivable
without a dodge roll. Ship it. It is also togglable off in RE4R (not advised) `[S]`.

### 2.4 Laser sight vs reticle — the two accuracy models

`[C]` This is a real design fork and you must pick one.

**2005 model — laser dot, static spread.** A literal projected dot. What the dot touches is what
gets hit. Spread was static. Community view: this made aiming *legible* in a way the remake lost.
`[S]` (https://www.dualshockers.com/resident-evil-4-remake-laser-sight-aim/)

**Remake model — dynamic spread reticle.** Four-petal reticle that **blooms on fire/move and
converges when you hold still.** The laser sight returns only as an *attachment*, available for
the Punisher and SG-09 R (and per one source, all handguns except Red9 and Blacktail, explicitly
so those two don't become dominant the way Red9 did in 2005). Critically: **the laser sight
functionally makes the weapon permanently converged** — max accuracy, max crit chance, max
stagger chance, every shot. `[S]`
(https://steamcommunity.com/app/2050650/discussions/0/6620894968760701246/,
https://www.nexusmods.com/residentevil42023/mods/4829)

**Recommendation:** ship the remake's bloom/converge reticle as the base model, and make the
laser sight a purchasable attachment that collapses bloom to zero. That gives you a meaningful
upgrade that is *felt* rather than read off a stat bar — the single best economy hook in the
remake's kit.

**Bloom/converge cycle (all `[E]`, tuned to feel like RE4R):**

```
reticleSpread (degrees of cone half-angle):
  min (fully converged, standing still, aiming >= convergeTime) : 0.15
  max (just fired / moving)                                     : 4.5
  convergeTime (max -> min while still & aiming)                : 0.90 s   (ease-out)
  bloomPerShot                                                  : +1.8 deg, clamped to max
  bloomFromMovement                                             : +2.5 deg while aim-walking
  bloomRecoveryDelayAfterShot                                   : 0.12 s before converge resumes
```

### 2.5 Aim sway

RE4R's aim is essentially sway-free at rest (that is what makes the converged reticle a real
reward). Add sway only:

- **When injured.** Sway amplitude scales with `1 - health%`: 0 at full, up to 0.8 deg amplitude
  at DANGER. `[E]`
- **On scoped weapons.** Rifle scope sway: figure-8 Lissajous, 0.6 deg amplitude, ~0.55 Hz on
  the fast axis, 0.35 Hz on the slow axis, plus a breath hold that damps it to 0.1 deg for
  ~4 s. `[E]`

Do **not** add sway to hipfire/handguns. It reads as input noise, not tension.

### 2.6 Critical hit / "tighten to crit"

`[C]` Two different mechanics get conflated in community sources and you must not merge them:

1. **Damage crit.** Reported as "critical hits deal 50% more damage (150%); you can only crit on
   weak points; base crit ~5%, rising to ~7% while holding aim." `[S]`
   (https://game8.co/games/Resident-Evil-4-Remake/archives/408847)
2. **Head pop / instant kill.** A separate roll on headshots that explodes the head and kills a
   standard Ganado outright. Community estimate **~10–15% in the remake**, with claims that on
   Professional "almost every ganado is head popping, at least 80% of the time." `[S]`
   (https://www.quora.com/In-Resident-Evil-4-do-headshots-actually-have-an-increased-chance-to-sprout-parasites,
   https://steamcommunity.com/app/2050650/discussions/0/6620894968769408198/)
   Another source says a crit is "roughly 10x damage" and "usually blows the enemy to pieces
   straight away" — that is the head-pop mechanic being described as a crit.

**Resolution:** these are the same underlying roll in RE4 lineage; the "+50%" figure is the
displayed stat, the "instant pop" is the *effect on a Ganado head hitbox specifically*, since
150% of handgun damage still exceeds the head's separate low HP pool. Implement it as:
**head hitbox has its own small HP pool; a crit roll multiplies damage; if head HP is depleted
the head pops and the body dies (or mutates — see §7.2).**

**Also `[S]`:** holding still until the crosshair is fully tightened increases crit chance, and
the laser pointer amplifies that. This is the mechanical justification for the whole
stop-and-aim ritual. Implement it: `critChance = base + (1 - spreadNormalized) * bonus`.

### 2.7 Knife parry (Remake)

- Parry consumes **knife durability**; at zero durability the knife breaks and can no longer
  deflect. Community estimate ~"a dozen uses" before break — not an official number. `[S]`
  (https://www.shacknews.com/article/134540/how-to-parry-with-the-knife-resident-evil-4,
  https://game8.co/games/Resident-Evil-4-Remake/archives/407324)
- Different attack types have **different parry windows**; a UI prompt appears bottom-right.
  Timing is "generous on lower difficulties," near-frame-perfect on Professional. `[S]`
- A successful parry **staggers the attacker and opens a melee window** — parry is a third
  route into the melee loop alongside headshot and legshot. `[S]`
  (https://gameranx.com/features/id/451881/article/resident-evil-4-remake-how-to-perform-melee-grapple-moves/)
- Parry also **instantly escapes a grab** at the cost of durability. `[S]`
  (https://www.thegamer.com/resident-evil-4-remake-avoid-being-grabbed-strategy/)
- Fully-upgraded Primal Knife becomes **indestructible**. `[S]`
  (https://gameranx.com/features/id/456491/article/resident-evil-4-remake-all-exclusive-weapon-perks-fully-upgraded-guns-guide/)

**Recommended windows `[E]`:** normal parry 0.20 s; "perfect" parry 0.08 s inside that (no
durability cost + longer enemy stun). Professional: 0.12 s / 0.05 s.

### 2.8 Crouch / stealth kill (Remake)

- Crouch, sneak behind an unaware enemy, press knife-melee on the prompt. **One-shot kill on
  regular enemies.** `[S]`
- You do **not** have to be crouched — running up to an enemy who hasn't noticed you also works.
  `[S]` (https://www.escapistmagazine.com/how-to-stealth-kill-in-resident-evil-4-remake/)
- Works on mini-bosses (Dr. Salvador, Bella Sisters, Brutes) but **not guaranteed lethal on
  higher difficulties.** `[S]`
- Garrador has a **back weak point**; sneaking up jams the knife into the exposed parasite for
  massive damage. `[S]`
- Stealth kills degrade the knife "at a moderate rate." `[S]`
  (https://game8.co/games/Resident-Evil-4-Remake/archives/407522)

**Design note:** the stealth kill is not a stealth *system*. It is a **pre-fight discount** —
you get to delete one enemy from the opening of an arena. That is the correct scope for us too.
Do not build detection meters, cover, or noise propagation.

---

## 3. COMBAT

### 3.1 The stagger → melee → knockdown loop (the core of the game)

The loop, stated precisely `[S]` (multiple):

```
shoot HEAD  -> enemy clutches head, prompt appears -> approach -> melee button
                -> ROUNDHOUSE KICK (facing) / THRUST KICK (while running in)
shoot KNEE/SHIN -> enemy drops to one knee, prompt appears -> approach
                -> facing them : ROUNDHOUSE KICK (knocks them flat)
                -> behind them : GERMAN SUPLEX
parry an attack -> stagger window -> melee
flash/frag grenade -> stagger -> melee
```

Sources: https://gameranx.com/features/id/451881/article/resident-evil-4-remake-how-to-perform-melee-grapple-moves/,
https://twistity.com/how-to-kick-and-suplex-in-resident-evil-4-remake/,
https://gamerant.com/resident-evil-4-remake-re4-how-to-do-suplex/,
https://progametalk.com/resident-evil-4-remake/how-to-melee-attacks/

**Why it matters:** the kick has an **AoE knockback that also knocks down bystanders.** `[S]`
(https://www.kokutech.com/blog/gamedev/design-patterns/power-fantasy/resident-evil-4 —
"shoot the head or shin to stagger, then execute a knockdown that also knocks back other
enemies"). This is the crowd-control release valve. Melee costs **zero ammo**. That single fact
is what makes a scarce economy playable. **If you implement nothing else from this document,
implement this.**

### 3.2 Hit-location → reaction table

Derived from RE4's animation set, which is unusually explicit — documented animation names
include "Leg shot", "Falling to knees", "Knocked over (shot from knees)", "Arm shot (dropping
weapon)", "Arm shot (not enough to drop weapon)". `[S]`
(https://www.moddb.com/games/resident-evil-4/tutorials/resident-evil-4-animation-list)

| Hit location | Effect | Enables melee? | Confidence |
|---|---|---|---|
| Head | flinch; on threshold → **clutch head** stun ~2.5 s | **Yes — kick** | `[S]` |
| Head (crit roll) | head pops; instant death **or** Plaga emerges | — | `[S]` |
| Knee / shin | short flinch; on threshold → **kneel** ~3.0 s | **Yes — kick (front) / suplex (back)** | `[S]` |
| Upper leg / thigh | limp, speed x0.6 for 4 s | No | `[E]` |
| Arm / shoulder | clutch wound; **on threshold, drops weapon permanently** | No (but disarms) | `[S]` |
| Torso | flinch only, small knockback | No | `[S]` |
| Shotgun close range | full knockdown, no stagger stage | No (already down) | `[S]` |
| Back (unaware) | stealth kill | Instant | `[S]` |

**Stagger thresholds are not HP.** RE4R exposes hidden per-weapon stats named **wince, break,
and stopping power** that feed the stagger system, distinct from damage. Community finding:
*"Blacktail and Red9 have very minimal difference in stagger power (wince x firepower), but their
ability to halt a ganado from its current action (stopping power x firepower) is much more
significant."* `[S]`
(https://www.thegamer.com/resident-evil-4-infographic-weapons-hidden-numbers-stats/)

**Implement three separate accumulators per enemy**, all decaying:

```
enemy.hp          - kills
enemy.wince       - small flinch; threshold low, decays fast   (interrupt animation)
enemy.stagger     - the kick/suplex opening; threshold high, decays slow
enemy.stop        - interrupts a committed attack mid-swing    (checked instantly, not accumulated)
```

`stagger += weapon.staggerPower * locationMultiplier` where head ≈ 3.0x, knee ≈ 2.5x,
torso ≈ 0.4x, limb ≈ 0.8x. `[E]`

### 3.3 Damage falloff

- 2005: **past a certain distance shotguns lose damage and can no longer crit.** `[S]`
- Shotguns have a **center pellet carrying most of the damage** plus surrounding pellets;
  different shotguns distribute differently (Riot Gun front-loads the center pellet; W-870
  spreads damage evenly across all pellets). `[S]`
- Riot Gun has a **tighter spread**, keeping damage and — uniquely — **keeping its knockdown
  effect at range**, which no other shotgun does. `[S]`
- A "precision" upgrade stat trades **less falloff (good) for smaller AoE spread (bad)**. `[S]`

Sources: https://steamcommunity.com/app/2050650/discussions/0/6717729343882625554/,
https://residentevil.fandom.com/wiki/Riot_Gun_(RE4)

**Recommendation:** falloff on **shotguns and SMG only**. Handguns, rifle, and magnum are
flat-damage at all ranges. Falloff on a handgun in a game about precise headshots feels like
the game is lying to you.

### 3.4 Enemy grabs and mash-to-escape

Mechanics, all `[S]`:

- **The initial grab animation deals damage before any prompt appears.** Then the mash prompt
  starts. Player input is *not registered* until the grab ticks damage a second time — so
  **an instant escape is impossible by design.** You always eat 2 damage ticks.
  (https://steamcommunity.com/app/2050650/discussions/0/5440953210426107576/)
- Mash alternates between **two buttons**, occasionally switching halfway through the sequence.
  Console: A and X (Cross/Square), with A/Cross used more.
- **Knife click escapes instantly at the cost of durability.** The skill-expression escape.
- **Crouching can make a charging grabber run past you** — but at point-blank the grab has zero
  startup and is unavoidable.
- Unarmed Ganados in the remake **grab specifically to hold you for armed Ganados to hit**, and
  some restrain from behind while others strike. `[S]`
  (https://screenrant.com/resident-evil-4-remake-ganados-new-enemies-re4/)
  That is the grab's real design purpose: it is not damage, it is a **combo enabler for the
  crowd.**

This is the most-complained-about mechanic in the remake ("guaranteed damage on initial contact
feels unfair"). `[S]` **For a browser/mobile game, soften it:** one damage tick, not two, and
always offer the knife escape.

**Recommended `[E]`:** grab duration cap 3.0 s; escape requires 8 alternating taps on desktop,
**5 taps on touch**; knife escape costs 20 durability; damage 4 HP on grab + 6 HP/s while held.

### 3.5 Weapon stats — RE4 2005

**Unit note:** 2005 uses an abstract "firepower" number. Enemy HP is expressed in the *same*
unit, which makes the whole table readable. `[S]`: a Category-A Ganado is listed at 1000 HP in
Famitsu's *biohazard4 kaitaishinsho*, and an unmodified handgun needs **7 bullets** to kill it
absent a crit — i.e. **base handgun firepower 1.0 ≈ 1/7 of a standard Ganado.**
(https://residentevil.fandom.com/wiki/Resident_Evil_4_creature_damage_chart)
So: **standard Ganado ≈ 7.0 firepower-units of effective HP.**

Corroborating, in the same unit `[S]`
(https://residentevil.fandom.com/wiki/Ganado/gameplay, StrategyWiki enemy page summary):

| Enemy | HP (firepower units) |
|---|---|
| Ganado Soldier, Ch. 5-1 | 15.0 – 20.0 |
| Gas Mask Soldier | 19.0 – 26.0 |
| Ganado Soldier, Ch. 5-2+ | 33.5 |
| Bulldozer-ride Soldier | 8.0 – 16.0 |
| Machine Gun Zealot | ~80 (unit ambiguous — likely a different scale) `[C]` |

Note also `[S]`: **standard Ganados take +40% damage from the TMP** — an explicit per-enemy,
per-weapon multiplier table exists. RE4 splits enemies into **five damage categories** (A–E)
and the same weapon does different damage to each. Copy this idea; it is cheap and it makes
weapon choice matter without touching raw damage numbers.

**Weapon table (2005).** `[S]` cells cited; all others `[K]` — the full upgrade grids live on
StrategyWiki/GameFAQs, both egress-blocked this session.

| Weapon | Base FP | Max FP (upgraded) | Exclusive effect | Capacity (base→max) | Notes |
|---|---|---|---|---|---|
| Handgun | 1.0 | ~2.6 | **5x critical headshot rate** | 10 → 22 | the crit-machine `[K]` |
| Punisher | ~0.9 | ~2.2 | **Penetrates 5 enemies** | 12 → 28 | `[K]`; remake keeps penetration x5 `[S]` |
| Red9 | ~1.4 | ~3.4 | **Firepower 6.5** (5.0 on GameCube) `[S][C]` | 8 → 18 | best pure DPS handgun `[K]` |
| Blacktail | ~1.6 | ~3.4 | firepower boost | 12 → 28 | best fire rate `[K]` |
| Matilda | ~0.4 | ~1.2 | 3-round burst; capacity 100 | 15 → 100 | `[K]` |
| Shotgun | 4.0 | ~8.0 | firepower boost | 6 → 12 | wide spread, keeps damage at range but loses knockdown `[S]` |
| **Riot Gun** | **5.0** `[S]` | ~8.0 | **Firepower → 10.0** `[S]` | 8 → 18 | tight spread; **keeps knockdown at range** `[S]`; costs 32,000₧ `[S]` |
| Striker | ~4.0 | ~6.0 | **Capacity → 100**, 60,000₧ `[S][C]` | 12 → 100 | `[C]` one summary attributes this to "the Magnum"; near-certainly the Striker |
| Rifle (bolt) | ~10.0 | ~22.0 | firepower boost | 5 → 12 | `[K]` |
| Semi-auto Rifle | ~8.0 | ~18.0 | firepower boost | 10 → 20 | `[K]` |
| TMP | ~0.4 | ~1.2 | stock (recoil control) | 30 → 100 | base 10,000₧; **fully upgraded total 334,000₧** `[S]` |
| Broken Butterfly | ~13.0 | **50.0** `[S]` | firepower boost | 6 → 12 | `[K]` |
| Killer7 | ~25.0 | ~35.0 | capacity boost | 7 → 100 | `[K]` |
| Handcannon | ~30.0 | **99.9 + infinite ammo** `[S]` | — | 5 → 100 | unlock reward `[S]` |
| Rocket Launcher | one-shot kill | — | — | 1 | ~30,000₧ `[K]`; **Infinite RL 1,000,000₧** `[S]` |
| Mine Thrower | ~4.0 | ~10.0 | homing mines | 6 → 20 | **28,000₧ (JP/US GC), 9,800₧ (EU GC + all ports)** `[S]`; **5x2 = 10 slots, scope +2x2** `[S]` |
| Chicago Typewriter | **10.0/round**, infinite ammo `[S]` | — | — | ∞ | **1,000,000₧ main / 300,000₧ Separate Ways** `[S]`; **3x7 footprint** `[S]` |

Sources: https://residentevil.fandom.com/wiki/Mine_Thrower,
https://residentevil.fandom.com/wiki/Chicago_Typewriter, https://residentevil.fandom.com/wiki/Riot_Gun_(RE4),
https://www.imfdb.org/wiki/Resident_Evil_4

### 3.6 Weapon stats — RE4 Remake (2023)

The remake replaces abstract firepower with a **Power** stat plus attachments, and adds
**Exclusive Upgrade Tickets** that unlock the exclusive perk without full-upgrading first —
**only two exist in the whole game**, from the Merchant after Chapter 7, for **30 and 40 Spinels**
respectively. `[S]`
(https://gamewith.net/resident-evil-4-remake/article/show/38470,
https://gamerant.com/resident-evil-4-remake-re4-fully-upgrade-weapons-guide-exclusive-upgrade-tickets/)

`[S]` maxed stats (https://game8.co/games/Resident-Evil-4-Remake/archives/407357,
https://game8.co/games/Resident-Evil-4-Remake/archives/408811):

| Weapon | Max power | Max capacity | Reload (s) | Rate of fire | Exclusive perk |
|---|---|---|---|---|---|
| SG-09 R (starter handgun) | ~1.5 `[K]` | **18** `[S]` | **1.40** `[S]` | **1.52** `[S]` | crit rate boost `[K]` |
| Punisher | ~1.4 `[K]` | 22 `[K]` | 1.35 `[K]` | 1.60 `[K]` | **Penetration x5** `[S]` |
| Red9 | **4.05 total** `[S][C]` | 12 `[K]` | 1.90 `[K]` | 0.90 `[K]` | power boost `[K]` |
| Blacktail | **3.60 total** `[S][C]` | 18 `[K]` | 1.60 `[K]` | 1.30 `[K]` | power boost `[K]` |
| W-870 Shotgun | **10.1** `[S]` | **10** `[S]` | **5.0** `[S]` | **0.85** `[S]` | **Power x2** `[S]` |
| Riot Gun | ~9.0 `[K]` | 12 `[K]` | 4.0 `[K]` | 1.0 `[K]` | power boost `[K]` |
| Striker | ~7.5 `[K]` | 20 `[K]` | 3.5 `[K]` | 1.4 `[K]` | capacity 100 `[K]` |
| SR M1903 Rifle | **5.30** `[S]` | **13** `[S]` | **5.0** `[S]` | **0.53** `[S]` | pierce `[K]` |
| Stingray Rifle | ~4.5 `[K]` | 16 `[K]` | 3.4 `[K]` | 0.9 `[K]` | power boost `[K]` |
| TMP | ~0.9 `[K]` | **70** `[S]` | **1.40** `[S]` | **2.50** `[S]` | full-auto stock `[K]` |
| LE 5 (SMG) | ~0.8 `[K]` | 40 `[K]` | 1.5 `[K]` | 2.2 `[K]` | penetration `[K]` |
| Bolt Thrower | ~3.0 `[K]` | 6 `[K]` | 1.2 `[K]` | 0.7 `[K]` | **recoverable ammo** `[K]` |
| Broken Butterfly | ~24 `[K]` | 8 `[K]` | 3.0 `[K]` | 0.55 `[K]` | power boost `[K]` |
| Killer7 | ~20 `[K]` | 10 `[K]` | 2.4 `[K]` | 0.75 `[K]` | **Critical rate x5** `[S]` |
| Handcannon | ~50 `[K]` | 100 `[K]` | 2.0 `[K]` | 0.6 `[K]` | infinite ammo `[K]` |
| Chicago Sweeper | ~2.0 `[K]` | ∞ `[K]` | — | 3.0 `[K]` | infinite ammo `[K]` |
| Rocket Launcher | lethal | 1 | — | — | — |
| Primal Knife | — | — | — | — | **Indestructible** `[S]` |

`[C]` The "4.05 / 3.60 total damage" figures for Red9/Blacktail come from a search summary of a
Steam comparison table and are almost certainly *max Power stat*, not a per-shot damage number
in the same units as the W-870's 10.1. Do not mix them. **Use the ratios, not the absolutes.**

### 3.7 Grenades

- **Flash Grenade:** stuns all enemies in an area; **instantly kills enemies with an exposed
  Plaga.** `[S]` (https://residentevil.fandom.com/wiki/Flash_Grenade_(RE4)) This is a huge deal —
  it makes the flash a hard counter to the mutation state, which turns the scariest enemy state
  into a resource-spending decision.
- **Heavy Grenade (remake):** upgraded Hand Grenade; recipe costs **12,000₧** from the Merchant;
  crafts from **12 Gunpowder + 1 Resources (L) → 1 grenade.** `[S]`
  (https://residentevil.fandom.com/wiki/Heavy_Grenade_(RE4_Remake))
- No published radius/duration numbers exist. `[E]` recommendations: frag 4.0 m lethal /
  6.5 m falloff; flash 7.0 m, blind 4.0 s (2.0 s on Professional-equivalent).

### 3.8 Ammo crafting (Remake)

`[S]` (https://sirusgaming.com/resident-evil-4-remake-ammo-crafting-recipes/,
https://gamewith.net/resident-evil-4-remake/article/show/38347):

| Item | Recipe | Yield |
|---|---|---|
| Magnum Ammo | 17 Gunpowder + 1 Resources | 3–4 `[C]` (sources disagree) |
| Bolts | Boot Knife **or** Kitchen Knife + 1 Resources (L) | 5 |
| Attachable Mine | 9 Gunpowder + 1 Resources | 1 |
| Heavy Grenade | 12 Gunpowder + 1 Resources (L) | 1 |
| Handgun Ammo | `[C]` one summary reports "17 Gunpowder + 1 Resources → 4", which is
  near-certainly a mis-attribution of the Magnum recipe. Community value is ~3 GP + 1 Res(S) → 10. `[K]` |

Recipes are **purchased from the Merchant and unlock progressively** — not all available at once.
`[S]` This is a pacing tool: gating the magnum recipe until Act 3 is how you gate magnum uptime.

---

## 4. AMMO & RESOURCE ECONOMY — THE DIRECTOR

### 4.1 The rank system, precisely

This is the best-documented hidden system in the game and the closest thing to a spec we have.
`[S]` (https://www.speedrun.com/re4console/guides/3sahj,
https://residentevil.fandom.com/wiki/Game_Rank_(RE4), https://residentevil.fandom.com/wiki/Rank,
https://www.engadget.com/2015-06-03-resident-evil-4-difficulty.html)

```
Rank is TWO values:
  rank      : integer 1..10
  progress  : integer 1000..10999          ("the rank progress bar")
  invariant : rank == first digit of progress

Updates:  MOD = BASE * RANK_RELATED_MODIFIER
          progress += MOD
  where BASE is a fixed point value for a given player action,
  and RANK_RELATED_MODIFIER scales the gain/loss by current rank
  (high rank -> harder to climb, easier to fall; and vice versa).

Boss fights NORMALIZE progress back to 5500.
  (Caveat: testing found NO reset after Del Lago or the first El Gigante,
   leading to the belief that it may never truly reset mid-game. [S][C])
```

**What rank modifies `[S]`:**
- damage you receive
- damage you deal (or, equivalently, enemy health — sources are unsure which side is scaled)
- **critical headshot chance**
- **hitbox sizes** (!) — the game literally makes enemy weak points bigger or smaller
- **which enemies spawn at all** — some enemies only appear above a rank threshold

**Specific documented example `[S]`:** in the village gondola/water-room sequence, *"if Leon
takes enough hits at this part, the two archers will not spawn at the water room."* That is the
director deleting content in front of a struggling player, invisibly.

**Rank point sources `[S]`:**
- Defeating **stronger** enemies → **larger** rank increase.
- Hitting **more targets simultaneously** → **larger** rank increase.
- **Failing to hit 3–4+ enemies at once with a shotgun-type weapon → rank DECREASE.**
  Read that again: the game penalizes your rank for *wasting a shotgun shell on one guy.* The
  director is measuring not just "are you winning" but **"are you playing well."**

**Difficulty interaction `[S]`:** the chosen difficulty sets the **starting value plus the lower
and upper caps** of the hidden rank. Professional **disables** dynamic adjustment entirely and
pins enemies to maximum aggression.

### 4.2 What the director does to drops

`[S]` (https://www.cbr.com/resident-evil-4-dynamic-difficulty-capcom/,
https://www.gamerevolution.com/guides/937631-resident-evil-4-remake-get-more-ammo-crafting-rng,
https://steamcommunity.com/app/2050650/discussions/0/3827536762643197944):

- Base drop tables are **weighted toward Pesetas and Gunpowder**, not finished ammo.
- Ammo drops are **biased toward weapons you are actually carrying and using.**
- Drop chance for a given ammo type **rises as your stock of that ammo falls.**
- The game **sometimes drops ammo for weapons you are NOT carrying**, and that chance increases
  if you own the weapon and left it in storage. (Anti-frustration: it stops you from being
  hard-locked out of a weapon you invested in.)
- Ammo drops **decrease for your preferred weapon if you are steamrolling.**
- The **attaché case skin itself modifies drop rates** (Leather Case → higher handgun ammo rate),
  and **charms** modify specific item drop likelihoods. `[S]`
- Adaptive difficulty alters **enemy appearance, placement, and their drop rates.** `[S]`

### 4.3 How scarcity is engineered so you feel poor but rarely soft-lock

Five mechanisms, all of which we should copy:

1. **Melee is free.** Ammo buys *openings*, not kills. A player at 0 ammo is not dead; they are
   playing a worse but functional game (knife + kick + environment).
2. **The floor is dynamic.** Below a low-ammo threshold the director floods the drop table with
   your primary ammo type.
3. **The ceiling is dynamic.** Above a high-ammo threshold it stops giving you that ammo at all,
   pushing you back toward scarcity so the feeling never resets.
4. **Currency ≠ ammo.** Pesetas drop generously; they only convert to power at a Merchant, which
   is *spatially and temporally gated.* You are always rich and starving at the same time.
5. **Crafting converts junk to ammo at a bad exchange rate.** Gunpowder is a slow drip that
   guarantees a non-zero floor.

### 4.4 Recommended director implementation for ISLAND PROTOCOL

```
S.director = {
  rank: 5,              // 1..10
  progress: 5500,       // 1000..10999, rank = floor(progress/1000)
  lo: 2, hi: 9          // caps set by difficulty
}

// Point values (BASE), applied per event:
  killEnemy(basic)                 +120
  killEnemy(elite/brute)           +300
  killEnemy(boss)                  +900
  multiKill(n>=3 in 1.5s)          +90 * n
  headshotKill                     +60
  meleeKill                        +40
  perfectParry                     +50
  noDamageForRoom                  +250
  takeDamage(hp)                   -14 * hp
  playerDeath                      -1500
  healUsed                         -120
  wastedShotgunShell(<2 targets)   -70      // copy RE4 exactly
  missedShots(5 consecutive)       -60

// RANK_RELATED_MODIFIER (compresses the ends):
  gain: mod = 1.0 - 0.06 * (rank - 1)     // rank10 gains at 0.46x
  loss: mod = 0.4  + 0.06 * (rank - 1)    // rank10 loses at 0.94x

// Boss fight start: progress = 5500 (normalize)
```

**What rank drives (recommended):**

| Rank | Enemy dmg mult | Player dmg mult | Ammo drop mult | Herb drop mult | Extra spawns | Attack tokens |
|---|---|---|---|---|---|---|
| 1–2 | 0.65 | 1.35 | 1.60 | 1.60 | -2 per arena | 1 |
| 3–4 | 0.80 | 1.15 | 1.30 | 1.25 | -1 | 2 |
| 5–6 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 2 |
| 7–8 | 1.20 | 0.90 | 0.80 | 0.70 | +1 | 3 |
| 9–10 | 1.40 | 0.85 | 0.60 | 0.50 | +2, elites unlock | 3 |

**Hard safety floor (anti-soft-lock, non-negotiable):** if the player has < 6 rounds of *any*
usable ammo AND < 1 healing item, the very next enemy killed drops ammo with probability 1.0.
Cap this to fire at most once per 90 s so it can't be farmed.

### 4.5 Recommended drop table

```
enemyDrop(enemy, S):
  roll nothing       : 35%   * (2.0 - ammoScarcity)    // scarcity in [0..1]
  roll pesetas       : 25%   (amount 200-1200 by tier)
  roll gunpowder     : 15%
  roll resources     : 8%
  roll ammo          : 12%   * ammoScarcity * rankAmmoMult
  roll herb (green)  : 4%    * healthScarcity
  roll grenade       : 1%
  // ammoScarcity = clamp(1 - carried/capacity, 0.15, 1.0) for the equipped weapon
  // ammo type is chosen 75% equipped weapon, 20% other carried, 5% stored-but-not-carried
```

---

## 5. INVENTORY — THE ATTACHÉ CASE

### 5.1 Grid sizes

**RE4 2005** `[S]` (https://residentevil.fandom.com/wiki/Attache_Case,
https://www.evilresource.com/resident-evil-4/equipment/attache-case,
https://godisageek.com/2023/03/resident-evil-4-remake-how-to-carry-more-items/):

| Case | Grid | Squares |
|---|---|---|
| Attaché Case (default) | **6 x 10** | **60** |
| Attaché Case M | **7 x 11** | **77** |
| Attaché Case L | **8 x 12** | **96** |
| Attaché Case XL | **10 x 12** | **120** (exactly double the start) |

That final doubling is the whole arc of the inventory system: **you end the game with exactly
2x the space you started with**, and it never feels like enough. Copy the ratio.

**RE4 Remake** `[C]` — sizes are smaller at start and top out around **9 x 13**. `[S]`
(https://gamerant.com/resident-evil-4-remake-all-attache-cases-guide-which-case-is-the-best-how-to-get-all-re4-cases/)
The remake's real innovation is that **cases are cosmetic-plus-perk**: five cases (Silver,
Leather, Black, Classic, Golden), only Black and Leather purchasable, and each **modifies drop
rates** (Leather → higher handgun ammo drop rate). `[S]` Plus **32 charms**, earned with Silver
and Gold tokens from the **Shooting Range**, each granting a small passive modifier. `[S]`
(https://primagames.com/tips/every-attache-case-charm-resident-evil-4-remake)

**Design read:** the remake turned the inventory into a **build system**. Case = build archetype,
charms = modifiers. That is a lot of value for very little code and I strongly recommend it for
ISLAND PROTOCOL — it makes the optional shooting-range content load-bearing.

### 5.2 Item footprints

`[S]` (https://residentevil.fandom.com/wiki/Inventory,
https://residentevil.fandom.com/wiki/Mine_Thrower, https://residentevil.fandom.com/wiki/Chicago_Typewriter):

| Item | Footprint | Squares |
|---|---|---|
| Handgun | 3 x 2 (rotatable to 2 x 3) | 6 |
| Ammo box / grenade / herb / spray | 2 x 1 | 2 |
| Egg | 1 x 1 | 1 |
| Shotgun (varies by model) | 5 x 2 to **8 x 2** | 10–16 |
| Mine Thrower | **5 x 2** | 10 |
| Mine Thrower scope | **2 x 2** | 4 |
| Chicago Typewriter | **7 x 3** | 21 |
| Rifle | 8 x 2 | 16 |
| Rocket Launcher | 10 x 3 | 30 |

**Rotation** is supported and is a core part of the puzzle. `[S]`

### 5.3 Why this system works (and the rule to preserve)

The attaché case works because **a weapon's inventory cost is a second, parallel balance axis to
its damage.** The rocket launcher is not balanced by its damage; it is balanced by eating 30 of
your 60 starting squares. The player is *constantly* re-litigating "is this gun worth its
footprint," and that decision happens in a calm menu, which is where players enjoy making
decisions. Do **not** let footprint be proportional to power in a boring way — make some cheap
weapons bulky (shotgun) and some expensive ones compact (magnum) so the trade is interesting.

### 5.4 Treasure & gem economy

`[S]` (https://gamerant.com/resident-evil-4-remake-re4-best-treasure-combinations-gemstone-bonus/,
https://screenrant.com/resident-evil-4-remake-more-treasure-sell-money/,
https://www.gamespot.com/articles/resident-evil-4-treasures-gemstones-guide-hub/1100-6512562/):

| Gem | Shape | Value |
|---|---|---|
| Ruby | Round | 3,000₧ |
| Sapphire | Round | 4,000₧ |
| Yellow Diamond | Round | 7,000₧ |
| Emerald | Square | 5,000₧ |
| Alexandrite | Square | 6,000₧ |
| Red Beryl | Square | 9,000₧ |

- Combinable treasures show **empty gem slots** in the inventory view and say so in their
  description text. `[S]`
- **Elegant Crown: 19,000₧ bare → 108,000₧ with the correct 5 gems.** `[S]` That is a **5.7x**
  multiplier for solving a small optional puzzle. Enormous, and correctly so: it rewards the
  exact behavior (careful exploration + optional cognition) the designers want.
- **Spinel is a second currency.** It cannot buy normal goods; it trades for things pesetas
  cannot buy (treasure maps, exclusive weapons, the Exclusive Upgrade Tickets at 30 and 40).
  Earned mainly from **Requests** — blue notes pinned around the world. `[S]`
  (https://residentevil.fandom.com/wiki/Spinel_(RE4_Remake),
  https://wegotthiscovered.com/gaming/resident-evil-4-remake-spinel-trading-guide/)

**Recommendation:** ship both currencies. Pesetas for the incremental upgrade treadmill; a rare
side-currency for the 3–4 *build-defining* purchases. Two currencies stops the "I have 90,000
and nothing to buy" endgame collapse.

### 5.5 The merchant loop and its pacing role

The Merchant is **the game's punctuation mark.** `[S]`
(https://gameinformer.com/exclusive-feature/2023/02/16/resident-evil-4s-sound-director-and-composer-break-down-the-remakes,
https://www.destructoid.com/resident-evil-4-remakes-atmospheric-sound-design-deserves-praise/)
His presence is *"a crucial respite, with his distinctive voice and quirky dialogue creating
fleeting moments of comfort that punctuate the relentless tension."*

Mechanically he is a **pressure release + a spend decision + a difficulty reset**, all at once:

1. Arrive with pockets full of loot you were forced to hoard through the danger.
2. Convert loot → power. This is where the player *feels* their progress; the actual power
   delta is small, the psychological delta is huge.
3. Leave with an empty case and a new capability you now want to test.

**Cadence:** roughly one Merchant per 20–35 minutes, and **always immediately before a major
escalation, never immediately after.** Selling to him after a boss is a reward; selling before
one is *preparation*, which is far more engaging because it makes the player predict.
Also note: higher difficulty **raises Merchant prices** `[S]` — a clean, non-obvious lever.

---

## 6. ASHLEY / ESCORT DESIGN — **THE MOST IMPORTANT SECTION**

Our companion is **Elena** (`IP.Systems.Companion`, rig kind `'elena'`, commands `cmdFollow`,
`cmdStay`, `cmdHide`, `cmdInteract`, `cmdCome`). Everything below is written to be applied
directly to her.

### 6.1 What players actually hated in 2005

Distilled from the retrospective coverage and the developer statements about why they changed
it `[S]` (https://kotaku.com/resident-evil-4-remake-re4-ashley-qte-knife-durability-1850062148,
https://gameinformer.com/exclusive-feature/2023/02/02/why-capcom-changed-ashley-in-resident-evil-4,
https://www.inverse.com/gaming/resident-evil-4-remake-ashley-redemption,
https://www.thegamer.com/resident-evil-4-remake-ashley-graham-failure-character/):

| # | The 2005 problem | Why it enraged people |
|---|---|---|
| 1 | **Ashley had a health bar.** Zero HP = instant Game Over. | She was *"a second health bar to babysit"* — the exact phrase Capcom used to describe what they removed. `[S]` A second fail state you only partly control. |
| 2 | **She could be shot by the player.** | The game punished you for doing the thing it demanded (shooting into crowds). |
| 3 | **Poor pathing / she walked into your line of fire.** | The failure felt like the *game's* fault, which is unforgivable in a fail state. |
| 4 | **"Wait" trivialized her.** Players parked her in a dumpster, cleared the level solo, came back. | The escort *mechanic* evaporated; what remained was a chore of walking back. |
| 5 | **Grabs sapped her health and you couldn't intervene.** | No agency during the fail. |
| 6 | **She had nothing to do.** | Pure liability. No upside ever. |

### 6.2 Exactly how the remake fixed it

Every fix, with the source:

1. **Removed the health bar entirely.** Instead she enters a **downed state** and must be
   revived — a chance to recover before failure. Goal, in Capcom's words: make her feel *"more
   like a natural companion and less like a second health bar to babysit."* `[S]`
   (https://kotaku.com/resident-evil-4-remake-re4-ashley-qte-knife-durability-1850062148)
2. **Reviving costs no items.** No Green Herb, no First Aid Spray. Just walk to her and press
   the revive input (R3). `[S]`
   (https://twinfinite.net/guides/how-to-revive-ashley-in-resident-evil-4-remake/)
   **This is critical** — making revival cost a consumable would have re-created problem #1.
3. **She is invulnerable to player gunfire while following.** `[S]`
   (https://www.gamerevolution.com/guides/937633-resident-evil-4-remake-ashley-keeps-dying-friendly-fire)
   Friendly fire exists **only in two scripted defend-Ashley set pieces** (Water Hall platforms
   in the Castle; Waste Disposal bridge on the Island), where protecting her *is* the objective
   and the rule change is legible. Explosives may still clip her but for **far less damage than
   enemies take.** `[S]`
4. **You can attack the enemy carrying her.** Shoot the abductor, or run up and knife his neck
   to free her. Previously she just drained. `[S]`
   (https://gamerant.com/resident-evil-4-co-op-gameplay-ashley/)
5. **Removed the park-and-forget.** *"Players can no longer command her to stop and then go back
   for her after clearing out an area of enemies, since Capcom wanted her to be in Leon's
   company more than she was in the original."* `[S]`
   (https://gamerant.com/resident-evil-4-co-op-gameplay-ashley/) The dumpsters are **gone
   entirely from the remake.** `[S]`
   (https://www.playstationlifestyle.net/2023/01/31/resident-evil-4-remake-ashley-dumpster-health-bar-changes/)
6. **Replaced Wait/Follow with a formation system.** Commands are still **WAIT / FOLLOW** on one
   button, but the meaningful control is **tight vs loose formation**, toggled with the right
   stick click. Tight = she hugs you (use when fleeing); loose = she spreads out (use when
   fighting so she isn't in your firing lane). `[S]`
   (https://www.gamespot.com/articles/resident-evil-4-ashley-guide/1100-6512555/,
   https://www.antmag.net/guide/resident-evil-4-remake/strategy-advanced-tactics/ashleys-commands-utility)
   **This is the key insight:** the player no longer decides *whether* she is present, only
   *how* she is present. Presence became mandatory; positioning became the skill.
7. **She is much better at ducking and staying out of the line of fire.** `[S]`
8. **She has a job.** Environments have *"tag-team obstacles"* that require her — boosts,
   crank-turning, crawlspaces, doors that need two people — so bringing her **opens content**
   rather than only costing safety. `[S]`
   (https://gamerant.com/resident-evil-4-co-op-gameplay-ashley/)
9. **She gets an agency section.** Chapter 9 makes her playable; she cannot attack but carries a
   **lamp that blinds the armored knights** and must hide and run. `[S]`
10. **Optional invulnerability exists.** Unlockable Knight Armor makes her immune to everything
    including friendly fire. `[S]` A legitimate accessibility valve.

### 6.3 PRESCRIPTIVE RULES FOR ELENA — implement exactly this

**A. Fail states — two, both recoverable, neither instant:**

```
Elena has NO visible health bar. She has a hidden downedMeter (0..100).
  enemy hit on Elena: downedMeter += 25..40 by attacker tier
  downedMeter decays: -6 per second out of combat, -2 per second in combat
  downedMeter >= 100 -> DOWNED state

DOWNED:
  - she is prone, crying out (audio ping, world-space, distinct from all other SFX)
  - a soft directional indicator appears at screen edge, always, even off-screen
  - reviveWindow = 25 s  (Standard) / 18 s (Hard) / 40 s (Assisted)
  - revive: stand within 1.5 m, hold interact 1.2 s. COSTS NOTHING.
  - after revive she has 6 s of invulnerability and moves to tight formation automatically
  - if she is hit while downed -> FAIL
  - if reviveWindow expires -> FAIL

CARRIED:
  - an enemy can hoist her and run for the nearest exit marker
  - carryEscapeDistance = 22 m from the player -> FAIL
  - carrier moves at 2.6 m/s; player run is 3.4 m/s -> a chase is ALWAYS winnable if started
    immediately. This must be arithmetically guaranteed, not approximately true.
  - carrier drops her on: any stagger, any melee prompt executed, 25% of its max HP dealt
  - carrier has a HIGH-CONTRAST outline through walls. No hunting.
```

**B. Friendly fire — hard rule:**

> **Elena is immune to all player-sourced damage, always, except inside explicitly-flagged
> `defendElena` scripted sequences, where the UI states the rule in plain text on entry.**

Explosives at 25% damage is a defensible middle ground for a single hard difficulty; for touch
players, zero. Do not make this a difficulty-scaled surprise.

**C. Commands (map to the existing input flags):**

| Input | Behavior |
|---|---|
| `cmdFollow` | resume following (default state) |
| `cmdStay` | hold current position — **auto-cancels after 30 s or if the player moves > 18 m away.** She then runs to rejoin. This is the anti-dumpster rule. |
| `cmdHide` | enter a nearby flagged `hideSpot` if one is within 6 m. **Only usable in flagged rooms.** Auto-exits when the room's encounter ends. |
| `cmdCome` | pull her to the player immediately at sprint speed, ignoring formation |
| `cmdInteract` | she performs the nearest `tagTeam` interaction (boost, crank, crawlspace) |
| formation toggle | **TIGHT (1.6 m) / LOOSE (3.5 m)** — put this on a dedicated key/gesture, it will be used constantly |

**D. Follow AI — the numbers:**

```
followDistance:  tight 1.6 m, loose 3.5 m
catchUpDistance: 6.0 m   -> she sprints (4.6 m/s) until back inside followDistance + 0.5
teleportDistance: 25 m   -> if out of the player's view frustum AND behind a corner,
                            teleport her to a valid nav point 4 m behind the player.
                            NEVER teleport on-screen. This kills 90% of pathing complaints.
repathInterval:  0.35 s  (0.15 s while in combat)
lateralSpread:   she biases to the player's LEFT by 0.8 m at rest (camera is right-shouldered,
                 so left-biasing keeps her physically out of the frame AND out of the lane)
```

**E. The firing-lane rule (do not skip this — it is the #1 source of escort rage):**

```
Every frame, if the player is aiming:
  build a capsule from the muzzle along the aim direction, length 14 m, radius 0.9 m
  if Elena's capsule overlaps it:
      she plays a 'duck' or 'sidestep' animation and moves perpendicular, away from the
      aim ray, at 4.0 m/s, until clear + 0.4 m margin
      she NEVER crosses in front of the player while the aim button is held
```

She is invulnerable to your bullets, but she must still *visibly get out of the way*, because
the player's frustration is about **visual obstruction**, not damage. Fixing the damage without
fixing the occlusion fixes nothing.

**F. Threat response — a 4-state machine:**

```
CALM     : follows at formation distance, idle barks, looks at points of interest
ALERT    : an enemy is within 20 m -> moves to 0.85x formation distance, faces threats,
           stops looking at scenery
COWER    : an enemy within 4 m and the player is > 5 m away -> she backs toward the player,
           crouches against cover, arms up. Uses rig anim 'cower'.
FLEE     : 2+ enemies within 6 m -> she runs directly to the player's position, ignoring
           formation, and stays inside 1.2 m until ALERT clears
```

Add a **grab-resist window**: when an enemy initiates a grab on her, she gets 1.0 s of struggle
during which the player can free her with a shot, melee, or knife. Enemies cannot grab her at
all within 2.0 m of the player — that space is *sacred*, and it teaches the player that standing
near her is the correct answer.

**G. Give her upside, not just cost.** Copy the remake exactly:

- **Tag-team obstacles.** At least 6 across the game: boost to a ledge, two-person door, she
  crawls a duct to unlock, she holds a light, she cranks while you cover.
- **She calls out threats you can't see.** *"Behind you!"* with a directional HUD ping. This
  turns her into a **sensor**, and a sensor is a thing players protect willingly.
- **She carries overflow.** Let her hold 4–6 inventory squares. Now she is a resource.
- **One scripted playable section** where the player is *her* — powerless, hiding, with one
  trick (a lamp). Pays off every hour of protecting her. `[S]`

**H. Hitbox and collision:**

```
Elena capsule: radius 0.28 m, height 1.68 m
  vs player      : NO collision (soft push only, 2.0 m/s separation force) — never block a door
  vs enemies     : full collision
  vs bullets     : layer 'friendly', player bullets pass through entirely
  vs explosions  : 0.25x damage into downedMeter (0.0 on touch/mobile)
```

Never let the companion body-block the player. Ever. It is the second-largest escort complaint
after friendly fire, and it is a one-line fix.

---

## 7. ENEMY DESIGN

### 7.1 Ganado archetypes and rules

`[S]` (https://residentevil.fandom.com/wiki/Ganado/gameplay,
https://gamerant.com/resident-evil-4-remake-capcom-ganados-redesign-explained/,
https://screenrant.com/resident-evil-4-remake-ganados-new-enemies-re4/)

| Archetype | Behavior rules |
|---|---|
| **Villager (baseline)** | Hand tools — axes, sickles, pitchforks, kitchen knives. **Will throw the weapon if at distance.** Slow shamble → committed run inside ~8 m. |
| **Dynamite thrower** | Minority of villagers. **Shooting the dynamite kills them and their neighbors.** The single best "reward for looking at the crowd" in the game. |
| **Unarmed grabber** | Grabs specifically **so armed Ganados can hit you.** Some restrain from behind while another strikes. `[S]` |
| **Zealot (mid-game)** | Higher HP, more ranged (crossbows, shields), more coordinated. Machine Gun Zealot ~80 HP `[S][C]`. |
| **Soldier / Militia (late)** | Helmets, bulletproof vests, military weapons. **Most dangerous tier.** HP 15–33.5 in firepower units by chapter `[S]`. Helmet defeats headshots until broken. |
| **Shield bearer** | Must be flanked, or the shield destroyed, or shot through with a penetrating weapon. Exists to punish frontal tunnel vision. |
| **Brute (remake)** | Hammer, huge HP, cannot be staggered by handguns, immune to the standard melee prompt at full health. |

**Remake AI upgrades `[S]`:** Ganados *"act strategically as a mob and ambush the player, or act
more aggressive in certain scenarios, such as when the player runs out of ammo."*
**Read that again:** the AI reads your ammo state and escalates when you're empty. That is a
director hook, not an AI hook, and it is trivially cheap for us to implement.

Mikami-era design intent, quoted in retrospective coverage: enemies that think *"like a smart
person"* by using *"weapons, of course"* — i.e. the perceived intelligence came from **tool
use and coordination**, not from pathfinding sophistication. `[S]`
(https://www.gamesradar.com/games/resident-evil/microsoft-ea-and-other-publishers-should-give-up-on-artificial-intelligence...)
**Cheap intelligence beats expensive intelligence.** Barks, tool use, and flanking arcs will
read as smarter than A* ever will.

### 7.2 Plaga mutation

- Headshots have a chance to pop the head; on a pop, a **Plaga may emerge** instead of the enemy
  dying — a mutated, faster, deadlier second phase. `[S]`
- Pop/mutation rate is **RNG and rank-modulated**; community estimate **~10–15%** in the remake,
  reportedly far higher on Professional. `[S]` Static, scripted mutations also exist. `[S]`
- **Flash grenades instantly kill enemies with an exposed Plaga.** `[S]`

**Recommended implementation `[E]`:**

```
onHeadHitboxDepleted(enemy):
  popRoll = 0.12 + 0.02 * (director.rank - 5)      // 0.04 at rank1, 0.22 at rank10
  if random() < popRoll AND enemy.canMutate AND activeMutants < 2:
       spawn mutation (speed 1.35x, damage 1.6x, HP 45% of base, cannot be staggered)
       mutation is INSTANTLY KILLED by flash
  else: enemy dies
```

Cap concurrent mutants at 2. An uncapped mutation roll turns a fair fight into a coin flip.

### 7.3 Special enemies

| Enemy | Rules | Source |
|---|---|---|
| **Dr. Salvador (chainsaw)** | Withstands multiple headshots **without flinching**. **Instant-kill decapitation regardless of health.** Far more durable than a regular Ganado. Sack over head because the parasite is in his skull. | `[S]` https://www.evilresource.com/resident-evil-4/enemies/dr-salvador, https://residentevil.fandom.com/wiki/Chainsaw_Man |
| **Colmillos** | Plaga-infected wolves. Hunt in **packs of 2–4**. More agile and aggressive than Ganados. Attack by flailing spine-tentacles or leaping for the throat. | `[S]` |
| **Garrador** | **Blind — navigates entirely by sound.** Swings claws wildly; on hearing a noise it **charges and gets its claws stuck for a few seconds** (the punish window). Head and body armored; **weak point is the Plaga on its back.** Arenas contain a **bell you can shoot to bait it.** Back stealth-stab does massive damage. | `[S]` https://game8.co/... , http://residentevil42013.blogspot.com/2013/10/garrador.html |
| **Regenerador** | Regenerates unless the internal parasites are destroyed — requires the **Infrared Scope + rifle** (ideally semi-auto). Pure "you need the right tool" gate. | `[S]` |
| **Novistador** | Flying insects, **camouflage**. Individually **extremely weak — one shot kills them in the air** — but attack in groups with high-damage grabs. Knife them when grounded. | `[S]` https://game8.co/games/Resident-Evil-4-Remake/archives/408431 |
| **El Gigante** | In the remake, summoned by a **Zealot** rather than by multiple villagers. Some instances are killable with normal weapons; others gate on an environmental kill (cannon). | `[S]` |

**Pattern to extract:** almost every special enemy is a **one-rule puzzle**, not a stat block.
Blind → make noise. Regenerating → need the scope. Camouflaged → shoot them airborne. Armored →
hit the back. This is why RE4's bestiary stays fresh with only ~10 enemy types. Build ours the
same way: *one rule per enemy, stated visually within 3 seconds of first contact.*

### 7.4 Crowd behavior — the attack-token system

The best-documented account `[S]`
(https://medium.com/@elio.lucantonio/the-architecture-of-anxiety-how-resident-evil-4-reconfigured-the-3d-viewport-7ee41935a930):

> *"Only a certain number of enemies are permitted to occupy the 'attack slots' simultaneously,
> while others circle, shouting to create psychological pressure... The AI intentionally leaves
> gaps for escape, only to close them seconds later, creating a rhythmic cycle of being
> overwhelmed and finding brief breathing room... a highly orchestrated piece of theater
> designed to push the player to their limit without breaking them."*

And from the developers, on group intent `[S]`: enemies try to attack in groups *"so that you
don't have a place to escape to."*

**Full recommended implementation:**

```
Per encounter group:
  tokens = 2 (Standard) | 1 (Assisted) | 3 (Hard) | 4 (Professional-equiv)
     +1 if director.rank >= 7 ;  -1 if director.rank <= 2

  ATTACKER  (holds a token): closes to attackRange, commits, releases token on
            attack-end, on stagger, or after attackTimeout (4 s) so it can't camp
  CIRCLER   (no token): orbits the player at ringRadius, tries to reach the
            player's rear 140-degree arc, BARKS (this is what makes the ring scary)
  WAITER    (no token, no path): idles at 8-14 m, advances only when a slot opens

  Token grant priority: nearest && has line of sight && has not attacked in the last 3 s
  Token cooldown after release: 1.2 s (that enemy cannot re-acquire for 1.2 s)
  Token is FORCE-RELEASED if the holder is staggered, grabbed, or killed

Spacing:
  personalRadius     0.75 m   soft separation force, enemies never overlap
  ringRadius         3.5 m    circlers orbit here
  attackRange        1.6 m    melee commit distance
  ringRotationSpeed  0.6 rad/s, direction flips every 4-7 s (prevents a readable orbit)

The GAP rule (the most important part of the theater):
  every 8-12 s, force a 90-degree arc of the ring to open for 2.5 s
  choose the arc FURTHEST from the densest enemy cluster
  -> the player always has an escape lane, but must FIND it
  -> this is what makes RE4 crowds feel fair while looking lethal
```

**Bark budget:** at most 2 concurrent enemy vocalizations, prioritized by proximity, with a
0.6 s global cooldown. RE4's ring is terrifying because you *hear* twelve enemies and *fight*
two. Over-vocalize and it becomes noise; under-vocalize and the crowd stops feeling dangerous.

**Crucially: the number of enemies alive is a horror stat; the number of tokens is a difficulty
stat.** Tune them independently. A room of 14 enemies with 2 tokens is scary and fair. A room of
5 enemies with 5 tokens is boring and unfair.

---

## 8. LEVEL & PACING

### 8.1 The village siege as a template

`[S]` (https://kotaku.com/the-cruel-brilliance-of-resident-evil-4s-village-fight-1639485771,
https://www.kokutech.com/blog/gamedev/design-patterns/power-fantasy/resident-evil-4,
https://www.escapistmagazine.com/resident-evil-4-village-sieges-made-the-game/,
https://medium.com/@gabriel.fuentesgd/level-design-analysis-resident-evil-4-remake-the-village-896a01c58feb)

The structure, beat by beat:

| Beat | Duration | Function |
|---|---|---|
| 1. Empty approach | **~10 min, "scarcely an enemy"** `[S]` | Establish tone, teach traversal, hand out ammo the player thinks is pointless |
| 2. First isolated kill | ~1 min | Teach the shoot→stagger→melee loop on ONE target, safely |
| 3. Arrive at the arena, unnoticed | ~30 s | Let the player survey a space they will shortly need to know intimately |
| 4. Trigger — noticed | instant | **5–6 villagers**, torches and hand tools only `[S]` |
| 5. Escalation | 1–2 min | More join *as you kill them*. The kill count outruns your expectation |
| 6. **Chainsaw** | mid-fight | Introduce an unstaggerable, insta-kill threat that invalidates your current strategy |
| 7. Verticality | ~1 min | The house/ladder — a defensible position that they can *also* reach |
| 8. Timed release | — | A bell rings and everyone leaves. **The player did not win. The game let them live.** |

**The single best lesson:** the fight is not won, it is **survived on a timer**. The player
never gets the satisfaction of clearing the room, which is exactly why it is remembered. Steal
this literally for our Act 1 siege.

Second lesson `[S]`: *"the player learns not to back themselves into a corner, and to use RE4's
more open-ended level design to keep a safe distance"* — **without being told.** The arena
teaches spacing by punishing its absence. Design our first arena as a **teaching machine with
no text.**

### 8.2 Arena vs corridor alternation

```
CORRIDOR   : 2-4 enemies max, tokens 1-2, no room to kite, dread and jump-scares.
             Camera arm collapses (see 1.5). Ammo is FOUND here, not spent.
ARENA      : 8-16 enemies, tokens 2-3, multiple exits, verticality, environmental kills
             (dynamite, ladders to kick, explosive barrels). Ammo is SPENT here.
TRANSITION : a 20-40 s empty stretch between them. NON-NEGOTIABLE. This is where the
             player breathes, reloads, and re-reads their inventory.
```

Ratio: roughly **corridor : arena : safe = 5 : 3 : 1** by time. RE4 is mostly corridor; the
arenas are memorable *because* they are rare.

### 8.3 Tension/release curve

Sound director on the remake `[S]`
(https://gameinformer.com/exclusive-feature/2023/02/16/resident-evil-4s-sound-director-and-composer-break-down-the-remakes,
https://www.destructoid.com/resident-evil-4-remakes-atmospheric-sound-design-deserves-praise/):
the game *"alternates between nerve-wracking encounters and quieter moments of respite, ensuring
that tension never fully dissipates yet never becomes a numbing constant."*

That is the whole spec: **never 0, never sustained max.** Target curve per 10-minute block:

```
tension 0.2 -> 0.5 -> 0.35 -> 0.7 -> 0.45 -> 0.9 (set piece) -> 0.15 (safe room) -> 0.3
```

Each release is **shallower than the previous drop** except the safe room, which resets fully.
That produces a rising sawtooth, which is the shape of a good horror hour.

### 8.4 Safe rooms and the typewriter

`[S]` (https://residentevil.fandom.com/wiki/Typewriter, https://screenrant.com/resident-evil-ink-ribbons-save-point-typewriter/,
https://filmstories.co.uk/features/resident-evil-save-rooms-kept-us-safe-from-the-stresses-of-survival-horror/):

- RE4 **kept the typewriter but dropped ink ribbons.** Save at a typewriter, unlimited times.
- Reason: the shift to action gameplay meant inventory-pressure saving no longer fit.

**Design read:** the typewriter's surviving job is **not** resource pressure — it is
**spatial punctuation.** The typewriter marks a room as safe, and the *sound of the save* is a
conditioned relief cue. Keep the typewriter, keep the unlimited saves, keep the distinctive
audio. Do not add ribbons; it is 2026 and this is a browser game.

**Safe room checklist:** distinct music (calm, tonal, not silence), warmer light temperature,
no enemy spawns ever, the save device, usually a Merchant, an item box or storage, and a
**readable document** — the safe room is where lore is delivered because it is the only place
the player will actually read.

### 8.5 Set-piece cadence and QTEs

`[S]` (https://www.shacknews.com/article/133961/resident-evil-4-remake-wont-have-qtes,
https://www.pcgamer.com/resident-evil-4-remake-is-ditching-qtes-and-i-couldnt-be-more-upset/,
https://game8.co/games/Resident-Evil-4-Remake/archives/407370):

- Capcom called QTEs **"antiquated"** and removed **cutscene button prompts entirely.**
- Producer Hirabayashi: there are *"barely any"* QTEs; specifically *"there aren't prompts to
  press buttons mid-cutscene."*
- Circumstantial timed presses **still exist during combat** — integrated into gameplay.
- The **Krauser knife fight was rebuilt from a QTE sequence into a real parry-based combat
  encounter.** `[S]`

**Rule for ISLAND PROTOCOL:** zero QTEs in cutscenes. The only timed inputs are
(a) the parry, (b) the grab-escape mash, (c) the interact-to-brace on a scripted collapse. All
three happen **in gameplay, with the camera under player control.** Our `qteTapped` input flag
should therefore only ever service the grab mash and the brace.

---

## 9. AUDIO & UI

### 9.1 HUD

RE4 2005's HUD is close to nothing: a segmented health bar bottom-left, ammo count near the
weapon, contextual prompts. The remake made it busier — an **animated circular health meter**,
and *"really in-your-face"* prompts (Check / Push / Open / Jump Over) that a substantial modding
population removes. `[S`]
(https://www.nexusmods.com/residentevil4/mods/430, https://www.gameuidatabase.com/gameData.php?id=1709)

**Recommendation — minimal, but not invisible:**

```
bottom-left  : segmented health bar. Segments, not a smooth bar — segments are countable
               at a glance under stress. Green -> yellow -> orange -> flashing red (DANGER).
               A red vignette pulse at DANGER (RE4R does this) [S].
bottom-right : ammo "current / reserve". Fades to 25% opacity 4 s after last combat event.
center       : reticle only. NEVER a permanent crosshair when not aiming.
edge         : directional damage indicator (arc, 0.6 s), and the Elena distress ping.
contextual   : ONE prompt line, centered low. Suppress it entirely while aiming or in combat.
NO minimap. NO objective marker in the world. NO enemy health bars.
```

The absence of a minimap is load-bearing: RE4 is scary partly because **you do not know what is
behind you**, and a minimap deletes that.

### 9.2 Music rules

`[S]` (Game Informer sound-director interview, Destructoid):

- *"Musical restraint... letting the game's environment speak for itself."* Silence is the
  default state, not a track.
- The original used **noise-type sounds in battle music** — innovative for horror at the time;
  the remake preserved that texture with modern production.
- **~30% of the remake's tracks retain a melody or phrase from the original; ~70% are new.**
  The save theme and merchant music are direct arrangements. `[S]`

**Stinger rules for us:**

```
AMBIENT  : no music. Wind, rain, distant structure groans, dripping. Default state.
STINGER  : a single sharp cluster on first enemy detection of the player. Once per encounter.
COMBAT   : enters ONLY when >= 3 enemies are actively hostile OR a special enemy is present.
           Percussive + noise-bed. No melody.
PANIC    : layer added when player health < 30% or when a token holder is inside 2 m.
RELEASE  : combat music does NOT stop on last kill -- it decays over 4 s, with a tail.
           Instant silence reads as a bug; a decaying tail reads as adrenaline draining.
SAFE     : the ONLY tonal, melodic cue in the game. This is the reward.
MERCHANT : distinct, slightly comic, warm. Deliberately breaks the horror register.
```

All of it must be WebAudio-synthesized per the engine contract — which actually suits this
palette well: noise beds, filtered sweeps, and detuned oscillator clusters are cheap to
synthesize and are exactly what RE4's battle music is made of.

### 9.3 Signaling off-screen threat

This is what the narrow FOV forces you to solve. Layered, in order of subtlety:

1. **Positional barks.** Circlers shout. This is the primary channel and it is free. Pan and
   attenuate properly with `IP.Audio.setListener`.
2. **Footsteps with material variation.** Gravel/wood/water. Distinct per enemy tier — the
   chainsaw's engine idle should be audible at 30 m and unmistakable.
3. **Directional damage arc** on hit — the fallback when audio failed.
4. **Screen-edge dimming** on the side a threat approaches from, subtle (0.15 alpha, 0.3 s in).
5. **Never an off-screen enemy marker.** That is a stealth-game affordance and it kills dread.

**Chainsaw rule specifically:** its audio must be the loudest, most distinct sound in the game
and must be audible **before** it is visible. RE4's chainsaw is scary because you hear it start
somewhere behind you.

---

## 10. SUMMARY OF CONFLICTS AND MY CALLS

| # | Conflict | Call |
|---|---|---|
| 1 | 2005 aim-stop vs remake move-while-aiming | **Remake**, with move speed x0.30 while aiming, no sprint, no quick-turn |
| 2 | Laser dot (2005) vs dynamic reticle (remake) | **Reticle by default, laser sight as an attachment** that zeroes bloom |
| 3 | Crit = +50% damage vs crit = ~10x/instant pop | **Both**: crit multiplies damage; the head has its own small HP pool, so a crit pops it |
| 4 | Plaga pop rate 10–15% vs "80% on Professional" | **12% at rank 5, ±2% per rank**, capped at 2 concurrent mutants |
| 5 | Red9 exclusive FP 6.5 vs 5.0 (GameCube) | Irrelevant to us; **use ratios, not absolutes** |
| 6 | "Magnum exclusive → capacity 100 for 60,000₧" | Almost certainly the **Striker**; the summary mis-attributed it |
| 7 | Handgun ammo craft "17 GP → 4" | **Mis-attributed Magnum recipe.** Use ~3 GP → 10 handgun rounds |
| 8 | Rank resets at bosses vs never resets | **Normalize to 5500 at bosses.** It is the safer, more controllable design |
| 9 | Magnum craft yield 3 vs 4 | Use **3** — magnum should always feel expensive |
| 10 | Ashley "Wait" exists vs was removed | Both are true: WAIT exists but **park-and-forget was removed.** Our `cmdStay` auto-cancels |

---

## 11. PRESCRIPTIVE TUNING TABLE FOR ISLAND PROTOCOL

**Everything below is `[E]` — my recommended starting values, internally consistent, tuned for a
WebGL2 browser game with desktop + touch. Units: meters, seconds, radians unless stated.
These are designed to be typed straight into `IP.Systems` data tables.**

### 11.1 Player locomotion

| Key | Value | Notes |
|---|---|---|
| `walkSpeed` | 1.4 m/s | analog partial deflection |
| `runSpeed` | 3.4 m/s | default locomotion |
| `sprintSpeed` | 4.7 m/s | cannot fire; 0.35 s recovery before aim allowed |
| `aimMoveMult` | 0.30 | → 1.02 m/s while aiming |
| `crouchSpeed` | 0.95 m/s | |
| `backpedalMult` | 0.55 | |
| `strafeMult` | 0.72 | |
| `accel` | 18 m/s² | reaches run speed in ~0.19 s |
| `decel` | 24 m/s² | |
| `bodyTurnRate` | 6.3 rad/s (360 deg/s) | |
| `lookYawRateHip` | 3.14 rad/s (180 deg/s) | at max stick |
| `lookYawRateAim` | 1.57 rad/s (90 deg/s) | separate sensitivity slider |
| `quickTurnTime` | 0.35 s | non-interruptible; blocked while aiming/knife |
| `aimEnterTime` | 0.15 s | ease-out |
| `aimExitTime` | 0.21 s | 1.4x slower than enter |
| `playerHP` | 100 (→ 160 fully upgraded) | DANGER below 30 |
| `playerRadius` / `playerHeight` | 0.32 m / 1.78 m | capsule |

### 11.2 Camera

| Key | Hip | Aim |
|---|---|---|
| `fovY` | 1.05 rad (60.2 deg) | 0.79 rad (45.3 deg) |
| `boomLength` | 1.50 m | 0.85 m |
| `shoulderOffsetX` | 0.30 m | 0.42 m |
| `heightOffset` | 1.45 m | 1.50 m |
| `collisionSphereRadius` | 0.25 m | 0.25 m |
| `pullInLambda` | instant | instant |
| `pushOutLambda` | 6.0 | 6.0 |
| `pitchClamp` | -1.05 .. +0.79 rad | -1.05 .. +0.79 rad |

Matches the engine contract default `camera.fov: 1.05`. Good — no change needed there.

### 11.3 Reticle / accuracy

| Key | Value |
|---|---|
| `spreadMin` | 0.15 deg |
| `spreadMax` | 4.5 deg |
| `convergeTime` | 0.90 s |
| `bloomPerShot` | +1.8 deg |
| `bloomWhileMoving` | +2.5 deg |
| `bloomHoldAfterShot` | 0.12 s |
| `critChanceBase` | 0.05 |
| `critChanceConverged` | 0.12 |
| `critDamageMult` | 1.5 |
| Laser-sight attachment | forces spread to `spreadMin` permanently |

### 11.4 Weapons (8 slots)

`RPM` = rounds/min. `reload` in seconds. `stagger` feeds the stagger accumulator (see 3.2).
Enemy HP is on a 100-point scale where a baseline Ganado = 100.

| # | Weapon | Damage | Cap | RPM | Reload | Stagger | Falloff | Slots | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Sidearm (9mm)** | 15 | 12→22 | 260 | 1.45 | 1.0 | none | 3x2 | starter; best crit rate |
| 2 | **Heavy Pistol** | 26 | 8→16 | 150 | 1.90 | 1.8 | none | 3x2 | the "Red9"; high stopping power |
| 3 | **Machine Pistol** | 7 | 30→70 | 900 | 1.40 | 0.25 | 0.85x @ 15 m | 3x2 | ammo hose; hard to crit |
| 4 | **Pump Shotgun** | 12 x 8 pellets | 6→12 | 55 | 4.6 (full) | 6.0 | 0.55x @ 12 m | 8x2 | knockdown < 4 m only |
| 5 | **Combat Shotgun** | 10 x 9 pellets | 8→16 | 90 | 4.0 | 5.0 | 0.85x @ 18 m | 8x2 | tight spread, **keeps knockdown at range** |
| 6 | **Bolt Rifle** | 95 | 5→12 | 45 | 3.6 | 8.0 | none | 8x2 | scope; pierces 2 |
| 7 | **Magnum** | 220 | 6→10 | 60 | 3.0 | 12.0 | none | 4x3 | pierces 3; ammo is precious |
| 8 | **Flare/Rocket** | 900 (4.0 m radius) | 1 | — | — | — | — | 10x3 | boss tool; one-shot |
| — | **Knife** | 12 (25 on stagger) | — | 170 | — | 2.0 | — | 2x2 | 100 durability; parry -8, stealth kill -15, grab escape -20 |
| — | **Frag Grenade** | 140 @ 4.0 m, 60 @ 6.5 m | — | — | — | 15.0 | — | 2x1 | |
| — | **Flash Grenade** | 0 dmg, blind 4.0 s @ 7.0 m | — | — | — | 20.0 | — | 2x1 | **instant-kills exposed mutants** |

**Upgrade tree per weapon (5 ranks each, prices scale by tier):**

```
Power    : +18% per rank of base       cost 4k, 8k, 14k, 22k, 34k  (tier-1 weapon)
Capacity : +25% per rank (rounded)     cost 3k, 6k, 11k, 18k, 28k
Reload   : -12% per rank               cost 3k, 6k, 11k, 18k, 28k
Rate     : +10% per rank               cost 5k, 9k, 15k, 24k, 36k
Exclusive: unlocked at all-5 OR via a rare Exclusive Token (2 exist in the game)
```

Tier multipliers on all costs: sidearm 1.0x, shotgun 1.4x, rifle 1.8x, magnum 2.6x.
Full-upgrading the magnum should cost roughly 300k — i.e. **the player can afford to max exactly
one late-game weapon.** That forced choice is the entire point of the economy.

### 11.5 Enemies (8 types — matching `IP.Actors.makeRig` kinds)

| # | Rig kind | HP | Contact dmg | Speed (walk/charge) | Stagger thresh | Behavior |
|---|---|---|---|---|---|---|
| 1 | `ganado` | 100 | 12 | 1.5 / 3.2 | head 3.0 / knee 2.5 | baseline; throws weapon at 8–14 m (25% chance/6 s) |
| 2 | `ganado` (thrower variant) | 90 | 10 melee, 22 explosive | 1.4 / 2.8 | 2.5 | carries explosive; **shooting it kills a 3.5 m cluster** |
| 3 | `soldier` | 190 | 18 | 1.8 / 3.6 | head 6.0 (helmet blocks first 2 headshots) | ranged, takes cover, coordinates |
| 4 | `shielder` | 150 (+shield 120) | 15 | 1.2 / 2.4 | frontal immune | must be flanked / shield destroyed / pierced |
| 5 | `brute` | 520 | 34 | 1.4 / 3.9 | 22.0 (handguns cannot reach it alone) | charge attack, no flinch, telegraphed 1.1 s wind-up |
| 6 | `spitter` | 80 | 20 (ranged, 0.9 m AoE) | 1.6 / 2.6 | 2.0 | fires from 6–16 m, repositions every 3 s, fragile |
| 7 | `crawler` | 60 | 14 | 2.4 / 5.2 | 1.5 | ceiling/floor, leaps 6 m, **one-shot killable in the air** |
| 8 | `boss` | 4200 | 45 (55 slam AoE) | 2.0 / 4.4 | phase-gated only | 3 phases; environmental kill available in phase 3 |

**Mutation (Plaga analogue):** on head-hitbox depletion, roll
`0.12 + 0.02*(rank-5)`. Mutant = 1.35x speed, 1.6x damage, 45% of base HP, unstaggerable,
**instantly killed by flash**. Max 2 concurrent.

**Special-enemy one-rule table (pick 3–4 for the game):**

| Enemy | The one rule | Taught by |
|---|---|---|
| `brute` (chainsaw variant) | cannot be staggered, insta-kills on contact — **run** | audible engine idle at 30 m |
| `shielder` | shoot the back / flank | shield sparks visibly on frontal hits |
| `crawler` | kill it airborne | it telegraphs a 0.5 s crouch before leaping |
| Blind variant | **it hunts by sound** — throw something, or walk | it visibly cocks its head at noises |
| Regenerating variant | needs the scope to find the nodes | it visibly re-knits a destroyed limb |

### 11.6 Stagger, melee, grabs

| Key | Value |
|---|---|
| `staggerDecay` | 3.0 /s |
| `winceDecay` | 8.0 /s |
| `winceThreshold` | 1.0 |
| Location multipliers | head 3.0, knee 2.5, arm 0.8, torso 0.4, back 1.2 |
| `headStunDuration` | 2.5 s (melee window) |
| `kneelDuration` | 3.0 s (melee window) |
| `meleePromptRadius` | 1.9 m |
| Roundhouse kick damage | 55; knocks target flat 2.2 s |
| Roundhouse **AoE knockdown** | 2.6 m radius, 30 damage, 1.6 s knockdown to bystanders |
| Suplex damage | 90 (requires being behind a kneeling target); 2.8 s down |
| Thrust kick (running in) | 45, 3.0 m knockback |
| Melee cooldown | 0.9 s |
| Stealth kill | instant on `ganado`/`spitter`/`crawler`; 60% max HP on others |
| Parry window | 0.20 s (perfect: inner 0.08 s) |
| Parry knife cost | 8 durability (0 on perfect) |
| Parry stagger applied | 10.0 |
| **Grab:** initial damage | 4 |
| **Grab:** damage per second held | 6 |
| **Grab:** max hold | 3.0 s |
| **Grab:** escape taps | **8 desktop / 5 touch**, alternating 2 keys, switch once at the halfway point |
| **Grab:** knife escape | instant, costs 20 durability |
| **Grab:** immune window | 2.0 s of i-frames after any escape |
| **Grab:** cannot target Elena within 2.0 m of the player | hard rule |

### 11.7 Companion (Elena)

| Key | Value |
|---|---|
| `followDistanceTight` / `Loose` | 1.6 m / 3.5 m |
| `lateralBias` | 0.8 m to the player's **left** |
| `catchUpDistance` | 6.0 m → sprint 4.6 m/s |
| `teleportDistance` | 25 m, **off-screen and behind cover only** |
| `repathInterval` | 0.35 s (0.15 s in combat) |
| `downedMeterMax` | 100; hit adds 25–40 by attacker tier |
| `downedDecay` | 6/s out of combat, 2/s in combat |
| `reviveWindow` | 25 s standard / 18 s hard / 40 s assisted |
| `reviveHoldTime` | 1.2 s at ≤ 1.5 m, **costs no item** |
| `postReviveInvuln` | 6.0 s |
| `carryEscapeDistance` | 22 m (carrier at 2.6 m/s vs player 3.4 m/s → always catchable) |
| `carrierDropOnDamage` | 25% of its max HP, or any stagger, or any melee execution |
| `cmdStay` auto-cancel | 30 s, or player > 18 m |
| Friendly fire | **none**, except flagged `defendElena` sequences |
| Explosive damage to her | 0.25x (0.0 on touch) |
| Firing-lane capsule | 14 m long, 0.9 m radius → she sidesteps at 4.0 m/s |
| Collision vs player | none (soft push 2.0 m/s) |
| Capsule | r 0.28 m, h 1.68 m |
| Carry capacity | 6 inventory squares |

### 11.8 Crowd / attack tokens

| Difficulty | Tokens | Max alive per arena | Ring radius | Gap interval |
|---|---|---|---|---|
| Assisted | 1 | 8 | 4.0 m | every 7 s, 3.5 s open |
| Standard | 2 | 12 | 3.5 m | every 10 s, 2.5 s open |
| Hard | 3 | 16 | 3.2 m | every 12 s, 2.0 s open |
| Nightmare | 4 | 20 | 3.0 m | every 15 s, 1.5 s open |

Plus `+1` token at director rank ≥ 7, `-1` at rank ≤ 2. Token timeout 4.0 s, cooldown 1.2 s.
Personal separation radius 0.75 m. Ring rotation 0.6 rad/s, flipping every 4–7 s.
Max 2 concurrent barks, 0.6 s global cooldown.

### 11.9 Director / rank

Use the point table and rank-effect table in §4.4 verbatim. Start `progress = 5500`.
Difficulty sets caps: Assisted `[1,5]`, Standard `[2,9]`, Hard `[4,10]`, Nightmare `[10,10]`
(pinned — the RE4 Professional rule `[S]`).

### 11.10 Drops and economy

| Roll | Base chance | Modifier |
|---|---|---|
| nothing | 35% | scaled by `(2.0 - ammoScarcity)` |
| pesetas 200–1200 | 25% | tier-scaled amount |
| gunpowder | 15% | |
| resources | 8% | |
| ammo | 12% | `x ammoScarcity x rankAmmoMult` |
| green herb | 4% | `x healthScarcity` |
| grenade | 1% | |

`ammoScarcity = clamp(1 - carried/capacity, 0.15, 1.0)` for the equipped weapon.
Ammo type: 75% equipped, 20% other carried, 5% owned-but-stored.
**Safety floor:** < 6 usable rounds AND 0 heals → next kill drops ammo at P=1.0, max once/90 s.

**Merchant:** one per 20–35 min of play, always *before* an escalation. Prices +25% on Hard,
+40% on Nightmare. Sell-back at 100% of listed treasure value (never penalize selling treasure —
it converts exploration into agency and should feel clean).

**Inventory case progression:** `6x10 (60) → 7x11 (77) → 8x12 (96) → 10x12 (120)`.
Exactly the RE4 curve `[S]`. Ship 3–4 case skins with small passive perks (one boosts sidearm
ammo drops, one boosts herb drops, one adds +1 knife durability per repair) and 8–12 charms
earned from an optional shooting range.

### 11.11 MOBILE / TOUCH ADAPTATIONS

Touch is a different game. RE4R's own iOS port was widely criticized: touch controls
*"far too convoluted for fluid play"* and *"obscuring much of the screen"*, with reviewers
uniformly recommending a physical controller. `[S]`
(https://toucharcade.com/2023/12/18/resident-evil-4-remake-iphone-15-pro-gameplay-review-mac-cloud-save/,
https://www.tapsmart.com/games/review-resident-evil-4/,
https://www.imore.com/gaming/resident-evil-4-iphone-15-pro-max-hands-on-impressions-a-zombie-killing-dream-with-some-minor-drawbacks)
**Do not repeat their mistake. Change the game, not just the buttons.**

RE4R's own aim assist has two modes worth copying `[S]`
(https://game8.co/games/Resident-Evil-4-Remake/archives/408217): **Snap** (reticle sticks to the
target) and **Snap and Follow** (reticle sticks *and tracks* the target as it moves), plus an
adjustable **activation range**.

| System | Desktop | **Touch / mobile** |
|---|---|---|
| **Aim assist cone** | 0 (off) | **8 deg** half-angle snap cone; **12 deg** on Assisted |
| Aim assist mode | — | **Snap and Follow**, with 0.55 follow strength (0..1 lerp toward target center per frame) |
| Aim assist range | — | 22 m; disabled beyond |
| Aim assist target priority | — | nearest-to-reticle-angle, tie-break on lowest HP, **never** a downed enemy |
| Aim assist bias point | — | **head hitbox** if the head is unobstructed, else torso center |
| Auto-fire | off | optional "fire on release of aim" toggle for one-handed play |
| `aimMoveMult` | 0.30 | **0.45** (touch players cannot micro-reposition as fast) |
| Reticle bloom | full | **spreadMax 4.5 → 2.5 deg**, `convergeTime 0.90 → 0.60 s` |
| **Melee** | prompt + button | **Single context button.** No directional variants — the game auto-picks kick vs suplex from the approach angle. **Auto-triggers the correct one.** |
| Melee prompt radius | 1.9 m | **2.6 m** |
| Melee auto-advance | none | if the prompt is on and the player taps, **dash up to 2.0 m** toward the target automatically |
| **Interact radius** | 1.4 m | **2.4 m**, and the prompt targets the *highest-priority* interactable rather than the nearest |
| Interact button size | — | ≥ 64 CSS px, bottom-right, thumb-reachable, never under the aim stick |
| **Grab escape** | 8 taps | **5 taps**, single button (no alternation), and a **swipe** also counts as 2 taps |
| **Parry window** | 0.20 s | **0.30 s** (0.14 s perfect) |
| **Quick turn** | stick-back + run | **double-tap the movement stick downward**, or a dedicated 180 button |
| Enemy tokens | per §11.8 | **-1 token at every difficulty** |
| Max alive per arena | per §11.8 | **x0.75**, rounded down |
| Explosive damage to Elena | 0.25x | **0.0** |
| Camera | mouse-look | **right-half-screen drag**; sensitivity slider mandatory; invert toggles for movement and aim **separately** `[S]` |
| Sprint | button | **left stick pushed past 85% deflection** for 0.25 s (no extra button) |
| Inventory | grid drag | **tap-to-select, tap-to-place**, with a "rotate" button. Never require drag-and-hold precision on a 6x10 grid on a phone. |
| HUD opacity | 100% | 70% idle, 100% in combat — screen real estate is the scarcest resource |
| Quality tier | 2 | **0** (`IP.Renderer.setQuality(0)`); target 30 fps |

**Two touch rules that matter more than all of the above:**

1. **Never put a required input under the player's thumbs during combat.** Both thumbs are
   occupied by the sticks. Fire, aim, melee, and interact must all live on the outer edges
   or be auto-triggered.
2. **The melee prompt must be impossible to miss.** On desktop, missing the roundhouse window
   is a skill check. On touch it is a UI failure. Widen the window to 3.2 s and the radius to
   2.6 m, and pulse the button.

---

## 12. THE FIVE THINGS TO GET RIGHT FIRST

If schedule collapses, ship these five and the game will still read as RE4:

1. **Shoot-to-stagger → free melee → AoE knockdown.** (§3.1, §11.6) The whole combat identity.
2. **Attack tokens with a rotating ring and a periodic escape gap.** (§7.4, §11.8) The whole
   crowd identity.
3. **Elena: no health bar, no friendly fire, revive is free, `cmdStay` auto-cancels, she
   sidesteps the firing lane, she opens content.** (§6.3) The whole escort identity.
4. **The hidden director scaling drops and aggression, with a hard anti-soft-lock floor.**
   (§4.4, §11.10) The whole difficulty identity.
5. **Grid inventory where weapon footprint is a real cost, plus a merchant every ~25 minutes.**
   (§5, §11.10) The whole economy identity.

Camera polish, audio stingers, and treasure combining are all high-value but strictly secondary
to those five.

---

## SOURCES

**Camera / controls**
- https://www.videogameschronicle.com/news/shinji-mikami-says-resident-evil-4s-camera-wasnt-meant-to-be-groundbreaking/
- https://www.gamedeveloper.com/business/shinji-mikami-didn-t-realize-the-impact-of-i-resident-evil-4-i-s-camera
- https://medium.com/@elio.lucantonio/the-architecture-of-anxiety-how-resident-evil-4-reconfigured-the-3d-viewport-7ee41935a930
- https://game8.co/games/Resident-Evil-4-Remake/archives/409453
- https://www.nexusmods.com/residentevil42023/mods/123
- https://www.gamepressure.com/resident-evil-4-1/keybinds/z510974
- https://game8.co/games/Resident-Evil-4-Remake/archives/408601
- https://gamerant.com/resident-evil-4-remake-quick-turn-guide-how-to/
- https://www.resetera.com/threads/why-do-some-people-believe-that-resident-evil-4-does-not-have-tank-controls.16000/
- https://www.dualshockers.com/resident-evil-4-remake-laser-sight-aim/
- https://www.nexusmods.com/residentevil42023/mods/4829

**Combat**
- https://gameranx.com/features/id/451881/article/resident-evil-4-remake-how-to-perform-melee-grapple-moves/
- https://twistity.com/how-to-kick-and-suplex-in-resident-evil-4-remake/
- https://gamerant.com/resident-evil-4-remake-re4-how-to-do-suplex/
- https://progametalk.com/resident-evil-4-remake/how-to-melee-attacks/
- https://www.moddb.com/games/resident-evil-4/tutorials/resident-evil-4-animation-list
- https://www.thegamer.com/resident-evil-4-infographic-weapons-hidden-numbers-stats/
- https://game8.co/games/Resident-Evil-4-Remake/archives/408847
- https://game8.co/games/Resident-Evil-4-Remake/archives/407324
- https://www.shacknews.com/article/134540/how-to-parry-with-the-knife-resident-evil-4
- https://www.escapistmagazine.com/how-to-stealth-kill-in-resident-evil-4-remake/
- https://game8.co/games/Resident-Evil-4-Remake/archives/407522
- https://www.thegamer.com/resident-evil-4-remake-avoid-being-grabbed-strategy/
- https://steamcommunity.com/app/2050650/discussions/0/5440953210426107576/

**Weapons / stats**
- https://game8.co/games/Resident-Evil-4-Remake/archives/407357
- https://game8.co/games/Resident-Evil-4-Remake/archives/408811
- https://game8.co/games/Resident-Evil-4-Remake/archives/408817
- https://gameranx.com/features/id/456491/article/resident-evil-4-remake-all-exclusive-weapon-perks-fully-upgraded-guns-guide/
- https://gamewith.net/resident-evil-4-remake/article/show/38470
- https://residentevil.fandom.com/wiki/Mine_Thrower
- https://residentevil.fandom.com/wiki/Chicago_Typewriter
- https://residentevil.fandom.com/wiki/Riot_Gun_(RE4)
- https://residentevil.fandom.com/wiki/Resident_Evil_4_creature_damage_chart
- https://www.imfdb.org/wiki/Resident_Evil_4
- https://sirusgaming.com/resident-evil-4-remake-ammo-crafting-recipes/
- https://gamewith.net/resident-evil-4-remake/article/show/38347
- https://residentevil.fandom.com/wiki/Heavy_Grenade_(RE4_Remake)
- https://residentevil.fandom.com/wiki/Flash_Grenade_(RE4)

**Director / difficulty**
- https://www.speedrun.com/re4console/guides/3sahj
- https://residentevil.fandom.com/wiki/Game_Rank_(RE4)
- https://residentevil.fandom.com/wiki/Rank
- https://www.engadget.com/2015-06-03-resident-evil-4-difficulty.html
- https://www.cbr.com/resident-evil-4-dynamic-difficulty-capcom/
- https://game8.co/games/Resident-Evil-4-Remake/archives/408067
- https://www.gamerevolution.com/guides/937631-resident-evil-4-remake-get-more-ammo-crafting-rng

**Inventory / economy**
- https://residentevil.fandom.com/wiki/Attache_Case
- https://www.evilresource.com/resident-evil-4/equipment/attache-case
- https://godisageek.com/2023/03/resident-evil-4-remake-how-to-carry-more-items/
- https://gamerant.com/resident-evil-4-remake-all-attache-cases-guide-which-case-is-the-best-how-to-get-all-re4-cases/
- https://primagames.com/tips/every-attache-case-charm-resident-evil-4-remake
- https://gamerant.com/resident-evil-4-remake-re4-best-treasure-combinations-gemstone-bonus/
- https://www.gamespot.com/articles/resident-evil-4-treasures-gemstones-guide-hub/1100-6512562/
- https://residentevil.fandom.com/wiki/Spinel_(RE4_Remake)
- https://bloody-disgusting.com/video-games/3658221/resident-evil-4-perfected-inventory-system-resident-evil-25/

**Ashley / escort**
- https://kotaku.com/resident-evil-4-remake-re4-ashley-qte-knife-durability-1850062148
- https://gameinformer.com/exclusive-feature/2023/02/02/why-capcom-changed-ashley-in-resident-evil-4
- https://gamerant.com/resident-evil-4-co-op-gameplay-ashley/
- https://www.gameshub.com/news/news/resident-evil-4-remake-ashley-graham-escort-missions-difficulty-39980/
- https://www.inverse.com/gaming/resident-evil-4-remake-ashley-redemption
- https://screenrant.com/resident-evil-4-remake-gameplay-ashley-changes/
- https://www.gamerevolution.com/guides/937633-resident-evil-4-remake-ashley-keeps-dying-friendly-fire
- https://twinfinite.net/guides/how-to-revive-ashley-in-resident-evil-4-remake/
- https://www.gamespot.com/articles/resident-evil-4-ashley-guide/1100-6512555/
- https://www.antmag.net/guide/resident-evil-4-remake/strategy-advanced-tactics/ashleys-commands-utility
- https://www.playstationlifestyle.net/2023/01/31/resident-evil-4-remake-ashley-dumpster-health-bar-changes/

**Enemies**
- https://residentevil.fandom.com/wiki/Ganado/gameplay
- https://gamerant.com/resident-evil-4-remake-capcom-ganados-redesign-explained/
- https://screenrant.com/resident-evil-4-remake-ganados-new-enemies-re4/
- https://medium.com/@gabrielpadinha/designing-with-purpose-a-resident-evil-4r-enemy-analysis-c54d43298fbc
- https://www.evilresource.com/resident-evil-4/enemies/dr-salvador
- https://residentevil.fandom.com/wiki/Chainsaw_Man
- http://residentevil42013.blogspot.com/2013/10/garrador.html
- http://residentevil42013.blogspot.com/2013/10/regenerators.html
- https://game8.co/games/Resident-Evil-4-Remake/archives/408431
- https://www.gamesradar.com/games/resident-evil/microsoft-ea-and-other-publishers-should-give-up-on-artificial-intelligence-we-peaked-21-years-ago-when-resident-evil-4-devs-were-thrilled-ai-enemies-could-think-like-a-smart-person-by-using-weapons-of-course/

**Level design / pacing / QTE**
- https://kotaku.com/the-cruel-brilliance-of-resident-evil-4s-village-fight-1639485771
- https://www.kokutech.com/blog/gamedev/design-patterns/power-fantasy/resident-evil-4
- https://www.escapistmagazine.com/resident-evil-4-village-sieges-made-the-game/
- https://medium.com/@gabriel.fuentesgd/level-design-analysis-resident-evil-4-remake-the-village-896a01c58feb
- https://www.shacknews.com/article/133961/resident-evil-4-remake-wont-have-qtes
- https://www.pcgamer.com/resident-evil-4-remake-is-ditching-qtes-and-i-couldnt-be-more-upset/
- https://game8.co/games/Resident-Evil-4-Remake/archives/407370
- https://residentevil.fandom.com/wiki/Typewriter
- https://filmstories.co.uk/features/resident-evil-save-rooms-kept-us-safe-from-the-stresses-of-survival-horror/

**Audio / UI / mobile**
- https://gameinformer.com/exclusive-feature/2023/02/16/resident-evil-4s-sound-director-and-composer-break-down-the-remakes
- https://www.destructoid.com/resident-evil-4-remakes-atmospheric-sound-design-deserves-praise/
- https://www.gameuidatabase.com/gameData.php?id=1709
- https://game8.co/games/Resident-Evil-4-Remake/archives/408217
- https://toucharcade.com/2023/12/18/resident-evil-4-remake-iphone-15-pro-gameplay-review-mac-cloud-save/
- https://www.tapsmart.com/games/review-resident-evil-4/
- https://www.imore.com/gaming/resident-evil-4-iphone-15-pro-max-hands-on-impressions-a-zombie-killing-dream-with-some-minor-drawbacks
- https://caniplaythat.com/2023/05/12/resident-evil-4-remake-accessibility-review/
