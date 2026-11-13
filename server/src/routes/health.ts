import { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/health', async () => {
    const isLiveLLM = config.LLM_PROVIDER !== 'mock';
    const isLiveSearch = config.SEARCH_PROVIDER !== 'mock';
    let llmModel: string | undefined;
    if (config.LLM_PROVIDER === 'groq') {
      llmModel = config.GROQ_MODEL;
    } else if (config.LLM_PROVIDER === 'grok') {
      llmModel = config.GROK_MODEL;
    } else if (config.LLM_PROVIDER === 'openai') {
      llmModel = config.OPENAI_MODEL;
    } else if (config.LLM_PROVIDER === 'gemini') {
      llmModel = config.GEMINI_MODEL;
    }

    return {
      status: 'ok',
      mode: isLiveLLM ? 'live' : 'mock',
      searchMode: isLiveSearch ? 'live' : 'mock',
      isLive: isLiveLLM,
      isLiveLLM,
      isLiveSearch,
      timezone: config.TIMEZONE,
      llmProvider: config.LLM_PROVIDER,
      llmModel,
      searchProvider: config.SEARCH_PROVIDER,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  });
};
