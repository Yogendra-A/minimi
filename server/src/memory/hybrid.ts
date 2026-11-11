import { getRawDb } from '../db/client.js';
import { DateRange } from '../temporal/parser.js';

export interface RetrievedContextItem {
  id: string;
  sourceType: 'message' | 'memory_item' | 'fact_observation';
  conversationId?: string;
  role?: string;
  content: string;
  timestampUtc: string;
  entityName?: string;
  sourceUrl?: string;
  score: number;
  matchReasons: string[];
}

export interface HybridSearchParams {
  conversationId?: string;
  excludeMessageId?: string;
  dateRange?: DateRange;
  entities?: string[];
  query: string;
  limit?: number;
}

const STOPWORDS = new Set([
  'what', 'when', 'where', 'did', 'last', 'this', 'have', 'from', 'with',
  'pricing', 'price', 'still', 'discussed', 'discuss', 'asked', 'tell',
  'about', 'know', 'that', 'were', 'which', 'their', 'there', 'show',
  'agreed', 'decide', 'decided', 'find', 'mentioning', 'discussion',
  'mention', 'talked', 'message', 'conversation', 'talk'
]);

/**
 * Executes hybrid memory retrieval combining structured SQL date/entity filters,
 * SQLite FTS5 lexical ranking, and observation baselines.
 */
