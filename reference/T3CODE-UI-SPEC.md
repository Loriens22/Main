# T3 Code — Desktop UI / Interaction Spec

Reconstruction target for a faithful desktop (and mini-tablet) rebuild.

**Sources.** Everything here is from the real source at `/home/user/Main/reference/t3code/` plus the
two product screenshots shipped in the repo at
`apps/marketing/public/updated-screenshot.webp` (2508×1682) and
`apps/marketing/public/screenshot.webp` (2764×1712).
Values taken from code are cited with a file path. Values measured off the screenshots are marked
**(measured, approximate)**. Anything I could not confirm is marked **UNVERIFIED**.

The web app is `apps/web` (React 19 + Tailwind v4 + Base UI + lucide-react + TanStack Router).
The desktop app is an Electron shell that loads the *same* web bundle over `t3code://` — so the
desktop look **is** the web look plus native titlebar handling.

---

## 0. Screenshot descriptions (ground truth)

### `updated-screenshot.webp` — dark theme, macOS, "NIGHTLY" channel

A frameless macOS window, fully dark. Left column ~410/2508 ≈ **16.4% of width** is the sidebar,
painted *pure black*; the rest is the chat canvas, painted a very slightly lifted near-black.
A hairline vertical border separates them.

- **Top-left of the sidebar**: macOS traffic lights (red/yellow/green) inset from the corner, then
  the wordmark **"T3"** in a heavier weight followed by **"Code"** in a lighter weight, then a small
  uppercase muted channel badge **"NIGHTLY"**.
- **Sidebar row 1**: a search field — magnifier icon + placeholder "Search" — with `⌘K` shown as a
  muted keycap hint on the right.
- **Sidebar row 2**: section label **"PROJECTS"** in small uppercase muted letterspaced type, with
  two ghost icon buttons on the right (a sort/order arrows icon, and an add-project folder icon).
- **Project rows**: a chevron (▾ expanded / ▸ collapsed), a **project favicon** (colorful, per
  project — a purple chat bubble for `t3chat`, a green grass mark for `lawn`, a lavender circle for
  `t3.gg`, a `»` glyph for `quickpic`, a plain folder icon for projects with no icon), then the
  project name in medium weight.
- **Thread rows** (indented under a project, with a subtle vertical guide line at the indent):
  optionally a small worktree/branch glyph, then a **status dot + status word** in a matching color
  (green "Completed", blue "Working"), then the thread title truncated with an ellipsis, then a
  right-aligned muted relative timestamp ("1m ago", "just now", "24d ago", "16h ago").
  The **selected** row ("Codebase overview") has a slightly lifted background and brighter text.
  A muted **"Show more"** link ends a truncated project's thread list.
- **Sidebar bottom**: a gear icon + **"Settings"**.
- **Top bar of the chat column** (~52px tall): the thread title in a large medium-weight face
  ("Codebase overview"), immediately followed by a small rounded **project chip** ("t3.gg").
  Right side, left→right: a `+ Add action` button, an **`Open`** split-button (box icon + label +
  chevron), a **`Commit & push`** split-button (cloud-upload icon + label + chevron), then two icon
  buttons (a right-panel toggle glyph and a `+`/new-tab glyph).
- **Timeline** (center, max-width column, generous line-height): rendered markdown with a table
  whose cells contain inline `code` chips on a subtly lifted background; a body paragraph; then a
  **changed-files card** — a rounded bordered panel headed `CHANGED FILES (7) · +31 / −17`
  (uppercase, letterspaced, muted; the +/− numbers in green/red) with `Collapse all` and
  `View diff` outline buttons on the right. Below it, an indented **file tree** in monospace:
  folder rows (`▾ 📁 public`) and file rows with per-language colored file-type icons
  (robots.txt, Astro `A`, TS badge, bun, npm), each with a right-aligned `+4 / −0` stat pair in
  green/red. A muted timestamp footer: `2:40:02 PM • 10s`.
- **Composer** (bottom, floating, `rounded-[22px]`, slightly lifted surface with a hairline border):
  a tall multi-line input area with placeholder *"Ask for follow-up changes or attach images"*, then
  a footer control row with thin vertical divider rules between clusters:
  `✳ Claude Opus 4.5 ⌄` | `High · Normal ⌄` | `🗂 Build` | `🔒 Full access ⌄`,
  and at the right a **context-window meter** (a thin ring around the number `85`) followed by a
  circular **blue send button** with an up-arrow.
- **Below the composer**, outside its shell: a muted footer strip — left `📁 Local checkout`,
  right `main ⌄` (the branch selector).

### `screenshot.webp` — dark theme, macOS, "ALPHA" channel

Same skeleton, older sidebar variant. Differences worth noting:

- Sidebar is grouped by project but with **no "PROJECTS" header and no search row**; project rows
  carry small provider/brand marks (a `T3` badge, a pink Neon-ish mark, a green grass mark, a
  folder). Bottom of the sidebar has a full-width dashed/outline **`+ Add project`** button.
- The timeline shows a **tool-call group card**: a rounded bordered panel headed
  `TOOL CALLS (3)` (uppercase, letterspaced, muted) whose rows are `• Command run complete`
  in normal text followed by the command in **monospace muted** text. A second card reads
  `TOOL CALLS (2)` with `• Image view complete /Users/theo/…` rows.
- A **typing indicator** below the last message: a filled dot followed by three smaller dots.
- Composer placeholder is *"Ask anything, @tag files/folders, or use /model"*.
- Composer footer reads `GPT-5.4 ⌄ | High ⌄ | 🗂 Chat | 🔒 Full access` and the primary button is a
  **red circular stop button with a square glyph** (turn in progress) instead of the blue send arrow.
- Footer strip: left `Local`, right `main ⌄`.

These two shots confirm: the interaction mode chip shows the *provider's own* mode name
(`Build` for Claude, `Chat` for Codex) — it is not a fixed T3 label.

---

