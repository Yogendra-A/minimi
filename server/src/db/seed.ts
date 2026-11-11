import { DateTime } from 'luxon';
import crypto from 'crypto';
import { getRawDb } from './client.js';
import { config } from '../config.js';
import { recordFactObservation, upsertEntity } from '../memory/entities.js';

export function seedHistoricalConversations(baseDateIso?: string) {
  const rawDb = getRawDb();
  const tz = config.TIMEZONE;
  const now = baseDateIso
    ? DateTime.fromISO(baseDateIso, { zone: 'utc' }).setZone(tz)
    : DateTime.now().setZone(tz);

  console.log(`Seeding historical conversations relative to ${now.toISO()} in timezone ${tz}...`);

  // Clear existing seed data if needed
  rawDb.exec('DELETE FROM messages;');
  rawDb.exec('DELETE FROM conversations;');
  rawDb.exec('DELETE FROM memory_items;');
  rawDb.exec('DELETE FROM fact_observations;');
  rawDb.exec('DELETE FROM entities;');

  // 1. Monday CRM Shortlist (Most recent Monday relative to now)
  let daysSinceMonday = now.weekday - 1;
  if (daysSinceMonday < 0) daysSinceMonday += 7;
  // If today is Monday, we can say it happened on Monday earlier or last Monday
  const mondayDate = now.minus({ days: daysSinceMonday === 0 ? 7 : daysSinceMonday }).set({ hour: 10, minute: 30, second: 0 });
  const mondayUtc = mondayDate.toUTC().toISO()!;

  const crmConvId = 'conv-crm-shortlist';
  rawDb.prepare(`
    INSERT INTO conversations (id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(crmConvId, 'CRM Shortlist for 20-person sales team', mondayUtc, mondayUtc);

  const crmUserMsgId = crypto.randomUUID();
  rawDb.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    crmUserMsgId,
    crmConvId,
    'user',
    'We need to shortlist 5 CRM tools for our 20-person sales team. What are the best options and their current starter pricing?',
    mondayUtc
  );

  const crmAssistantMsgId = crypto.randomUUID();
  const crmContent = `Here is our curated shortlist of 5 CRM tools evaluated for a 20-person sales team:
1. **HubSpot Sales Hub**: Starter tier at $20/user/month (billed annually) or $25/user/month (billed monthly). Professional tier is $500/month for 5 seats.
2. **Salesforce Sales Cloud**: Starter Suite at $25/user/month. Pro Suite at $100/user/month.
3. **Pipedrive**: Essential tier at $14/user/month (annual) or $24/user/month (monthly).
4. **Zoho CRM**: Standard tier at $14/user/month (annual).
5. **Copper CRM**: Basic tier at $25/user/month (annual) for Google Workspace teams.`;

  rawDb.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(crmAssistantMsgId, crmConvId, 'assistant', crmContent, mondayUtc);

  // Save memory item and fact observations for the shortlist
  rawDb.prepare(`
    INSERT INTO memory_items (id, conversation_id, message_id, type, content, entities, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    crmConvId,
    crmAssistantMsgId,
    'shortlist',
    'Shortlisted 5 CRM tools for 20-person sales team: HubSpot, Salesforce, Pipedrive, Zoho, Copper',
    JSON.stringify(['HubSpot', 'Salesforce', 'Pipedrive', 'Zoho', 'Copper']),
    mondayUtc
  );

  const hubspotId = upsertEntity('HubSpot', 'product', 'CRM platform');
  recordFactObservation({
    entityId: hubspotId,
    entityName: 'HubSpot',
    topic: 'pricing',
    attribute: 'starter_plan_price',
    value: '20',
    unit: 'USD',
    currency: 'USD',
    billingPeriod: 'annually',
    confidence: 1.0,
    sourceUrl: 'https://www.hubspot.com/pricing/sales',
    retrievedAt: mondayUtc,
    observedAt: mondayUtc
  });

  const salesforceId = upsertEntity('Salesforce', 'product', 'CRM platform');
  recordFactObservation({
    entityId: salesforceId,
    entityName: 'Salesforce',
    topic: 'pricing',
    attribute: 'starter_suite_price',
    value: '25',
    unit: 'USD',
    currency: 'USD',
    billingPeriod: 'monthly',
    confidence: 1.0,
    sourceUrl: 'https://www.salesforce.com/editions-pricing/sales-cloud',
    retrievedAt: mondayUtc,
    observedAt: mondayUtc
  });

  // 2. November 3 Historical Conversation (Neon Postgres)
  // For November 3: find the closest past Nov 3 relative to now
  let nov3Year = now.year;
  if (now.month < 11 || (now.month === 11 && now.day < 3)) {
    nov3Year = now.year - 1;
  }
  const nov3Date = DateTime.fromObject({ year: nov3Year, month: 11, day: 3, hour: 14, minute: 15 }, { zone: tz });
  const nov3Utc = nov3Date.toUTC().toISO()!;

  const nov3ConvId = 'conv-nov3-postgres';
  rawDb.prepare(`
    INSERT INTO conversations (id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(nov3ConvId, 'Neon Postgres Pricing Inquiry', nov3Utc, nov3Utc);

  rawDb.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    nov3ConvId,
    'user',
    'What is Neon serverless Postgres pricing and starter storage?',
    nov3Utc
  );

  const nov3AssistantContent = `On November 3, we discussed Neon Serverless Postgres. Neon provides a Free tier with 0.5 GB storage, and a Launch plan starting at $19/month with 10 GB storage and autoscaling compute. Source: https://neon.tech/pricing.`;

  rawDb.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    nov3ConvId,
    'assistant',
    nov3AssistantContent,
    nov3Utc
  );

  const neonId = upsertEntity('Neon', 'product', 'Serverless Postgres');
  recordFactObservation({
    entityId: neonId,
    entityName: 'Neon',
    topic: 'pricing',
    attribute: 'launch_plan_price',
    value: '19',
    unit: 'USD',
    currency: 'USD',
    billingPeriod: 'monthly',
    confidence: 1.0,
    sourceUrl: 'https://neon.tech/pricing',
    retrievedAt: nov3Utc,
    observedAt: nov3Utc
  });

  // 3. Last Tuesday Postgres Hosting (Supabase)
  let daysSinceTuesday = now.weekday - 2;
  if (daysSinceTuesday <= 0) daysSinceTuesday += 7;
  const tuesdayDate = now.minus({ days: daysSinceTuesday }).set({ hour: 16, minute: 45 });
  const tuesdayUtc = tuesdayDate.toUTC().toISO()!;

  const tuesdayConvId = 'conv-tuesday-postgres';
  rawDb.prepare(`
    INSERT INTO conversations (id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(tuesdayConvId, 'Postgres Hosting Discussion', tuesdayUtc, tuesdayUtc);

  rawDb.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    tuesdayConvId,
    'user',
    'Can you tell me about Postgres hosting options, specifically Supabase Pro plan pricing?',
    tuesdayUtc
  );

  const tuesdayAssistantContent = `On Tuesday, we reviewed Supabase Postgres hosting. The Supabase Pro plan starts at $25/month and includes 8 GB database storage and 100,000 monthly active users. Source: https://supabase.com/pricing.`;

  rawDb.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    tuesdayConvId,
    'assistant',
    tuesdayAssistantContent,
    tuesdayUtc
  );

  const supabaseId = upsertEntity('Supabase', 'product', 'Open source Firebase alternative with Postgres');
  recordFactObservation({
    entityId: supabaseId,
    entityName: 'Supabase',
    topic: 'pricing',
    attribute: 'pro_plan_price',
    value: '25',
    unit: 'USD',
    currency: 'USD',
    billingPeriod: 'monthly',
    confidence: 1.0,
    sourceUrl: 'https://supabase.com/pricing',
    retrievedAt: tuesdayUtc,
    observedAt: tuesdayUtc
  });

  console.log('Seeding complete successfully.');
}

if (process.argv[1] && process.argv[1].includes('seed.ts')) {
  seedHistoricalConversations();
}