export async function retrieveHybridMemory(params: HybridSearchParams): Promise<RetrievedContextItem[]> {
  const { conversationId, excludeMessageId, dateRange, entities: queryEntities = [], query, limit = 8 } = params;
  const rawDb = getRawDb();

  const candidatesMap = new Map<string, RetrievedContextItem>();

  const sanitizeFtsQuery = (q: string): string => {
    const cleaned = q
      .replace(/['"*:^(){}\[\]\-+~]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w.toLowerCase()))
      .map((w) => `"${w}"*`)
      .join(' OR ');
    return cleaned;
  };

  // 1. Structured retrieval by explicit Date Range
  if (dateRange) {
    try {
      let querySql = `
        SELECT id, conversation_id, role, content, created_at, metadata
        FROM messages
        WHERE created_at >= ? AND created_at <= ?
      `;
      const sqlParams: any[] = [dateRange.startUtc, dateRange.endUtc];

      if (excludeMessageId) {
        querySql += ` AND id != ?`;
        sqlParams.push(excludeMessageId);
      }
      if (conversationId) {
        querySql += ` AND conversation_id = ?`;
        sqlParams.push(conversationId);
      }
      querySql += ` ORDER BY created_at DESC LIMIT 20;`;

      const stmt = rawDb.prepare(querySql);
      const dateFilteredMsgs = stmt.all(...sqlParams) as any[];

      for (const msg of dateFilteredMsgs) {
        candidatesMap.set(msg.id, {
          id: msg.id,
          sourceType: 'message',
          conversationId: msg.conversation_id,
          role: msg.role,
          content: msg.content,
          timestampUtc: msg.created_at,
          score: 10.0,
          matchReasons: [`exact date match (${dateRange.description})`]
        });
      }

      // Check memory items for this date range
      let memSql = `
        SELECT id, conversation_id, message_id, type, content, entities, created_at
        FROM memory_items
        WHERE created_at >= ? AND created_at <= ?
      `;
      const memParams: any[] = [dateRange.startUtc, dateRange.endUtc];
      if (conversationId) {
        memSql += ` AND conversation_id = ?`;
        memParams.push(conversationId);
      }
      memSql += ` LIMIT 10;`;

      const memStmt = rawDb.prepare(memSql);
      const dateFilteredMemories = memStmt.all(...memParams) as any[];

      for (const mem of dateFilteredMemories) {
        candidatesMap.set(mem.id, {
          id: mem.id,
          sourceType: 'memory_item',
          conversationId: mem.conversation_id,
          content: `[${mem.type.toUpperCase()}] ${mem.content}`,
          timestampUtc: mem.created_at,
          score: 9.5,
          matchReasons: [`memory date match (${dateRange.description})`]
        });
      }
    } catch (err) {
      console.warn('Error in structured date retrieval:', err);
    }
  }

  // 2. FTS5 Lexical Search on Messages and Memory Items
  const ftsSearchStr = sanitizeFtsQuery(query);
  if (ftsSearchStr.length > 0) {
    try {
      let ftsSql = `
        SELECT m.id, m.conversation_id, m.role, m.content, m.created_at, f.rank
        FROM messages_fts f
        JOIN messages m ON f.id = m.id
        WHERE messages_fts MATCH ?
      `;
      const ftsParams: any[] = [ftsSearchStr];

      if (excludeMessageId) {
        ftsSql += ` AND m.id != ?`;
        ftsParams.push(excludeMessageId);
      }
      if (conversationId) {
        ftsSql += ` AND m.conversation_id = ?`;
        ftsParams.push(conversationId);
      }
      ftsSql += ` ORDER BY f.rank LIMIT 15;`;

      const ftsStmt = rawDb.prepare(ftsSql);
      const rows = ftsStmt.all(...ftsParams) as any[];

      for (const row of rows) {
        if (dateRange) {
          if (row.created_at < dateRange.startUtc || row.created_at > dateRange.endUtc) {
            continue;
          }
        }

        const existing = candidatesMap.get(row.id);
        const ftsScore = Math.max(1, 5 - (row.rank ? Math.abs(Number(row.rank)) * 0.1 : 0));
        if (existing) {
          existing.score += ftsScore;
          existing.matchReasons.push('FTS lexical match');
        } else {
          candidatesMap.set(row.id, {
            id: row.id,
            sourceType: 'message',
            conversationId: row.conversation_id,
            role: row.role,
            content: row.content,
            timestampUtc: row.created_at,
            score: ftsScore,
            matchReasons: ['FTS lexical match']
          });
        }
      }

      let memFtsSql = `
        SELECT m.id, m.conversation_id, m.type, m.content, m.created_at, f.rank
        FROM memory_items_fts f
        JOIN memory_items m ON f.id = m.id
        WHERE memory_items_fts MATCH ?
      `;
      const memFtsParams: any[] = [ftsSearchStr];
      if (conversationId) {
        memFtsSql += ` AND m.conversation_id = ?`;
        memFtsParams.push(conversationId);
      }
      memFtsSql += ` ORDER BY f.rank LIMIT 10;`;

      const memFtsStmt = rawDb.prepare(memFtsSql);
      const memRows = memFtsStmt.all(...memFtsParams) as any[];

      for (const row of memRows) {
        if (dateRange) {
          if (row.created_at < dateRange.startUtc || row.created_at > dateRange.endUtc) {
            continue;
          }
        }

        const existing = candidatesMap.get(row.id);
        const ftsScore = Math.max(1, 5 - (row.rank ? Math.abs(Number(row.rank)) * 0.1 : 0));
        if (existing) {
          existing.score += ftsScore;
          existing.matchReasons.push('Memory FTS match');
        } else {
          candidatesMap.set(row.id, {
            id: row.id,
            sourceType: 'memory_item',
            conversationId: row.conversation_id,
            content: `[${row.type.toUpperCase()}] ${row.content}`,
            timestampUtc: row.created_at,
            score: ftsScore,
            matchReasons: ['Memory FTS match']
          });
        }
      }
    } catch (err) {
      console.warn('FTS search error:', err);
    }
  }

  // 3. Entity-based Fact Observation Retrieval
  if (queryEntities.length > 0) {
    try {
      const lowerEntities = queryEntities.map((e) => e.toLowerCase());
      const factStmt = rawDb.prepare(`
        SELECT id, entity_name, topic, attribute, value, unit, currency, billing_period,
               status, source_url, observed_at
        FROM fact_observations
        ORDER BY observed_at DESC
        LIMIT 25;
      `);
      const facts = factStmt.all() as any[];

      for (const fact of facts) {
        const matchesEntity = lowerEntities.some(
          (le) => fact.entity_name.toLowerCase().includes(le) || fact.topic.toLowerCase().includes(le)
        );

        if (matchesEntity) {
          const factContent = `[Historical Baseline: ${fact.entity_name}] ${fact.topic} - ${fact.attribute}: ${fact.value} ${fact.unit || ''} (${fact.billing_period || ''}). Source: ${fact.source_url || 'Prior discussion'}. Observed: ${fact.observed_at}.`;
          candidatesMap.set(fact.id, {
            id: fact.id,
            sourceType: 'fact_observation',
            entityName: fact.entity_name,
            content: factContent,
            timestampUtc: fact.observed_at,
            sourceUrl: fact.source_url || undefined,
            score: 7.5,
            matchReasons: [`Entity match (${fact.entity_name})`]
          });
        }
      }
    } catch (err) {
      console.warn('Error retrieving facts by entity:', err);
    }
  }

  // Sort candidates by score descending, then timestamp descending
  const sorted = Array.from(candidatesMap.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.timestampUtc.localeCompare(a.timestampUtc);
  });

  return sorted.slice(0, limit);
}
