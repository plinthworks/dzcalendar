import { Temporal, UNASSIGNED, formatTemporal, serializeRRule } from '@dzcalendar/core';
import type { CalEvent, Command, CommandResult, CreateRequest, EditScope, EventInput, EventInstance, EventPatch, PlainDate, RRuleWeekday as Weekday, ZoneId } from '@dzcalendar/core';
import { ensureStyles, messagesForLocale } from '@dzcalendar/dom';
import type { CalendarInstance } from '@dzcalendar/dom';
import { createDateTimeRange, EN as TZ_EN, FR as TZ_FR, AR as TZ_AR } from '@tzslot/dom';
import type { DateTimeRangeInstance } from '@tzslot/dom';
import { editorMessagesFor } from './messages.js';
import type { EditorMessages } from './messages.js';
import { nthOf, readRepeat, writeRepeat } from './recurrence.js';
import type { RepeatForm, RepeatFreq } from './recurrence.js';
import { EDITOR_CSS } from './styles.js';

/** What the editor opens on: an event (or an occurrence of a series), or a new one from the calendar's request. */
export type EditorTarget = { readonly instance: EventInstance } | { readonly create: CreateRequest };

export type EditorOutcome = 'saved' | 'deleted' | 'cancelled';

export interface EditorOptions {
  /** Words over the locale's (`editorMessagesFor`). */
  readonly messages?: Partial<EditorMessages>;
  /** Where the dialog goes: default the calendar's own element (its theme applies). */
  readonly container?: HTMLElement;
  /** Minutes the time arrows move by. Default 15. */
  readonly stepMinutes?: number;
  /** Length of a new timed event. Default 60 minutes. */
  readonly defaultMinutes?: number;
  /** The tones offered (theme tokens `--dz-tone-*`). Default: the six of @dzcalendar/theme. */
  readonly tones?: readonly string[];
  /** False under a CSP without inline styles: include `EDITOR_CSS` yourself. Default true. */
  readonly injectStyles?: boolean;
}

const TONES = ['blue', 'green', 'red', 'amber', 'violet', 'slate'] as const;
let uid = 0;

/**
 * The event editor (owner's decision: a modal dialog, the usual
 * recurrences). Opens on an event or a new one, saves through the
 * calendar's history (checked against its rules, undoable), and resolves
 * with what happened. An occurrence of a series asks how far an edit reaches;
 * its recurrence is edited on the whole series.
 */
export function openEventEditor(cal: CalendarInstance, target: EditorTarget, o: EditorOptions = {}): Promise<EditorOutcome> {
  // One editor at a time per calendar: a second call gets the one already open.
  const open = OPEN.get(cal);
  if (open) return open;
  const p = editorOn(cal, target, o);
  OPEN.set(cal, p);
  void p.finally(() => OPEN.delete(cal));
  return p;
}

const OPEN = new WeakMap<CalendarInstance, Promise<EditorOutcome>>();

