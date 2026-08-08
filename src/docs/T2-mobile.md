# T2 — Mobile touch controls (`src/p13-mobile.js`)

The phone is the primary platform, so this layer replaces the keyboard/mouse scheme
entirely rather than decorating it. It owns its own DOM (appended to `#ui`), its own
touch pipeline, and publishes a single struct, `mobAxes`, which
`fltUpdate()` in `p7f-physics-fallback.js` reads whenever `mobAxes.active`.

---

## 1. What was actually broken

The previous agent's file loaded cleanly and built its DOM, but the scheme was
unusable on a real phone and invisible in a headless phone context. Three distinct
faults, found by driving the real build with Playwright + CDP `Input.dispatchTouchEvent`:

### 1.1 `p1-shell.html` had no `<meta name="viewport">` — **the real bug**

Without it, a mobile browser lays the page out at its **980 px fallback width** and then
scales the whole thing down to fit the screen. Measured in a 390x844 iPhone context:

```
mobRoot   0,0  980x2120      <- layout viewport, not the device
mobThr    6,1670  40x230     <- 1670 px down a 2120 px page
mobRow    4,1908  972x34     <- an 8-button row 972 CSS px wide
```

Every control rendered at ~40 % scale (button text ~4 px tall) and the bottom band sat
below the fold. Fixed in `p1-shell.html`:

```html
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
```

plus `overscroll-behavior:none` and `-webkit-text-size-adjust:100%` on `html,body`
(kills pull-to-refresh, rubber-banding and iOS font inflation), and
`position:fixed;inset:0` so the document itself can never scroll.

### 1.2 `IS_MOBILE` is a pure UA sniff

`p3-gl.js` derives `IS_MOBILE` from `navigator.userAgent`. Any touch device that does
not advertise a phone UA — **iPadOS reports a desktop Safari UA**, and every automated
phone harness that does not forge one — got `mobSetEnabled(false)` and therefore *no
controls at all*. That is exactly what the earlier 390x844 screenshot showed.

Replaced with `mobWantTouch()`: a real digitiser (`maxTouchPoints > 0` or
`ontouchstart`) **and** either a coarse pointer or a viewport whose short side is
≤ 820 px. A desktop with a touchscreen therefore keeps its keyboard/mouse UI, an iPad
does not. `?touch` / `?desktop` in the URL and `localStorage.seg_touch` still override,
and the first real `touchstart` still force-enables.

### 1.3 No resting affordance

Both sticks were `opacity:0` until a finger landed (`.mobStk.a`). A new player saw an
empty screen and had no way to know the bottom band was live. The sticks are now always
drawn at their home position at `opacity:.55` with a dark scrim, an outline and a
caption (`TRANSLATE` / `PITCH · YAW`) so they read against a sunlit planet; the ring
brightens to 1.0 and re-centres under the thumb on contact.

---

## 2. The scheme

```
 ┌──────────────────────────────────────────┐
 │ #tl readout                  #tr readout │
 │ ▓ throttle          ( navball + gauges ) │   throttle: left edge portrait,
 │ ▓ 0/50/100 detents                       │             right edge landscape
 │ [SAS][RCS][GER][BRK][VIW][W-][W+][MENU]  │   38 px row, ~45 px buttons at 390 px
 │ ╭ left ╮        [↺][↻]         ╭ right ╮ │   activation band (158 px portrait)
 └──────────────────────────────────────────┘
```

* **Sticks** — floating origin inside a generous band (`zL` = left 42 % of the band,
  `zR` = right 42 %; the ring re-centres wherever the thumb lands and is clamped so it
  stays on screen). Dead zone 0.11, cubic expo blend `0.6·n³ + 0.4·n` — small thumb
  wobble is nothing, the tips stay linear and precise. Left = RCS translate (X lateral,
  Y vertical), right = pitch/yaw.
* **Roll** — dedicated hold buttons `↺ ↻` between the sticks (they update `mobAxes.roll`
  in the same event, not on the next frame), or a two-finger twist on the free area with
  its own dead zone.
* **Throttle** — a real vertical slider, not a stick axis. Absolute drag with magnetic
  detents at 0 / 50 / 100 %; a grab **within 24 px of the knob** drags relatively so fine
  trims do not jump, a grab anywhere else jumps to that value, and the last 6 px of the
  track always commits to the end so a relative grab can never make 0 %/100 %
  unreachable. It holds its value between drags and writes straight into `SHIP.throttle`
  (single source of truth); if the sim cuts the throttle — e.g. fuel exhaustion in
  `fltUpdate` — the slider follows it back down.