## 1. Region layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [traffic lights] T3 Code BADGE │  <thread title> (chip)   [actions] [icons]   │  ← 52px topbar
├────────────────────────────────┼──────────────────────────────────────────────┤
│  SIDEBAR (resizable)           │  CHAT COLUMN                │ RIGHT PANEL    │
│  ┌ search  [＋]                │  ┌ scrolling timeline       │ (tabbed,       │
│  ├ PROJECTS  [sort][add]       │  │                         │  resizable,    │
│  ├ ▾ project                   │  │  messages / tool cards  │  collapsible)  │
│  │   • thread row              │  │  changed-files cards    │                │
│  │   • thread row  (selected)  │  │  approvals inline       │                │
│  │   Show more                 │  │                         │                │
│  ├ ▸ project                   │  ├ [jump-to-latest pill]   │                │
│  │  …                          │  ├ banner stack            │                │
│  ├ (flex spacer)               │  ├ COMPOSER (floating)     │                │
│  └ ⚙ Settings                  │  └ footer: checkout | branch│                │
└────────────────────────────────┴─────────────────────────────┴────────────────┘
```

### Sizing constants (from code)

`apps/web/src/components/threadSidebarWidth.ts`:

```ts
THREAD_SIDEBAR_WIDTH_STORAGE_KEY = "chat_thread_sidebar_width";
THREAD_SIDEBAR_DEFAULT_WIDTH  = 16 * 16 = 256px
THREAD_SIDEBAR_MIN_WIDTH      = 13 * 16 = 208px
THREAD_MAIN_CONTENT_MIN_WIDTH = 40 * 16 = 640px
// max width = viewportWidth - 640, floored at 208
```
Width is persisted to localStorage, clamped live against window resize, and a drag that would push
the main column under 640px is rejected (`shouldAcceptWidth`).

`apps/web/src/components/ui/sidebar.tsx`:

```ts
SIDEBAR_WIDTH        = "16rem"       // 256px
SIDEBAR_WIDTH_MOBILE = "calc(100vw - var(--spacing(3)))"
SIDEBAR_WIDTH_ICON   = "3rem"        // 48px collapsed rail
SIDEBAR_COOKIE_NAME  = "sidebar_state"   (7-day max-age)
collapsible = "offcanvas"
```

`apps/web/src/rightPanelLayout.ts`:

```ts
RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY = "(max-width: 980px)"   // below this, panel becomes a sheet
RIGHT_PANEL_SHEET_CLASS_NAME =
  "w-[min(42vw,28rem)] min-w-80 max-w-[28rem] p-0
   max-[760px]:w-[min(88vw,24rem)] max-[760px]:min-w-0
   wco:mt-[env(titlebar-area-height)] …"
```
So the right panel is **~42vw capped at 448px, min 320px**; below 760px it becomes 88vw capped at
384px.

`apps/web/src/components/composerFooterLayout.ts`:

```ts
COMPOSER_FOOTER_COMPACT_BREAKPOINT_PX              = 620  // collapse footer controls into a ⋯ menu
COMPOSER_FOOTER_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX = 780  // when wide actions present
COMPOSER_PRIMARY_ACTIONS_COMPACT_BREAKPOINT_PX     = 780
```

`apps/web/src/index.css` geometry tokens (`:root`):

```css
--control-radius: 0.5rem;            /* 8px — compact controls          */
--sidebar-content-inset: 0.5rem;     /* 8px  outer padding of sidebar groups */
--sidebar-control-gap: 0.5rem;
--sidebar-row-content-inset: 0.625rem; /* 10px */
--command-shell-inset: 0.5rem;
--command-content-inset: 1rem;
--floating-content-inset: 0.75rem;
--glass-blur: 12px;                   /* dark: 16px */
--glass-opacity: 80%;
--glass-saturation: 1.14;             /* dark: 1.08 */
--workspace-topbar-height: 52px;
--workspace-controls-top: 0px;
--workspace-controls-left:  calc(env(safe-area-inset-left)  + 0.75rem);
--workspace-controls-right: calc(env(safe-area-inset-right) + 0.75rem);
--workspace-titlebar-control-size: 1.75rem;   /* 28px */
--workspace-titlebar-control-gap:  0.75rem;   /* 12px */
--app-scrollbar-width: 6px;
--app-scrollbar-thumb: rgb(217 217 217);          /* dark: rgb(255 255 255 / 8%)  */
--app-scrollbar-thumb-hover: rgb(191 191 191);    /* dark: rgb(255 255 255 / 12%) */
```

macOS desktop inserts `--workspace-controls-left: 90px` for traffic lights
(`MACOS_TRAFFIC_LIGHTS_LEFT_INSET` in `AppSidebarLayout.tsx`), removed in fullscreen. On Windows,
the `.wco` variant reads `env(titlebar-area-*)` for Window Controls Overlay.

Structural JSX (`AppSidebarLayout.tsx`):

```tsx
<SidebarProvider className="h-dvh! min-h-0!" defaultOpen style={{ "--sidebar-width": `${w}px` }}>
  <Sidebar side="left" collapsible="offcanvas" data-app-sidebar
           className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
           resizable={{ maxWidth, minWidth: 208, storageKey, onResize }}>
    {isOnSettings ? <SidebarChromeHeader/> + <SettingsSidebarNav/> : <ThreadSidebar/>}
    <SidebarRail/>
  </Sidebar>
  {children}
  <SidebarControl/>   {/* fixed floating sidebar-toggle over the topbar */}
</SidebarProvider>
```

Chat column root (`ChatView.tsx:6092`):
`<div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background">`

---

## 2. Color system

All tokens are defined in `apps/web/src/index.css`. Tailwind v4 `@theme inline` maps them to
utilities (`bg-background`, `text-muted-foreground`, `border-sidebar-border`, …).
Dark mode is class-based: `@custom-variant dark (&:is(.dark, .dark *))`.

### Light (`:root`)

