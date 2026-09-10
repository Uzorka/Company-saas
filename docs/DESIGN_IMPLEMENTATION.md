# Design implementation

Source of truth: `design/project/`. When this file and a phase file disagree, **the phase file is correct**. When the Developer Handoff and a phase file disagree, the phase file is correct — the handoff is a summary of the designed artefacts.

## Tokens

### Brand · Heron Blue
`brand-50 #EEF4FB` `brand-100 #D9E6F5` `brand-200 #AFC9E7` `brand-300 #7FA6D3` `brand-400 #4E80B9` `brand-500 #2A63A0` `brand-600 #1B4F8C` `brand-700 #16406F` `brand-800 #112F52`

### Neutral · surfaces & ink
`bg #FFFFFF` `surface #F8F9FB` `canvas #F1F4F8` `border #E3E8EF` `border-hi #CDD5E0` `text-3 #7A8798` `text-2 #4A5666` `text #131A22`

### Semantic pairs — ink on tint, all ≥ 4.5:1
| State | Glyph | Tint | Ink | Used for |
|---|---|---|---|---|
| Success | ● | `#E7F4EE` | `#0F7A54` | Present, verified, approved, published |
| Warning | ▲ | `#FDF2DF` | `#8A5600` | Late, in review, restricted, needs attention |
| Danger | ✕ | `#FDECEA` | `#B42318` | Absent, rejected, confidential, denied |
| Info | ◇ | `#EEF4FB` | `#16406F` | Remote, in progress, informational |

No gradients. No second brand hue. **Colour never carries meaning alone** — every status has colour, a glyph and a word.

### Dark ramp — defined, not shipped
`dark-bg #0E1319` `dark-surface #151C24` `dark-raised #1D262F` `dark-border #2A3540` `dark-brand #6FA0D8` `dark-text #E6EBF1`
Per-screen dark treatments were **never designed**. Ship light-only; do not invent them. Build with CSS custom properties so dark is a later token swap.

### Typography — IBM Plex Sans / IBM Plex Mono
| Step | Spec | Use |
|---|---|---|
| display | 34/40, 600, −.025em | Page hero, dashboard headline figure |
| h1 | 26/32, 600, −.02em | Screen title |
| h2 | 20/28, 600, −.015em | Section heading |
| h3 | 16/24, 600 | Card and panel heading |
| body | 14/22, 400 | Body, table cells, labels |
| small | 13/20, 400 | Helper copy, metadata |
| overline | 11/16, 600, .09em, uppercase | Section eyebrow |
| data | mono 13/20, tabular | **Every comparable figure** — IDs, coordinates, timestamps, currency, accuracy |

### Spacing (4px base)
4 icon-to-label · 8 chip gaps · 12 card internal · 16 mobile card padding, grid gaps · 24 desktop card padding · 32 section internal · 48 between sections · 64 page top

### Radius
`sm 4px` badges/inline chips · `md 6px` buttons/inputs/selects/menu items · `lg 10px` popovers/inner panels/list cards · `xl 14px` cards/dialogs/drawers/main panels · `pill 999px` status pills/filter chips/avatars

### Elevation
`e0` none, 1px border — flat inside a bordered container
`e1` `0 1px 2px rgba(16,24,40,.06)` — resting cards
`e2` `0 2px 6px -1px rgba(16,24,40,.08), 0 1px 2px rgba(16,24,40,.06)` — card hover
`e3` `0 8px 24px -6px rgba(16,24,40,.12)` — popovers, menus, dragged cards
`e4` `0 20px 48px -12px rgba(16,24,40,.2)` — dialogs and drawers

### Icons
Lucide, **no substitutions** — if an icon doesn't exist in Lucide, use a word. 1.75px stroke at every size, never filled or duotone. 16px inline, 18px in nav and buttons, 22px in headers, 24px+ in empty states only. Inherits text colour unless the icon *is* the status indicator. An icon-only button needs an `aria-label` and a tooltip; icons never replace a status word.

## Motion — 5 durations, 3 easings
`instant 80ms` hover/press/focus · `fast 140ms` menus/tooltips/toggles/chips · `base 200ms` dialogs/tabs/toasts/kanban/stage moves · `slow 320ms` drawers/sheets/sidebar/timelines · `confirm 420ms` check-in, verification, payroll publish **only**

`standard cubic-bezier(.2,.8,.2,1)` position/size/colour · `enter cubic-bezier(0,.6,.25,1)` arriving · `exit cubic-bezier(.4,0,1,1)` leaving

All 16 animations, with their triggers and reduced-motion fallbacks, are specified in the Developer Handoff §10 and shown live in Phase 8. Under `prefers-reduced-motion`, transforms drop and opacity/colour stay — **a user who disables motion must still see that their check-in worked.** Entrance animations run on first paint only; refiltering a table must never re-run them.

## Breakpoints
| Range | Mode | Rules |
|---|---|---|
| < 640px | cards + bottom nav | Single column. Tables become cards. Bottom nav replaces the sidebar. Filters open as sheets. Primary action pinned, 46px. Slide-overs full-screen. 44px targets, nothing within 16px of an edge. |
| 640–1023px | icon rail + reduced table | Sidebar → 58px icon rail with hover labels. Real tables appear but drop to three essential columns — columns are **removed, never squeezed**. Slide-over 80% width. |
| 1024–1439px | full shell | 186px sidebar with labels. All columns, 44px comfortable rows. Slide-over 480px. Row hover, bulk select, inline row actions. |
| ≥ 1440px | full shell, capped | Content caps at 1440px. Detail panels can dock beside the list. 36px compact density becomes an option. |
| Print | document layout | Payslips one page A4, greyscale-safe. Reports print with identical figures and footnotes. Nav, filters, actions hidden. |

## Forms
Persistent labels above the field, always — placeholders are examples. Required marked with a red asterisk; optional fields say *Optional*. Validate **on blur, never on keystroke**; re-validate on submit; never block typing. Errors inline below the field with an icon and specific guidance, announced via a live region and tied with `aria-describedby`. Long forms autosave as draft and survive a session timeout. Irreversible actions need a dialog restating the consequence, and a **typed reason** wherever the action affects someone else's record: corrections, rejections, role grants, returned visits.

## Universal states
Every list and panel ships all four: **Empty** (names what's missing, one sentence, an action), **Filtered empty** (distinct — says the filter is the reason, offers Clear filters), **Error** (names the cause, reassures the data is safe, offers retry — never a stack trace), **Permission** (lock icon, which roles can access it, how to request it — the nav item stays, never a 404).

## Non-negotiable principles
1. **Verification is the product.** Consent copy, one-off capture and visible accuracy in the attendance and field-visit flows are load-bearing. Do not simplify them.
2. **Consent-first, never surveillant.** Location is read at the moment of the action and never in the background. The copy says so, on screen, every time.
3. **Nothing is destroyed.** Corrections reference originals. Audit entries are immutable for everyone, Management included.
4. **Restricted, not hidden.** A module a role can't open stays in the sidebar with a lock.
5. **Colour is never the only cue.** Must survive greyscale and colour-blind vision.
6. **Mobile is not a shrunken desktop.** No horizontal table scrolling on phones.
7. **One primary action per view.** Destructive is never the default focus.
8. **State the consequence.** Irreversible actions restate what will happen, in the same words everywhere.