* **Camera** — one finger on the free area orbits `CAM.yaw/pitch`, two fingers pinch
  `CAM.dist`. Camera touches are a separate `kind:'C'` tracker class, so they can never
  fight the sticks. `fltBindInput` already yields mouse-look when `mobAxes.active`.
* **Buttons** — SAS / RCS / gear / brakes / view / warp∓ / MENU on one 38 px row that
  sits **above** the band and **below** the navball (measured: navball ends at y 632,
  row occupies 642-680, band starts at 686 on a 390x844 screen). MENU opens a full-screen
  systems panel with wormhole, scan, star map, docs and reset-camera, so the four
  `#btns` actions stay reachable without stealing screen space.

## 3. Multi-touch correctness

* Every touch is tracked in a `Map` keyed by `Touch.identifier` with a `kind`
  (`L`/`R`/`T`/`C`), so fingers are never confused by order.
* `touchend` **and** `touchcancel` go through the same handler, which deletes the ended
  identifiers and then *rebuilds from `e.touches`* — the browser's own live list. A
  finger that slid off the element, was stolen by the system, or whose end event was
  dropped can therefore never leave an axis latched.
* `mobAxesFromTouches()` is called directly from `touchend` and from the roll buttons,
  so a release reaches `mobAxes` in the same event rather than up to a frame later
  (at 30 fps that is 33 ms of ghost input; headless it was a whole second).
* `visibilitychange`, `blur`, panel-open and orientation change all call
  `mobClearAll()`.
* `preventDefault()` is called on every tracked touch move and on `gesturestart` /
  `gesturechange` / `dblclick`, so the page never scrolls, rubber-bands or double-tap
  zooms — but **not** on untracked touches, so the docs panel, the wormhole picker and
  the star map keep their own gestures.

## 4. Layout, orientation and the iOS 100vh problem

`mobLayout()` recomputes everything from `visualViewport.width/height` (falling back to
`innerWidth/Height`) and sets `--mobH`, with `body.mobOn #ui{height:var(--mobH,100dvh)}`.
The visual viewport shrinks when the iOS URL bar is showing, so the control band tracks
the actually-visible area instead of hiding underneath the bar — `100dvh` is only the
fallback. It is re-run on `resize`, `orientationchange`, the
`(orientation:portrait)` media query, and `visualViewport` resize/scroll.

`env(safe-area-inset-*)` is read through two hidden probe divs (the only reliable way to
get those values into JS) and folded into the band height and the row/throttle insets,
so `viewport-fit=cover` does not put a stick under the home indicator or a notch.

Landscape (844x390) differs: the band shrinks to 128 px, `#tr` is hidden, the navball
panel shrinks (`body.mobLand`) and moves to the right, the message/subtitle column moves
left, and the throttle moves to the **right** edge because the left edge belongs to the
`#tl` readout panel.

## 5. Not blocking the overlays

`mobBlocked()` is true for the wormhole picker, the docs panel, the star map
(`UI.mapOpen` / `#map_root`) and the systems menu. When blocked, `#mobRoot` goes
`pointer-events:none` and `#mobUI` `visibility:hidden`. This used to be evaluated only
in the per-frame `mobUpdate()`; it is now also driven from a capturing
`click`/`touchend` listener (`mobBlockSync()`), so at 1-30 fps the sticks stop eating
touches in the same tick the panel opens.

`p1-shell.html` sets `touch-action:none` on `<body>` to kill browser gestures — which
also kills **touch scrolling in every descendant**. `#docs` and `#pick` are both long
scrolling panels, so `body.mobOn #docs,#pick{touch-action:pan-y}` gives it back. On a
real phone the documentation was otherwise unscrollable.

## 6. Cost

Per frame `mobUpdate()` does: one pass over a Map that holds ≤ 4 records, ~6 arithmetic
ops per axis, and 5 `classList.toggle` calls that are no-ops when unchanged. The stick
repaint is memoised on a position signature, so an untouched control writes no styles at
all. Measured contribution on the SwiftShader headless run is below the timer noise
floor; the realistic phone figure is **< 0.05 ms/frame**, versus a ~33 ms budget. No
per-frame allocation (the only allocations are the `Set` in `mobUp`, which happens once
per touch release, and the signature string on a moving stick).