function editorOn(cal: CalendarInstance, target: EditorTarget, o: EditorOptions): Promise<EditorOutcome> {
  const state = cal.kernel.getState();
  const locale = state.locale;
  const calZone = state.timeZone;
  const words: EditorMessages = { ...editorMessagesFor(locale), ...o.messages } as EditorMessages;
  const cm = messagesForLocale(locale);
  const host = o.container ?? cal.element;
  const doc = host.ownerDocument;
  if (o.injectStyles !== false) ensureStyles(host, 'editor', EDITOR_CSS);
  const id = `dz-editor-${++uid}`;
  let fieldN = 0;
  /** tzslot's range, made below: read by the helpers before (only once it exists). */
  let dtr: DateTimeRangeInstance | null = null;

  // ── what is edited ───────────────────────────────────────────────────────
  const inst = 'instance' in target ? target.instance : null;
  const ev: CalEvent | null = inst?.event ?? null;
  const series = ev?.ref ? cal.kernel.store.snapshot.getSeries(ev.ref.seriesId) ?? null : null;
  const zoneOf = (e: CalEvent | null): ZoneId => (e && !e.allDay ? e.start.timeZoneId : calZone);
  let zone = zoneOf(ev);
  /** A flight's end keeps its own zone (Paris → Tokyo), unless the person sets the zone. */
  let endZone: ZoneId = ev && !ev.allDay ? ev.end.timeZoneId : zone;
  const req = 'create' in target ? target.create : null;
  const initial = (() => {
    if (ev) {
      const s = ev.allDay ? ev.start.toZonedDateTime({ timeZone: calZone }).toInstant() : ev.start.toInstant();
      const e = ev.allDay ? ev.end.toZonedDateTime({ timeZone: calZone }).toInstant() : ev.end.toInstant();
      return { start: s, end: e, allDay: ev.allDay };
    }
    if (req!.allDay) {
      const s = req!.start.toZonedDateTime({ timeZone: calZone }).toInstant();
      return { start: s, end: req!.start.add({ days: 1 }).toZonedDateTime({ timeZone: calZone }).toInstant(), allDay: true };
    }
    return { start: req!.start, end: req!.start.add({ minutes: o.defaultMinutes ?? 60 }), allDay: false };
  })();
  const startDate = (): PlainDate => (dtr?.value.start ?? initial.start).toZonedDateTimeISO(zone).toPlainDate();
  const ruleText = series ? series.set.rules.map(serializeRRule).join('\n') : '';
  const firstDate = series ? (series.base.allDay ? (series.base.start as PlainDate) : series.base.start.toPlainDate()) : startDate();
  const repeat0: RepeatForm = readRepeat(series ? series.set.rules : null, ev?.ref ? firstDate : (initial.start.toZonedDateTimeISO(zone).toPlainDate()), zone, ruleText);

  // ── the dialog ───────────────────────────────────────────────────────────
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const backdrop = el('div', 'dz-editor-backdrop');
  const dialog = el('div', 'dz-editor');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', `${id}-h`);
  const heading = el('h2', 'dz-editor__title', ev ? words.editEvent : words.newEvent);
  heading.id = `${id}-h`;
  const form = el('form', 'dz-editor__form');
  form.noValidate = true;
  dialog.append(heading, form);
  backdrop.append(dialog);
  // In the document, hidden, before tzslot's widget is made: it injects its styles only once connected.
  backdrop.hidden = true;
  host.append(backdrop);

  const field = (label: string, control: HTMLElement) => {
    const wrap = el('div', 'dz-editor__field');
    const l = el('label', 'dz-editor__label', label);
    control.id ||= `${id}-f${++fieldN}`;
    l.htmlFor = control.id;
    wrap.append(l, control);
    return wrap;
  };
  const group = (legend: string, ...kids: HTMLElement[]) => {
    const fs = el('fieldset', 'dz-editor__group');
    fs.append(el('legend', 'dz-editor__label', legend), ...kids);
    return fs;
  };

  // Title.
  const title = el('input', 'dz-editor__input');
  title.type = 'text';
  title.value = ev?.title ?? '';
  title.autocomplete = 'off';
  form.append(field(words.title, title));

  // When: tzslot's range (the measured length, the repeated hour, whole days).
  const whenHost = el('div', 'dz-editor__when');
  form.append(group(words.when, whenHost));
  const tz = locale.toLowerCase().startsWith('fr') ? TZ_FR : locale.toLowerCase().startsWith('ar') ? TZ_AR : TZ_EN;
  dtr = createDateTimeRange(whenHost, {
    value: { start: initial.start, end: initial.end, allDay: initial.allDay },
    allDay: initial.allDay,
    allDaySwitch: true,
    timeZone: zone,
    locale,
    messages: tz,
    stepMinutes: o.stepMinutes ?? 15,
    snapMinutes: o.stepMinutes ?? 15,
    today: state.today,
    // The month's options name the start's day: they follow it.
    onChange: () => sync(),
  } as never);

  // The event's zone (its wall clock: what a repeated time keeps).
  const zoneSel = el('select', 'dz-editor__input');
  const zones = [...new Set([zone, calZone, ...supportedZones()])];
  for (const z of zones) zoneSel.append(new Option(z, z, z === zone, z === zone));
  zoneSel.addEventListener('change', () => {
    zone = zoneSel.value;
    endZone = zone;
    dtr?.update({ timeZone: zone });
  });
  const zoneField = field(words.timeZone, zoneSel);
  form.append(zoneField);

  // Resources, when the calendar has some.
  const resources = cal.kernel.getResources().order;
  const chosen = new Set<string>(ev?.resourceIds ?? (req?.resourceId && req.resourceId !== UNASSIGNED ? [req.resourceId] : []));
  const resourceBoxes: HTMLInputElement[] = [];
  if (resources.length > 0) {
    const list = el('div', 'dz-editor__checks');
    for (const r of resources) {
      const box = el('input');
      box.type = 'checkbox';
      box.value = r.id;
      box.checked = chosen.has(r.id);
      resourceBoxes.push(box);
      const l = el('label', 'dz-editor__check');
      l.append(box, doc.createTextNode(` ${r.title || r.id}`));
      list.append(l);
    }
    form.append(group(words.resources, list));
  }

  // Colour.
  const toneSel = el('select', 'dz-editor__input');
  toneSel.append(new Option(words.colours.none, ''));
  for (const t of o.tones ?? TONES) toneSel.append(new Option((words.colours as Record<string, string>)[t] ?? t, t, t === ev?.tone, t === ev?.tone));
  form.append(field(words.colour, toneSel));

  // Repeats.
  const freqSel = el('select', 'dz-editor__input');
  freqSel.append(new Option(words.repeatNone, 'none'));
  for (const f of ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const) freqSel.append(new Option(words.freq[f], f));
  if (repeat0.freq === 'custom') freqSel.append(new Option(words.customLabel, 'custom'));
  freqSel.value = repeat0.freq;
  const interval = el('input', 'dz-editor__input dz-editor__num');
  interval.type = 'number';
  interval.min = '1';
  interval.value = String(repeat0.freq === 'custom' ? 1 : repeat0.interval);
  const unit = el('span', 'dz-editor__unit');
  const everyRow = el('div', 'dz-editor__row');
  const everyLabel = el('label', 'dz-editor__label', words.every);
  interval.id = `${id}-every`;
  everyLabel.htmlFor = interval.id;
  everyRow.append(everyLabel, interval, unit);
  // Weekdays, in the calendar's week order. Untouched, the one ticked follows the start's day.
  let daysTouched = Boolean(series);
  const days = el('div', 'dz-editor__checks dz-editor__days');
  const dayBoxes = new Map<Weekday, HTMLInputElement>();
  const ref = Temporal.PlainDate.from('2026-10-19'); // a Monday
  for (let i = 0; i < 7; i++) {
    const wd = (((state.firstDay - 1 + i) % 7) + 1) as Weekday;
    const box = el('input');
    box.type = 'checkbox';
    box.checked = repeat0.freq !== 'custom' && repeat0.weekdays.includes(wd);
    box.addEventListener('change', () => (daysTouched = true));
    dayBoxes.set(wd, box);
    const l = el('label', 'dz-editor__check');
    l.append(box, doc.createTextNode(` ${formatTemporal(ref.add({ days: wd - 1 }), { weekday: 'short' }, locale)}`));
    days.append(l);
  }
  const daysGroup = group(words.onDays, days);
  // Monthly: on the day, the n-th weekday, the last one.
  const monthly = el('div', 'dz-editor__radios');
  const monthlyRadio = (value: 'day' | 'nth' | 'last') => {
    const r = el('input');
    r.type = 'radio';
    r.name = `${id}-monthly`;
    r.value = value;
    r.checked = repeat0.freq !== 'custom' && repeat0.monthly === value;
    const l = el('label', 'dz-editor__check');
    l.append(r, el('span'));
    return l;
  };
  const mDay = monthlyRadio('day');
  const mNth = monthlyRadio('nth');
  const mLast = monthlyRadio('last');
  monthly.append(mDay, mNth, mLast);
  // Ends.
  const ends = el('div', 'dz-editor__radios');
  const endRadio = (value: 'never' | 'until' | 'count', label: string, extra?: HTMLElement) => {
    const r = el('input');
    r.type = 'radio';
    r.name = `${id}-end`;
    r.value = value;
    r.checked = repeat0.freq !== 'custom' && repeat0.end.kind === value;
    // The radio's name is its word only; the date or the count beside it is its own field, and choosing it picks the radio.
    const l = el('label', 'dz-editor__check');
    l.append(r, doc.createTextNode(` ${label}`));
    if (!extra) return l;
    extra.addEventListener('input', () => (r.checked = true));
    extra.addEventListener('focus', () => (r.checked = true), true);
    const row = el('div', 'dz-editor__row');
    row.append(l, extra);
    return row;
  };
  const untilInput = el('input', 'dz-editor__input');
  untilInput.type = 'date';
  untilInput.setAttribute('aria-label', words.onDate);
  untilInput.value = repeat0.freq !== 'custom' && repeat0.end.kind === 'until' ? repeat0.end.date.toString() : '';
  const countInput = el('input', 'dz-editor__input dz-editor__num');
  countInput.type = 'number';
  countInput.min = '1';
  countInput.value = repeat0.freq !== 'custom' && repeat0.end.kind === 'count' ? String(repeat0.end.count) : '10';
  const countWord = el('span');
  const countWrap = el('span');
  countWrap.append(countInput, countWord);
  countInput.setAttribute('aria-label', words.after);
  ends.append(endRadio('never', words.never), endRadio('until', words.onDate, untilInput), endRadio('count', words.after, countWrap));
  const endsGroup = group(words.ends, ends);
  const customNote = el('p', 'dz-editor__note', repeat0.freq === 'custom' ? words.custom({ rule: repeat0.text }) : '');
  const repeatGroup = group(words.repeat, field(words.frequency, freqSel), everyRow, daysGroup, group(words.monthlyOn, monthly), endsGroup, customNote);
  form.append(repeatGroup);

  // An occurrence: how far the edit reaches. The repeat is the whole series': shown with "all events" only.
  let scope: EditScope = 'this';
  const scopeRadios: HTMLInputElement[] = [];
  if (ev?.ref) {
    const radios = el('div', 'dz-editor__radios');
    for (const [value, label] of [['this', cm.scopeThis], ['following', cm.scopeFollowing], ['all', cm.scopeAll]] as const) {
      const r = el('input');
      r.type = 'radio';
      r.name = `${id}-scope`;
      r.value = value;
      r.checked = value === 'this';
      r.addEventListener('change', () => {
        scope = value;
        sync();
      });
      scopeRadios.push(r);
      const l = el('label', 'dz-editor__check');
      l.append(r, doc.createTextNode(` ${label}`));
      radios.append(l);
    }
    form.insertBefore(group(words.applyTo, radios), repeatGroup);
  }

  const error = el('p', 'dz-editor__error');
  error.setAttribute('role', 'alert');
  form.append(error);
  const footer = el('div', 'dz-editor__actions');
  const remove = el('button', 'dz-editor__btn dz-editor__btn--danger', words.remove);
  remove.type = 'button';
  const cancel = el('button', 'dz-editor__btn', words.cancel);
  cancel.type = 'button';
  const save = el('button', 'dz-editor__btn dz-editor__btn--primary', words.save);
  save.type = 'submit';
  if (ev) footer.append(remove);
  footer.append(cancel, save);
  form.append(footer);

  /** The form's repeat now. */
  const repeatNow = (): RepeatForm => {
    if (freqSel.value === 'custom' && repeat0.freq === 'custom') return repeat0;
    const end = (form.querySelector<HTMLInputElement>(`input[name="${id}-end"]:checked`)?.value ?? 'never') as 'never' | 'until' | 'count';
    const untilDate = (() => {
      try {
        return untilInput.value ? Temporal.PlainDate.from(untilInput.value) : null;
      } catch {
        return null;
      }
    })();
    return {
      freq: freqSel.value as RepeatFreq,
      interval: Math.max(1, Math.floor(Number(interval.value) || 1)),
      weekdays: [...dayBoxes].filter(([, b]) => b.checked).map(([d]) => d),
      monthly: (form.querySelector<HTMLInputElement>(`input[name="${id}-monthly"]:checked`)?.value ?? 'day') as 'day' | 'nth' | 'last',
      end: end === 'until' && untilDate ? { kind: 'until', date: untilDate } : end === 'count' ? { kind: 'count', count: Math.max(1, Math.floor(Number(countInput.value) || 1)) } : { kind: 'never' },
    };
  };

  /** What is shown follows the choices: the unit, the weekdays for weekly, the month's options, the repeat with the series. */
  function sync(): void {
    const f = freqSel.value as RepeatFreq | 'custom';
    const real = f !== 'none' && f !== 'custom';
    everyRow.hidden = !real;
    endsGroup.hidden = !real;
    daysGroup.hidden = f !== 'WEEKLY';
    (monthly.closest('fieldset') as HTMLElement).hidden = f !== 'MONTHLY';
    customNote.hidden = f !== 'custom';
    if (real) unit.textContent = words.units({ freq: f, n: Math.max(1, Math.floor(Number(interval.value) || 1)) });
    countWord.textContent = ` ${words.occurrences({ n: Math.max(1, Math.floor(Number(countInput.value) || 1)) })}`;
    const d = ev?.ref ? firstDate : startDate();
    const nth = nthOf(d);
    const weekday = formatTemporal(d, { weekday: 'long' }, locale);
    (mDay.lastChild as HTMLElement).textContent = ` ${words.monthlyDay({ day: formatTemporal(d, { day: 'numeric' }, locale) })}`;
    (mNth.lastChild as HTMLElement).textContent = ` ${words.monthlyNth({ n: nth.n, weekday })}`;
    (mLast.lastChild as HTMLElement).textContent = ` ${words.monthlyLast({ weekday })}`;
    mNth.hidden = nth.n > 4;
    mLast.hidden = !nth.last;
    if (!daysTouched) for (const [wd, b] of dayBoxes) b.checked = wd === d.dayOfWeek;
    // An occurrence's repeat is its series': changed with "all events" only.
    repeatGroup.hidden = Boolean(ev?.ref) && scope !== 'all';
    zoneField.hidden = Boolean(dtr?.value.allDay);
  }
  for (const n of [freqSel, interval, countInput]) n.addEventListener('input', sync);
  freqSel.addEventListener('change', sync);
  sync();

  // ── saving ──────────────────────────────────────────────────────────────
  function fields(): { input: Omit<EventInput, 'id'>; date: PlainDate; allDay: boolean } | null {
    const v = dtr!.value;
    if (!v.start || !v.end) return null;
    const allDay = Boolean(v.allDay);
    const date = v.start.toZonedDateTimeISO(zone).toPlainDate();
    let start: string;
    let end: string;
    if (allDay) {
      let last = v.end.toZonedDateTimeISO(zone).toPlainDate();
      if (Temporal.PlainDate.compare(last, date) <= 0) last = date.add({ days: 1 });
      start = date.toString();
      end = last.toString();
    } else {
      start = v.start.toZonedDateTimeISO(zone).toString();
      end = (v.end.epochMilliseconds > v.start.epochMilliseconds ? v.end : v.start).toZonedDateTimeISO(endZone).toString();
    }
    const tone = toneSel.value;
    return {
      input: {
        title: title.value.trim(),
        start,
        end,
        allDay,
        resourceIds: resourceBoxes.filter((b) => b.checked).map((b) => b.value),
        ...(tone ? { tone } : { tone: undefined }),
      } as Omit<EventInput, 'id'>,
      date,
      allDay,
    };
  }

  function commandFor(): Command | null {
    const f = fields();
    if (!f) return null;
    const repeat = repeatNow();
    const rrule = writeRepeat(repeat, ev?.ref ? firstDate : f.date, { allDay: f.allDay, zone });
    if (!ev) return { type: 'event.create', event: { ...f.input, ...(rrule && { rrule }) } as EventInput };
    const patch = changed(f.input);
    const edits = Object.keys(patch).length > 0;
    // Compared as forms, not strings: a rule written another way (or with its own WKST) is not a change.
    const ruleChanged = !sameRepeat(repeat, repeat0);
    const all: Command[] = [];
    if (!ev.ref) {
      if (edits) all.push({ type: 'event.update', id: ev.id, patch });
      // A single event made to repeat: the same id, every field kept (core: event.repeat).
      if (rrule && ruleChanged) all.push({ type: 'event.repeat', id: ev.id, rrule });
    } else {
      const sid = ev.ref.seriesId;
      // The whole series: another rule (or none) first, read against its present start — then a move of
      // the series rebases that rule with it (a Wednesday rule moved to Thursday is a Thursday rule).
      if (scope === 'all' && ruleChanged && rrule !== null) all.push({ type: 'series.rule', id: sid, rrule: rrule.split('\n') });
      if (edits) all.push({ type: 'event.update', id: sid, key: ev.ref.key, scope, patch });
      // None: its first occurrence becomes the event, nothing else lost — after the edit, which it then carries.
      if (scope === 'all' && ruleChanged && rrule === null) all.push({ type: 'series.rule', id: sid, rrule: null });
    }
    if (all.length === 0) return NOTHING;
    return all.length === 1 ? all[0]! : { type: 'batch', commands: all };
  }

  /**
   * Only what the person changed: a title edited on an event that already
   * overlaps another is not refused for its times (the rules check moves).
   */
  function changed(input: Omit<EventInput, 'id'>): EventPatch {
    const was = ev!;
    const patch: Record<string, unknown> = {};
    if (input.title !== was.title) patch['title'] = input.title;
    if (input.tone !== was.tone) patch['tone'] = input.tone;
    // ISO strings: another zone is another string, as it should (the wall clock changed).
    const sameTime = was.allDay === input.allDay && String(was.start) === String(input.start) && String(was.end) === String(input.end);
    if (!sameTime) Object.assign(patch, { start: input.start, end: input.end, allDay: input.allDay });
    const ids = input.resourceIds ?? [];
    if (ids.join('\u0000') !== was.resourceIds.join('\u0000')) patch['resourceIds'] = ids;
    return patch as EventPatch;
  }

  const refusedWords = (r: Extract<CommandResult, { ok: false }>) => {
    const why = r.violations && r.violations.length > 0 ? [...new Set(r.violations.map((v) => cm.violation(v.code)))].join(', ') : [...new Set(r.problems.map((p) => words.problem(p.code)))].join(', ');
    return words.refused({ why });
  };

  /** What must be fixed before saving: said, the field marked and focused. Null when all is readable. */
  function invalid(): { readonly field: HTMLElement; readonly why: string } | null {
    for (const n of [untilInput, countInput, interval]) n.removeAttribute('aria-invalid');
    const v = dtr!.value;
    if (!v.start || !v.end) return { field: title, why: words.needDate };
    const f = freqSel.value;
    if (f === 'none' || f === 'custom' || (ev?.ref && scope !== 'all')) return null;
    const whole = (n: HTMLInputElement) => /^\s*\d+\s*$/.test(n.value) && Number(n.value) >= 1;
    if (!whole(interval)) return { field: interval, why: words.needNumber };
    if (f === 'WEEKLY' && ![...dayBoxes.values()].some((b) => b.checked)) return { field: dayBoxes.values().next().value!, why: words.needWeekday };
    const end = form.querySelector<HTMLInputElement>(`input[name="${id}-end"]:checked`)?.value;
    if (end === 'count' && !whole(countInput)) return { field: countInput, why: words.needNumber };
    if (end === 'until') {
      let date: PlainDate | null = null;
      try {
        date = untilInput.value ? Temporal.PlainDate.from(untilInput.value) : null;
      } catch {
        date = null;
      }
      if (!date) return { field: untilInput, why: words.needUntil };
      if (Temporal.PlainDate.compare(date, ev?.ref ? firstDate : startDate()) < 0) return { field: untilInput, why: words.untilBeforeStart };
    }
    return null;
  }

  return new Promise<EditorOutcome>((resolve) => {
    const before = doc.activeElement as HTMLElement | null;
    let done = false;
    let dirty = false;
    form.addEventListener('input', () => (dirty = true));
    form.addEventListener('change', () => (dirty = true));
    const close = (outcome: EditorOutcome) => {
      if (done) return;
      done = true;
      dtr?.destroy();
      backdrop.remove();
      doc.removeEventListener('keydown', onKey, true);
      doc.removeEventListener('focusin', onFocus, true);
      untrack();
      // Back where it was; from the context menu (gone now), to the event's node, else the calendar's tab stop.
      const back = before?.isConnected && !before.closest('.dz-menu') ? before : ev ? cal.element.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(ev.id)}"][tabindex]`) : cal.element.querySelector<HTMLElement>('.dz-cursor, [tabindex="0"]');
      back?.focus();
      resolve(outcome);
    };
    // The calendar destroyed while the editor is open: it closes with it.
    const untrack = cal.onDestroy(() => close('cancelled'));
    const run = (cmd: Command | null, outcome: EditorOutcome) => {
      const bad = outcome === 'saved' ? invalid() : null;
      if (bad || !cmd) {
        error.textContent = bad?.why ?? words.needDate;
        if (bad) {
          bad.field.setAttribute('aria-invalid', 'true');
          bad.field.focus();
        }
        return;
      }
      // Nothing changed: nothing written (no empty override of an occurrence).
      if (cmd === NOTHING) return close(outcome);
      const r = cal.run(cmd, { validate: true });
      if (!r.ok) {
        error.textContent = refusedWords(r);
        return;
      }
      close(outcome);
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      run(commandFor(), 'saved');
    });
    cancel.addEventListener('click', () => close('cancelled'));
    remove.addEventListener('click', () => {
      if (!ev) return;
      run(ev.ref ? { type: 'event.delete', id: ev.ref.seriesId, key: ev.ref.key, scope } : { type: 'event.delete', id: ev.id }, 'deleted');
    });
    // A click outside closes an untouched form only: a stray click does not lose what was typed.
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop && !dirty) close('cancelled');
    });
    // Modal: Escape closes — not while one of tzslot's pickers is open (Escape is its, to close it) — and Tab stays inside.
    function onKey(e: KeyboardEvent): void {
      if (!backdrop.isConnected) return;
      if (e.key === 'Escape' && !e.defaultPrevented) {
        if (dialog.querySelector('[aria-expanded="true"]')) return;
        e.preventDefault();
        close('cancelled');
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('input, select, textarea, button, [tabindex]:not([tabindex="-1"])')].filter((n) => !n.hasAttribute('disabled') && !n.closest('[hidden]') && n.tabIndex >= 0);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && doc.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && doc.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    // The focus never leaves for the page behind (a click on dead space, a script): back to the title.
    function onFocus(e: FocusEvent): void {
      const t = e.target as Node | null;
      // tzslot's pickers open on the page's body, outside the dialog: they are part of it.
      const inPicker = t instanceof Element && t.closest('.tz-field__panel, [class^="tz-"], [class*=" tz-"]') !== null;
      if (t && !dialog.contains(t) && !inPicker) title.focus();
    }
    doc.addEventListener('keydown', onKey, true);
    doc.addEventListener('focusin', onFocus, true);
    backdrop.hidden = false;
    title.focus();
  });
}

