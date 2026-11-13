import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GrokProvider } from '../src/providers/llm/grok.js';
import { getLLMProvider } from '../src/providers/index.js';
import { MockLLMProvider } from '../src/providers/llm/mock.js';
import { AgentOrchestrator } from '../src/agent/orchestrator.js';
import { MockSearchProvider } from '../src/providers/search/mock.js';
import { seedHistoricalConversations } from '../src/db/seed.js';
import { config } from '../src/config.js';

describe('Grok LLM Provider Suite', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // 1. Grok provider initialization
  describe('1. Grok provider initialization', () => {
    it('initializes with default model grok-2-latest and xAI base URL', () => {
      const provider = new GrokProvider('test-xai-key');
      expect(provider.name).toBe('grok');
      // @ts-ignore
      expect(provider.model).toBe('grok-2-latest');
      // @ts-ignore
      expect(provider.baseUrl).toBe('https://api.x.ai/v1');
    });

    it('accepts configurable model and custom base URL', () => {
      const provider = new GrokProvider('test-xai-key', 'grok-beta', 'https://custom.x.ai/v1/');
      // @ts-ignore
      expect(provider.model).toBe('grok-beta');
      // @ts-ignore
      expect(provider.baseUrl).toBe('https://custom.x.ai/v1');
    });
  });

  // 2. Missing and invalid API credentials
  describe('2. Missing and invalid API credentials', () => {
    it('throws error when API key is empty or whitespace', () => {
      expect(() => new GrokProvider('')).toThrow('xAI API key is required');
      expect(() => new GrokProvider('   ')).toThrow('xAI API key is required');
      // @ts-ignore
      expect(() => new GrokProvider(null as any)).toThrow('xAI API key is required');
    });

    it('throws when getLLMProvider requests grok but XAI_API_KEY is unset', () => {
      const prevKey = config.XAI_API_KEY;
      // @ts-ignore
      config.XAI_API_KEY = undefined;
      expect(() => getLLMProvider('grok')).toThrow('XAI_API_KEY is required when LLM_PROVIDER is set to grok');
      config.XAI_API_KEY = prevKey;
    });
  });

  // 3. Successful live LLM responses
  describe('3. Successful live LLM responses (mocked HTTP)', () => {
    it('sends correct headers, payload, and parses response', async () => {
      const provider = new GrokProvider('valid-test-key', 'grok-2-latest');

      const mockResponse = {
        id: 'chatcmpl-test',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Grok response: PostgreSQL pricing remains consistent with last week.'
            },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 25, completion_tokens: 15, total_tokens: 40 }
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse
      } as any);

      const res = await provider.generate([{ role: 'user', content: 'Check PostgreSQL pricing' }]);

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (globalThis.fetch as any).mock.calls[0];
      expect(url).toBe('https://api.x.ai/v1/chat/completions');
      expect(options.headers.Authorization).toBe('Bearer valid-test-key');
      expect(options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body.model).toBe('grok-2-latest');
      expect(body.temperature).toBe(0.1);
      expect(body.messages[0].content).toBe('Check PostgreSQL pricing');

      expect(res.content).toContain('Grok response');
      expect(res.finish_reason).toBe('stop');
      expect(res.usage?.total_tokens).toBe(40);
    });
  });

  // 4. API errors, rate limits, and timeouts
  describe('4. API errors, rate limits, and timeouts', () => {
    it('handles 400 Bad Request error cleanly without mock fallback', async () => {
      const provider = new GrokProvider('test-key');
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => '{"error":"Incorrect API key provided"}'
      } as any);

      await expect(
        provider.generate([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('GROK API error (400): {"error":"Incorrect API key provided"}');
    });

    it('handles 429 Rate Limit error gracefully', async () => {
      const provider = new GrokProvider('test-key');
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded for requests per minute'
      } as any);

      await expect(
        provider.generate([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('GROK rate limit exceeded (429)');
    });

    it('handles network request timeout', async () => {
      const provider = new GrokProvider('test-key');
      globalThis.fetch = vi.fn().mockImplementation(() => {
        const error: any = new Error('The operation was aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      await expect(
        provider.generate([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('GROK request timed out after 30000ms');
    });

    it('handles invalid JSON in response', async () => {
      const provider = new GrokProvider('test-key');
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Unexpected token < in JSON at position 0');
        }
      } as any);

      await expect(
        provider.generate([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('GROK returned invalid JSON response');
    });

    it('handles empty choices in response', async () => {
      const provider = new GrokProvider('test-key');
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [] })
      } as any);

      await expect(
        provider.generate([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('GROK returned no completion choice');
    });
  });

  // 5. Tool-call parsing and execution
  describe('5. Tool-call parsing and execution with Grok', () => {
    it('executes web_search tool requested by Grok and returns grounded synthesis', async () => {
      const grok = new GrokProvider('test-key');
      const searchProvider = new MockSearchProvider();
      const orchestrator = new AgentOrchestrator({
        llmProvider: grok,
        searchProvider
      });

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async (_url, options) => {
        callCount++;
        const body = JSON.parse(options.body);

        if (callCount === 1) {
          // Verify web_search tool was provided to Grok
          expect(body.tools).toBeDefined();
          expect(body.tools[0].function.name).toBe('web_search');

          // Return tool call from Grok
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      {
                        id: 'call_grok_search_1',
                        type: 'function',
                        function: {
                          name: 'web_search',
                          arguments: JSON.stringify({ query: 'Postgres hosting pricing Neon Supabase' })
                        }
                      }
                    ]
                  },
                  finish_reason: 'tool_calls'
                }
              ]
            })
          };
        } else {
          // In second call, verify tool results were passed back to Grok
          const toolMsg = body.messages.find((m: any) => m.role === 'tool');
          expect(toolMsg).toBeDefined();
          expect(toolMsg.name).toBe('web_search');
          expect(toolMsg.tool_call_id).toBe('call_grok_search_1');
          expect(toolMsg.content).toContain('Neon');

          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: 'Based on current search results, Neon Launch tier starts at $19/mo and Supabase Pro starts at $25/mo.'
                  },
                  finish_reason: 'stop'
                }
              ]
            })
          };
        }
      });

      const res = await orchestrator.handleMessage(
        'grok-conv-test',
        'Has Postgres hosting pricing changed recently?'
      );

      expect(callCount).toBe(2);
      expect(searchProvider.searchCount).toBe(1);
      expect(res.searchesExecuted).toHaveLength(1);
      expect(res.searchesExecuted[0].query).toBe('Postgres hosting pricing Neon Supabase');
      expect(res.citations.length).toBeGreaterThan(0);
      expect(res.response).toContain('Neon Launch tier starts at $19/mo');
    });
  });

  // 6. Multiple tool-call iterations within existing limit
  describe('6. Multiple tool-call iterations within limit', () => {
    it('handles 2 tool calls consecutively then finishes', async () => {
      const grok = new GrokProvider('test-key');
      const searchProvider = new MockSearchProvider();
      const orchestrator = new AgentOrchestrator({
        llmProvider: grok,
        searchProvider
      });

      let round = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        round++;
        if (round === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      {
                        id: 'call_1',
                        type: 'function',
                        function: {
                          name: 'web_search',
                          arguments: JSON.stringify({ query: 'Neon postgres pricing' })
                        }
                      }
                    ]
                  }
                }
              ]
            })
          };
        } else if (round === 2) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      {
                        id: 'call_2',
                        type: 'function',
                        function: {
                          name: 'web_search',
                          arguments: JSON.stringify({ query: 'Supabase pricing' })
                        }
                      }
                    ]
                  }
                }
              ]
            })
          };
        } else {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: 'Evaluated both Neon and Supabase pricing successfully.'
                  }
                }
              ]
            })
          };
        }
      });

      const res = await orchestrator.handleMessage('grok-multi-round', 'Compare Neon and Supabase pricing today');
      expect(round).toBe(3);
      expect(res.searchesExecuted.length).toBe(2);
      expect(res.response).toContain('Evaluated both Neon and Supabase');
    });
  });

  // 7. Citation preservation
  describe('7. Citation preservation', () => {
    it('preserves source URLs and domains in citations metadata', async () => {
      const grok = new GrokProvider('test-key');
      const searchProvider = new MockSearchProvider();
      const orchestrator = new AgentOrchestrator({
        llmProvider: grok,
        searchProvider
      });

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'call_cit',
                      type: 'function',
                      function: {
                        name: 'web_search',
                        arguments: JSON.stringify({ query: 'CRM pricing updates' })
                      }
                    }
                  ]
                }
              }
            ]
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'HubSpot remains $20/mo [HubSpot Pricing](https://www.hubspot.com/pricing/sales).'
                }
              }
            ]
          })
        });

      const res = await orchestrator.handleMessage('grok-cit-test', 'Has CRM pricing changed?');
      expect(res.citations.some((c) => c.url.includes('hubspot.com'))).toBe(true);
      expect(res.citations.some((c) => c.domain === 'hubspot.com')).toBe(true);
    });
  });

  // 8. Memory retrieval and temporal recall with Grok
  describe('8. Memory retrieval and temporal recall with Grok', () => {
    it('delivers seeded temporal memory to Grok system prompt', async () => {
      seedHistoricalConversations('2026-11-11T12:00:00Z');
      const grok = new GrokProvider('test-key');
      const orchestrator = new AgentOrchestrator({
        llmProvider: grok,
        timezone: 'Asia/Kolkata'
      });

      let systemPromptReceived = '';
      globalThis.fetch = vi.fn().mockImplementation(async (_url, options) => {
        const body = JSON.parse(options.body);
        const sys = body.messages.find((m: any) => m.role === 'system');
        systemPromptReceived = sys?.content || '';

        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'On 3 November, you asked about Neon serverless Postgres pricing.'
                }
              }
            ]
          })
        };
      });

      const res = await orchestrator.handleMessage(
        'grok-memory-test',
        'What did I ask you on 3 November?',
        '2026-11-11T12:00:00Z'
      );

      expect(systemPromptReceived).toContain('Neon');
      expect(systemPromptReceived).toContain('2026-11-03');
      expect(res.response).toContain('On 3 November, you asked about Neon');
    });
  });

  // 9. Mock mode continuing to work without credentials
  describe('9. Mock mode continuing to work without credentials', () => {
    it('returns MockLLMProvider when credentials are absent', () => {
      const prevKey = config.XAI_API_KEY;
      const prevOpenAI = config.OPENAI_API_KEY;
      const prevGemini = config.GEMINI_API_KEY;
      // @ts-ignore
      config.XAI_API_KEY = undefined;
      // @ts-ignore
      config.OPENAI_API_KEY = undefined;
      // @ts-ignore
      config.GEMINI_API_KEY = undefined;

      const provider = getLLMProvider('mock');
      expect(provider).toBeInstanceOf(MockLLMProvider);
      expect(provider.name).toBe('mock');

      config.XAI_API_KEY = prevKey;
      config.OPENAI_API_KEY = prevOpenAI;
      config.GEMINI_API_KEY = prevGemini;
    });
  });
});