| Token | Value |
| --- | --- |
| `--background` | `--color-zinc-25` = `oklch(99.2% 0 0)` |
| `--foreground` | `zinc-800` |
| `--card` / `--card-foreground` | `white` / `zinc-800` |
| `--popover` / `--popover-foreground` | `white` / `zinc-800` |
| `--primary` | `oklch(0.488 0.217 264)` (blue) |
| `--primary-foreground` | `white` |
| `--secondary` / `--muted` | `zinc-50` |
| `--muted-foreground` | `zinc-500` |
| `--accent` / `--accent-foreground` | `zinc-100` / `zinc-900` |
| `--border` / `--input` / `--ring` | `zinc-200` / `zinc-300` / `--primary` |
| `--surface-raised` | `color-mix(in srgb, var(--card) 20%, transparent)` |
| `--error` / `--error-foreground` | `red-500` / `red-700` |
| `--warning` / `--warning-foreground` | `amber-500` / `amber-700` |
| `--success` / `--success-foreground` | `emerald-500` / `emerald-700` |
| `--info` / `--info-foreground` | `blue-500` / `blue-700` |
| `--update` / `--update-surface` | `--primary` / `mix(--update 12%, transparent)` |
| `*-surface` tints | error/warning: `color-mix(… 8%, transparent)` |
| `--code-background` | `mix(--card 90%, --background)` |
| `--terminal-cursor` | `rgb(38 56 78)` |
| `--terminal-selection-background` | `rgb(37 63 99 / 20%)` |

Sidebar scope (light): `--sidebar: zinc-50`, `--sidebar-control-surface: zinc-100`,
`--sidebar-row-hover: zinc-25`, `--sidebar-row-active: white`, `--sidebar-row-selected: white`,
`--sidebar-border: --border`.

### Dark (`@variant dark`)

| Token | Value |
| --- | --- |
| `--background` | `--color-neutral-950` |
| `--foreground` | `neutral-100` |
| `--card` | `color-mix(in srgb, var(--background) 97%, white)` |
| `--popover` | `color-mix(in srgb, var(--background) 94%, white)` |
| `--primary` | `oklch(0.571 0.21 264)` |
| `--secondary` / `--muted` / `--accent` | `--alpha(white / 4%)` |
| `--muted-foreground` | `mix(neutral-500 90%, white)` |
| `--border` / `--input` | `white / 6%` / `white / 8%` |
| `--error` | `mix(red-500 90%, white)`, fg `red-400` |
| `--warning` / `--success` / `--info` | `amber-500` / `emerald-500` / `blue-500`, fg `*-400` |
| `*-surface` tints | error/warning `16%`, update `18%` |
| `--surface-raised` | `--secondary` |
| `--terminal-cursor` | `rgb(180 203 255)` |

**Sidebar scope (dark) is a separate, darker palette** — `.dark [data-app-sidebar]`:

```css
--background: #000;  --foreground: #f1f3f7;  --card: #000;
--accent: #191a1d;   --accent-foreground: #f7f9ff;
--muted: #0a0a0a;    --muted-foreground: #a3a3a3;
--border: rgb(255 255 255 / 8%);   --input: rgb(255 255 255 / 18%);
--sidebar: var(--card);                                  /* pure black */
--sidebar-row-hover:    color-mix(in srgb, var(--foreground)  8%, transparent);
--sidebar-row-active:   color-mix(in srgb, var(--foreground) 11%, transparent);
--sidebar-row-selected: color-mix(in srgb, var(--foreground)  7%, transparent);
--sidebar-stage-fade: var(--card);
```

This is the key visual signature: **in dark mode the sidebar is pure `#000` and the chat canvas is
`neutral-950`**, so the sidebar reads as a recessed well, not a raised panel. Do not flatten this.

There is also `--app-chrome-background`, `--toolbar-background/-foreground/-border/-control/
-control-hover` for the topbar, and a `html[data-theme-id]` block that remaps *every* token to
`--app-theme-*` variables so user themes (and imported VS Code themes) can override the whole app.

### Radius scale

```css
--radius: 0.625rem;                 /* 10px base */
--radius-sm: calc(var(--radius) - 4px)   /*  6px */
--radius-md: calc(var(--radius) - 2px)   /*  8px */
--radius-lg: var(--radius)               /* 10px */
--radius-xl: calc(var(--radius) + 4px)   /* 14px */
--radius-2xl: calc(var(--radius) + 8px)  /* 18px */
--radius-3xl: calc(var(--radius) + 12px) /* 22px */
--radius-4xl: calc(var(--radius) + 16px) /* 26px */
```
Composer shell uses the literal `rounded-[22px]`; small controls use `rounded-md` / `rounded-sm`;
pills and the send button use `rounded-full`.

### Status colors (`apps/web/src/components/Sidebar.logic.ts`, `ThreadStatusIndicators.tsx`)

| State | Text | Dot | Pulse |
| --- | --- | --- | --- |
| Pending Approval | `text-amber-600` / dark `text-amber-300/90` | `bg-amber-500` / `bg-amber-300/90` | no |
| Awaiting Input | `text-indigo-600` / `text-indigo-300/90` | `bg-indigo-500` / `bg-indigo-300/90` | no |
| Working | `text-sky-600` / `text-sky-300/80` | `bg-sky-500` / `bg-sky-300/80` | **yes** |
| Connecting | same as Working | same | **yes** |
| Plan Ready | `text-violet-600` / `text-violet-300/90` | `bg-violet-500` / `bg-violet-300/90` | no |
| Monitoring | same colors as Working | same | no |
| Completed | `text-emerald-600` / `text-emerald-300/90` | `bg-emerald-500` / `bg-emerald-300/90` | no |

PR state colors: open `emerald-600 / emerald-300/90`, merged `violet-600 / violet-300/90`,
closed `red-600 / red-300/90`.

---

## 3. Typography

`@theme` in `index.css` (overridable at runtime from Settings → Appearance):

