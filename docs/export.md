# Printing and exports — `@dzcalendar/pro/print`, `@dzcalendar/pro/export`

No dependency (owner's decision): the PDF, the zip of an XLSX and its XML,
the CSV and the iCalendar text are written here; each sub-entry is loaded
on demand. Bad input never throws: a result carries `problems`
(`invalid-export`: an unknown view, a range ending before it starts, a
paper that is not `a4`, `letter` or `a3`).

## Paged printing

```ts
import { printPages } from '@dzcalendar/pro/print';
await printPages(cal); // the period shown, A4 landscape (portrait for a list)
await printPages(cal, { view: 'timeGridWeek', from, to, paper: 'letter', orientation: 'portrait' });
```

Real sheets in the DOM, then `window.print()`: a copy of the calendar per
period (a day, a week, a month; a multi-month view prints a month a sheet),
sharing its store (nothing fetched again), with the period's title and
"n / of". A copy has the calendar's look and options but none of its
handlers, motion or context menu; paper is light, whatever the scheme on
screen (owner's decision). One print job per document: a second call, or
the calendar destroyed, closes the first. What a sheet cannot hold is a
`clipped:n` warning; a date range that could not be fetched, a `sources`
warning. The browser draws the text: any script, selectable in "Save as
PDF". Each copy is sized to its sheet: a time grid's hours fill its height,
a month's weeks too, a timeline's day its width (a slot coarse enough to be
labelled: an hour, two…). A resource timeline is split between sheets by
whole top-level resources (`rowsPerPage`, default what the sheet holds).
No "now" line on paper. `print: false` builds the sheets and returns them
(`job.pages`) without printing; `job.close()` takes them away (done after
printing by itself).

## PDF and PNG

```ts
import { exportPDF, exportPNG, download } from '@dzcalendar/pro/export';
const { blob, problems } = await exportPDF(cal, { from, to, paper: 'a4' });
if (blob) download(blob, 'agenda.pdf');
const { blobs } = await exportPNG(cal, { scale: 2 }); // a PNG per sheet
```

Every view is drawn from its model on a canvas — time grid (with
resources), month, list (over as many sheets as it takes, a day's head
repeated), timeline (rows over several sheets, heads repeated). Days of 23
and 25 hours as they are: a repeated hour striped on the wall axis, a
timeline day 25 hours wide. Right to left in Arabic and Hebrew; each text
in its own direction. The PDF holds the sheets as images (the browser
shapes every script; owner's decision): text is not selectable, about
150–300 kB a sheet at `scale: 2` (192 dpi). The colours are the calendar's
light palette (`--dzc-*`, `--dz-tone-*`), whatever the scheme on screen.
Sheets are drawn and encoded one at a time on one canvas; at most 60
periods and 300 sheets (past them, a `cut:n` warning).

The drawing is plain data: `paintSheets(kernel, periods, …)` gives each
sheet's operations (`Pen.ops`: rectangles, lines, text, stripes), drawn by
`drawSheet(canvas, ops, …)` — testable without a browser.

## XLSX and CSV

```ts
const { blob } = await exportXLSX(cal, { from, to });
await exportCSV(cal, { separator: ';' }); // a French Excel
```

A row per occurrence (series expanded, each once), in order: title; start
**in the event's zone** and that zone; end **in its own zone** and that zone
(a flight Paris → Tokyo ends at 07:00, Asia/Tokyo); start and end **in the
calendar's zone**; the real duration in minutes (a night across a clock
change says 420 for 00:00–06:00); all day; resources (their titles);
status. Excel has no date before 1900: such a time is written as text
(1 January 1900 is 1; from 1 March 1900, Excel's phantom 29 February
counted). XLSX cells are real Excel dates (wall times: what the cell says is
what that zone's clock said), the head row frozen and filtered, the sheet
right to left in Arabic. The CSV is UTF-8 with a BOM and CRLF; a title
starting with `=`, `+`, `-` or `@` is written as text (no formula).

## ICS

`exportICS(cal, { from, to })`: what the range shows — an event as it is,
a series whole (its rule, its moved occurrences) — each in its own zone,
with its VTIMEZONE (`@dzcalendar/ical`). `all: true` writes everything.

## Words

Column heads, statuses, "n / of": `exportMessagesFor(locale)` in English,
French, Arabic, Spanish, German; `defineExportLocale`; `messages` over them.
