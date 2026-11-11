import { describe, it, expect, beforeEach } from 'vitest';
import { getRawDb, closeDb } from '../src/db/client.js';
import { seedHistoricalConversations } from '../src/db/seed.js';
import { retrieveHybridMemory } from '../src/memory/hybrid.js';

describe('Hybrid Memory & Structured Retrieval', () => {
  beforeEach(() => {
    seedHistoricalConversations('2026-11-11T12:00:00Z');
  });

  it('retrieves exact historical conversation by date filter', async () => {
    // Nov 3 query
    const results = await retrieveHybridMemory({
      query: 'What did I ask on 3 November?',
      dateRange: {
        startUtc: '2026-11-02T18:30:00.000Z',
        endUtc: '2026-11-03T18:29:59.999Z',
        description: '2026-11-03'
      }
    });

    expect(results.length).toBeGreaterThan(0);
    const hasNeon = results.some((r) => r.content.includes('Neon') || r.content.includes('Postgres'));
    expect(hasNeon).toBe(true);
    expect(results[0].matchReasons[0]).toContain('exact date match');
  });

  it('recovers shortlist and entity records from previous discussion', async () => {
    const results = await retrieveHybridMemory({
      query: 'CRM tools shortlist for sales team',
      entities: ['HubSpot', 'Salesforce', 'CRM']
    });

    expect(results.length).toBeGreaterThan(0);
    const foundShortlist = results.some((r) => r.content.includes('HubSpot') && r.content.includes('Salesforce'));
    expect(foundShortlist).toBe(true);
  });

  it('searches via SQLite FTS5 lexical index for specific keywords', async () => {
    const results = await retrieveHybridMemory({
      query: 'Supabase Pro plan pricing'
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.content.includes('Supabase'))).toBe(true);
  });

  it('does not allow fuzzy matches to violate an explicit date filter', async () => {
    // Search for "Supabase" (discussed on Tuesday), but pass strict date filter for Nov 3
    const results = await retrieveHybridMemory({
      query: 'Supabase pricing',
      dateRange: {
        startUtc: '2026-11-02T18:30:00.000Z',
        endUtc: '2026-11-03T18:29:59.999Z',
        description: '2026-11-03'
      }
    });

    // Supabase should not be returned because it was not on Nov 3!
    for (const r of results) {
      expect(r.timestampUtc >= '2026-11-02T18:30:00.000Z' && r.timestampUtc <= '2026-11-03T18:29:59.999Z').toBe(true);
    }
  });

  it('persists memory reliably across database connection restarts', async () => {
    const db1 = getRawDb();
    const countBefore = (db1.prepare('SELECT count(*) as cnt FROM messages').get() as any).cnt;

    // Simulate server / DB close and reopen
    closeDb();

    const db2 = getRawDb();
    const countAfter = (db2.prepare('SELECT count(*) as cnt FROM messages').get() as any).cnt;
    expect(countAfter).toBe(countBefore);
  });
});