```css
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
--font-mono: ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace;
```

`apps/web/src/appearanceFonts.ts` notes that for *code* surfaces the stack deliberately puts
concrete names first, because some engines alias `ui-monospace` to a proportional UI font:

```ts
DEFAULT_SANS_FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
DEFAULT_CODE_FONT_STACK = '"SF Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace'
```

Size scale (`packages/contracts/src/settings.ts`) — user-adjustable, defaults in bold:

| Surface | Min | **Default** | Max |
| --- | --- | --- | --- |
| Interface (scales every rem dimension) | — | **16px** | — |
| Prompt / composer | 12 | **14px** | 20 |
| Code | 10 | **13px** | 18 |
| Terminal | 8 | **12px** | 20 |

Four independent family slots: `fontFamilySans`, `fontFamilyComposer`, `fontFamilyCode`,
`fontFamilyTerminal`. A custom family is always *prepended* to the default stack so glyph coverage
never regresses. In "Simple" typography mode the terminal follows the code font; "Advanced" mode
(`localStorage` key `t3code:typography-advanced`) splits them. `fontSmoothing` defaults on.

Observed in-app type roles **(measured, approximate)**:

| Role | Treatment |
| --- | --- |
| Wordmark "T3 Code" | ~15px; "T3" semibold, "Code" regular; channel badge ~9px uppercase, letterspaced, muted |
| Sidebar section label ("PROJECTS") | ~10–11px, uppercase, `tracking-wide`, `text-sidebar-muted-foreground` |
| Project name | ~13px medium |
| Thread title | ~13px regular; selected row goes medium + brighter |
| Status word | ~12px medium, colored |
| Timestamp | ~11–12px, `text-muted-foreground` |
| Thread title in topbar | ~20px medium |
| Chat body | 15–16px, generous leading (~1.6) |
| Inline `code` | code font at ~0.9em on `--code-background`, `rounded-sm`, ~2px/5px padding |
| Card headers ("CHANGED FILES (7)", "TOOL CALLS (3)") | ~11px uppercase, letterspaced, muted |
| Diff stats `+31 / −17` | ~11–12px, code font, emerald / red |
| File tree rows | code font ~12–13px |
| Composer placeholder & input | 14px (prompt size) |
| Composer footer controls | ~13px |
| Timeline footer `2:40:02 PM • 10s` | ~11px muted |

Small UI text classes seen repeatedly in source: `text-xs leading-4`, `text-[11px]`.

---

## 4. Region-by-region

### 4.1 Titlebar / topbar (52px)

- Height `var(--workspace-topbar-height)` = **52px**, `env(titlebar-area-height, 52px)` under WCO.
- Drag region; on macOS the left 90px is reserved for traffic lights.
- **Left (over the sidebar):** wordmark + channel badge (`ALPHA` / `NIGHTLY` / none for stable),
  rendered by `components/sidebar/SidebarChrome.tsx` (`SidebarChromeHeader`).
- **Sidebar toggle**: a fixed-position floating trigger,
  `fixed left-[var(--workspace-controls-left)] top-[var(--workspace-controls-top)] z-50
   flex h-[var(--workspace-topbar-height)] items-center`, tooltip
  `"Toggle main sidebar (<shortcut>)"`, command `sidebar.toggle`, key handler bound in **capture**
  phase so focused rich-text editors can't eat `Mod+B`.
- **Center-left:** editable thread title (inline rename: trim → reject empty (toast) → skip no-op,
  `resolveRenameCommit` in `chat/ChatHeader.tsx`) followed by a small rounded **project chip**.
  Title carries a context/action menu only for real server threads, not drafts.
- **Right cluster** (`ChatHeader.tsx` props): `+ Add action` (project scripts →
  `ProjectScriptsControl`), **`Open`** split-button (`OpenInPicker` — open in editor, from
  `availableEditors`), **Git actions** split-button (`GitActionsControl`), right-panel toggle,
  new-tab/new-thread icon.

Icon buttons in this row are `size="icon-xs"` (~22px box, `!size-[22px]` where forced),
`variant="outline"`, icons `size-3` / `size-3.5`.

### 4.2 Sidebar (`apps/web/src/components/Sidebar.tsx`, 3,704 lines)

Top → bottom:

1. **`SidebarChromeHeader`** — wordmark + channel badge, plus update pills
   (`SidebarUpdatePill`, `SidebarProviderUpdatePill`).
2. **Fixed header group** (`SidebarGroup className="relative z-[1] gap-1 p-[var(--sidebar-content-inset)]"`):
   - **Search row** — verbatim shape:
     ```tsx
     <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5
                     text-sm font-medium text-sidebar-muted-foreground
                     hover:bg-sidebar-row-hover hover:text-sidebar-foreground">
       <SearchIcon className="size-4 shrink-0 text-sidebar-muted-foreground/80" />
       <Input placeholder="Search" aria-label="Search threads" role="combobox"
              aria-autocomplete="list" … />
       {searching && <Button size="icon-xs" variant="ghost" className="size-5 rounded-sm"
                             aria-label="Clear thread search"><XIcon className="size-3"/></Button>}
     </div>
     ```
     So the search row is **32px tall (`h-8`), `rounded-md`, no border** — it is a hover-highlight
     row, not a boxed input. It is a combobox: results appear as a list
     (`#sidebar-thread-search-results`), arrow keys move `activeSearchResultIndex`, Enter navigates,
     Escape clears.
   - **New-thread button** to its right: `SidebarMenuButton size="icon"` with `SquarePenIcon`,
     tooltip on the **right** side reading `New thread (<shortcut>)`, disabled when there are no
     projects. It has an invisible `size-[max(100%,3rem)]` touch-target expander that is hidden on
     fine pointers (`pointer-fine:hidden`) — a mini-tablet detail worth copying.
   - **Project scope menu row** below (grouping / sort controls) when there is ≥1 project group.