## 7. Verification

`tools/mob.js` (added) launches a phone context
(`viewport 390x844, hasTouch, isMobile, deviceScaleFactor:1`) and drives **real** touch
events over CDP `Input.dispatchTouchEvent` — not synthetic clicks. `--land` runs
844x390, `--shot=x.png` captures. **52 assertions pass in portrait, 52 in landscape, 0
console/page errors.** Highlights, with the values it actually observed:

| Assertion | Observed |
|---|---|
| right stick up → `mobAxes.pitch` → `SHIP.rcs[0]` | `pitch -0.615`, `rcs [-0.437,0,0]` |
| right stick right → `SHIP.rcs[1]` | `yaw 0.681`, `rcs [0,0.520,0]` |
| finger lifted → axes zero **and** `SHIP.rcs` zero | `{pitch:0,yaw:0}`, `rcs [0,0,0]`, map size 0 |
| throttle drag to mid / top | `SHIP.throttle` 0.5 then 1 (detent) |
| throttle holds after release | `1`, readout `100%` |
| throttle continuous between detents | `0.35` at 35 % of the track |
| fat-finger slop beside the slider grabs it | `kind:'T'`, 0.5 |
| a stick input does not disturb the throttle | unchanged to 1e-9 |
| two fingers at once | `n=2 kinds=LR`, `translate[0] 0.615` **and** `pitch -0.615` together |
| lifting one of two | other axis survives, released axis is exactly 0 |
| `touchcancel` | map empty, all axes 0 |
| sky drag orbits / pinch zooms | `CAM.yaw 0.60→0.17`, `CAM.dist 82→219` |
| SAS / GEAR buttons | `SHIP.sas`, `SHIP.gearDown` toggled |
| roll button → `mobAxes.roll` → `SHIP.rcs[2]` | 1 → 1, and back to 0 on release |
| star map opens, gets the touch, controls hidden | `map_cv` on top, `mobRoot` `pointer-events:none` |
| docs opens, scrolls, controls hidden | `touch-action:pan-y`, `scrollTop 400` |
| MENU → CREATE WORMHOLE → picker | 25 targets, menu closed, `pan-y` |
| rotate **with a finger down** | relayout to 844x390, tracker emptied, axes 0, selfTest ok |
| page never scrolls | `scrollX/Y 0`, `scrollWidth == innerWidth` |

Screenshots: `tools/scratch/shot_portrait.png` (390x844),
`tools/scratch/shot_landscape.png` (844x390). Desktop is unaffected —
`tools/test.js` still reports `ORBIT / EARTH / 420 km` with 0 errors and the full
keyboard UI (`shot1.png`).

## 8. Files touched

| File | Change |
|---|---|
| `src/p13-mobile.js` | rewritten (owner) |
| `src/p1-shell.html` | added the viewport/charset meta block; `overscroll-behavior:none`, `text-size-adjust`, `position:fixed` on `html,body` |
| `tools/mob.js` | **new** touch harness |
| `tools/mm.js` | one line: at 390 px with touch the mobile scheme now hides `#btns`, so `p.click('#b_map')` could no longer hit it — it dispatches the same handler instead. The tool passes. |

`src/p7f-physics-fallback.js` and `src/p8-ui.js` needed no changes: `fltUpdate` already
reads `mobAxes` when `mobAxes.active`, and `fltBindInput` already yields the camera.

## 9. Where the design comes from

* **Kerbal Space Program** — a discrete throttle that *holds*, separate translate and
  rotate authority, and RCS as its own toggle. A rocket needs a throttle you can set and
  forget; putting it on a spring-return stick axis (the previous scheme) makes any burn
  of more than a second impossible.
* **Console twin-stick / Call of Duty Mobile** — floating-origin sticks with a large
  activation region rather than fixed rings. Thumbs land where they land; a fixed ring
  forces the player to look at the screen bottom instead of the horizon.
* **Elite Dangerous / Star Citizen** — dead zone + expo on every rotation axis, so the
  ship is docile near centre and still reaches full authority at the stops.
* Apple's Human Interface Guidelines 44 pt minimum target drove the 38 px row height
  with 45 px-wide buttons at 390 px, plus the 16 px invisible slop around the throttle.
