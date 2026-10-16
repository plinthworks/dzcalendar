# DzCalendar conformance suite

Language-independent cases: an input and the output any implementation of
DzCalendar's core must produce. The TypeScript core runs them today
(`conformance/runner/runner.test.ts`); the Swift and Kotlin ports will read
the same files. When they all pass, "the same engine everywhere" is a fact
rather than a claim.

## Format

One case per file, `cases/<suite>/<id>.json`, validated by `schema/case.schema.json`:

```json
{ "id": "…", "suite": "zone-dayinfo", "description": "…", "refs": ["FC#3887"],
  "input": { … }, "expected": { … } }
```

- Every value is a string in ISO 8601 with IANA zone annotations, a number,
  a boolean or null — nothing specific to one language.
- Expected values are written **by hand from the published zone rules**,
  never generated from an implementation's output.
- Zone data is only exercised on dates whose rules are settled.
- `refs` cites the public issue whose symptom the case covers.

## Suites

| Suite | Input | Expected |
|---|---|---|
| `zone-dayinfo` | `{date, zone}` | `{start, end, lengthMinutes, kind, transitions[]}` |
| `zone-resolve` | `{date, time, zone, policy}` | `{instant, other, exists, ambiguous, offsetMatched}` |
| `normalize` | `{event, context}` | `{ok, allDay, start, end, zoneGuessed?, warnings[]}` or `{ok: false, errors[]}` |

Later phases add `segment`, `layout-column`, `rrule-expand`, `series-edit`, …