3. **Scrolling content:** pinned section (if any) → project groups → settled/archived tail.
4. **Footer:** Settings entry (older build: a full-width `+ Add project` button).

**Project group row:** disclosure chevron, `ProjectFavicon` (custom `iconPath` from `t3.json`, else
a folder glyph), project name, and hover-revealed actions.

**Thread row anatomy** (left→right): optional worktree/branch icon → status dot (`size-1.5`
rounded-full, colored, `animate-status-pulse` when pulsing) → status word (colored) → title
(truncate) → right-aligned relative timestamp. Trailing status glyphs when relevant:
`GitPullRequestIcon` (PR open/merged/closed, colored per table above), `TerminalIcon` (a terminal
process is running in this thread), `CloudIcon`, `FolderGit2Icon` (worktree).

**Row states:** default → `--sidebar-row-hover` on hover → `--sidebar-row-active` while pressed →
`--sidebar-row-selected` for the open thread. Multi-select is supported (`threadSelectionStore`);
`Escape` clears the selection.

**Context menu / affordances:** pin (moves to the pinned section above, drag-reorderable on
web+desktop via `@dnd-kit`, `Move up`/`Move down` on mobile; order is stored server-side and syncs
across devices), snooze/unsnooze, settle/unsettle, archive/unarchive, rename, delete.
`Show more` reveals a truncated tail; the currently-open thread is never hidden behind it.

**Empty/edge:** zero projects → the new-thread button is disabled and a `+ Add project` affordance
is shown. `AppSidebarLayout` keeps a `ProjectProjectionRetention` component mounted while on
Settings so returning to a draft never flashes the zero-project state.

**Settings mode:** the whole sidebar body is swapped for `SettingsSidebarNav` when the route starts
with `/settings`.

### 4.3 Chat column

```
relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background
  └ flex min-h-0 min-w-0 flex-1
     └ relative flex min-h-0 min-w-0 flex-1 flex-col
        ├ pointer-events-none absolute inset-x-0 top-0 z-20      ← top overlay (header fade)
        └ relative flex min-h-0 flex-1 flex-col                  ← timeline + composer
```

**Timeline** (`chat/MessagesTimeline.tsx`, 2,383 lines) is a virtualized list
(`@legendapp/list`) with scroll anchoring (`timelineScrollAnchoring.ts`). Item kinds:

- **User message** — right-ish / distinct surface using `--message-surface` (= `--accent`),
  `--message-foreground`, with `--message-action` (= primary) for its inline actions.
- **Assistant message** — full-width rendered markdown (`ChatMarkdown.tsx`, react-markdown +
  remark-gfm + remark-breaks + rehype-raw + rehype-sanitize, plus custom plugins for GitHub alerts,
  link handling, list indentation, and clipboard-as-markdown copy). Footer line:
  `<time> • <duration>` in muted 11px. A `MessageCopyButton` appears on hover.
- **Reasoning** — collapsed by default.
- **Tool-call group card** — bordered `rounded-lg` panel, header `TOOL CALLS (n)` uppercase muted,
  rows `• <Verb> <status>` + monospace muted argument/path. Groups adjacent tool calls rather than
  emitting one card each.
- **Changed-files card** (`chat/ChangedFilesTree.tsx`) — header button:
  ```tsx
  <ChevronIcon className="size-3.5 … transition-transform" + rotate-90 when expanded />
  <span className="… font-medium text-foreground text-xs leading-4">
    {n} changed file{s}  <DiffStatLabel additions deletions layout="inline" className="text-xs leading-4"/>
  </span>
  <span className="ml-1 hidden … text-[11px] text-muted-foreground
                   group-hover:text-foreground/80 sm:inline">{expanded ? "Hide files" : "Show files"}</span>
  ```
  Right side: an `icon-xs` outline button `!size-[22px]` toggling all folders
  (`ChevronsDownUpIcon` / `ChevronsUpDownIcon`, `size-3`, aria-label
  `"Collapse all folders"` / `"Expand all folders"`), and an `size="xs"` outline button
  `aria-label="Open diff"` that opens the turn diff in the right panel at the first changed file.
  The tree itself renders per-folder and per-file `+n / −n` stats.
- **Approval request** — inline card with Approve / Approve for session / Reject / Cancel
  (`ComposerPendingApprovalPanel.tsx`, `ComposerPendingApprovalActions.tsx`).
- **User-input request** — structured question form (`ComposerPendingUserInputPanel.tsx`).
- **Proposed plan card** (`ProposedPlanCard.tsx`) with an "implement this plan" follow-up
  (`ComposerPlanFollowUpBanner.tsx`).
- **Error banner** (`ThreadErrorBanner.tsx`), **provider status banner**
  (`ProviderStatusBanner.tsx`), **sync status pill** (`ThreadSyncStatusPill.tsx`).
- **Typing / thinking indicator** — `size-1.5 animate-status-pulse rounded-full bg-foreground`
  followed by ghost dots (`animate-ghost-pulse`).
- **Branch-changed notice** — `"Branch changed — was <code>"` with a tooltip
  (`max-w-80`, side top).

**Jump-to-latest pill** — floats above the composer:
```tsx
<div className="pointer-events-none absolute left-1/2 z-30 flex -translate-x-1/2 justify-center py-1.5">
  <button className="chat-composer-glass pointer-events-auto flex items-center gap-1.5 rounded-full
                     border border-border/60 px-3 py-1 text-muted-foreground text-xs shadow-sm
                     transition-colors hover:border-border hover:text-foreground hover:cursor-pointer">
    <ChevronDownIcon className="size-3.5" /> …
  </button>
</div>
```

**Banner stack** (`ComposerBannerStack`) sits directly above the composer, `z-0`, for version-skew
warnings, provider auth problems, plan follow-ups, etc.

### 4.4 Composer (`chat/ChatComposer.tsx`, 3,215 lines)

