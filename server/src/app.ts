import Fastify from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health.js';
import { conversationRoutes } from './routes/conversations.js';
import { chatRoutes } from './routes/chat.js';
import { config } from './config.js';
import { getRawDb } from './db/client.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL
    }
  });

  // Ensure DB schema is initialized on startup
  getRawDb();

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  });

  await app.register(healthRoutes);
  await app.register(conversationRoutes);
  await app.register(chatRoutes);

  return app;
}
