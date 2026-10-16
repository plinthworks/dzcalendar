# Week numbers

## What the user does
Turns week numbers on.

## What they observe (reference behaviour)
A number per week, following the local convention.

## What DzCalendar does
The convention is the locale's: first weekday and the days of the new year
week 1 needs (4 under ISO in most of Europe, 1 in the US). V8 omits
`minimalDays`, so a CLDR region table fills it in. 1 January 2027 is week 53
of 2026 in France and week 1 in the US.

## Tests
`packages/core/test/views.test.ts` (ten years against Temporal's ISO weeks).