/**
 * The calendar's callbacks that open the editor: `cal.update(editorHandlers(cal))`
 * — "Open" on an event and "New event here" from the context menu go to it.
 */
export function editorHandlers(cal: CalendarInstance, o: EditorOptions = {}) {
  return {
    onEventOpen: (instance: EventInstance) => void openEventEditor(cal, { instance }, o),
    onCreateRequest: (request: CreateRequest) => void openEventEditor(cal, { create: request }, o),
  };
}

/** No change at all: the editor closes without writing. */
const NOTHING: Command = { type: 'batch', label: 'nothing', commands: [] };

/** Two repeat forms the same (the weekdays as a set, the end's date as a date). */
function sameRepeat(a: RepeatForm, b: RepeatForm): boolean {
  if (a.freq === 'custom' || b.freq === 'custom') return a.freq === b.freq && a.freq === 'custom' && b.freq === 'custom' && a.text === b.text;
  if (a.freq !== b.freq) return false;
  if (a.freq === 'none') return true;
  const end = (x: typeof a.end) => (x.kind === 'until' ? `u${x.date}` : x.kind === 'count' ? `c${x.count}` : 'n');
  const days = (x: typeof a) => (x.freq === 'WEEKLY' ? [...new Set(x.weekdays)].sort().join() : '');
  return a.interval === b.interval && end(a.end) === end(b.end) && days(a) === days(b) && (a.freq !== 'MONTHLY' || a.monthly === b.monthly);
}

/** Every IANA zone the engine knows (older engines: none listed beyond the event's and the calendar's). */
function supportedZones(): string[] {
  try {
    return (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    return [];
  }
}
