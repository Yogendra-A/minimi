import { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/health', async () => {
    return {
      status: 'ok',
      timezone: config.TIMEZONE,
      llmProvider: config.LLM_PROVIDER,
      searchProvider: config.SEARCH_PROVIDER,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  });
};
