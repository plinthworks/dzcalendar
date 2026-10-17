import { Temporal, isValidZone } from '@dzcalendar/core';
import type { Instant, PlainDateTime } from '@dzcalendar/core';
import { iterateZoned, parseRRule } from '@dzcalendar/rrule';

/**
 * Windows zone names (Outlook, Exchange) → IANA, from CLDR's windowsZones
 * (territory 001). `*` stands for " Standard Time".
 */
const WINDOWS =
  'Dateline*|Etc/GMT+12;UTC-11|Etc/GMT+11;Aleutian*|America/Adak;Hawaiian*|Pacific/Honolulu;Marquesas*|Pacific/Marquesas;' +
  'Alaskan*|America/Anchorage;UTC-09|Etc/GMT+9;Pacific* (Mexico)|America/Tijuana;UTC-08|Etc/GMT+8;Pacific*|America/Los_Angeles;' +
  'US Mountain*|America/Phoenix;Mountain* (Mexico)|America/Mazatlan;Mountain*|America/Denver;Yukon*|America/Whitehorse;' +
  'Central America*|America/Guatemala;Central*|America/Chicago;Easter Island*|Pacific/Easter;' +
  'Central* (Mexico)|America/Mexico_City;Mexico*|America/Mexico_City;Canada Central*|America/Regina;SA Pacific*|America/Bogota;' +
  'Eastern* (Mexico)|America/Cancun;Eastern*|America/New_York;Haiti*|America/Port-au-Prince;Cuba*|America/Havana;' +
  'US Eastern*|America/Indiana/Indianapolis;Turks And Caicos*|America/Grand_Turk;Paraguay*|America/Asuncion;' +
  'Atlantic*|America/Halifax;Venezuela*|America/Caracas;Central Brazilian*|America/Cuiaba;SA Western*|America/La_Paz;' +
  'Pacific SA*|America/Santiago;Newfoundland*|America/St_Johns;Tocantins*|America/Araguaina;E. South America*|America/Sao_Paulo;' +
  'SA Eastern*|America/Cayenne;Argentina*|America/Argentina/Buenos_Aires;Greenland*|America/Nuuk;Montevideo*|America/Montevideo;' +
  'Magallanes*|America/Punta_Arenas;Saint Pierre*|America/Miquelon;Bahia*|America/Bahia;UTC-02|Etc/GMT+2;' +
  'Mid-Atlantic*|Etc/GMT+2;Azores*|Atlantic/Azores;Cape Verde*|Atlantic/Cape_Verde;UTC|Etc/UTC;GMT*|Europe/London;' +
  'Greenwich*|Atlantic/Reykjavik;Sao Tome*|Africa/Sao_Tome;Morocco*|Africa/Casablanca;W. Europe*|Europe/Berlin;' +
  'Central Europe*|Europe/Budapest;Romance*|Europe/Paris;Central European*|Europe/Warsaw;W. Central Africa*|Africa/Lagos;' +
  'Jordan*|Asia/Amman;GTB*|Europe/Bucharest;Middle East*|Asia/Beirut;Egypt*|Africa/Cairo;E. Europe*|Europe/Chisinau;' +
  'Syria*|Asia/Damascus;West Bank*|Asia/Hebron;South Africa*|Africa/Johannesburg;FLE*|Europe/Kiev;Israel*|Asia/Jerusalem;' +
  'South Sudan*|Africa/Juba;Kaliningrad*|Europe/Kaliningrad;Sudan*|Africa/Khartoum;Libya*|Africa/Tripoli;' +
  'Namibia*|Africa/Windhoek;Arabic*|Asia/Baghdad;Turkey*|Europe/Istanbul;Arab*|Asia/Riyadh;Belarus*|Europe/Minsk;' +
  'Russian*|Europe/Moscow;E. Africa*|Africa/Nairobi;Volgograd*|Europe/Volgograd;Iran*|Asia/Tehran;Arabian*|Asia/Dubai;' +
  'Astrakhan*|Europe/Astrakhan;Azerbaijan*|Asia/Baku;Russia Time Zone 3|Europe/Samara;Mauritius*|Indian/Mauritius;' +
  'Saratov*|Europe/Saratov;Georgian*|Asia/Tbilisi;Caucasus*|Asia/Yerevan;Armenian*|Asia/Yerevan;Afghanistan*|Asia/Kabul;' +
  'West Asia*|Asia/Tashkent;Ekaterinburg*|Asia/Yekaterinburg;Pakistan*|Asia/Karachi;Qyzylorda*|Asia/Qyzylorda;' +
  'India*|Asia/Kolkata;Sri Lanka*|Asia/Colombo;Nepal*|Asia/Kathmandu;Central Asia*|Asia/Almaty;Bangladesh*|Asia/Dhaka;' +
  'Omsk*|Asia/Omsk;Myanmar*|Asia/Yangon;SE Asia*|Asia/Bangkok;Altai*|Asia/Barnaul;W. Mongolia*|Asia/Hovd;' +
  'North Asia*|Asia/Krasnoyarsk;N. Central Asia*|Asia/Novosibirsk;Tomsk*|Asia/Tomsk;China*|Asia/Shanghai;' +
  'North Asia East*|Asia/Irkutsk;Singapore*|Asia/Singapore;W. Australia*|Australia/Perth;Taipei*|Asia/Taipei;' +
  'Ulaanbaatar*|Asia/Ulaanbaatar;Aus Central W.*|Australia/Eucla;Transbaikal*|Asia/Chita;Tokyo*|Asia/Tokyo;' +
  'North Korea*|Asia/Pyongyang;Korea*|Asia/Seoul;Yakutsk*|Asia/Yakutsk;Cen. Australia*|Australia/Adelaide;' +
  'AUS Central*|Australia/Darwin;E. Australia*|Australia/Brisbane;AUS Eastern*|Australia/Sydney;' +
  'West Pacific*|Pacific/Port_Moresby;Tasmania*|Australia/Hobart;Vladivostok*|Asia/Vladivostok;Lord Howe*|Australia/Lord_Howe;' +
  'Bougainville*|Pacific/Bougainville;Russia Time Zone 10|Asia/Srednekolymsk;Magadan*|Asia/Magadan;Norfolk*|Pacific/Norfolk;' +
  'Sakhalin*|Asia/Sakhalin;Central Pacific*|Pacific/Guadalcanal;Russia Time Zone 11|Asia/Kamchatka;Kamchatka*|Asia/Kamchatka;' +
  'New Zealand*|Pacific/Auckland;UTC+12|Etc/GMT-12;Fiji*|Pacific/Fiji;Chatham Islands*|Pacific/Chatham;UTC+13|Etc/GMT-13;' +
  'Tonga*|Pacific/Tongatapu;Samoa*|Pacific/Apia;Line Islands*|Pacific/Kiritimati';

