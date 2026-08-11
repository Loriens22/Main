# Ornight Plus — build contracts

Every agent working in this repo reads this file first. It fixes the seams
between packages so parallel work composes instead of colliding.

## Product

**Ornight Plus** — a coding agent harness control surface, mirroring the
architecture and feature set of T3 Code, rebuilt for **mini tablets**
(7–8.5", high DPI, portrait *and* landscape, touch-first). A desktop build
ships alongside it. Design language: **liquid glass** over a nocturnal palette.

## Monorepo layout and ownership

```
packages/protocol   OWNED BY LEAD — shared types, provider registry, diff parser.
                    Read it. Do not edit it. If you need a type added, say so
                    in your final report instead of editing.
packages/core       Agent: HARNESS      — provider adapters, threads, worktrees, git.
packages/glass      Agent: GLASS        — the liquid-glass design system.
apps/server         Agent: HARNESS      — daemon: HTTP + WebSocket + remote access.
apps/tablet/src/
  brand/            Agent: GLASS        — splash sequence, Ornight badge, logo, night field.
  shell/            Agent: SHELL        — app shell, sidebar, thread list, layout, nav.
  chat/             Agent: SHELL        — conversation view, message rendering, composer.
  review/           Agent: REVIEW       — diff viewer, git panel, tool cards, permissions, ship flow.
  state/            OWNED BY LEAD       — zustand store + selectors. Read, do not edit.
  mock/             OWNED BY LEAD       — demo transport and fixtures.
  lib/              OWNED BY LEAD       — small shared helpers.
  App.tsx main.tsx index.css            OWNED BY LEAD.
apps/desktop        Agent: DESKTOP      — Electron PC build, desktop layout.
packaging/          Agent: DESKTOP      — PWA manifest, service worker, icons, dist scripts.
reference/          Agent: RESEARCH     — T3 Code source + research notes.
```

**Rule: only write files inside the directories you own.** If you need
something from another area, code against the documented contract below and
assume it will exist. Do not create placeholder versions of another agent's
files — that causes merge conflicts.

## Import map

- `@ornight/protocol` — all domain types, `ClientCommand`, `ServerEvent`, `Transport`.
- `@ornight/protocol/providers` — `PROVIDERS`, `PROVIDER_ORDER`, `providerOf(id)`.
- `@ornight/protocol/diff` — `parseUnifiedDiff`, `parseHunks`, `splitMultiFileDiff`, `countChanges`.
- `@ornight/glass` — the design system (below).
- `@/state/store` — `useOrnight` (zustand hook + `.getState()`).
- `@/state/selectors` — `useActiveThread`, `useThread`, `useThreadList`, `useMessages`,
  `useGitState`, `usePendingPermissions`, `useProvider`, `useTotalChanges`,
  `useConnection`, `layoutFor(width, height)`.
- `@` is aliased to `apps/tablet/src`.

Read `packages/protocol/src/index.ts` and `apps/tablet/src/state/store.ts`
before writing UI code. They are short and they are the truth.

## `@ornight/glass` public API — GLASS agent implements exactly this

Components (all accept `className`, `style`, `children` and forward refs where sensible):

| Export | Props |
| --- | --- |
| `Glass` | `as?`, `tone?: 'panel' \| 'raised' \| 'sunken' \| 'chrome' \| 'accent'`, `blur?: 'sm' \| 'md' \| 'lg' \| 'xl'`, `radius?: 'sm' \| 'md' \| 'lg' \| 'xl' \| 'pill'`, `border?: boolean`, `glow?: boolean`, `interactive?: boolean` |
| `GlassButton` | `variant?: 'primary' \| 'ghost' \| 'quiet' \| 'danger'`, `size?: 'sm' \| 'md' \| 'lg'`, `icon?: ReactNode`, `loading?: boolean`, `block?: boolean`, + `<button>` props |
| `GlassIconButton` | `label: string` (a11y), `size?: 'sm' \| 'md' \| 'lg'`, `active?: boolean`, + `<button>` props |
| `GlassSheet` | `open: boolean`, `onClose: () => void`, `title?: ReactNode`, `side?: 'bottom' \| 'right' \| 'center'`, `size?: 'sm' \| 'md' \| 'lg' \| 'full'` |
| `GlassSegmented` | `value: string`, `onChange: (v: string) => void`, `options: { value: string; label: ReactNode; hint?: string }[]`, `size?: 'sm' \| 'md'` |
| `GlassField` | `value: string`, `onChange: (v: string) => void`, `placeholder?`, `multiline?`, `rows?`, `label?`, `icon?` |
| `GlassBadge` | `tone?: 'neutral' \| 'accent' \| 'success' \| 'warn' \| 'danger'`, `size?: 'sm' \| 'md'` |
| `GlassScroll` | `fade?: boolean` — momentum scroll container with masked edges |
| `GlassDivider` | `vertical?: boolean` |
| `GlassSpinner` | `size?: number` |
| `GlassProgress` | `value: number` (0–1), `indeterminate?: boolean` |
| `GlassTooltip` | `label: string` — long-press on touch, hover on pointer |
| `LiquidText` | `children: string`, `size?: number \| string`, `weight?: number`, `glow?: number` (0–1), `as?` — the embossed/refracted branding type |
| `OrnightMark` | `size?: number`, `animated?: boolean` — the app icon as inline SVG |

Also exported:

```ts
export const SPRING: {
  snappy: { type: 'spring'; stiffness: number; damping: number; mass: number };
  soft:   { ... };
  glide:  { ... };
  press:  { ... };
};
export const LAYOUT_ID: { brand: 'ornight-brand' };  // splash → badge morph
export function useReducedMotion(): boolean;
export function useLongPress(fn: () => void, ms?: number): { ... };  // touch handlers
```

Styling: `packages/glass/src/tokens.css` defines CSS custom properties and is
imported once by the lead in `apps/tablet/src/index.css`. **Never hardcode a
colour in a component** — use the tokens.

### Tokens (GLASS agent defines these exact names)

```
--on-bg            deepest background
--on-bg-2          panel ground
--on-surface       glass fill (translucent)
--on-surface-2     raised glass fill
--on-line          hairline border
--on-line-strong
--on-text          primary text
--on-text-dim
--on-text-faint
--on-accent        r g b triple, default sapphire  (usable as rgb(var(--on-accent)/.4))
--on-accent-2      secondary glow
--on-success --on-warn --on-danger   (r g b triples)
--on-blur-sm/md/lg/xl
--on-radius-sm/md/lg/xl
--on-tap           44px minimum touch target
--on-shadow-lift --on-shadow-deep
--on-specular      the highlight gradient used on glass edges
--on-font          UI sans stack
--on-mono          code stack
```

`html[data-glass="reduced"]` must drop blur radii to 0 and swap translucency
for solid fills — a battery/perf escape hatch the settings panel toggles.

## Touch rules — non-negotiable for the tablet app

- Minimum hit target **44×44 px**; primary actions 52 px.
- No hover-only affordances. Every hover reveal has a tap or long-press path.
- Scrollers use `overscroll-behavior: contain` and `-webkit-overflow-scrolling: touch`.
- Respect `env(safe-area-inset-*)` on all fixed chrome.
- Animations use spring physics from `SPRING`; honour `useReducedMotion()`.
- Never block the main thread during animation. Animate `transform`/`opacity`
  only; `backdrop-filter` is expensive, so keep the number of simultaneously
  blurred layers under ~6 and never animate blur radius on a large surface.

## Layout modes

`layoutFor(width, height)` returns:

- `compact-portrait` (<620 w, portrait) — single column, sidebar is an overlay
  sheet, bottom tab bar for chat/changes/ship.
- `portrait` (≥620 w, portrait) — single column + collapsible overlay sidebar,
  changes panel slides up as a sheet.
- `landscape` (<1180 w) — persistent 240–280 px glass sidebar + chat; changes
  panel is a right-side sheet.
- `wide` (≥1180 w) — sidebar + chat + persistent right review column.

## Splash sequence — exact spec

1. Cold launch shows a **full-screen** night-field background (see brand assets).
2. Ornight logo enters: scale + fade + soft glow pulse + gentle rotation/morph.
3. Below it, the word **“Ornight”** is typewritten letter-by-letter in liquid
   glass typography (frosted, embossed, soft internal light, refraction).
4. The splash is on screen for **exactly 2000 ms** total.
5. It then shrinks and morphs — via framer-motion `layoutId={LAYOUT_ID.brand}` —
   into a compact rectangular glass pill that settles in the **top-left corner**
   of the main UI, above the thread list. In that minimized state the pill shows
   a tiny crop of the same night-field image inside the glass, and the liquid
   glass text **“Ornight Plus”**.

The lead owns the mount point: `App.tsx` renders `<SplashSequence onComplete>`
and the shell renders `<OrnightBadge />` at the top of the sidebar. Both come
from `@/brand`.

## Definition of done for every agent

- TypeScript strict, no `any` unless justified in a comment.
- No dead files, no `TODO` left in shipped code paths.
- Components must render correctly with the demo transport (no daemon running).
- Run `npx tsc --noEmit` in your app before reporting done, and fix your own errors.
- Report: what you built, the public exports you added, anything you had to stub.
