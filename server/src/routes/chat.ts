import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AgentOrchestrator } from '../agent/orchestrator.js';

const chatRequestSchema = z.object({
  conversationId: z.string().min(1, 'conversationId is required'),
  message: z.string().min(1, 'message cannot be empty'),
  referenceTime: z.string().optional()
});

export const chatRoutes: FastifyPluginAsync = async (app) => {
  const orchestrator = new AgentOrchestrator();

  app.post('/api/chat', async (req, reply) => {
    const parseResult = chatRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: parseResult.error.format()
      });
    }

    const { conversationId, message, referenceTime } = parseResult.data;

    try {
      const result = await orchestrator.handleMessage(conversationId, message, referenceTime);
      return result;
    } catch (err: any) {
      app.log.error(err, 'Chat execution error');
      return reply.status(500).send({
        error: 'Internal server error while processing chat message',
        message: err.message
      });
    }
  });
};
