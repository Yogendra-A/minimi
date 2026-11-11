import { z } from 'zod';
import { LLMToolDefinition } from '../providers/llm/types.js';

export const webSearchArgsSchema = z.object({
  query: z.string().min(1, 'Search query must be a non-empty string'),
  recency: z.enum(['day', 'week', 'month', 'year']).optional(),
  domains: z.array(z.string()).optional()
});

export type WebSearchArgs = z.infer<typeof webSearchArgsSchema>;

export const WEB_SEARCH_TOOL: LLMToolDefinition = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Searches the live web for current primary sources, documentation, pricing pages, and changelogs. Use this when asked for current updates, prices, recent changes, or to verify if past information is still accurate.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Targeted search query focusing on product, pricing, or release documentation.'
        },
        recency: {
          type: 'string',
          enum: ['day', 'week', 'month', 'year'],
          description: 'Optional filter for how recent the results should be.'
        },
        domains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of specific domains to restrict search to (e.g. ["hubspot.com"]).'
        }
      },
      required: ['query']
    }
  }
};