Shell: `<div className="chat-composer-glass-host relative z-10 w-full rounded-[22px]">` inside a
`chat-composer-horizontal-inset w-full` wrapper, with a bottom safe-area spacer
`h-[calc(env(safe-area-inset-bottom)+1rem)] sm:h-[calc(env(safe-area-inset-bottom)+1.25rem)]`.
The glass utility uses `--glass-blur` / `--glass-opacity` / `--glass-saturation`.

**Input area** — Lexical rich-text editor (`ComposerPromptEditor.tsx`) with:

- `@` **file/folder mentions** (`composer-editor-mentions.ts`, drag-drop support via
  `composerMentionDrag.ts`), rendered as `FileTagChip`.
- `/` **slash commands** (`composerSlashCommandSearch.ts`, `ComposerCommandMenu.tsx`) — includes
  `/model` and provider skills (`providerSkillSearch.ts`, `SkillInlineText.tsx`).
- **Image attachments** — paste or attach; expanded preview dialog
  (`ExpandedImagePreview.tsx`, `ExpandedImageDialog.tsx`).
- **Terminal context chips** and **preview annotation cards** can be attached as context
  (`ComposerPendingTerminalContexts.tsx`, `ComposerPreviewAnnotationCards.tsx`,
  `TerminalContextInlineChip.tsx`).
- **Review comment context** (`reviewCommentContext.ts`) — attach a PR review comment to the prompt.
- **Draft persistence** per thread (`composerDraftStore.ts`) and a **prompt stash**
  (`promptStashStore.ts`, `ComposerStashBadge.tsx`, `ComposerStashMenu.tsx`).

**Footer control row** (left→right, thin vertical divider rules between clusters):

1. **Model picker** — provider mark + model name + chevron. Opens
   `ProviderModelPicker` → `ModelPickerContent` + `ModelPickerSidebar` + `ModelListRow`, with search
   (`modelPickerSearch.ts`), favorites, per-provider grouping, and keyboard nav (`modelPickerKeys.ts`).
   Sets the `modelPickerOpen` keybinding context key.
2. **Reasoning-effort / options control** — e.g. `High · Normal ⌄`, `High ⌄`. These are
   provider option descriptors (`getProviderOptionDescriptors`) — Claude exposes `effort`,
   `fastMode`, `thinking`; Codex exposes reasoning effort and service tier.
3. **Interaction-mode chip** — shows the *provider's own* mode label: `Build` (Claude), `Chat`
   (Codex), `Plan`. Backed by `ProviderInteractionMode = "default" | "plan"`;
   `composerProviderState.tsx` maps `{ id: "build", label: "Build", isDefault: true }`,
   `{ id: "plan", label: "Plan" }`.
4. **Permission-mode control** — lock icon + label + chevron. Options and copy verbatim from
   `runtimeModeConfig`:
   | id | label | description | icon |
   | --- | --- | --- | --- |
   | `approval-required` | Supervised | Ask before commands and file changes. | `LockIcon` |
   | `auto-accept-edits` | Auto-accept edits | Auto-approve edits, ask before other actions. | `PenLineIcon` |
   | `auto` | Auto | Supported providers approve routine actions; others still ask. | `SparklesIcon` |
   | `full-access` | Full access | Allow commands and edits without prompts. | `LockOpenIcon` |
5. **Traits picker** (`TraitsPicker.tsx`) — optional.
6. **Right side:** `ContextWindowMeter` — a thin ring showing remaining context with the percentage
   number inside, then the **primary action button** (`ComposerPrimaryActions.tsx`):
   - Idle → circular **blue** (`--primary`) button, up-arrow glyph, sends the turn.
   - Running → circular **red** button with a square glyph, dispatches `thread.turn.interrupt`.

Under 620px (or 780px with wide actions) the footer collapses into
`CompactComposerControlsMenu.tsx`, a single `⋯` menu with radio groups:

```tsx
<MenuRadioItem value="approval-required">Supervised</MenuRadioItem>
<MenuRadioItem value="auto-accept-edits">Auto-accept edits</MenuRadioItem>
<MenuRadioItem value="auto">Auto</MenuRadioItem>
<MenuRadioItem value="full-access">Full access</MenuRadioItem>
```
**This is the mini-tablet path — implement it first for Ornight Plus.**

**Placeholders observed:** `"Ask anything, @tag files/folders, or use /model"` (empty thread) and
`"Ask for follow-up changes or attach images"` (continuing thread).

**Draft hero:** on a new/draft thread the composer renders expanded and centered with a headline
(`DraftHeroHeadline.tsx`); on send it morphs into the docked composer via a View Transition
(`draftHeroTransition.ts`; the CSS `::view-transition-group(t3-mobile-composer)` runs 180ms
`cubic-bezier(0.4, 0, 0.2, 1)` with a 130ms headline exit).

### 4.5 Composer footer strip (below the composer shell)

Left: environment/checkout indicator — `Local`, `Local checkout`, or the worktree path
(`formatWorktreePathForDisplay`). Right: **branch selector** `main ⌄`
(`BranchToolbar.tsx` + `BranchToolbarBranchSelector.tsx` +
`BranchToolbarEnvironmentSelector.tsx` + `BranchToolbarEnvModeSelector.tsx`). The branch toolbar
also hosts the explicit **"new thread in this worktree"** action.

### 4.6 Right panel (`RightPanelTabs.tsx`, `RightPanelSheet.tsx`, `PanelLayoutControls.tsx`)

Tab surfaces and their lucide icons:

| Surface | Icon |
| --- | --- |
| Diff | `FileDiff` |
| Files | `Files` |
| Terminal | `TerminalSquare` |
| Browser / Preview | `Globe2` (falls back to the site favicon via `faviconUrlForOrigin`) |
| Pull request | `GitPullRequest` |
| Agents | `Bot` |
| add tab | `Plus` |
| close tab | `X` |

