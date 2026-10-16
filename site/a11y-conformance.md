# DzCalendar — Accessibility Conformance Report (draft)

**Status: draft, Phase 8 (2026-10-16).** Based on the WCAG 2.2 edition of the
VPAT® format, level A and AA. Product: `@dzcalendar/dom` with
`@dzcalendar/theme`, views month (`dayGridMonth`, `dayGridWeek`,
`dayGridDay`), week and day (`timeGridWeek`, `timeGridDay`).

How it was evaluated:

- **Automated:** axe-core 4.13.0 in Chrome (`npm run test:browser`), rules
  tagged WCAG 2.0–2.2 A/AA and best practices, on the week, month and day
  views, with the context menu and a sub-menu open, the "+N" panel open, the
  cursor focused with a selection drawn, an event held by keyboard, right to
  left (`he-IL`), and on the four-zone clock-change page — no violation
  (`target-size` on events aside, see 2.5.8).
- **Keyboard:** every operation scripted in jsdom (`packages/dom/test/keyboard.test.ts`)
  and checked where layout matters in Chrome (cursor and preview positions,
  focus ring, single-pointer move).
- **Not yet done:** sessions with NVDA, JAWS, VoiceOver (macOS and iOS) and
  TalkBack; an audit by people with disabilities. Remarks below marked
  *(to confirm with a screen reader)* depend on them.

Terms: **Supports**, **Partially supports**, **Does not support**, **Not
applicable**. What an application adds inside events (content hooks) or
around the calendar is its own responsibility.

## Table 1: Level A

| Criterion | Level | Remarks |
|---|---|---|
| 1.1.1 Non-text Content | **Supports** | No meaningful images. Toolbar arrows have names ("Previous", "Next"); decorative marks (gutter, now line, off-hours shading) are hidden from assistive technology. |
| 1.2.x Time-based Media | **Not applicable** | |
| 1.3.1 Info and Relationships | **Supports** | Month: `grid` > `row` > `columnheader` / `gridcell`; each cell names its date and event count and contains a button for every event of that day, including those behind "+N" (the drawn bars are presentation). Week/day: each column is a `group` named by its date (and its real length when not 24 h); events are buttons; repeated and skipped hours are `note`s. *(to confirm with a screen reader)* |
| 1.3.2 Meaningful Sequence | **Supports** | DOM order follows reading order: toolbar, all-day row, the hours by day; right to left mirrors by CSS logical properties. |
| 1.3.3 Sensory Characteristics | **Supports** | Messages never rely on shape, colour or position alone ("Not allowed here: overlaps another event"). |
| 1.4.1 Use of Colour | **Supports** | A refused place is red *and* said with its reason; today is marked by `aria-current` and a filled date; event tones are not information by themselves. |
| 1.4.2 Audio Control | **Not applicable** | |
| 2.1.1 Keyboard | **Supports** | Every pointer operation has a keyboard path: cursor on days and slots, selection (Shift+arrows), open (Enter), move and resize (grab mode: M or Alt+Enter, arrows, Shift / Alt+Shift+arrows, Enter, Escape), timed ↔ all-day (Up from the first slot, Down from the all-day row), another period (crossing the edge, PageUp/PageDown), delete (Delete), undo/redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl+Y), context menu (Menu key, Shift+F10). |
| 2.1.2 No Keyboard Trap | **Supports** | Escape leaves grab mode, the menu, the "+N" panel and a selection; Tab in grab mode lets go. |
| 2.1.4 Character Key Shortcuts | **Partially supports** | `M` (grab) acts only while an event has the focus. The undo/redo shortcuts can be turned off (`keyboardUndo: false`); `M` cannot be remapped yet. |
| 2.2.1 Timing Adjustable | **Supports** | No time limit. Edge navigation while dragging (600 ms / 900 ms) can be turned off (`dragEdgeNavigate: false`) and has a keyboard equivalent. |
| 2.2.2 Pause, Stop, Hide | **Supports** | Motion lasts under a second and follows `prefers-reduced-motion` (GSAP adapter optional). The now line moves once a minute. |
| 2.3.1 Three Flashes | **Supports** | Nothing flashes. |
| 2.4.1 Bypass Blocks | **Supports** | The month grid is one tab stop (roving focus); the week's hours are one stop (the cursor) plus the events. |
| 2.4.2 Page Titled | **Not applicable** | A component; the page is the application's. |
| 2.4.3 Focus Order | **Supports** | Focus returns where it came from after a menu, the "+N" panel, a grab (to the event where it now is), a delete (to the day). |
| 2.4.4 Link Purpose | **Supports** | "+N" is named "3 more events, Wednesday 21 October". |
| 2.5.1 Pointer Gestures | **Supports** | No multipoint or path gesture is required. |
| 2.5.2 Pointer Cancellation | **Supports** | A drag acts on release; Escape or leaving the window cancels it; a refused drop changes nothing. |
| 2.5.3 Label in Name | **Supports** | Accessible names start with the visible text (event title, date number). |
| 2.5.4 Motion Actuation | **Not applicable** | |
| 3.1.1 Language of Page | **Not applicable** | The application sets `lang`; the calendar's words follow its `locale` (EN and FR built in, others by `messages`). |
| 3.2.1 On Focus / 3.2.2 On Input | **Supports** | Focus never changes the view; moving the cursor past the last shown day changes the period, which is the key's purpose. |
| 3.3.1 Error Identification | **Supports** | A refused drop or step is said with its reason (outside the allowed hours, overlaps another event…), and `onProposalRefused` / `onCommandRefused` give it to the application. |
| 3.3.2 Labels or Instructions | **Partially supports** | Grab mode says its keys when it starts; a change between timed and all-day is said. The cursor and events do not yet expose their shortcuts (`aria-keyshortcuts`) before use. |
| 4.1.2 Name, Role, Value | **Supports** | Buttons, groups, grid cells, menus (`menu`/`menuitem`, `aria-haspopup`/`aria-expanded`), the panel (`dialog`), the view switcher (`aria-pressed`), a touched event (`aria-pressed`). |

