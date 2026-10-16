# Handoff: Grilled Heads-Up, mobile UI reference

## Overview
Visual reference for the Grilled Heads-Up client (repo `mwe-dexpro/Grilled-Heads-Up`). It shows 10 screens of the personal calendar and to-do app: home with Buckets, Event detail with At risk, Task detail with Subtasks, the Reschedule sheet, the Planning wizard (2 steps), the Move question, new Event with suggested tasks, Projects and the month Calendar.

**Read `ALIGNMENT.md` next.** It lists where this prototype differs from `CONTEXT.md` / `docs/v1-scope.md` and which v1 features have no screen yet. **The repo docs win on behaviour and terminology. This prototype wins on look and layout.**

## About the design files
The files in `prototype/` are **design references built in HTML**. They show the intended look; they are not production code to copy. Rebuild them in the repo's stack (ADR-0007: React + Vite + TypeScript PWA), with your own components, i18n files (EN/DE) and domain logic. Every screen is static, with no live interaction. Swipe and sheet states are drawn as frozen frames.

- `screenshots/4a…4j.png`: one PNG per screen at 2× (804×1806). **This is the fastest way to see the design.**
- `prototype/Linked Planner.dc.html`: all 10 screens on one canvas. It needs a local HTTP server (it fetches `ios-frame.jsx`), e.g. `npx serve prototype` → open `/Linked%20Planner.dc.html`. The markup uses inline styles throughout, so exact values can be read from the source.
- `prototype/_ds/…`: the Tile design-system tokens the prototype uses (`tokens/*.css`).

## Fidelity
**High-fidelity** for colours, type, spacing, radii and component anatomy. Copy text is illustrative demo data (today = Sat Oct 4). The iPhone bezel, status bar and home indicator are frame chrome only. The target is an Android-first PWA (ADR-0001), so use `env(safe-area-inset-*)` instead of the drawn insets.

