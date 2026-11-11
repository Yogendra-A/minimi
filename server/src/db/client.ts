import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

let rawSqliteInstance: DatabaseSync | null = null;

export function getRawDb(): DatabaseSync {
  if (!rawSqliteInstance) {
    const dbPath = path.resolve(process.cwd(), config.DATABASE_URL);
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    rawSqliteInstance = new DatabaseSync(dbPath);
    rawSqliteInstance.exec('PRAGMA journal_mode = WAL;');
    rawSqliteInstance.exec('PRAGMA foreign_keys = ON;');
    rawSqliteInstance.exec('PRAGMA busy_timeout = 5000;');

    initDatabaseSchema(rawSqliteInstance);
  }
  return rawSqliteInstance;
}

export function getDb(): DatabaseSync {
  return getRawDb();
}

export function initDatabaseSchema(db: DatabaseSync) {
  // Deterministic schema creation
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      metadata TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

    CREATE TABLE IF NOT EXISTS memory_items (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK(type IN ('preference', 'fact', 'summary', 'shortlist')),
      content TEXT NOT NULL,
      entities TEXT,
      created_at TEXT NOT NULL,
      valid_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_memory_items_conversation ON memory_items(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_memory_items_type ON memory_items(type);

    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      description TEXT,
      aliases TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);

    CREATE TABLE IF NOT EXISTS message_entities (
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      PRIMARY KEY (message_id, entity_id)
    );

    CREATE TABLE IF NOT EXISTS search_snapshots (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
      query TEXT NOT NULL,
      recency TEXT,
      domains TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS search_results (
      id TEXT PRIMARY KEY,
      snapshot_id TEXT NOT NULL REFERENCES search_snapshots(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      snippet TEXT NOT NULL,
      domain TEXT NOT NULL,
      published_at TEXT,
      retrieved_at TEXT NOT NULL,
      raw_content TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_search_results_snapshot ON search_results(snapshot_id);
    CREATE INDEX IF NOT EXISTS idx_search_results_url ON search_results(url);

    CREATE TABLE IF NOT EXISTS fact_observations (
      id TEXT PRIMARY KEY,
      entity_id TEXT REFERENCES entities(id) ON DELETE SET NULL,
      entity_name TEXT NOT NULL,
      topic TEXT NOT NULL,
      attribute TEXT NOT NULL,
      value TEXT NOT NULL,
      unit TEXT,
      currency TEXT,
      billing_period TEXT,
      confidence REAL DEFAULT 1.0,
      status TEXT DEFAULT 'active',
      source_url TEXT,
      published_at TEXT,
      retrieved_at TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      effective_at TEXT,
      context_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_facts_entity_name ON fact_observations(entity_name);
    CREATE INDEX IF NOT EXISTS idx_facts_topic ON fact_observations(topic);
    CREATE INDEX IF NOT EXISTS idx_facts_observed_at ON fact_observations(observed_at);

    -- SQLite FTS5 Full-Text Search Virtual Tables
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      id UNINDEXED,
      conversation_id UNINDEXED,
      content,
      tokenize='porter'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memory_items_fts USING fts5(
      id UNINDEXED,
      conversation_id UNINDEXED,
      content,
      tokenize='porter'
    );

    -- Triggers to automatically sync messages_fts
    CREATE TRIGGER IF NOT EXISTS trg_messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(id, conversation_id, content) VALUES (new.id, new.conversation_id, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS trg_messages_ad AFTER DELETE ON messages BEGIN
      DELETE FROM messages_fts WHERE id = old.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_messages_au AFTER UPDATE ON messages BEGIN
      DELETE FROM messages_fts WHERE id = old.id;
      INSERT INTO messages_fts(id, conversation_id, content) VALUES (new.id, new.conversation_id, new.content);
    END;

    -- Triggers to automatically sync memory_items_fts
    CREATE TRIGGER IF NOT EXISTS trg_memory_items_ai AFTER INSERT ON memory_items BEGIN
      INSERT INTO memory_items_fts(id, conversation_id, content) VALUES (new.id, new.conversation_id, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS trg_memory_items_ad AFTER DELETE ON memory_items BEGIN
      DELETE FROM memory_items_fts WHERE id = old.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_memory_items_au AFTER UPDATE ON memory_items BEGIN
      DELETE FROM memory_items_fts WHERE id = old.id;
      INSERT INTO memory_items_fts(id, conversation_id, content) VALUES (new.id, new.conversation_id, new.content);
    END;
  `);
}

export function closeDb() {
  if (rawSqliteInstance) {
    rawSqliteInstance.close();
    rawSqliteInstance = null;
  }
}
