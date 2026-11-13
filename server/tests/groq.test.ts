import { describe, it, expect, vi, afterEach } from 'vitest';
import { GroqProvider } from '../src/providers/llm/groq.js';
import { getLLMProvider } from '../src/providers/index.js';
import { MockLLMProvider } from '../src/providers/llm/mock.js';
import { AgentOrchestrator } from '../src/agent/orchestrator.js';
import { MockSearchProvider } from '../src/providers/search/mock.js';
import { seedHistoricalConversations } from '../src/db/seed.js';
import { config } from '../src/config.js';

describe('Groq LLM Provider Suite', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // 1. Groq provider initialization
  describe('1. Groq provider initialization', () => {
    it('initializes with default model qwen/qwen3.8-27b and Groq base URL', () => {
      const provider = new GroqProvider('gsk_test_key');
      expect(provider.name).toBe('groq');
      // @ts-ignore
      expect(provider.model).toBe('qwen/qwen3.8-27b');
      // @ts-ignore
      expect(provider.baseUrl).toBe('https://api.groq.com/openai/v1');
    });

    it('accepts configurable model and custom base URL', () => {
      const provider = new GroqProvider('gsk_test_key', 'openai/gpt-oss-120b', 'https://custom.groq.api/v1/');
      // @ts-ignore
      expect(provider.model).toBe('openai/gpt-oss-120b');
      // @ts-ignore
      expect(provider.baseUrl).toBe('https://custom.groq.api/v1');
    });
  });

  // 2. Missing and invalid API credentials
  describe('2. Missing and invalid API credentials', () => {
    it('throws error when API key is empty or whitespace', () => {
      expect(() => new GroqProvider('')).toThrow('Groq API key is required');
      expect(() => new GroqProvider('   ')).toThrow('Groq API key is required');
      // @ts-ignore
      expect(() => new GroqProvider(null as any)).toThrow('Groq API key is required');
    });

    it('throws when getLLMProvider requests groq but GROQ_API_KEY is unset', () => {
      const prevKey = config.GROQ_API_KEY;
      // @ts-ignore
      config.GROQ_API_KEY = undefined;
      expect(() => getLLMProvider('groq')).toThrow('GROQ_API_KEY is required when LLM_PROVIDER is set to groq');
      config.GROQ_API_KEY = prevKey;
    });
  });

  // 3. Successful live LLM responses (mocked HTTP)
  describe('3. Successful completions', () => {
    it('sends correct headers, payload, and parses response', async () => {
      const provider = new GroqProvider('gsk_valid_key', 'qwen/qwen3.8-27b');

      const mockResponse = {
        id: 'chatcmpl-groq-test',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Groq Cloud response: Supabase Pro tier remains $25/month.'
            },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 }
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse
      } as any);

      const res = await provider.generate([{ role: 'user', content: 'What is Supabase Pro pricing?' }]);

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (globalThis.fetch as any).mock.calls[0];
      expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
      expect(options.headers.Authorization).toBe('Bearer gsk_valid_key');
      expect(options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body.model).toBe('qwen/qwen3.8-27b');
      expect(body.temperature).toBe(0.1);

      expect(res.content).toContain('Supabase Pro tier remains $25/month');
      expect(res.finish_reason).toBe('stop');
      expect(res.usage?.total_tokens).toBe(50);
    });
  });

  // 4. API errors, rate limits, and timeouts
  describe('4. API errors, rate limits, and timeouts', () => {
    it('handles 401 Unauthorized cleanly without silent mock fallback', async () => {
      const provider = new GroqProvider('gsk_bad_key');
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => '{"error":{"message":"Invalid API Key","type":"invalid_request_error"}}'
      } as any);

      await expect(
        provider.generate([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('GROQ API error (401): {"error":{"message":"Invalid API Key"');
    });

    it('handles 429 Rate Limit error gracefully', async () => {
      const provider = new GroqProvider('gsk_test_key');
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded: TPM limit reached'
      } as any);

      await expect(
        provider.generate([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('GROQ rate limit exceeded (429)');
    });

    it('handles request timeout cleanly', async () => {
      const provider = new GroqProvider('gsk_test_key');
      globalThis.fetch = vi.fn().mockImplementation(() => {
        const error: any = new Error('The operation was aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      await expect(
        provider.generate([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('GROQ request timed out after 30000ms');
    });

    it('handles invalid JSON in response', async () => {
      const provider = new GroqProvider('gsk_test_key');
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Unexpected token < in JSON');
        }
      } as any);

      await expect(
        provider.generate([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('GROQ returned invalid JSON response');
    });
  });

  // 5. Tool-call execution with Groq
  describe('5. Tool-call execution with Groq', () => {
    it('executes web_search tool and passes results back to Groq for grounded synthesis', async () => {
      const groq = new GroqProvider('gsk_test_key');
      const searchProvider = new MockSearchProvider();
      const orchestrator = new AgentOrchestrator({
        llmProvider: groq,
        searchProvider
      });

      let callIndex = 0;
      globalThis.fetch = vi.fn().mockImplementation(async (_url, options) => {
        callIndex++;
        const body = JSON.parse(options.body);

        if (callIndex === 1) {
          expect(body.tools[0].function.name).toBe('web_search');
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
                        id: 'call_groq_search_01',
                        type: 'function',
                        function: {
                          name: 'web_search',
                          arguments: JSON.stringify({ query: 'PostgreSQL hosting pricing 2026' })
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
          const toolMsg = body.messages.find((m: any) => m.role === 'tool');
          expect(toolMsg.name).toBe('web_search');
          expect(toolMsg.tool_call_id).toBe('call_groq_search_01');

          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: 'Verified current pricing: Neon Launch plan is $19/mo and Supabase Pro plan is $25/mo.'
                  },
                  finish_reason: 'stop'
                }
              ]
            })
          };
        }
      });

      const res = await orchestrator.handleMessage('groq-tool-test', 'Compare current PostgreSQL hosting prices');
      expect(callIndex).toBe(2);
      expect(res.searchesExecuted).toHaveLength(1);
      expect(res.citations.length).toBeGreaterThan(0);
      expect(res.response).toContain('Neon Launch plan is $19/mo');
    });
  });

  // 6. Memory retrieval and temporal recall
  describe('6. Memory retrieval and temporal recall', () => {
    it('delivers seeded temporal memory to Groq system prompt', async () => {
      seedHistoricalConversations('2026-11-11T12:00:00Z');
      const groq = new GroqProvider('gsk_test_key');
      const orchestrator = new AgentOrchestrator({
        llmProvider: groq,
        timezone: 'Asia/Kolkata'
      });

      let promptReceived = '';
      globalThis.fetch = vi.fn().mockImplementation(async (_url, options) => {
        const body = JSON.parse(options.body);
        const sys = body.messages.find((m: any) => m.role === 'system');
        promptReceived = sys?.content || '';

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
        'groq-memory-test',
        'What did I ask you on 3 November?',
        '2026-11-11T12:00:00Z'
      );

      expect(promptReceived).toContain('Neon');
      expect(promptReceived).toContain('2026-11-03');
      expect(res.response).toContain('On 3 November');
    });
  });

  // 7. Mock mode fallback when credentials absent
  describe('7. Mock mode when credentials absent', () => {
    it('defaults to MockLLMProvider when credentials are absent', () => {
      const prevGroq = config.GROQ_API_KEY;
      const prevXai = config.XAI_API_KEY;
      const prevOpenAI = config.OPENAI_API_KEY;
      // @ts-ignore
      config.GROQ_API_KEY = undefined;
      // @ts-ignore
      config.XAI_API_KEY = undefined;
      // @ts-ignore
      config.OPENAI_API_KEY = undefined;

      const provider = getLLMProvider('mock');
      expect(provider).toBeInstanceOf(MockLLMProvider);
      expect(provider.name).toBe('mock');

      config.GROQ_API_KEY = prevGroq;
      config.XAI_API_KEY = prevXai;
      config.OPENAI_API_KEY = prevOpenAI;
    });
  });
});