## Design tokens
Colours
- Action blue `#0066cc`: links, primary pills, active tab, checked circles, FAB, event markers
- Focus blue `#0071e3`: focus ring (2px solid, 2px offset), selected chip/option outline (2px)
- Ink `#1d1d1f`: primary text · `#333333` body secondary (event description) · `#7a7a7a` meta text, inactive tabs
- Screen background (parchment) `#f5f5f7` · cards / sheets / tab bar `#ffffff`
- Hairline `#e0e0e0` (card border, tab-bar top, empty progress) · row divider `#f0f0f0` · unchecked circle / disabled `#d2d2d7`
- **Amber `#c25e00` = Overdue / At risk.** This is an addition to the Tile system, which has no warning colour. Contrast on white is ≈4.3:1, so use it at ≥14px **600**, or darken to `#b35600` for 400-weight small text.
- Sheet scrim `rgba(0,0,0,.35)`
- No gradients. **No shadows on UI** (Tile's single shadow is reserved for product photos, unused here).

Typography (`system-ui` → SF Pro on Apple, Roboto on Android; Tile uses Inter as fallback. Load Inter for a consistent look). Weights 400/600 only (never 500).
- Large title 34/1.15, 600, −0.374px
- Wizard B title 28/1.14, 600
- Section heading 21/1.19, 600
- Row title 17/1.3, 400 · card title 17/1.24, 600 · body letter-spacing −0.374px
- Description 15/1.4 · meta 14/1.4, letter-spacing −0.224px · chip label 14/1.29
- Small 12 · timeline labels 11 · tab labels 10/1.3

Spacing and radii
- Screen side padding 16px (full-bleed bands use 20px inner). Header block margin 14/4/16–18px.
- Section header: margin-top 24px, bottom 10px; heading + 14px gray count side by side (gap 8px)
- Rows: 12px × 16px padding (11px in dense lists), gap 12px, divider `#f0f0f0`
- Cards: white, 1px `#e0e0e0`, **radius 18px**, overflow hidden. Card gaps 8–12px.
- Pills (chips, CTAs, segmented): radius 999px. Bottom sheet: top radius 18px. Icon tile: 40×40, radius 10px, bg `#f5f5f7`.
- Progress bars: 4–5px high, radius 999px; segmented per Task (gap 4px) or continuous.

Icons: **Lucide** at 1.5px stroke, `currentColor`: `sun, calendar, list-checks, folder, plus, check, clock, triangle-alert, map-pin, repeat, sparkles, grip-vertical, chevron-left, chevron-right, ellipsis, x`.

Motion: press = `scale(0.95)` over 120ms `cubic-bezier(.25,.1,.25,1)` on every button/FAB. Otherwise short fades only, no bounce.

## Shared components
- **Task row**: 22px check circle (1.5px `#d2d2d7`; overdue 1.5px amber; completed = filled `#0066cc` with a white 1.8px check, title struck through, row text `#7a7a7a`) · title 17/400 · meta line 14px: the Event name in blue (tappable, opens Event detail), then " · " and the Offset ("7 days before") or date · optional trailing chevron `#d2d2d7` 16px.
- **Swipe actions** (swipe left on any Task row): actions revealed at 78px each, label 12px under an 18px icon. Shown: Reschedule (bg `#d2d2d7`, ink, `clock`) then Complete (bg `#0066cc`, white, `check`). Delete is still missing (see ALIGNMENT).
- **Tab bar**: white, 1px top hairline, padding 8/8/30, equal columns. Each tab is a 22px icon over a 10px label; active `#0066cc`, inactive `#7a7a7a`. v1 tabs: Today `sun` · Calendar `calendar` · Projects `folder` (the drawn Plan tab `list-checks` returns with the Planning wizard after v1).
- **FAB (Quick add)**: 56px circle `#0066cc`, white `plus` 26px, right 20px, bottom = 16px above the tab bar. It never overlaps the tab bar. No shadow.
- **Nav bar**: 44px tall, 17px blue text. Left: `chevron-left` 20px + parent name; right: text action ("Edit", "Done") or `ellipsis`.
- **Bottom sheet**: white, top radius 18, padding 20/16/42, over a scrim; dimmed content behind at 50% opacity.
- **Chips**: 1px `#e0e0e0` pill, 7×14px padding, 14px; selected = filled `#0066cc` + white text, or 2px `#0071e3` outline for options.
- **Buttons**: Tile `Button`: primary filled blue pill (17px, 11×22 padding), secondary ghost pill (1px blue outline, blue text); `size="sm"` for inline actions.

## Screens
**4a Home (Today tab)**: `screenshots/4a-home.png`
- Header: "Saturday, Oct 4" (14 gray) over the large title "Today". Right side: a 28px Progress ring (2.5px stroke, track `#e0e0e0`, arc `#0066cc`, starts at 12 o'clock) and "N of M done" (14 gray): Progress of the Today bucket, matching its "N left".
- **Overdue bucket** card (white): header row with a 10px amber dot, "Overdue" 17/600, a count pill (not drawn; see ALIGNMENT §1) and a right-aligned blue bulk action "Reschedule all…". Task rows with amber circles below it. The meta line names the consequence ("Puts Mom's birthday at risk", amber) or the age and history ("9 days · rescheduled 3×"). Row 2 is drawn mid-swipe.
- Bucket cards below: **Today** ("2 left"), **Tomorrow** ("Sun Oct 5 · 1"), **Next 3 days** ("Mon – Wed · 3"). Each is a section heading plus a white card of Task rows. The list scrolls under the FAB.

**4b Event detail**: `4b-event-detail.png`
- Nav "‹ Calendar" / "Edit". Meta line "Sunday, Oct 12 · 12:30 pm · in 8 days · every year" (14 gray), then the title 34/600.
- **Location**: `map-pin` 16px + text, 15px blue, one line with ellipsis; tap opens maps. **Description**: 15/1.4 `#333`, `text-wrap: pretty`.
- **Risk band**, full-bleed white with top/bottom hairlines, padding 18/20/16. Top row: Progress, e.g. "1 of 3 done" (21/600, no wrap; the drawn "prepared" is replaced, see ALIGNMENT §1); on the right `triangle-alert` 15px + "At risk" 14/600 amber. Below it a 72px **countdown line**: a 1px track `#e0e0e0`, filled in ink up to a "Today" tick (1×17px, label 11/600 below). Tasks are plotted by Offset above the line (completed = blue filled dot with check; overdue = amber 2px ring with an amber 11/600 label; open = gray ring) and the Event sits at the right end as a 14px blue rounded square with its date. Last a one-line explanation (14 gray).
- **Preparation** section ("relative to the event" in gray): a card of Linked task rows showing their Offset, with "Add task" (primary) and "Move event" (secondary) buttons below.

**4c Task detail**: `4c-task-detail.png`
- 28px check circle + title 34/600, then "Due Thu Oct 16 · reminder 1 day before".
- "Part of" card: 40px icon tile + Event name 17/600 + "Fri Oct 17 – Sun Oct 19 · on track · 3 of 4 tasks" + chevron. It opens the Event.
- Subtasks: heading + count "3 of 7", a 4px progress bar, then a card of subtask rows with an "Add item" row (blue `plus`).
- "Move to" quick chips: Tomorrow · Day after · Next week · Pick a date (with icon). Sticky full-width primary "Mark done" button.

**4d Reschedule sheet** (opened from swipe → Reschedule): `4d-reschedule-sheet.png`
- Header "Move" (14 gray) over the Task title 21/600 and context (14 gray).
- Options card (rows 14×16): Tomorrow / Day after / Day before the event (Linked tasks only) / Next week, with dates right-aligned in 14 gray. An option that lands **after the Event** is gray with an amber `triangle-alert` and "after the event". Last row: "Pick a date" (blue, calendar icon).
- Footer: "Cancel" (blue) on the left, the reschedule count (gray) on the right.

**4e Planning wizard · step 1, brain dump**: `4e-wizard-brain-dump.png`
- `x` close, "Step 1 of 2", a 2-segment 4px progress bar. Title "Get it all out." + "No order, no dates. Just type."
- A card of 6px-bullet rows; the last row is the active input with a blue caret. The keyboard is open. Footer: count + primary "Structure ›".

**4f Planning wizard · step 2, drag into buckets**: `4f-wizard-buckets.png`
- Title "Drag into a day." + "Or tap an item, then tap a bucket."
- 4-column grid of bucket tiles (Today / Tomorrow / Mon / Later): white, radius 18, min-height 92, name 14/600, date 12 gray, count 21/600. The drop target has a 2px `#0071e3` border and a "+1" count in blue.
- A row of target chips (Event `calendar` / Project `folder`), then an "Unsorted · N left" card with `grip-vertical` handles. The dragged item floats rotated −2°, radius 14, at 25% opacity in its origin slot. Footer: "Skip the rest" secondary sm.

**4g Move event**: `4g-move-event.png`
- Sheet over the Event. Title "Move 3 tasks too?" plus a reason line that adapts to direction.
- Two option pills: the **suggested** one has a 2px `#0071e3` outline and a "Suggested" tag; the other shows a delta ("+7 days").
- Preview card: each Linked task with its resulting date. Full-width primary "Move event" + "Cancel".

**4h New event with suggested tasks**: `4h-new-event-suggested.png`
- Nav: Cancel / "New event" / **Add**. Form card: title (21/600), Date, Repeats.
- Suggestion card: `sparkles` icon tile, then "Looks like Leo's home game on Oct 10." and "Bring over its tasks?". Selectable Task rows with Offsets, then "Import 2 tasks" (primary sm) and "Skip" (secondary sm).

**4i Projects**: `4i-projects.png`
- Large title + a 2-option segmented control (pill track `#e0e0e0`, selected white, 600): "Projects & Lists" | "Events" (see ALIGNMENT §1).
- One card per Project/Event: name 21/600, status on the right (amber "At risk" + icon, or gray "On track" / "No deadline"), date line, a **segmented progress bar** (one segment per Task: blue = completed, amber = overdue, `#e0e0e0` = open; continuous for large Lists), and a footer "N of M · next/overdue task" with "Open ›".

**4j Calendar (month)**: `4j-calendar.png`
- Title "October" + prev/next chevrons. Card with a Monday-first 7-column grid. Day = 32px circle: today has a 1.5px blue ring and blue 600 text; an At-risk Event day is filled amber with white text; out-of-month days `#d2d2d7`. Up to 2 dots (4px) per day below: blue = Event, gray = Tasks, amber = at risk. Legend row under the grid.
- Below the grid: the selected-day agenda. The Event card has an amber dot when At risk; Task rows follow.

## Interactions & state (intended)
- Check circle → Complete (stays struck through until end of day, per v1-scope). Row tap → Task detail. Event name in a meta line → Event detail.
- Swipe left → Reschedule / Complete (+ Delete). Reschedule opens 4d. Picking a date removes the Task from Overdue immediately.
- FAB → quick add into the Inbox (v1: "+" on every screen).
- Move event → 4g. The default depends on direction (earlier → follow, later → stay/Pinned).
- Derived state the UI reads: per-Task `isOverdue`, `isLate`; per-Event `isAtRisk`, `isCritical`, `progress {done,total}`; per-Bucket `progress`, `count`. Compute these in the domain layer, not the components.

## Files
- `screenshots/`: 10 PNGs, one per screen (4a–4j)
- `prototype/Linked Planner.dc.html`: source of all screens
- `prototype/ios-frame.jsx`, `prototype/support.js`: preview runtime only (not part of the app)
- `prototype/_ds/tile-design-system-…/tokens/*.css`: token values
- `ALIGNMENT.md`: decisions taken, gaps and conflicts against the repo concept, open questions