## Table 2: Level AA

| Criterion | Level | Remarks |
|---|---|---|
| 1.3.4 Orientation | **Supports** | No orientation lock. |
| 1.3.5 Identify Input Purpose | **Not applicable** | No form fields. |
| 1.4.3 Contrast (Minimum) | **Supports** (default theme) | axe-core finds no contrast failure. An application's palette (`--tz-*`, `--dz-*`) is its responsibility. A hover rule that cancelled the selected view button's background was found by axe and fixed. |
| 1.4.4 Resize Text | **Supports** | Sizes in `rem`; the grid's minute height is a variable. |
| 1.4.5 Images of Text | **Not applicable** | |
| 1.4.10 Reflow | **Partially supports** | Day and month views reflow to 320 CSS px; a week of seven columns at 320 px is narrow (the application may pick `timeGridDay` on small screens). To be reviewed in the CSS pass. |
| 1.4.11 Non-text Contrast | **Supports** (default theme) | Focus rings are 2 px in the accent colour; `forced-colors` draws them in `Highlight`. |
| 1.4.12 Text Spacing | **Partially supports** | Event titles are clipped with an ellipsis in short events; the full text is in the accessible name and the "+N" panel. To be reviewed in the CSS pass. |
| 1.4.13 Content on Hover or Focus | **Supports** | No hover-only content; the menu and panel stay until dismissed. |
| 2.4.5 Multiple Ways | **Not applicable** | |
| 2.4.6 Headings and Labels | **Supports** | The toolbar title is a heading (and a polite live region); the panel is titled by its date. |
| 2.4.7 Focus Visible | **Supports** | Every focusable element has a ring. A month cell's event items are visually hidden: their ring is drawn on the bar they stand for, or on "+N" when the event is behind it. |
| 2.4.11 Focus Not Obscured (Minimum) | **Supports** | The time grid scrolls the cursor and a held event's edge into view. |
| 2.5.7 Dragging Movements | **Supports** | Without dragging: "Move…" / "Change duration…" in the context menu, then a click where it goes (or the arrow keys); selection by Shift+arrows or a tap with two handles that can also be dragged. |
| 2.5.8 Target Size (Minimum) | **Partially supports** | Toolbar buttons, menu entries, touch selection handles are ≥ 24 × 24 px. An event's height *is* its duration and its width its share of the column (the "essential" exception); a 15-minute event at the default scale is 12 px tall, and overlapping events get narrow, with the context menu and the keyboard as alternatives. The browser checks allow axe's `target-size` finding on events only — any other small target fails. A `--dz-target-min` floor is planned with the CSS pass. |
| 3.1.2 Language of Parts | **Supports** | Event titles are the application's; built-in words follow `locale`. |
| 3.2.3 Consistent Navigation / 3.2.4 Consistent Identification | **Supports** | The same keys and names in every view. |
| 3.2.6 Consistent Help | **Not applicable** | |
| 3.3.3 Error Suggestion | **Partially supports** | The reason is said; where it *could* go is not suggested. |
| 3.3.4 Error Prevention (Legal, Financial, Data) | **Supports** | Every change is undoable (history, Ctrl/Cmd+Z), deletes say so; a series change asks how far it reaches. |
| 3.3.7 Redundant Entry / 3.3.8 Accessible Authentication | **Not applicable** | |
| 4.1.3 Status Messages | **Supports** | A polite live region says moves, resizes, refusals and their reasons, a step into a skipped hour, selections, deletes, undo/redo, grab mode's keys; the title is a polite region. *(to confirm with a screen reader)* |

## Clock changes (beyond WCAG)

- The two 02:30s of a fall-back night are told apart by offset in names and
  announcements ("02:30 (+01:00)"); the keyboard cursor visits both passes.
- A skipped hour is a `note` ("02:00–03:00 does not exist"); a move into it
  lands at 03:00 and is said.
- A day that does not exist in a zone (Apia, 30 December 2011) is named so
  and skipped by the cursor.

## Known gaps, planned

- Screen-reader sessions (NVDA, JAWS, VoiceOver macOS/iOS, TalkBack) and an
  audit with users.
- `aria-keyshortcuts` on events and the cursor; remappable keys.
- `--dz-target-min` and reflow of the week at 320 px (CSS pass).
- The timeline (Pro, `treegrid`) is not covered by this report.