Behaviors: activate, close, **close others**, **close to the right**, **close all**, copy file path,
add-of-each-kind. Tabs scroll horizontally in a `ScrollArea`. Pending tabs are tracked
(`pendingSurfaceIds`) for a loading treatment. The panel is resizable with a persisted width
(`widthStorageKey`, `defaultWidth`) and can be maximized. Below 980px it becomes a modal sheet.

**Diff viewer** (`DiffPanel.tsx`, `DiffPanelShell.tsx`, `DiffWorkerPoolProvider.tsx`) renders via
`@pierre/diffs` with shiki syntax transformers, off the main thread through a **worker pool**.
Header controls include `aria-label="Expand all files" / "Collapse all files"`. Whitespace is
ignored by default (`diffIgnoreWhitespace: true`). File actions in `diffFileActions.ts`.

**Terminal** — libghostty WASM renderer on web
(`docs/architecture/terminal-renderers.md`, `apps/web/src/terminal/`), `node-pty` on the server,
streamed over `terminal.attach`. Link detection in `terminal-links.ts`.
There is also a bottom **`ThreadTerminalDrawer`** as an alternative to the right-panel tab.

### 4.7 Command palette (`CommandPalette.tsx`, `CommandPaletteContent.tsx`, `CommandPaletteResults.tsx`)

- Default `⌘K` / `Ctrl+K`; command id `commandPalette.toggle`; also opened programmatically via
  `commandPaletteBus.ts` with modes like `openCommandPalette({ open: "new-thread-in" })`.
- Searches **across connected environments**: active thread titles, projects, branches,
  user messages, and final agent responses. Message search begins after **2 characters** and uses
  SQLite's ASCII case-insensitive matching. A message match shows **one labeled excerpt** while
  keeping the thread's project, branch, and machine context visible.
- Hosts "Add Project" (GitHub / GitLab / Bitbucket / Azure DevOps repository, or any Git URL),
  "New thread in…", and every registered command.
- Insets: `--command-shell-inset: 0.5rem`, `--command-content-inset: 1rem`.

### 4.8 Settings routes

`/settings`, `/settings/general`, `/appearance`, `/providers`, `/connections`, `/keybindings`,
`/source-control`, `/diagnostics`, `/archived`. Plus `/usage`, `/pull-requests`, `/pair`,
`/connect`, `/projects/$projectKey`.

Settings replaces the sidebar body with `SettingsSidebarNav`.

