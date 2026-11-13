import { describe, it, expect, vi, afterEach } from 'vitest';
import { TavilySearchProvider } from '../src/providers/search/tavily.js';
import { MockSearchProvider } from '../src/providers/search/mock.js';
import { getSearchProvider } from '../src/providers/index.js';
import { AgentOrchestrator } from '../src/agent/orchestrator.js';
import { GroqProvider } from '../src/providers/llm/groq.js';
import { config } from '../src/config.js';

describe('Tavily Search Provider Suite', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // 1. Initialization and credential validation
  describe('1. Initialization and credential validation', () => {
    it('initializes cleanly with valid key', () => {
      const provider = new TavilySearchProvider('tvly-test-key-12345');
      expect(provider.name).toBe('tavily');
    });

    it('rejects empty or whitespace keys in constructor', () => {
      expect(() => new TavilySearchProvider('')).toThrow('Tavily API key is required');
      expect(() => new TavilySearchProvider('   ')).toThrow('Tavily API key is required');
      // @ts-ignore
      expect(() => new TavilySearchProvider(null as any)).toThrow('Tavily API key is required');
    });

    it('throws when getSearchProvider requests tavily but TAVILY_API_KEY is unset', () => {
      const prevKey = config.TAVILY_API_KEY;
      // @ts-ignore
      config.TAVILY_API_KEY = undefined;
      expect(() => getSearchProvider('tavily')).toThrow('TAVILY_API_KEY is required when SEARCH_PROVIDER is set to tavily');
      config.TAVILY_API_KEY = prevKey;
    });
  });

  // 2. Successful search requests (mocked HTTP)
  describe('2. Successful search execution', () => {
    it('sends correct payload to https://api.tavily.com/search and parses results', async () => {
      const provider = new TavilySearchProvider('tvly-sample-key');

      const mockTavilyResponse = {
        results: [
          {
            title: 'Neon Serverless Postgres Pricing',
            url: 'https://neon.tech/pricing',
            content: 'Neon Free tier includes 0.5 GB storage. Launch plan starts at $19/month.',
            published_date: '2026-10-15T12:00:00Z',
            raw_content: 'Official Neon pricing plans.'
          },
          {
            title: 'Supabase Database Compute & Pricing',
            url: 'https://supabase.com/pricing',
            content: 'Supabase Pro tier starts at $25/month including 8 GB database storage.',
            published_date: '2026-10-20T08:00:00Z'
          }
        ]
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockTavilyResponse
      } as any);

      const items = await provider.search({
        query: 'Postgres hosting pricing Neon Supabase',
        recency: 'month',
        domains: ['neon.tech', 'supabase.com']
      });

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (globalThis.fetch as any).mock.calls[0];
      expect(url).toBe('https://api.tavily.com/search');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body.api_key).toBe('tvly-sample-key');
      expect(body.query).toBe('Postgres hosting pricing Neon Supabase');
      expect(body.time_range).toBe('month');
      expect(body.include_domains).toEqual(['neon.tech', 'supabase.com']);

      expect(items).toHaveLength(2);
      expect(items[0].title).toBe('Neon Serverless Postgres Pricing');
      expect(items[0].url).toBe('https://neon.tech/pricing');
      expect(items[0].domain).toBe('neon.tech');
      expect(items[0].published_at).toBe('2026-10-15T12:00:00Z');
      expect(items[0].retrieved_at).toBeDefined();

      expect(items[1].domain).toBe('supabase.com');
    });

    it('handles empty results cleanly', async () => {
      const provider = new TavilySearchProvider('tvly-sample-key');
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ results: [] })
      } as any);

      const items = await provider.search({ query: 'non-existent query' });
      expect(items).toEqual([]);
    });
  });

  // 3. Error, rate limit, and timeout handling
  describe('3. Error, rate limit, and timeout handling', () => {
    it('handles 401 Unauthorized cleanly without silent mock fallback', async () => {
      const provider = new TavilySearchProvider('tvly-bad-key');
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => '{"detail":{"error":"Unauthorized: missing or invalid API key."}}'
      } as any);

      await expect(
        provider.search({ query: 'test' })
      ).rejects.toThrow('Tavily authentication failed (401)');
    });

    it('handles 429 rate limit cleanly', async () => {
      const provider = new TavilySearchProvider('tvly-key');
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded: Monthly search quota reached'
      } as any);

      await expect(
        provider.search({ query: 'test' })
      ).rejects.toThrow('Tavily rate limit exceeded (429)');
    });

    it('handles request timeout cleanly', async () => {
      const provider = new TavilySearchProvider('tvly-key');
      globalThis.fetch = vi.fn().mockImplementation(() => {
        const error: any = new Error('The operation was aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      await expect(
        provider.search({ query: 'test' })
      ).rejects.toThrow('Tavily search request timed out after 12000ms');
    });

    it('handles invalid JSON in response', async () => {
      const provider = new TavilySearchProvider('tvly-key');
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Unexpected token < in JSON at position 0');
        }
      } as any);

      await expect(
        provider.search({ query: 'test' })
      ).rejects.toThrow('Tavily returned invalid JSON response');
    });
  });

  // 4. End-to-end integration with GroqProvider
  describe('4. End-to-end integration with GroqProvider', () => {
    it('feeds Tavily search results back to Groq and preserves citations', async () => {
      const tavily = new TavilySearchProvider('tvly-key');
      const groq = new GroqProvider('gsk_key');

      const orchestrator = new AgentOrchestrator({
        llmProvider: groq,
        searchProvider: tavily
      });

      globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL, options: any) => {
        const urlStr = url.toString();

        if (urlStr.includes('api.tavily.com')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  title: 'Neon Serverless Postgres Pricing',
                  url: 'https://neon.tech/pricing',
                  content: 'Neon Launch plan remains $19/mo with 10 GB storage.',
                  published_date: '2026-10-01T00:00:00Z'
                }
              ]
            })
          };
        } else if (urlStr.includes('api.groq.com')) {
          const body = JSON.parse(options.body);
          const hasToolResult = body.messages.some((m: any) => m.role === 'tool');

          if (!hasToolResult) {
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
                          id: 'call_tavily_1',
                          type: 'function',
                          function: {
                            name: 'web_search',
                            arguments: JSON.stringify({ query: 'Neon postgres pricing 2026' })
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
            return {
              ok: true,
              status: 200,
              json: async () => ({
                choices: [
                  {
                    message: {
                      role: 'assistant',
                      content: 'Verified via Tavily: Neon Launch plan remains $19/mo. Source: [Neon Pricing](https://neon.tech/pricing).'
                    },
                    finish_reason: 'stop'
                  }
                ]
              })
            };
          }
        }

        throw new Error(`Unexpected URL in mock: ${urlStr}`);
      });

      const res = await orchestrator.handleMessage('tavily-groq-session', 'Check Neon pricing today');
      expect(res.searchesExecuted).toHaveLength(1);
      expect(res.searchesExecuted[0].query).toBe('Neon postgres pricing 2026');
      expect(res.citations).toHaveLength(1);
      expect(res.citations[0].url).toBe('https://neon.tech/pricing');
      expect(res.citations[0].domain).toBe('neon.tech');
      expect(res.response).toContain('Verified via Tavily: Neon Launch plan remains $19/mo');
    });
  });

  // 5. Mock provider fallback preservation
  describe('5. Mock search provider preservation', () => {
    it('returns MockSearchProvider when searchProvider is mock', () => {
      const prevKey = config.TAVILY_API_KEY;
      const prevSearch = config.SEARCH_PROVIDER;

      // @ts-ignore
      config.TAVILY_API_KEY = undefined;
      // @ts-ignore
      config.SEARCH_PROVIDER = 'mock';

      const provider = getSearchProvider('mock');
      expect(provider).toBeInstanceOf(MockSearchProvider);
      expect(provider.name).toBe('mock');

      config.TAVILY_API_KEY = prevKey;
      config.SEARCH_PROVIDER = prevSearch;
    });
  });
});
