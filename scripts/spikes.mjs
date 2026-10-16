/**
 * Phase 0 spikes: four questions about the Temporal polyfill that the
 * architecture could not answer from reading. Run against the polyfill that
 * @tzslot/core bundles, and against the native Temporal when the runtime has one.
 * Results are copied by hand into ROADMAP.md.
 */
import { Temporal as Polyfill } from 'temporal-polyfill/full';

const native = globalThis.Temporal;
const impls = [['polyfill', Polyfill], ...(native ? [['native', native]] : [])];
const out = (label, fn) => {
  try { console.log(`  ${label}:`, fn()); } catch (e) { console.log(`  ${label}: THROWS ${e.constructor.name}: ${e.message}`); }
};

for (const [name, T] of impls) {
  console.log(`\n=== ${name}`);

  console.log('1. getTimeZoneTransition');
  const z = T.ZonedDateTime.from('2026-10-25T00:00[Europe/Paris]');
  out('method exists', () => typeof z.getTimeZoneTransition);
  out('next from 25 Oct 00:00 Paris', () => z.getTimeZoneTransition('next')?.toString());
  out('previous', () => z.getTimeZoneTransition('previous')?.toString());
  out('next Lord Howe from 2026-10-01', () => T.ZonedDateTime.from('2026-10-01T00:00[Australia/Lord_Howe]').getTimeZoneTransition('next')?.toString());
  out('next in UTC', () => T.ZonedDateTime.from('2026-01-01T00:00[UTC]').getTimeZoneTransition('next'));

  console.log('2. Intl formatting');
  const zdt = T.ZonedDateTime.from('2026-10-25T02:30+01:00[Europe/Paris]');
  out('zdt.toLocaleString fr', () => zdt.toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }));
  out('DTF.format(epochMs) tz Paris', () => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(zdt.epochMilliseconds));
  out('DTF.formatToParts(epochMs) islamic', () => new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { timeZone: 'Asia/Riyadh', year: 'numeric', month: 'long', day: 'numeric' }).formatToParts(zdt.epochMilliseconds).map((p) => p.type + '=' + p.value).join(' | '));
  out('DTF.format(PlainDate) (calendar iso8601)', () => new Intl.DateTimeFormat('fr-FR', { calendar: 'iso8601' }).format(T.PlainDate.from('2026-10-25')));
  out('DTF.format(ZonedDateTime)', () => new Intl.DateTimeFormat('fr-FR').format(zdt));

  console.log('4. start of day when midnight does not exist');
  out('Sao Paulo 2018-11-04', () => T.PlainDate.from('2018-11-04').toZonedDateTime({ timeZone: 'America/Sao_Paulo' }).toString());
  out('Havana 2023-03-12', () => T.PlainDate.from('2023-03-12').toZonedDateTime({ timeZone: 'America/Havana' }).toString());
  out('Havana startOfDay', () => T.ZonedDateTime.from('2023-03-12T12:00[America/Havana]').startOfDay().toString());
  out('Apia 2011-12-30 (skipped day)', () => T.PlainDate.from('2011-12-30').toZonedDateTime({ timeZone: 'Pacific/Apia' }).toString());
  out('Apia 2011-12-31', () => T.PlainDate.from('2011-12-31').toZonedDateTime({ timeZone: 'Pacific/Apia' }).toString());
  out('Apia 2011-12-29 hoursInDay', () => T.PlainDate.from('2011-12-29').toZonedDateTime({ timeZone: 'Pacific/Apia' }).hoursInDay);
  out('Paris 2026-10-25 hoursInDay', () => T.PlainDate.from('2026-10-25').toZonedDateTime({ timeZone: 'Europe/Paris' }).hoursInDay);
  out('Lord Howe 2026-10-04 hoursInDay', () => T.PlainDate.from('2026-10-04').toZonedDateTime({ timeZone: 'Australia/Lord_Howe' }).hoursInDay);
}

console.log('\n3. Intl.Locale text direction');
out('getTextInfo', () => typeof new Intl.Locale('ar').getTextInfo);
out('textInfo getter', () => JSON.stringify(new Intl.Locale('ar').textInfo));
out('getTextInfo()', () => JSON.stringify(new Intl.Locale('ar').getTextInfo?.()));
console.log(`\nnode ${process.version}, native Temporal: ${Boolean(native)}`);
