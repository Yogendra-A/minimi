import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { interpretTemporalQuery } from '../src/temporal/parser.js';

describe('Temporal Interpretation & Timezone Boundaries', () => {
  // Fix reference time: Wednesday, 2026-11-11 at 12:00:00 local time in Asia/Kolkata
  const refTime = DateTime.fromISO('2026-11-11T12:00:00', { zone: 'Asia/Kolkata' });

  it('resolves "yesterday" with exact local start and end of day in UTC', () => {
    const res = interpretTemporalQuery('What did I ask you yesterday?', refTime, 'Asia/Kolkata');
    expect(res.hasTemporalReference).toBe(true);
    expect(res.dateRange).toBeDefined();

    // 2026-11-10 in Asia/Kolkata (UTC+5:30):
    // 00:00:00 IST -> 2026-11-09T18:30:00.000Z
    // 23:59:59.999 IST -> 2026-11-10T18:29:59.999Z
    const startIst = DateTime.fromISO(res.dateRange!.startUtc).setZone('Asia/Kolkata');
    const endIst = DateTime.fromISO(res.dateRange!.endUtc).setZone('Asia/Kolkata');

    expect(startIst.toFormat('yyyy-MM-dd HH:mm:ss')).toBe('2026-11-10 00:00:00');
    expect(endIst.toFormat('yyyy-MM-dd HH:mm:ss')).toBe('2026-11-10 23:59:59');
  });

  it('resolves "last Tuesday" correctly', () => {
    // ref is Wednesday 2026-11-11. Last Tuesday was yesterday 2026-11-10
    const res = interpretTemporalQuery('Last Tuesday I asked you about Postgres hosting', refTime, 'Asia/Kolkata');
    expect(res.hasTemporalReference).toBe(true);
    expect(res.dateRange?.description).toContain('last tuesday');

    const targetIst = DateTime.fromISO(res.dateRange!.startUtc).setZone('Asia/Kolkata');
    expect(targetIst.toFormat('yyyy-MM-dd')).toBe('2026-11-10');
  });

  it('resolves "since Monday" correctly', () => {
    const res = interpretTemporalQuery('Has any of them changed pricing since Monday?', refTime, 'Asia/Kolkata');
    expect(res.hasTemporalReference).toBe(true);
    expect(res.dateRange).toBeDefined();

    // Monday was 2026-11-09
    const startIst = DateTime.fromISO(res.dateRange!.startUtc).setZone('Asia/Kolkata');
    expect(startIst.toFormat('yyyy-MM-dd')).toBe('2026-11-09');
  });

  it('resolves "on 3 November" with exact date boundaries', () => {
    const res = interpretTemporalQuery('What did I ask you on 3 November?', refTime, 'Asia/Kolkata');
    expect(res.hasTemporalReference).toBe(true);
    expect(res.dateRange).toBeDefined();

    const startIst = DateTime.fromISO(res.dateRange!.startUtc).setZone('Asia/Kolkata');
    expect(startIst.toFormat('yyyy-MM-dd')).toBe('2026-11-03');
  });

  it('resolves "earlier this week" to start of week (Monday)', () => {
    const res = interpretTemporalQuery('What did we discuss earlier this week?', refTime, 'Asia/Kolkata');
    expect(res.hasTemporalReference).toBe(true);
    const startIst = DateTime.fromISO(res.dateRange!.startUtc).setZone('Asia/Kolkata');
    expect(startIst.toFormat('yyyy-MM-dd')).toBe('2026-11-09'); // Monday of current week
  });

  it('detects ambiguous date references and asks concise clarification', () => {
    // If today is Wednesday, and user says "on Wednesday"
    const res = interpretTemporalQuery('What did we decide on Wednesday?', refTime, 'Asia/Kolkata');
    expect(res.isAmbiguous).toBe(true);
    expect(res.clarificationPrompt).toContain('Did you mean today');
  });

  it('correctly handles Daylight Saving Time (DST) for configured timezones like America/New_York', () => {
    // Test date around summer/winter time
    const summerTime = DateTime.fromISO('2026-07-15T12:00:00', { zone: 'America/New_York' });
    const res = interpretTemporalQuery('What did I ask yesterday?', summerTime, 'America/New_York');
    const startNy = DateTime.fromISO(res.dateRange!.startUtc).setZone('America/New_York');
    expect(startNy.toFormat('yyyy-MM-dd HH:mm:ss')).toBe('2026-07-14 00:00:00');
    // In July, New York is EDT (UTC-4)
    expect(startNy.offset).toBe(-240);
  });
});
