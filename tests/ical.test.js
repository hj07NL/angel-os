const assert = require('assert'); const I = require('../js/ical.js');
process.env.TZ = process.env.TZ || 'Europe/Amsterdam';
const wrap = (b) => 'BEGIN:VCALENDAR\r\n' + b + '\r\nEND:VCALENDAR';
const ev = (l) => 'BEGIN:VEVENT\r\n' + l.join('\r\n') + '\r\nEND:VEVENT';
const P = (l, o) => I.parse(wrap(ev(l)), Object.assign({ from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 11, 31) }, o));
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };

t('gewone afspraak (Z) + ingeklapte regel + escapes', () => {
  const r = P(['UID:a', 'DTSTART:20261027T080000Z', 'DTEND:20261027T085000Z', 'SUMMARY:Wiskunde\\, klas', ' 4A', 'LOCATION:A1.02']);
  assert.deepStrictEqual(r.map(x => [x.start, x.end, x.summary, x.location]), [['2026-10-27T08:00:00.000Z', '2026-10-27T08:50:00.000Z', 'Wiskunde, klas4A', 'A1.02']]);
});
t('zwevende tijd = lokale tijd (zoals oude lezer)', () => {
  const r = P(['DTSTART:20261027T090000', 'DTEND:20261027T100000', 'SUMMARY:x']);
  assert.strictEqual(r[0].start, new Date(2026, 9, 27, 9, 0).toISOString());
});
t('TZID Amsterdam winter/zomer', () => {
  const w = P(['DTSTART;TZID=Europe/Amsterdam:20261201T100000', 'SUMMARY:w'])[0].start;
  const s = P(['DTSTART;TZID=Europe/Amsterdam:20260701T100000', 'SUMMARY:s'])[0].start;
  assert.strictEqual(w, '2026-12-01T09:00:00.000Z'); assert.strictEqual(s, '2026-07-01T08:00:00.000Z');
});
t('hele dag', () => {
  const r = P(['DTSTART;VALUE=DATE:20261105', 'DTEND;VALUE=DATE:20261106', 'SUMMARY:d']);
  assert.strictEqual(r[0].allDay, true);
});
t('wekelijks MO,WE COUNT=4', () => {
  const r = P(['UID:w', 'DTSTART:20261026T080000Z', 'DTEND:20261026T090000Z', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4', 'SUMMARY:w']);
  assert.deepStrictEqual(r.map(x => x.start.slice(0, 10)), ['2026-10-26', '2026-10-28', '2026-11-02', '2026-11-04']);
});
t('dagelijks INTERVAL=2 UNTIL + EXDATE', () => {
  const r = P(['UID:d', 'DTSTART:20261001T080000Z', 'RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20261009T235959Z', 'EXDATE:20261003T080000Z', 'SUMMARY:d']);
  assert.deepStrictEqual(r.map(x => x.start.slice(8, 10)), ['01', '05', '07', '09']);
});
t('maandelijks BYMONTHDAY en n-de weekdag', () => {
  const a = P(['UID:m', 'DTSTART:20261015T080000Z', 'RRULE:FREQ=MONTHLY;COUNT=3', 'SUMMARY:m']);
  assert.deepStrictEqual(a.map(x => x.start.slice(0, 10)), ['2026-10-15', '2026-11-15', '2026-12-15']);
  const b = P(['UID:m2', 'DTSTART:20261007T080000Z', 'RRULE:FREQ=MONTHLY;BYDAY=1WE;COUNT=3', 'SUMMARY:m']);
  assert.deepStrictEqual(b.map(x => x.start.slice(0, 10)), ['2026-10-07', '2026-11-04', '2026-12-02']);
});
t('jaarlijks', () => {
  const r = I.parse(wrap(ev(['UID:y', 'DTSTART;VALUE=DATE:20200301', 'RRULE:FREQ=YEARLY', 'SUMMARY:y'])), { from: Date.UTC(2026, 0, 1), to: Date.UTC(2027, 11, 31) });
  assert.strictEqual(r.length, 2);
});
t('RECURRENCE-ID verplaatst en annuleert', () => {
  const r = P(['UID:r', 'DTSTART:20261026T080000Z', 'DTEND:20261026T090000Z', 'RRULE:FREQ=WEEKLY;COUNT=3', 'SUMMARY:orig'].concat([]).concat(['END:VEVENT', 'BEGIN:VEVENT', 'UID:r', 'RECURRENCE-ID:20261102T080000Z', 'DTSTART:20261102T120000Z', 'DTEND:20261102T130000Z', 'SUMMARY:verplaatst']));
  assert.deepStrictEqual(r.map(x => x.start.slice(0, 13) + x.summary), ['2026-10-26T08orig', '2026-11-02T12verplaatst', '2026-11-09T08orig']);
});
t('STATUS:CANCELLED overgeslagen, VALARM genegeerd', () => {
  assert.strictEqual(P(['DTSTART:20261027T080000Z', 'STATUS:CANCELLED', 'SUMMARY:x']).length, 0);
  const r = P(['DTSTART:20261027T080000Z', 'SUMMARY:x', 'BEGIN:VALARM', 'SUMMARY:alarm', 'END:VALARM']);
  assert.strictEqual(r[0].summary, 'x');
});
t('oneindige herhaling stopt', () => {
  const r = P(['UID:i', 'DTSTART:20260101T080000Z', 'RRULE:FREQ=DAILY', 'SUMMARY:i']);
  assert.ok(r.length >= 300 && r.length <= 366);
});
console.log(n + ' tests geslaagd');
