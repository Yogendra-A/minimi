import { sqliteTable, text, real, primaryKey } from 'drizzle-orm/sqlite-core';

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversation_id: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  created_at: text('created_at').notNull(),
  metadata: text('metadata') // JSON string
});

export const memoryItems = sqliteTable('memory_items', {
  id: text('id').primaryKey(),
  conversation_id: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  message_id: text('message_id').references(() => messages.id, { onDelete: 'set null' }),
  type: text('type', { enum: ['preference', 'fact', 'summary', 'shortlist'] }).notNull(),
  content: text('content').notNull(),
  entities: text('entities'), // JSON string array
  created_at: text('created_at').notNull(),
  valid_at: text('valid_at') // ISO UTC
});

export const entities = sqliteTable('entities', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  type: text('type').notNull(), // 'product', 'company', 'service', etc.
  description: text('description'),
  aliases: text('aliases'), // JSON string array
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
});

export const messageEntities = sqliteTable('message_entities', {
  message_id: text('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  entity_id: text('entity_id').notNull().references(() => entities.id, { onDelete: 'cascade' })
}, (table) => [
  primaryKey({ columns: [table.message_id, table.entity_id] })
]);

export const searchSnapshots = sqliteTable('search_snapshots', {
  id: text('id').primaryKey(),
  conversation_id: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  message_id: text('message_id').references(() => messages.id, { onDelete: 'set null' }),
  query: text('query').notNull(),
  recency: text('recency'),
  domains: text('domains'), // JSON string array
  created_at: text('created_at').notNull()
});

export const searchResults = sqliteTable('search_results', {
  id: text('id').primaryKey(),
  snapshot_id: text('snapshot_id').notNull().references(() => searchSnapshots.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  url: text('url').notNull(),
  snippet: text('snippet').notNull(),
  domain: text('domain').notNull(),
  published_at: text('published_at'), // ISO UTC nullable
  retrieved_at: text('retrieved_at').notNull(), // ISO UTC
  raw_content: text('raw_content')
});

export const factObservations = sqliteTable('fact_observations', {
  id: text('id').primaryKey(),
  entity_id: text('entity_id').references(() => entities.id, { onDelete: 'set null' }),
  entity_name: text('entity_name').notNull(),
  topic: text('topic').notNull(), // e.g. 'pricing', 'feature', 'hosting'
  attribute: text('attribute').notNull(), // e.g. 'starter_price', 'storage_limit'
  value: text('value').notNull(),
  unit: text('unit'),
  currency: text('currency'),
  billing_period: text('billing_period'), // 'monthly', 'annually', 'one-time'
  confidence: real('confidence').default(1.0),
  status: text('status').default('active'),
  source_url: text('source_url'),
  published_at: text('published_at'), // ISO UTC nullable
  retrieved_at: text('retrieved_at').notNull(), // ISO UTC
  observed_at: text('observed_at').notNull(), // ISO UTC
  effective_at: text('effective_at'), // ISO UTC nullable
  context_json: text('context_json'),
  created_at: text('created_at').notNull()
});

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type MemoryItem = typeof memoryItems.$inferSelect;
export type Entity = typeof entities.$inferSelect;
export type SearchSnapshot = typeof searchSnapshots.$inferSelect;
export type SearchResult = typeof searchResults.$inferSelect;
export type FactObservation = typeof factObservations.$inferSelect;
