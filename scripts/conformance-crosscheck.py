"""
Generates conformance/cases/rrule-expand/*.json with expectations computed by
python-dateutil — an implementation independent of ours (ARCHITECTURE H).
Not shipped. Run: python3 scripts/conformance-crosscheck.py

dateutil iterates wall times and attaches zoneinfo; a wall time in a gap
(fold=0) and our 'compatible' reading are the same instant, and a repeated
wall time (fold=0) is its first reading — our rule too. dateutil steps
HOURLY/MINUTELY in wall time where we step in elapsed time: those cases use
UTC, and the DST behaviour of sub-daily rules is covered by hand-written cases.
"""
import json, os, re
from datetime import datetime, date, timezone
from zoneinfo import ZoneInfo
from dateutil.rrule import rrulestr

OUT = os.path.join(os.path.dirname(__file__), '..', 'conformance', 'cases', 'rrule-expand')
LIMIT = 40

CASES = [
    # (id, description, dtstart, zone, rule, window_end or None)
    ('daily-count', 'Daily, ten times', '2026-09-02T09:00', 'America/New_York', 'FREQ=DAILY;COUNT=10', None),
    ('daily-until', 'Daily until a UTC instant', '2026-09-02T09:00', 'America/New_York', 'FREQ=DAILY;UNTIL=20261224T000000Z', None),
    ('daily-interval-2', 'Every other day', '2026-09-02T09:00', 'America/New_York', 'FREQ=DAILY;INTERVAL=2;COUNT=12', None),
    ('daily-interval-10', 'Every 10 days, 5 times', '2026-09-02T09:00', 'America/New_York', 'FREQ=DAILY;INTERVAL=10;COUNT=5', None),
    ('daily-january-3-years', 'Every day in January for 3 years (daily form)', '2026-01-01T09:00', 'America/New_York', 'FREQ=DAILY;UNTIL=20280131T140000Z;BYMONTH=1', None),
    ('yearly-january-every-day', 'Every day in January for 3 years (yearly form)', '2026-01-01T09:00', 'America/New_York', 'FREQ=YEARLY;UNTIL=20280131T140000Z;BYMONTH=1;BYDAY=SU,MO,TU,WE,TH,FR,SA', None),
    ('weekly-count', 'Weekly, ten times', '2026-09-02T09:00', 'America/New_York', 'FREQ=WEEKLY;COUNT=10', None),
    ('weekly-until', 'Weekly until 24 December', '2026-09-02T09:00', 'America/New_York', 'FREQ=WEEKLY;UNTIL=20261224T000000Z', None),
    ('weekly-every-other-wkst-su', 'Every other week, WKST=SU', '2026-09-02T09:00', 'America/New_York', 'FREQ=WEEKLY;INTERVAL=2;WKST=SU;COUNT=12', None),
    ('weekly-tu-th', 'Weekly on Tuesday and Thursday for five weeks', '2026-09-01T09:00', 'America/New_York', 'FREQ=WEEKLY;UNTIL=20261007T000000Z;WKST=SU;BYDAY=TU,TH', None),
    ('weekly-mo-we-fr-every-other', 'Every other week on Monday, Wednesday, Friday', '2026-09-02T09:00', 'America/New_York', 'FREQ=WEEKLY;INTERVAL=2;UNTIL=20261224T000000Z;WKST=SU;BYDAY=MO,WE,FR', None),
    ('weekly-tu-th-every-other-count', 'Every other week on Tuesday and Thursday, 8 times', '2026-09-01T09:00', 'America/New_York', 'FREQ=WEEKLY;INTERVAL=2;COUNT=8;WKST=SU;BYDAY=TU,TH', None),
    ('weekly-wkst-mo-vs-su-mo', 'Interval 2 with WKST=MO', '2027-08-05T09:00', 'America/New_York', 'FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO', None),
    ('weekly-wkst-mo-vs-su-su', 'Interval 2 with WKST=SU', '2027-08-05T09:00', 'America/New_York', 'FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU', None),
    ('monthly-first-friday-count', 'Monthly on the first Friday, ten times', '2026-09-04T09:00', 'America/New_York', 'FREQ=MONTHLY;COUNT=10;BYDAY=1FR', None),
    ('monthly-first-friday-until', 'Monthly on the first Friday until 24 December', '2026-09-04T09:00', 'America/New_York', 'FREQ=MONTHLY;UNTIL=20261224T000000Z;BYDAY=1FR', None),
    ('monthly-every-other-first-last-sunday', 'Every other month, first and last Sunday', '2026-09-06T09:00', 'America/New_York', 'FREQ=MONTHLY;INTERVAL=2;COUNT=10;BYDAY=1SU,-1SU', None),
    ('monthly-second-to-last-monday', 'Monthly on the second-to-last Monday, 6 times', '2026-09-21T09:00', 'America/New_York', 'FREQ=MONTHLY;COUNT=6;BYDAY=-2MO', None),
    ('monthly-third-to-last-day', 'Monthly on the third-to-last day', '2026-09-28T09:00', 'America/New_York', 'FREQ=MONTHLY;BYMONTHDAY=-3;COUNT=8', None),
    ('monthly-2nd-and-15th', 'Monthly on the 2nd and 15th, 10 times', '2026-09-02T09:00', 'America/New_York', 'FREQ=MONTHLY;COUNT=10;BYMONTHDAY=2,15', None),
    ('monthly-first-and-last-day', 'Monthly on the first and last day, 10 times', '2026-09-30T09:00', 'America/New_York', 'FREQ=MONTHLY;COUNT=10;BYMONTHDAY=1,-1', None),
    ('monthly-every-18-months-10-15', 'Every 18 months on the 10th–15th', '2026-09-10T09:00', 'America/New_York', 'FREQ=MONTHLY;INTERVAL=18;COUNT=10;BYMONTHDAY=10,11,12,13,14,15', None),
    ('monthly-every-tuesday-every-other-month', 'Every Tuesday, every other month', '2026-09-01T09:00', 'America/New_York', 'FREQ=MONTHLY;INTERVAL=2;BYDAY=TU;COUNT=18', None),
    ('monthly-31st-skips-short-months', 'The 31st: months without one are skipped', '2026-01-31T10:30', 'America/New_York', 'FREQ=MONTHLY;COUNT=7', None),
    ('monthly-friday-13', 'Every Friday the 13th', '2026-02-13T09:00', 'America/New_York', 'FREQ=MONTHLY;BYDAY=FR;BYMONTHDAY=13;COUNT=5', None),
    ('monthly-first-saturday-after-first-sunday', 'The first Saturday after the first Sunday', '2026-09-13T09:00', 'America/New_York', 'FREQ=MONTHLY;BYDAY=SA;BYMONTHDAY=7,8,9,10,11,12,13;COUNT=10', None),
    ('monthly-last-workday', 'The last workday of the month (BYSETPOS)', '2026-09-30T09:00', 'America/New_York', 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=8', None),
    ('monthly-third-tu-we-th', 'The third Tuesday, Wednesday or Thursday', '2026-09-03T09:00', 'America/New_York', 'FREQ=MONTHLY;COUNT=6;BYDAY=TU,WE,TH;BYSETPOS=3', None),
    ('monthly-second-to-last-weekday', 'The second-to-last weekday', '2026-09-29T09:00', 'America/New_York', 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-2;COUNT=7', None),
    ('yearly-june-july', 'Yearly in June and July, 10 times', '2026-06-10T09:00', 'America/New_York', 'FREQ=YEARLY;COUNT=10;BYMONTH=6,7', None),
    ('yearly-every-other-jan-feb-mar', 'Every other year in January, February, March', '2026-03-10T09:00', 'America/New_York', 'FREQ=YEARLY;INTERVAL=2;COUNT=10;BYMONTH=1,2,3', None),
    ('yearly-every-3-years-yeardays', 'Every 3 years on days 1, 100, 200', '2026-01-01T09:00', 'America/New_York', 'FREQ=YEARLY;INTERVAL=3;COUNT=10;BYYEARDAY=1,100,200', None),
    ('yearly-20th-monday', 'The 20th Monday of the year', '2026-05-18T09:00', 'America/New_York', 'FREQ=YEARLY;BYDAY=20MO;COUNT=4', None),
    ('yearly-weekno-20-monday', 'Monday of week 20 (week 1 has 4 days)', '2026-05-11T09:00', 'America/New_York', 'FREQ=YEARLY;BYWEEKNO=20;BYDAY=MO;COUNT=4', None),
    ('yearly-thursdays-in-march', 'Every Thursday in March', '2026-03-05T09:00', 'America/New_York', 'FREQ=YEARLY;BYMONTH=3;BYDAY=TH;COUNT=12', None),
    ('yearly-thursdays-summer', 'Every Thursday, June to August', '2026-06-04T09:00', 'America/New_York', 'FREQ=YEARLY;BYDAY=TH;BYMONTH=6,7,8;COUNT=20', None),
    ('yearly-us-election-day', 'US election day: first Tuesday after a Monday in November, every 4 years', '2028-11-07T09:00', 'America/New_York', 'FREQ=YEARLY;INTERVAL=4;BYMONTH=11;BYDAY=TU;BYMONTHDAY=2,3,4,5,6,7,8;COUNT=3', None),
    ('yearly-feb-29', '29 February: only leap years', '2024-02-29T08:00', 'UTC', 'FREQ=YEARLY;COUNT=4', None),
    ('yearly-last-day-of-feb', 'The last day of February', '2026-02-28T08:00', 'UTC', 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1;COUNT=6', None),
    ('yearly-weekno-1-wkst-su', 'Week 1 with WKST=SU', '2026-01-01T09:00', 'UTC', 'FREQ=YEARLY;BYWEEKNO=1;BYDAY=SU;WKST=SU;COUNT=5', None),
    ('yearly-weekno-minus-1', 'The last week of the year, Friday', '2026-12-25T09:00', 'UTC', 'FREQ=YEARLY;BYWEEKNO=-1;BYDAY=FR;COUNT=5', None),
    ('yearly-weekno-53', 'Week 53, only in years that have one', '2026-12-28T09:00', 'UTC', 'FREQ=YEARLY;BYWEEKNO=53;BYDAY=MO;COUNT=3', None),
    ('yearly-yearday-negative', 'The last day of each year', '2026-12-31T09:00', 'UTC', 'FREQ=YEARLY;BYYEARDAY=-1;COUNT=5', None),
    ('yearly-setpos-first-weekday', 'The first weekday of each year', '2026-01-01T09:00', 'UTC', 'FREQ=YEARLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1;COUNT=6', None),
    ('daily-byhour', 'Daily at 9, 12 and 17', '2026-09-02T09:00', 'Europe/Paris', 'FREQ=DAILY;BYHOUR=9,12,17;COUNT=9', None),
    ('daily-byhour-byminute', 'Daily at 9:00 and 9:30 and 14:00, 14:30', '2026-09-02T09:00', 'Europe/Paris', 'FREQ=DAILY;BYHOUR=9,14;BYMINUTE=0,30;COUNT=10', None),
    ('weekly-byday-byhour', 'Weekdays at 8 and 18', '2026-09-07T08:00', 'Europe/Paris', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=8,18;COUNT=12', None),
    ('monthly-byhour-setpos', 'The last 18:00 slot of each month', '2026-09-01T09:00', 'Europe/Paris', 'FREQ=MONTHLY;BYHOUR=18;BYSETPOS=-1;COUNT=5', None),
    ('hourly-utc', 'Every 3 hours, UTC', '2026-09-02T09:00', 'UTC', 'FREQ=HOURLY;INTERVAL=3;UNTIL=20260902T170000Z', None),
    ('minutely-utc', 'Every 15 minutes, 6 times, UTC', '2026-09-02T09:00', 'UTC', 'FREQ=MINUTELY;INTERVAL=15;COUNT=6', None),
    ('minutely-90-utc', 'Every hour and a half, 4 times, UTC', '2026-09-02T09:00', 'UTC', 'FREQ=MINUTELY;INTERVAL=90;COUNT=4', None),
    ('minutely-byhour-utc', 'Every 20 minutes from 9 to 16:40', '2026-09-02T09:00', 'UTC', 'FREQ=MINUTELY;INTERVAL=20;BYHOUR=9,10,11,12,13,14,15,16;COUNT=30', None),
    ('hourly-byminute-utc', 'Hourly at :15 and :45', '2026-09-02T09:00', 'UTC', 'FREQ=HOURLY;BYMINUTE=15,45;COUNT=8', None),
    ('secondly-utc', 'Every 10 seconds, 5 times', '2026-09-02T09:00', 'UTC', 'FREQ=SECONDLY;INTERVAL=10;COUNT=5', None),
    # Clock changes: wall time is kept (FullCalendar #6729), gaps move forward, repeats take the first reading.
    ('dst-weekly-paris-0900', 'Weekly 09:00 in Paris stays 09:00 across spring forward', '2026-03-16T09:00', 'Europe/Paris', 'FREQ=WEEKLY;COUNT=4', None),
    ('dst-daily-paris-autumn', 'Daily 09:00 across fall back', '2026-10-23T09:00', 'Europe/Paris', 'FREQ=DAILY;COUNT=5', None),
    ('dst-daily-gap-0230', 'Daily 02:30: the day it does not exist it moves to 03:30', '2026-03-27T02:30', 'Europe/Paris', 'FREQ=DAILY;COUNT=4', None),
    ('dst-daily-repeat-0230', 'Daily 02:30: the day it happens twice, the first reading', '2026-10-23T02:30', 'Europe/Paris', 'FREQ=DAILY;COUNT=5', None),
    ('dst-ny-monthly-0130', 'Monthly 01:30 in New York through November', '2026-09-01T01:30', 'America/New_York', 'FREQ=MONTHLY;COUNT=4', None),
    ('dst-ny-weekly-sunday-0130', 'Sundays 01:30 in New York, repeated on 1 November', '2026-10-18T01:30', 'America/New_York', 'FREQ=WEEKLY;BYDAY=SU;COUNT=4', None),
    ('dst-lordhowe-daily-0215', 'Lord Howe 02:15 across its half-hour gap', '2026-10-02T02:15', 'Australia/Lord_Howe', 'FREQ=DAILY;COUNT=4', None),
    ('dst-sydney-weekly', 'Sydney weekly across its spring forward', '2026-09-27T10:00', 'Australia/Sydney', 'FREQ=WEEKLY;COUNT=3', None),
    ('dst-chicago-yearly-nov-1', 'Yearly on 1 November 01:30 in Chicago', '2026-11-01T01:30', 'America/Chicago', 'FREQ=YEARLY;COUNT=3', None),
    ('kolkata-daily', 'Kolkata, +05:30, daily', '2026-03-27T09:00', 'Asia/Kolkata', 'FREQ=DAILY;COUNT=4', None),
    ('yearly-first-monday-jan-jul', 'First Monday of January and July', '2026-01-05T09:00', 'UTC', 'FREQ=YEARLY;BYMONTH=1,7;BYDAY=1MO;COUNT=6', None),
    ('monthly-first-and-last-weekday', 'First and last weekday of each month', '2026-09-01T09:00', 'UTC', 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1,-1;COUNT=8', None),
    ('weekly-weekend-every-3', 'Weekends, every third week', '2026-09-05T09:00', 'UTC', 'FREQ=WEEKLY;BYDAY=SA,SU;INTERVAL=3;COUNT=8', None),
    ('yearly-yearday-60', 'Day 60: 29 February or 1 March', '2026-03-01T09:00', 'UTC', 'FREQ=YEARLY;BYYEARDAY=60;COUNT=6', None),
    ('monthly-29-30-31', 'The 29th, 30th and 31st, when they exist', '2026-01-29T09:00', 'UTC', 'FREQ=MONTHLY;BYMONTHDAY=29,30,31;COUNT=12', None),
    ('daily-feb-29-only', 'Daily, but only 29 February', '2024-02-29T09:00', 'UTC', 'FREQ=DAILY;BYMONTH=2;BYMONTHDAY=29;COUNT=3', None),
    ('yearly-weekno-1-52-thursday', 'Thursday of weeks 1 and 52', '2026-01-01T09:00', 'UTC', 'FREQ=YEARLY;BYWEEKNO=1,52;BYDAY=TH;COUNT=6', None),
    ('yearly-last-sunday-october', 'The last Sunday of October (Europe’s fall back)', '2026-10-25T09:00', 'Europe/Paris', 'FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10;COUNT=5', None),
    ('monthly-second-wednesday-quarterly', 'Second Wednesday, every three months', '2026-09-09T09:00', 'UTC', 'FREQ=MONTHLY;BYDAY=2WE;INTERVAL=3;COUNT=5', None),
    ('weekly-wkst-sa-every-other', 'Friday to Sunday every other week, WKST=SA', '2026-09-04T09:00', 'UTC', 'FREQ=WEEKLY;WKST=SA;BYDAY=FR,SA,SU;INTERVAL=2;COUNT=9', None),
    ('daily-byday-limit', 'Daily, limited to Monday, Wednesday, Friday', '2026-09-02T09:00', 'UTC', 'FREQ=DAILY;BYDAY=MO,WE,FR;COUNT=7', None),
    ('yearly-last-day-march-two-hours', 'The last day of March at 08:00 and 20:00', '2026-03-31T08:00', 'Europe/Paris', 'FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=-1;BYHOUR=8,20;COUNT=4', None),
    # Windowed (no count): what a view asks for.
    ('window-weekly-infinite', 'An endless weekly rule, seen through October 2026', '2025-01-06T09:00', 'Europe/Paris', 'FREQ=WEEKLY;BYDAY=MO,TH', ('2026-10-01T00:00', '2026-11-01T00:00')),
    ('window-daily-infinite-dst', 'An endless daily rule over the week of fall back', '2026-01-01T09:00', 'Europe/Paris', 'FREQ=DAILY', ('2026-10-24T00:00', '2026-10-27T00:00')),
    ('window-yearly-birthday', 'A yearly birthday, seen in 2030', '2000-03-14T00:00', 'Europe/Paris', 'FREQ=YEARLY', ('2030-01-01T00:00', '2031-01-01T00:00')),
    ('window-monthly-last-friday', 'Last Friday of each month, seen in 2027', '2026-01-30T17:00', 'America/New_York', 'FREQ=MONTHLY;BYDAY=-1FR', ('2027-01-01T00:00', '2028-01-01T00:00')),
]

def iso_z(dt):
    return dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

for cid, desc, start, zone, rule, window in CASES:
    tz = ZoneInfo(zone)
    dtstart = datetime.fromisoformat(start).replace(tzinfo=tz)
    rr = rrulestr(rule, dtstart=dtstart)
    if window:
        lo = datetime.fromisoformat(window[0]).replace(tzinfo=tz)
        hi = datetime.fromisoformat(window[1]).replace(tzinfo=tz)
        got = [d for d in rr.between(lo, hi, inc=True) if d < hi][:LIMIT]
        win = {'from': iso_z(lo), 'to': iso_z(hi)}
    else:
        got = []
        for d in rr:
            got.append(d)
            if len(got) >= LIMIT:
                break
        win = None
    # The zoned start as an RFC 9557 string, with its offset (first reading).
    off = dtstart.strftime('%z')
    off = off[:3] + ':' + off[3:]
    case = {
        'id': f'rrule-{cid}',
        'suite': 'rrule-expand',
        'description': desc,
        'refs': ['FC#6729'] if cid.startswith('dst-') else [],
        'input': {'dtstart': f"{start}:00{off}[{zone}]", 'rrule': rule, **({'window': win} if win else {}), 'limit': LIMIT},
        'expected': [iso_z(d) for d in got],
        'source': 'python-dateutil 2.9 (independent implementation)',
    }
    with open(os.path.join(OUT, f"{case['id']}.json"), 'w') as f:
        json.dump(case, f, indent=2, ensure_ascii=False)
        f.write('\n')
print(len(CASES), 'cases written')
