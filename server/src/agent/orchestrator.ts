import crypto from 'crypto';
import { DateTime } from 'luxon';
import { config } from '../config.js';
import { getRawDb } from '../db/client.js';
import { interpretTemporalQuery, TemporalResult } from '../temporal/parser.js';
import { retrieveHybridMemory, RetrievedContextItem } from '../memory/hybrid.js';
import {
  upsertEntity,
  linkMessageEntity,
  recordSearchSnapshot,
  recordFactObservation,
  SearchResultItem
} from '../memory/entities.js';
import { LLMMessage, LLMProvider, LLMResponse } from '../providers/llm/types.js';
import { SearchProvider } from '../providers/search/types.js';
import { getLLMProvider, getSearchProvider } from '../providers/index.js';
import { WEB_SEARCH_TOOL, webSearchArgsSchema, WebSearchArgs, parseToolCallsFromText } from './tools.js';
import { buildSystemPrompt } from './prompts.js';
import { sanitizeWebContent } from '../evidence/comparator.js';

export interface ChatSessionResult {
  messageId: string;
  response: string;
  citations: Array<{ title: string; url: string; domain: string }>;
  searchesExecuted: Array<{ query: string; resultsCount: number }>;
  retrievedMemory: RetrievedContextItem[];
  temporal: TemporalResult;
  isClarification?: boolean;
}

export class AgentOrchestrator {
  private llmProvider: LLMProvider;
  private searchProvider: SearchProvider;
  private timezone: string;

  constructor(options?: {
    llmProvider?: LLMProvider;
    searchProvider?: SearchProvider;
    timezone?: string;
  }) {
    this.llmProvider = options?.llmProvider || getLLMProvider();
    this.searchProvider = options?.searchProvider || getSearchProvider();
    this.timezone = options?.timezone || config.TIMEZONE;
  }