let windows: Map<string, string> | undefined;

/** The IANA zone for a Windows zone name, case-insensitive. */
export function windowsZone(name: string): string | undefined {
  windows ??= new Map(
    WINDOWS.split(';').map((e) => {
      const [w, iana] = e.split('|') as [string, string];
      return [w.replace('*', ' Standard Time').toLowerCase(), iana];
    }),
  );
  return windows.get(name.trim().toLowerCase());
}

/** One STANDARD or DAYLIGHT block of a VTIMEZONE: from when, from which offset to which (seconds). */
export interface Observance {
  readonly start: PlainDateTime;
  readonly from: number;
  readonly to: number;
  readonly rrule?: string;
  readonly rdates: readonly PlainDateTime[];
  readonly standard: boolean;
}

/** `+0100`, `-0330`, `+013015` → seconds; null when malformed. */
export function offsetSeconds(v: string): number | null {
  const m = /^([+-])(\d{2})(\d{2})(\d{2})?$/.exec(v.trim());
  if (!m) return null;
  const s = Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4] ?? 0);
  return m[1] === '-' ? -s : s;
}

/** Seconds → `+0100` (`+013015` when it has seconds). */
export function formatOffset(seconds: number): string {
  const a = Math.abs(seconds);
  const p = (n: number) => String(n).padStart(2, '0');
  const s = a % 60;
  return `${seconds < 0 ? '-' : '+'}${p(Math.floor(a / 3600))}${p(Math.floor(a / 60) % 60)}${s ? p(s) : ''}`;
}

/** The moments a VTIMEZONE changes offset within the years asked, with the offset before and after. */
function transitions(obs: readonly Observance[], fromYear: number, toYear: number): { at: Instant; from: number; to: number }[] {
  const out: { at: Instant; from: number; to: number }[] = [];
  const until = Temporal.PlainDate.from({ year: toYear + 1, month: 1, day: 1 }).toZonedDateTime('UTC').toInstant();
  const since = Temporal.PlainDate.from({ year: fromYear, month: 1, day: 1 }).toZonedDateTime('UTC').toInstant();
  for (const o of obs) {
    // Wall times stepped as if in UTC: pure wall-clock arithmetic.
    const onsets: PlainDateTime[] = [o.start, ...o.rdates];
    const rule = o.rrule ? parseRRule(o.rrule) : null;
    if (rule?.ok) {
      let n = 0;
      for (const z of iterateZoned(o.start.toZonedDateTime('UTC'), rule.rule)) {
        if (z.year > toYear || ++n > 2000) break;
        onsets.push(z.toPlainDateTime());
      }
    }
    for (const wall of onsets) {
      const at = wall.toZonedDateTime('UTC').toInstant().subtract({ seconds: o.from });
      if (Temporal.Instant.compare(at, until) < 0 && Temporal.Instant.compare(at, since) >= 0) out.push({ at, from: o.from, to: o.to });
    }
  }
  return out.sort((a, b) => Temporal.Instant.compare(a.at, b.at));
}