**Appearance** exposes: theme + theme editor, glass opacity (0–100, default 80), the four font
sizes and four font families, font smoothing, timestamp format, word wrap, sidebar grouping/sort
options, environment identification mode (`artwork | pill | none`, default `artwork` — the
"stage backdrop" artwork behind the sidebar header that identifies which machine you're on).

**Theme editor** — floating panel, `themeEditor.toggle` default `mod+alt+shift+t`. Selecting a color
label spotlights every element using it; selecting again clears. **Inspect** arms an element picker
(hover glow + a badge previewing the element and the token the click will select); it disarms after
one successful pick; `Cancel`/`Escape` exits and clears spotlight + selection.

---

## 5. Motion & animation rules

`AGENTS.md` is explicit: *"No continuously repainting animations; they peg the GPU on high-refresh
displays."* All indicator animations are **duty-cycled with stepped keyframes**:

```css
--animate-skeleton:     skeleton 2s infinite linear;   /* transform-only sweep, parked off-screen 60–100% */
--animate-status-pulse: status-pulse 2s infinite;
--animate-ghost-pulse:  ghost-pulse 2.4s infinite;
--animate-status-ping:  status-ping 2s infinite;
```
The source comment on `ghost-pulse` explains the intent exactly: *"stepped like the status
indicators, so however many bars a ghost holds, the compositor draws a handful of discrete frames
per cycle rather than one per vsync — which on a 120Hz display is the difference between ~14 and
~288 updates."*

Other motion:

- Theme switches suppress all motion via a `.no-transitions` class that forces
  `transition-duration: 0s !important; animation-duration: 0s !important` on everything.
- The mobile/draft composer morph uses View Transitions: group 180ms
  `cubic-bezier(0.4, 0, 0.2, 1)`, with old/new crossfading only between 35% and 65% of the
  duration so the internal layout change doesn't read as a cut. Headline exit is 130ms
  `cubic-bezier(0.4, 0, 1, 1)` with a `-6px` translateY.
- `@formkit/auto-animate` handles list insert/remove.
- Chevrons rotate 90° on expand (`transition-transform`).

---

## 6. Keyboard & shortcuts

Config lives at `~/.t3/userdata/keybindings.json`; the authoritative list is **Settings →
Keybindings**, which always matches the running build.

Confirmed commands and defaults (`docs/user/keybindings.md`):

| Command | Default | Notes |
| --- | --- | --- |
| `commandPalette.toggle` | `⌘K` / `Ctrl+K` | |
| `sidebar.toggle` | UNVERIFIED default | bound in capture phase |
| `chat.new` | UNVERIFIED default | with >1 project group and the current sidebar, opens the project chooser first |
| `chat.newLocal` | UNVERIFIED default | always creates immediately |
| `terminal.toggle` | `mod+g` (doc example) | |
| `terminal.new` | — | doc example uses `mod+shift+g` with `when: terminalFocus` |
| `filePicker.toggle` | `mod+p` | repeating the shortcut closes it |
| `projectSearch.toggle` | `mod+shift+f` | switching shortcuts replaces the open search |
| `themeEditor.toggle` | `mod+alt+shift+t` | |
| `preview.toggle` / `.refresh` / `.focusUrl` / `.zoomIn` / `.zoomOut` / `.resetZoom` | — | gated by `when: previewFocus` |
| `script.{id}.run` | — | project scripts are addressable commands |
| `Escape` | built-in | clears sidebar multi-selection; exits theme-editor Inspect |

New-thread inheritance rule (important, and easy to get wrong): a new thread inherits the **project,
model and mode** of the thread you were in, but **branch, worktree, and environment mode always come
from your configured defaults**, not from the thread you were looking at. To keep a worktree, use
the explicit "new thread in this worktree" action in the branch toolbar.

`when` context keys currently supplied: `terminalFocus`, `terminalOpen`, `previewFocus`,
`previewOpen`, `modelPickerOpen`. Unknown keys evaluate `false`. Operators `!`, `&&`, `||`, `()`.
**Precedence: last matching rule wins, across commands.**

---

## 7. Notifications & status feedback

- **Toasts** (`components/ui/toast.tsx`, `toastManager`, `stackedThreadToast`) — used for git action
  results (with an `open_pr` CTA carrying label + url), keybinding-file updates
  (`KeybindingsUpdateToast`), desktop/provider/server update prompts, slow-RPC warnings
  (`SlowRpcRequestToastCoordinator.tsx`), and capability messages such as
  *"Preview is desktop-only — Open T3 Code in the desktop app to use the in-app preview."*
- **Connection status dot** (`ConnectionStatusDot.tsx`) per environment.
- **Version-skew banner** above the composer *and* a row in Settings → Connections. Dismissing the
  conversation banner only hides that reminder for that version pair.
- **Provider update notifications** — launch-time (`ProviderUpdateLaunchNotification.tsx`) and
  primary (`ProviderUpdatePrimaryNotification.tsx`), dismissals persisted in
  `dismissedProviderUpdateNotificationKeys`.
- **Mobile push** goes through the T3 Connect relay (`infra/relay`).
- **Confirm dialogs** (`ConfirmDialogHost.tsx`, `confirmDialog.ts`) — `confirmThreadDelete` defaults
  **true**, `confirmThreadArchive` defaults **false**.
- **Splash** (`SplashScreen.tsx`) and **render error boundary** (`RenderErrorBoundary.tsx`).

---

## 8. Component library conventions worth copying

- **Base UI** (`@base-ui/react`) primitives, wrapped locally under `components/ui/`:
  `sidebar`, `tooltip` (`Tooltip` / `TooltipTrigger render={…}` / `TooltipPopup side= align=`),
  `menu` (`Menu`/`MenuTrigger`/`MenuPopup`/`MenuItem`/`MenuRadioItem`), `popover`, `select`,
  `combobox`, `autocomplete`, `scroll-area`, `toast`, `input`, `button`.
  The `render={<X/>}` prop pattern (render-delegation instead of `asChild`) is used everywhere.
- Floating layers are identified by data attributes, and the composer uses this selector to know
  when a popup is open:
  ```ts
  const COMPOSER_FLOATING_LAYER_SELECTOR = [
    '[data-slot="popover-popup"]','[data-slot="menu-popup"]','[data-slot="select-popup"]',
    '[data-slot="combobox-popup"]','[data-slot="autocomplete-popup"]',
  ].join(",");
  ```
- Button sizes seen: `icon-xs` (~22px), `icon`, `xs`, default. Variants: `outline`, `ghost`.
- `cn()` = `clsx` + `tailwind-merge` (`lib/utils.ts`); variants via `class-variance-authority`.
- Group containers use `group/<name>` scoping (e.g. `group-hover/v2-row:text-emerald-600`).
- `data-scroll-anchor-ignore` marks controls that must not disturb timeline scroll anchoring.
- Accessibility is consistently done: `aria-label` on every icon button, `role="combobox"` +
  `aria-autocomplete` + `aria-expanded` + `aria-controls` + `aria-activedescendant` on the sidebar
  search, `aria-labelledby` on card-radio groups.

---

## 9. Build order for a faithful desktop clone

1. Shell: `SidebarProvider` + resizable 208/256/(vw−640) sidebar + 52px topbar with platform
   titlebar insets (macOS 90px traffic-light inset; WCO `env(titlebar-area-*)`).
2. Token layer: the full light/dark palettes from §2 **including the separate
   `[data-app-sidebar]` scope**, the radius scale, and the glass tokens.
3. Sidebar: search row (`h-8`, `rounded-md`, hover-highlight, combobox) + new-thread icon button;
   project groups with favicons; thread rows with dot+word+title+timestamp; the status-pill color
   table and priority order.
4. Chat column: virtualized timeline, markdown renderer, tool-call group card, changed-files card
   with the exact header string `{n} changed file{s}` + inline `+n/−n`.
5. Composer: `rounded-[22px]` glass shell, Lexical editor with `@`/`/` menus, the five footer
   controls in order, context meter, and the blue-send ⇄ red-stop morph.
6. Right panel tabs (start with Diff + Terminal), 42vw/448px/320px sizing, 980px sheet fallback.
7. Command palette at `⌘K` with cross-environment search.
8. Compact composer menu below 620/780px — the mini-tablet path.
9. Motion pass: duty-cycled indicators only; `.no-transitions` on theme change.

---

## 10. Known gaps

- **UNVERIFIED:** exact default keybindings for `sidebar.toggle`, `chat.new`, `chat.newLocal`,
  `commandPalette.toggle`'s literal binding string, and the full `DEFAULT_KEYBINDINGS` array
  (imported into `apps/server/src/keybindings.ts` from `@t3tools/contracts`).
- **UNVERIFIED:** exact pixel heights for sidebar rows, topbar button sizes, and timeline spacing —
  the values in §3 marked *(measured, approximate)* come from the screenshots, not from constants.
  The definitive source is the Tailwind classes in `Sidebar.tsx` / `ChatView.tsx` / `ChatComposer.tsx`.
- **UNVERIFIED:** light-theme screenshots. Both in-repo product shots are dark. The light palette in
  §2 is read directly from CSS and is reliable, but no light-mode reference image exists in the repo.
- **UNVERIFIED:** the mobile app's navigation structure (not analyzed in depth; `apps/mobile` is
  React Native with separate navigation).
- No Gemini provider exists in this build; the composer's provider marks cover Codex, Claude,
  Cursor, Grok, OpenCode only.
