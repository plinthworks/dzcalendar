# Event sources

> A source's events with `rrule` need `import '@dzcalendar/core/recurrence'` once in the application (18i).


Observable behaviour of calendars fed from servers (FullCalendar's public
documentation of event sources, JSON feeds and iCalendar feeds; Google
Calendar and Outlook subscribing to `.ics` URLs), described in our own
words; no implementation read.

## What the user does
Opens a calendar whose events live on a server, moves from week to week or
month to month, edits an event, reloads, imports a `.ics` file.

## What they observe (reference behaviour)
- FullCalendar asks a JSON feed for the visible range (`start`, `end`,
  optionally `timeZone`) each time the range changes, and keeps what it
  fetched for ranges it has already seen ("lazy fetching"); a source can be a
  URL, a function, or a fixed array; `refetchEvents` asks again; a `loading`
  callback says when fetching starts and ends; a failure callback says why.
- Moving an event fires a change callback carrying a `revert` function: the
  application saves and calls `revert` when the server refuses.
- An iCalendar feed is read whole; recurring events with `RRULE`, `EXDATE`
  and overridden occurrences show; a `TZID` naming an IANA zone has been read
  in the wrong zone in some versions (issue #7456).
- Google and Outlook import Windows zone names ("Romance Standard Time") and
  custom `VTIMEZONE` blocks.

## What DzCalendar does — and where it differs on purpose
- **Chunks, not ranges.** A source is fetched by whole chunks (month by
  default; week, year or none), so a week view and the month view around it
  share what they fetched. Chunks missing side by side go out as **one**
  request; `prefetch` fetches neighbours ahead. A chunk is its *dates as they
  exist anywhere* (from UTC+14 to UTC−12), so changing the display zone
  fetches nothing.
- **Nothing stale, nothing twice.** A request no longer needed (the user moved
  on) is aborted through its `AbortSignal`; an answer from before a
  `refetch` is ignored; at most four requests run at once; a refetch keeps the
  events on screen until the new answer replaces them (no flash). Failed
  fetches retry with exponential backoff (`retry`), then say so.
- **An event over two chunks** (a night from 31 October to 1 November)
  belongs to both and leaves only when both have dropped it.
- **Saving is the source's job.** A source may have `save`: an edit shows at
  once, is sent with what it was before, and a refusal puts it back — said
  ("“Planning” could not be saved. It is back as it was.") — leaving nothing
  to undo. Undo and redo are saved too. While a save is out, a refetch does
  not overwrite the edit; once it settles, the source is asked again. Without
  `save`, the server is the authority: the next fetch overwrites a local edit.
- **What `save` receives**: every change a gesture made, in order — the
  edited event, and for a series also what the edit created on it (the
  override of "this occurrence", the new tail of "this and following"). An
  override saved and delivered back under its id is taken as the source's.
  Events *created* in the calendar are the application's (`onCreateRequest`),
  not a source's: `save` does not see them.
- **What a server must do**: answer a series with all of its overrides in the
  same answer (they are linked within one delivery; an override alone is
  shown as a plain event, with an `orphan-override` warning). The stretch
  asked is wider than what is shown (a chunk's dates everywhere on earth);
  `timeZone` is sent for servers that format local times, but changing the
  calendar's zone does not fetch again — call `refetch()` if the server's
  answer depends on it.
- **Specs are compared by identity**: `update({ sources })` fetches again a
  source whose spec object is new. A framework wrapper keeps its specs stable.
- A chunk scrolled far away is dropped (twelve kept per source): a local edit
  on a source without `save` goes with it — the server is the authority.
  A chunk holding an edit whose save is out is kept until it settles.
- A chunk that failed is asked again when the shown range changes, not on
  every redraw.
- **The calendar is `aria-busy` while loading** (and has `dz-loading`), so
  assistive technology knows its content is changing; a failed fetch is said
  once, politely.
- **iCalendar**: `TZID` honoured (IANA, prefixed IANA, Windows names through
  CLDR's table). A custom `VTIMEZONE` is matched to the IANA zone whose
  offsets and clock changes agree for the years used — a warning says which —
  and only when none does is it read as a fixed offset, with a warning.
  Overridden occurrences (`RECURRENCE-ID`) replace exactly their occurrence,
  keyed in the series' zone.

## Tests
- `packages/core/test/sources.test.ts`: chunking, one request for
  contiguous chunks, abort, generations, refcounted chunks, retries,
  staleness, saving and reverting, the JSON source's requests.
- `packages/dom/test/sources.test.ts`: `aria-busy`, a refused save said and
  put back, `update({ sources })`, `refetch`.
- `packages/ical/test`: parse, serialize, round trips on hand-written
  fixtures, zone resolution.
- `playground/sources.html`: a simulated server with latency, a failure
  switch and a save that refuses Fridays.
