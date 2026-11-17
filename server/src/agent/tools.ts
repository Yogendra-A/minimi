import crypto from 'crypto';
import { z } from 'zod';
import { LLMToolDefinition, LLMToolCall } from '../providers/llm/types.js';

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

/**
 * Extracts tool calls from model text outputs when models (such as Qwen on Groq)
 * emit tool requests as XML or JSON tags in the text content instead of populating
 * the native API `tool_calls` field.
 */
export function parseToolCallsFromText(text: string): LLMToolCall[] {
  if (!text || typeof text !== 'string') return [];
  const toolCalls: LLMToolCall[] = [];

  const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
  let match: RegExpExecArray | null;

  while ((match = toolCallRegex.exec(text)) !== null) {
    const inner = match[1].trim();
    if (!inner) continue;

    // Format 1: JSON payload inside <tool_call>{ ... }</tool_call>
    if (inner.startsWith('{') && inner.endsWith('}')) {
      try {
        const parsed = JSON.parse(inner);
        const name = parsed.name || parsed.function || (parsed.function && parsed.function.name);
        const args = parsed.arguments || parsed.parameters || (parsed.function && parsed.function.arguments) || {};
        if (name) {
          toolCalls.push({
            id: `call_${crypto.randomUUID().slice(0, 8)}`,
            type: 'function',
            function: {
              name: String(name).trim(),
              arguments: typeof args === 'string' ? args : JSON.stringify(args)
            }
          });
          continue;
        }
      } catch {}
    }

    // Format 2: XML syntax <function=name> ... </function> or <function name="name"> ... </function>
    const funcMatch = /<function(?:=|\s+name=)["']?([a-zA-Z0-9_-]+)["']?>([\s\S]*?)<\/function>/i.exec(inner);
    if (funcMatch) {
      const funcName = funcMatch[1].trim();
      const paramsBlock = funcMatch[2];
      const paramRegex = /<parameter(?:=|\s+name=)["']?([a-zA-Z0-9_-]+)["']?>([\s\S]*?)<\/parameter>/gi;
      const args: Record<string, any> = {};
      let pMatch: RegExpExecArray | null;

      while ((pMatch = paramRegex.exec(paramsBlock)) !== null) {
        const pName = pMatch[1].trim();
        const pVal = pMatch[2].trim();
        try {
          args[pName] = JSON.parse(pVal);
        } catch {
          args[pName] = pVal;
        }
      }

      toolCalls.push({
        id: `call_${crypto.randomUUID().slice(0, 8)}`,
        type: 'function',
        function: {
          name: funcName,
          arguments: JSON.stringify(args)
        }
      });
    }
  }

  return toolCalls;
}