  async handleMessage(
    conversationId: string,
    userText: string,
    referenceTime?: string | Date | DateTime
  ): Promise<ChatSessionResult> {
    const rawDb = getRawDb();
    const nowUtc = referenceTime
      ? (typeof referenceTime === 'string'
          ? referenceTime
          : referenceTime instanceof Date
          ? referenceTime.toISOString()
          : referenceTime.toUTC().toISO()!)
      : DateTime.utc().toISO()!;

    // 1. Ensure conversation exists
    const conv = rawDb.prepare('SELECT id FROM conversations WHERE id = ?').get(conversationId);
    if (!conv) {
      rawDb.prepare(`
        INSERT INTO conversations (id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(conversationId, userText.slice(0, 40), nowUtc, nowUtc);
    } else {
      rawDb.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(nowUtc, conversationId);
    }

    // 2. Persist user message
    const userMessageId = crypto.randomUUID();
    rawDb.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(userMessageId, conversationId, 'user', userText, nowUtc);

    // 3. Temporal query interpretation
    const temporal = interpretTemporalQuery(userText, nowUtc, this.timezone);

    // 4. Ambiguity check: if user prompt is ambiguous, ask concise clarification
    if (temporal.isAmbiguous && temporal.clarificationPrompt) {
      const assistantMsgId = crypto.randomUUID();
      rawDb.prepare(`
        INSERT INTO messages (id, conversation_id, role, content, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(assistantMsgId, conversationId, 'assistant', temporal.clarificationPrompt, nowUtc);

      return {
        messageId: assistantMsgId,
        response: temporal.clarificationPrompt,
        citations: [],
        searchesExecuted: [],
        retrievedMemory: [],
        temporal,
        isClarification: true
      };
    }

    // 5. Link recognized entities to message
    for (const ent of temporal.extractedEntities) {
      const entityId = upsertEntity(ent, 'product');
      linkMessageEntity(userMessageId, entityId);
    }

    // 6. Retrieve hybrid memory (excluding current message)
    const retrievedMemory = await retrieveHybridMemory({
      conversationId: undefined, // search globally across user history for facts/conversations
      excludeMessageId: userMessageId,
      dateRange: temporal.dateRange,
      entities: temporal.extractedEntities,
      query: temporal.normalizedQuery,
      limit: 8
    });

    // 7. Load recent conversation history (last 6 messages)
    const historyRows = rawDb.prepare(`
      SELECT role, content FROM messages
      WHERE conversation_id = ? AND id != ?
      ORDER BY created_at ASC
      LIMIT 6;
    `).all(conversationId, userMessageId) as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;

    // 8. Build prompt
    const systemPrompt = buildSystemPrompt(nowUtc, this.timezone, temporal, retrievedMemory);

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      ...historyRows.map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: userText }
    ];

    // 9. Bounded tool calling loop
    const MAX_ROUNDS = 3;
    let round = 0;
    const executedSearches: Array<{ query: string; resultsCount: number }> = [];
    const seenQueries = new Set<string>();
    const allCitations: Array<{ title: string; url: string; domain: string }> = [];

    let finalContent = '';

    while (round < MAX_ROUNDS) {
      round++;
      const response: LLMResponse = await this.llmProvider.generate(messages, [WEB_SEARCH_TOOL]);

      let toolCalls = response.tool_calls;
      let responseContent = response.content || '';

      // Fallback: If provider returned tool calls inside content as XML/text
      if ((!toolCalls || toolCalls.length === 0) && responseContent.includes('<tool_call>')) {
        const parsed = parseToolCallsFromText(responseContent);
        if (parsed.length > 0) {
          toolCalls = parsed;
          responseContent = responseContent.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim();
        }
      }

      // If no tool call was made, we have our final text response
      if (!toolCalls || toolCalls.length === 0) {
        finalContent = responseContent.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim() ||
          responseContent ||
          'I processed your request, but have no further information.';
        break;
      }

      // Model requested tool calls
      messages.push({
        role: 'assistant',
        content: responseContent,
        tool_calls: toolCalls
      });

      for (const tc of toolCalls) {
        if (tc.function.name !== 'web_search') {
          messages.push({
            role: 'tool',
            name: tc.function.name,
            tool_call_id: tc.id,
            content: JSON.stringify({ error: `Tool ${tc.function.name} is not permitted. Only 'web_search' is allowed.` })
          });
          continue;
        }

        // Validate arguments
        let parsedArgs: WebSearchArgs;
        try {
          const rawArgs = JSON.parse(tc.function.arguments || '{}');
          const validation = webSearchArgsSchema.safeParse(rawArgs);
          if (!validation.success) {
            messages.push({
              role: 'tool',
              name: 'web_search',
              tool_call_id: tc.id,
              content: JSON.stringify({ error: `Invalid web_search arguments: ${validation.error.message}` })
            });
            continue;
          }
          parsedArgs = validation.data;
        } catch (err: any) {
          messages.push({
            role: 'tool',
            name: 'web_search',
            tool_call_id: tc.id,
            content: JSON.stringify({ error: `Failed to parse tool arguments: ${err.message}` })
          });
          continue;
        }

        // Prevent duplicate searches in the same session
        const queryKey = parsedArgs.query.trim().toLowerCase();
        if (seenQueries.has(queryKey)) {
          messages.push({
            role: 'tool',
            name: 'web_search',
            tool_call_id: tc.id,
            content: JSON.stringify({ message: 'Search was already executed for this query earlier in the turn.' })
          });
          continue;
        }
        seenQueries.add(queryKey);

        // Execute search
        let results: SearchResultItem[] = [];
        try {
          results = await this.searchProvider.search(parsedArgs);
        } catch (searchErr: any) {
          console.warn('Search provider error:', searchErr);
          messages.push({
            role: 'tool',
            name: 'web_search',
            tool_call_id: tc.id,
            content: JSON.stringify({ error: `Search provider failed: ${searchErr.message}` })
          });
          continue;
        }

        // Record search snapshot and results in database
        recordSearchSnapshot(
          conversationId,
          userMessageId,
          parsedArgs.query,
          parsedArgs.recency || null,
          parsedArgs.domains || null,
          results
        );

        executedSearches.push({
          query: parsedArgs.query,
          resultsCount: results.length
        });

        // Collect citations and compress snippets to minimize input tokens
        const sanitizedResults = results.slice(0, 3).map((r) => {
          allCitations.push({ title: r.title, url: r.url, domain: r.domain });
          const rawSnippet = r.snippet || '';
          // Compress snippet to max 350 chars while retaining factual numbers and plans
          const compressedSnippet = rawSnippet.length > 350 ? rawSnippet.slice(0, 350) + '...' : rawSnippet;
          return {
            title: r.title,
            url: r.url,
            snippet: sanitizeWebContent(compressedSnippet),
            domain: r.domain,
            published_at: r.published_at
          };
        });

        messages.push({
          role: 'tool',
          name: 'web_search',
          tool_call_id: tc.id,
          content: JSON.stringify({ results: sanitizedResults })
        });
      }
    }

    // If loop terminated after max rounds without final content, do a final synthesis call without tools
    if (!finalContent) {
      const fallbackResponse = await this.llmProvider.generate(messages, []);
      finalContent = fallbackResponse.content || 'Unable to complete search evaluation within the allowed rounds.';
    }

    // Clean any remaining raw tool tags so they never leak to user view
    finalContent = finalContent.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim();
    if (!finalContent) {
      finalContent = 'I processed your request, but have no further information.';
    }

    // 10. Persist assistant message
    const assistantMessageId = crypto.randomUUID();
    rawDb.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      assistantMessageId,
      conversationId,
      'assistant',
      finalContent,
      DateTime.utc().toISO()!,
      JSON.stringify({
        citations: allCitations,
        searches: executedSearches
      })
    );

    // Deduplicate citations by URL
    const uniqueCitations = Array.from(
      new Map(allCitations.map((c) => [c.url, c])).values()
    );

    return {
      messageId: assistantMessageId,
      response: finalContent,
      citations: uniqueCitations,
      searchesExecuted: executedSearches,
      retrievedMemory,
      temporal
    };
  }
}
