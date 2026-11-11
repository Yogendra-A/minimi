import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { getRawDb } from '../db/client.js';

export const conversationRoutes: FastifyPluginAsync = async (app) => {
  // List all conversations
  app.get('/api/conversations', async () => {
    const rawDb = getRawDb();
    const rows = rawDb.prepare(`
      SELECT id, title, created_at, updated_at
      FROM conversations
      ORDER BY updated_at DESC
    `).all();
    return rows;
  });

  // Create new conversation
  app.post('/api/conversations', async (req) => {
    const schema = z.object({
      title: z.string().optional()
    });
    const body = schema.parse(req.body || {});
    const rawDb = getRawDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const title = body.title || 'New Conversation';

    rawDb.prepare(`
      INSERT INTO conversations (id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(id, title, now, now);

    return { id, title, created_at: now, updated_at: now };
  });

  // Get messages for a conversation
  app.get('/api/conversations/:id/messages', async (req, reply) => {
    const paramsSchema = z.object({ id: z.string() });
    const { id } = paramsSchema.parse(req.params);
    const rawDb = getRawDb();

    const messages = rawDb.prepare(`
      SELECT id, conversation_id, role, content, created_at, metadata
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `).all(id) as any[];

    return messages.map((m) => {
      let parsedMeta = null;
      if (m.metadata) {
        try {
          parsedMeta = JSON.parse(m.metadata);
        } catch {}
      }
      return {
        ...m,
        metadata: parsedMeta
      };
    });
  });

  // Delete a conversation
  app.delete('/api/conversations/:id', async (req) => {
    const paramsSchema = z.object({ id: z.string() });
    const { id } = paramsSchema.parse(req.params);
    const rawDb = getRawDb();

    rawDb.prepare('DELETE FROM conversations WHERE id = ?').run(id);
    return { success: true };
  });
};