/**
 * The offset (seconds) a VTIMEZONE's own rules give a wall time: what the
 * reader uses when no IANA zone keeps those rules. In a skipped hour, the
 * offset before the change (the wall time is read as if it had not changed
 * yet); in a repeated hour, the first pass.
 */
export function offsetIn(obs: readonly Observance[], wall: PlainDateTime): number {
  const changes = transitions(obs, wall.year - 1, wall.year + 1);
  const std = (obs.find((o) => o.standard) ?? obs[0])?.to ?? 0;
  const at = (inst: Instant) => {
    let off = changes[0]?.from ?? std;
    for (const c of changes) if (Temporal.Instant.compare(c.at, inst) <= 0) off = c.to;
    return off;
  };
  const utc = wall.toZonedDateTime('UTC').toInstant();
  const offsets = [...new Set([std, ...changes.flatMap((c) => [c.from, c.to])])];
  // Offsets under which the wall time exists; two in a repeated hour (the first pass is the larger), none in a gap.
  const fit = offsets.filter((o) => at(utc.subtract({ seconds: o })) === o);
  return fit.length > 0 ? Math.max(...fit) : Math.min(...offsets);
}

const offsetAt = (zone: string, at: Instant) => at.toZonedDateTimeISO(zone).offsetNanoseconds / 1e9;

let candidates: string[] | undefined;

/**
 * The IANA zone that keeps the same offsets as a VTIMEZONE over the years
 * asked: equal just before and at each of its changes, and mid-January and
 * mid-July of each year. Several zones agree (Paris, Berlin, Madrid…): a zone
 * whose name shares a word with the TZID wins, then the one Windows names
 * first for that region (Europe/Berlin rather than Africa/Ceuta), then by name.
 */
export function matchObservances(obs: readonly Observance[], years: readonly number[]): string | null {
  if (obs.length === 0 || years.length === 0) return null;
  const first = Math.min(...years);
  const last = Math.max(...years);
  const changes = transitions(obs, first, last);
  // Before any change the years see, the offset is what the earliest observance changed from.
  const initial = changes[0]?.from ?? [...obs].sort((a, b) => Temporal.PlainDateTime.compare(b.start, a.start))[0]!.to;
  const samples: [Instant, number][] = [];
  for (const c of changes) samples.push([c.at.subtract({ seconds: 1 }), c.from], [c.at, c.to]);
  for (const y of years) {
    for (const month of [1, 7]) {
      const at = Temporal.PlainDateTime.from({ year: y, month, day: 15, hour: 12 }).toZonedDateTime('UTC').toInstant();
      let off = initial;
      for (const c of changes) if (Temporal.Instant.compare(c.at, at) <= 0) off = c.to;
      samples.push([at, off]);
    }
  }
  candidates ??= Intl.supportedValuesOf('timeZone')
    .filter((z) => z.includes('/') && !z.startsWith('Etc/'))
    .sort();
  const fit = candidates.filter((z) => samples.every(([at, off]) => offsetAt(z, at) === off));
  if (fit.length === 0) return null;
  windowsZone(''); // fills the table
  const known = [...windows!.values()];
  const rank = (z: string) => (known.includes(z) ? -known.indexOf(z) : -999);
  return fit.reduce((best, z) => (rank(z) > rank(best) ? z : best));
}

/** A fixed-offset zone id (`+05:30`) for an offset in seconds, to the minute. */
export function fixedZone(seconds: number): string {
  return formatOffset(Math.round(seconds / 60) * 60).replace(/(\d\d)$/, ':$1');
}

/** An IANA zone hidden in a TZID: as is, or the longest valid tail of a path (`/mozilla.org/…/Europe/Paris`). */
export function ianaIn(tzid: string): string | undefined {
  const t = tzid.trim();
  if (isValidZone(t) && !/^[+-]\d/.test(t)) return t;
  const parts = t.split('/').filter((p) => p.length > 0);
  for (let i = 0; i < parts.length - 1; i++) {
    const z = parts.slice(i).join('/');
    if (z.includes('/') && isValidZone(z)) return z;
  }
  return isValidZone(t) ? t : windowsZone(t);
}
