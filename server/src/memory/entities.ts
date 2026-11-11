import { getRawDb } from '../db/client.js';
import crypto from 'crypto';

export interface FactObservationInput {
  entityId?: string;
  entityName: string;
  topic: string;
  attribute: string;
  value: string;
  unit?: string;
  currency?: string;
  billingPeriod?: string;
  confidence?: number;
  status?: string;
  sourceUrl?: string;
  publishedAt?: string;
  retrievedAt: string;
  observedAt: string;
  effectiveAt?: string;
  contextJson?: string;
}

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  published_at?: string | null;
  retrieved_at: string;
  raw_content?: string | null;
}

export function upsertEntity(name: string, type: string = 'product', description?: string, aliases: string[] = []): string {
  const rawDb = getRawDb();
  const now = new Date().toISOString();

  const existing = rawDb.prepare('SELECT id FROM entities WHERE LOWER(name) = LOWER(?)').get(name) as any;
  if (existing) {
    return existing.id;
  }

  const id = crypto.randomUUID();
  rawDb.prepare(`
    INSERT INTO entities (id, name, type, description, aliases, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, type, description || null, JSON.stringify(aliases), now, now);

  return id;
}

export function linkMessageEntity(messageId: string, entityId: string) {
  const rawDb = getRawDb();
  try {
    rawDb.prepare(`
      INSERT OR IGNORE INTO message_entities (message_id, entity_id)
      VALUES (?, ?)
    `).run(messageId, entityId);
  } catch (err) {
    console.warn('Error linking message to entity:', err);
  }
}

export function saveMemoryItem(
  conversationId: string,
  messageId: string | null,
  type: 'preference' | 'fact' | 'summary' | 'shortlist',
  content: string,
  entities: string[] = [],
  validAt?: string
): string {
  const rawDb = getRawDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  rawDb.prepare(`
    INSERT INTO memory_items (id, conversation_id, message_id, type, content, entities, created_at, valid_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, conversationId, messageId, type, content, JSON.stringify(entities), now, validAt || null);

  return id;
}

export function recordFactObservation(fact: FactObservationInput): string {
  const rawDb = getRawDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  rawDb.prepare(`
    INSERT INTO fact_observations (
      id, entity_id, entity_name, topic, attribute, value, unit,
      currency, billing_period, confidence, status, source_url,
      published_at, retrieved_at, observed_at, effective_at, context_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    fact.entityId || null,
    fact.entityName,
    fact.topic,
    fact.attribute,
    fact.value,
    fact.unit || null,
    fact.currency || null,
    fact.billingPeriod || null,
    fact.confidence ?? 1.0,
    fact.status || 'active',
    fact.sourceUrl || null,
    fact.publishedAt || null,
    fact.retrievedAt,
    fact.observedAt,
    fact.effectiveAt || null,
    fact.contextJson || null,
    now
  );

  return id;
}

export function recordSearchSnapshot(
  conversationId: string,
  messageId: string | null,
  query: string,
  recency: string | null,
  domains: string[] | null,
  results: SearchResultItem[]
): string {
  const rawDb = getRawDb();
  const snapshotId = crypto.randomUUID();
  const now = new Date().toISOString();

  rawDb.prepare(`
    INSERT INTO search_snapshots (id, conversation_id, message_id, query, recency, domains, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(snapshotId, conversationId, messageId, query, recency, domains ? JSON.stringify(domains) : null, now);

  const insertResult = rawDb.prepare(`
    INSERT INTO search_results (id, snapshot_id, title, url, snippet, domain, published_at, retrieved_at, raw_content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const r of results) {
    const resultId = crypto.randomUUID();
    insertResult.run(
      resultId,
      snapshotId,
      r.title,
      r.url,
      r.snippet,
      r.domain,
      r.published_at || null,
      r.retrieved_at,
      r.raw_content || null
    );
  }

  return snapshotId;
}
